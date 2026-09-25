// Geração de imagem por IA pros slots "criativos" do guia de mídia
// (01, 02, 07, 09 — os que dependem de cenário/contexto, não de dado
// puro). Diferente dos slots 03/04 (gerados sem IA nenhuma, ver
// generateSlotImage.js no front), aqui a IA edita a FOTO REAL do
// produto (image-to-image), nunca gera do zero — a instrução de
// fidelidade abaixo é sempre prependada, o prompt do usuário só
// controla o que muda ao redor. Pedido do Raphael, 24/09: "precisamos
// manter 100% a integridade e realidade de nossos produtos".
//
// Nunca salva nada sozinha — só devolve a imagem gerada em base64 pro
// front mostrar numa prévia; o usuário decide usar ou descartar (mesmo
// padrão do gerador sem IA), e o salvamento de verdade reaproveita o
// upload já existente (uploadCheckPhoto).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

const GEMINI_MODEL = 'gemini-3.1-flash-image' // "Nano Banana 2" — 24/09/2026

const FIDELITY_PREFIX = `INSTRUÇÃO OBRIGATÓRIA — PRIORIDADE MÁXIMA SOBRE QUALQUER OUTRA COISA:
A imagem fornecida mostra um produto real, fotografado, de um fabricante de produtos pet (CoisaPet).
Você NUNCA deve alterar o produto em si: mantenha EXATAMENTE a mesma forma, proporções, medidas,
material, textura, cor, acabamento e todos os detalhes construtivos visíveis — como se o objeto
físico real tivesse sido colocado numa cena nova, sem nenhum retoque nele. Não invente, não
adicione, não remova e não modifique nenhuma peça, acessório ou característica do produto. A única
coisa que pode mudar é o que está AO REDOR dele (fundo, cenário, iluminação, enquadramento, e
elementos externos como textos, ícones, setas, linhas de medida e outros elementos gráficos),
conforme o pedido abaixo. Se o pedido for só melhorar a foto, melhore luz/nitidez/limpeza sem
mudar o produto.

PEDIDO PARA ESTA IMAGEM:
`

function mimeFromPath(path: string) {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return 'image/webp'
}

async function toBase64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary)
}

// Modo "composição" (26/09): o usuário quer que a IA siga o LAYOUT da
// referência (enquadramento, disposição, textos), com o nosso produto no lugar.
const COMPOSITION_NOTE = `IMAGEM(NS) DE REFERÊNCIA A SEGUIR — MODELO DE COMPOSIÇÃO:
As próximas imagens mostram a COMPOSIÇÃO/LAYOUT desejado: siga o enquadramento, o ângulo, a
posição e a disposição dos elementos, o estilo gráfico e a estrutura de textos/ícones delas. MAS o
produto da imagem final é SEMPRE e SOMENTE o produto real da primeira imagem (a imagem base) —
nunca copie, misture ou substitua pelo produto/objeto que aparece nas referências. Textos que
aparecerem nas referências não devem ser copiados literalmente, a não ser que o pedido diga isso.`

const REFERENCE_NOTE = `IMAGEM(NS) DE REFERÊNCIA A SEGUIR — SOMENTE INSPIRAÇÃO DE ESTILO:
As próximas imagens são só referência de estilo/ambiente/composição/iluminação (ex: como
ambientar um cenário). NÃO são o produto sendo editado, NÃO copie os objetos delas pra dentro da
imagem final, e principalmente NÃO troque nem misture o produto real (imagem acima) por qualquer
objeto parecido que apareça nelas. Use-as só pra entender o "clima"/composição desejado.`

