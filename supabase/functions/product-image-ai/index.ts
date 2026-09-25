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

// Modo "composição" (25/09): o usuário quer que a IA siga o LAYOUT da
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
type Img = { data: string; mime_type: string }

// Fotos reais extras do mesmo produto (25/09) — ex: closes de canto,
// logo gravado, encaixe. A IA não tem como "adivinhar" esses detalhes:
// eles só existem se vierem de foto real, então entram como fonte da verdade.
const EXTRA_PRODUCT_NOTE = `AS PRÓXIMAS IMAGENS SÃO OUTRAS FOTOS REAIS DO MESMO PRODUTO (outros ângulos, closes de
detalhes, encaixes, acabamento, gravações/logo). São a FONTE DA VERDADE sobre como o produto é de
verdade: use-as para reproduzir detalhes com fidelidade total (e, se o pedido for um close/detalhe,
use a foto correspondente como base desse close). Nunca invente detalhe que não aparece nelas.`

// Modo "ajustar" (25/09): corrigir a imagem que a própria IA gerou sem
// refazer tudo (ex: "removeu um atributo repetido" e ela refez a imagem inteira).
const EDIT_PREFIX = `EDIÇÃO PONTUAL — PRIORIDADE MÁXIMA:
A primeira imagem abaixo é uma imagem já aprovada. Aplique SOMENTE a alteração pedida a seguir e
mantenha TODO o resto IDÊNTICO: mesmo produto, mesmo enquadramento, mesma composição, mesmas cores,
mesma luz, mesmos textos (exceto o que o pedido mandar mudar), mesma posição de cada elemento.
Não recrie, não reinterprete e não "melhore" nada além do que foi pedido.

ALTERAÇÃO PEDIDA:
`

const EDIT_PRODUCT_NOTE = `As imagens a seguir são fotos reais do produto, só para conferência — se a alteração pedida
envolver o produto, ele deve continuar fiel a elas. Não use essas fotos para mudar a composição.`

// Chave "Não mexer no conteúdo" do modal (25/09). Ligada: a IA só pode
// mexer em tom/luz/cor/nitidez (e no que o pedido mandar explicitamente
// de visual), sem tirar, pôr ou mover nada. Desligada: liberdade pra
// melhorar a cena (reposicionar, remover distrações, adicionar
// elementos) — mas o PRODUTO continua intocável em qualquer caso.
const LOCK_CONTENT_NOTE = `

REGRA DE CONTEÚDO TRAVADO (OBRIGATÓRIA): não mexa em absolutamente nada do conteúdo da imagem —
não remova, não adicione, não mova e não altere nenhum objeto, elemento, texto ou posição. Mantenha
a mesma composição e enquadramento. Só são permitidos ajustes de cor, tom, saturação, exposição,
luz e nitidez.`

const FREE_CONTENT_NOTE = `

LIBERDADE DE COMPOSIÇÃO: além do pedido, você pode melhorar a cena ao redor do produto — reposicionar,
remover distrações, adicionar ou trocar elementos de cenário e ajustar o enquadramento — se isso
deixar a imagem melhor e mais vendável. O produto em si continua intocável.`

async function generateImage({ productImages, editImage, userPrompt, refImages, refMode, lockContent }: {
  productImages: Img[]
  editImage: Img | null
  userPrompt: string
  refImages: Img[]
  refMode: 'style' | 'composition'
  lockContent: boolean
}) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('Chave do Gemini não configurada (GEMINI_API_KEY) — rode "supabase secrets set GEMINI_API_KEY=..." primeiro.')
  if (!editImage && !productImages.length) throw new Error('Imagem base obrigatória (foto do slot ou imagem enviada).')
  if (!userPrompt?.trim()) throw new Error('Prompt obrigatório.')

  const img = (i: Img) => ({ inline_data: { mime_type: i.mime_type || 'image/jpeg', data: i.data } })
  const parts: any[] = []

  if (editImage) {
    parts.push({ text: EDIT_PREFIX + userPrompt.trim() + (lockContent ? LOCK_CONTENT_NOTE : '') }, img(editImage))
    if (productImages.length) {
      parts.push({ text: EDIT_PRODUCT_NOTE }, ...productImages.map(img))
    }
  } else {
    const [primary, ...extras] = productImages
    parts.push({ text: FIDELITY_PREFIX + userPrompt.trim() + (lockContent ? LOCK_CONTENT_NOTE : FREE_CONTENT_NOTE) }, img(primary))
    if (extras.length) parts.push({ text: EXTRA_PRODUCT_NOTE }, ...extras.map(img))
  }

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

        // Fotos reais do produto, NA ORDEM (a 1ª é a base principal).
        // Cada uma vem como { path } (já no storage: foto 01/slot) ou
        // { data, mime_type } (enviada na hora). Formato antigo
        // (base_photo_path / base_image_base64) continua aceito.
        const baseList: any[] = Array.isArray(body.base_images) ? [...body.base_images] : []
        if (!baseList.length && body.base_image_base64?.data) baseList.push(body.base_image_base64)
        if (!baseList.length && body.base_photo_path) baseList.push({ path: body.base_photo_path })
        const productImages = (await Promise.all(baseList.map(async (b) => {
          if (b?.data) return { data: b.data, mime_type: b.mime_type || 'image/jpeg' }
          if (!b?.path) return null
          const { data: blob, error } = await db.storage.from('product-photos').download(b.path)
          if (error || !blob) throw new Error('Não consegui carregar a foto base: ' + (error?.message || b.path))
          return { data: await toBase64(blob), mime_type: mimeFromPath(b.path) }
        }))).filter(Boolean) as Img[]

        const editImage = body.edit_image_base64?.data ? body.edit_image_base64 : null
        const refMode = body.ref_mode === 'composition' ? 'composition' : 'style'
        return json(await generateImage({ productImages, editImage, userPrompt: body.prompt, refImages, refMode, lockContent: body.lock_content === true }))
      }
      default:
        return json({ error: 'Ação desconhecida.' }, 400)
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