// `refImages` = imagens de referência já resolvidas em base64 (tanto as
// vindas da biblioteca de exemplos do guia — baixadas do storage —
// quanto anexos avulsos que o usuário subiu na hora, ver rota abaixo).
async function generateImage(
  db: ReturnType<typeof adminClient>,
  basePhotoPath: string | null,
  baseImage: { data: string; mime_type: string } | null,
  userPrompt: string,
  refImages: { data: string; mime_type: string }[],
  refMode: 'style' | 'composition',
) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('Chave do Gemini não configurada (GEMINI_API_KEY) — rode "supabase secrets set GEMINI_API_KEY=..." primeiro.')
  if (!basePhotoPath && !baseImage?.data) throw new Error('Imagem base obrigatória (foto do slot ou imagem enviada).')
  if (!userPrompt?.trim()) throw new Error('Prompt obrigatório.')

  // Imagem base: foto já salva no storage (hero/slot) OU enviada na hora
  // pelo usuário ("melhorar esta foto"), que chega em base64 direto do front.
  let base64Photo: string
  let mimeType: string
  if (baseImage?.data) {
    base64Photo = baseImage.data
    mimeType = baseImage.mime_type || 'image/jpeg'
  } else {
    const { data: blob, error: dlErr } = await db.storage.from('product-photos').download(basePhotoPath!)
    if (dlErr || !blob) throw new Error('Não consegui carregar a foto base: ' + (dlErr?.message || 'arquivo não encontrado'))
    base64Photo = await toBase64(blob)
    mimeType = mimeFromPath(basePhotoPath!)
  }

  const fullPrompt = FIDELITY_PREFIX + userPrompt.trim()

  const parts: any[] = [
    { text: fullPrompt },
    { inline_data: { mime_type: mimeType, data: base64Photo } },
  ]
  if (refImages.length) {
    parts.push({ text: refMode === 'composition' ? COMPOSITION_NOTE : REFERENCE_NOTE })
    for (const ref of refImages) {
      parts.push({ inline_data: { mime_type: ref.mime_type, data: ref.data } })
    }
  }

  // Pede 4:5 (padrão do guia, 1080×1350). Se o modelo recusar o
  // imageConfig, tenta de novo sem ele em vez de falhar a geração.
  const call = (withAspect: boolean) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: withAspect
          ? { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } }
          : { responseModalities: ['IMAGE'] },
      }),
    },
  )

  let res = await call(true)
  let data = await res.json()
  if (res.status === 400 && /aspect|imageConfig|image_config/i.test(data?.error?.message || '')) {
    res = await call(false)
    data = await res.json()
  }
  if (!res.ok) {
    throw new Error('Erro na API do Gemini: ' + (data?.error?.message || res.status))
  }

  // A API costuma devolver em camelCase (inlineData/mimeType), mas
  // aceita snake_case no request — checa os dois formatos por segurança.
  const respParts = data?.candidates?.[0]?.content?.parts || []
  const imgPart = respParts.find((p: any) => p.inlineData || p.inline_data)
  const inline = imgPart?.inlineData || imgPart?.inline_data
  if (!inline?.data) {
    const textPart = respParts.find((p: any) => p.text)?.text
    throw new Error('Gemini não devolveu imagem.' + (textPart ? ` Resposta: ${textPart.slice(0, 300)}` : ''))
  }

  return { image_base64: inline.data, mime_type: inline.mimeType || inline.mime_type || 'image/png' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: any = {}
  try { body = await req.json() } catch { /* vazio */ }
  const db = adminClient()

  try {
    switch (body.action) {
      case 'generate': {
        // Referências vindas da biblioteca de exemplos (paths do bucket
        // product-photos, ex: guide-examples/...) — baixa e converte aqui.
        const refPaths: string[] = Array.isArray(body.ref_photo_paths) ? body.ref_photo_paths : []
        const fromLibrary = await Promise.all(refPaths.map(async (path) => {
          const { data: blob, error } = await db.storage.from('product-photos').download(path)
          if (error || !blob) return null
          return { data: await toBase64(blob), mime_type: mimeFromPath(path) }
        }))
        // Referências avulsas — já chegam em base64 direto do front
        // (upload feito na hora, sem salvar no storage).
        const adhoc: { data: string; mime_type: string }[] = Array.isArray(body.ref_images_base64) ? body.ref_images_base64 : []
        const refImages = [...fromLibrary.filter(Boolean), ...adhoc] as { data: string; mime_type: string }[]

        const baseImage = body.base_image_base64?.data ? body.base_image_base64 : null
        const refMode = body.ref_mode === 'composition' ? 'composition' : 'style'
        return json(await generateImage(db, body.base_photo_path || null, baseImage, body.prompt, refImages, refMode))
      }
      default:
        return json({ error: 'Ação desconhecida.' }, 400)
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
