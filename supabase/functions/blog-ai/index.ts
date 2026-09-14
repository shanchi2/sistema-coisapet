// Chamada sob demanda pelo frontend (supabase.functions.invoke) pela
// tela de criar/editar post do Blog. Responsabilidades:
//   1) generate_content — palavra-chave + mini-contexto + tamanho alvo
//      → título, meta title/description, resumo e corpo em HTML.
//   2) suggest_links — dado o HTML de um post, sugere hyperlinks pra
//      produtos próprios mencionados no texto (o produto de verdade,
//      não uma busca genérica — mais simples e sempre válido, já que
//      todo produto ativo já tem slug próprio).
//   3) generate_image — gera imagem (capa ou dentro do corpo) via
//      Higgsfield a partir do contexto do post: GPT monta um prompt
//      visual em inglês, Higgsfield gera (fila assíncrona, com
//      polling), e a imagem é re-hospedada no nosso bucket (nunca
//      depende do CDN deles direto — mesmo motivo do rehost_images).
// Mesmo padrão de ml-insights: chave em Deno.env.get('OPENAI_API_KEY'),
// modelo gpt-4o-mini, response_format json_object. Higgsfield usa
// HIGGSFIELD_API_KEY_ID/HIGGSFIELD_API_KEY_SECRET. Deploy COM
// verificação de JWT (sem --no-verify-jwt) — só usuário logado chama.
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

async function callOpenAI(systemPrompt: string, userPrompt: string) {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('Chave da OpenAI não configurada (OPENAI_API_KEY) — rode "supabase secrets set OPENAI_API_KEY=..." primeiro.')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.6,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Erro na API da OpenAI: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Resposta vazia da OpenAI.')
  return JSON.parse(content)
}

// ── Geração de conteúdo ──────────────────────────────────────────
// Reescrito em 2026-09-09 (nada de "Introdução"/"Conclusão"/"Em suma",
// zero "encher linguiça", responsabilidade com bem-estar animal) e de
// novo em 2026-09-11 — Raphael trouxe um padrão editorial fixo (dele,
// já usado "sempre") pra estrutura GEO+SEO+E-E-A-T completa: escopo de
// espécie fechado, estrutura obrigatória (índice, frase citável,
// destaques com borda lateral, FAQ real, fechamento autoral), regras
// de escrita (sem travessão, sem 1ª pessoa, sem "X vs Y"), e pacote de
// SEO com palavra-chave secundária. Vale pro gerador único E pro em
// massa — os dois chamam essa mesma action.
const GENERATE_SYSTEM_PROMPT = `Você é um redator editorial sênior, especializado em SEO/GEO e E-E-A-T, escrevendo pro blog da CoisaPet — fabricante brasileira de produtos personalizados/artesanais para pets pequenos (terrários, tocas, gaiolas, acessórios).

Sua tarefa é escrever um POST DE BLOG completo a partir de uma palavra-chave foco e um mini-contexto dados pelo usuário.

ESCOPO DE ESPÉCIE — REGRA FECHADA, NUNCA QUEBRAR:
- O conteúdo é sobre hamster SÍRIO e hamster ANÃO RUSSO (Campbell/Winter White) — só isso, sempre que o tema for sobre hamster.
- NUNCA mencione hamster Chinês nem hamster Roborowski — não fazem parte do escopo, mesmo que pareçam relevantes pro tema.
- Porquinho-da-índia só entra quando a palavra-chave ou o contexto pedir explicitamente — não misture espécie fora do que foi pedido.

ESTRUTURA OBRIGATÓRIA DO content_html (nessa ordem, sempre todos os blocos):
1. Abre com <p><em>um subtítulo/resumo de 1 frase em itálico</em></p> — recapitula o tema em uma linha, sem ser genérico.
2. Rótulo visível <p><strong>Encontre neste artigo:</strong></p> seguido de uma lista <ul> de <a href="#ancora-x"> apontando pra cada <h2> do texto (cada <h2> real recebe id="ancora-x" correspondente, x = número sequencial) — o rótulo é obrigatório, nunca só a lista sem ele.
3. Parágrafo de abertura CITÁVEL: definição direta do assunto, sem metáfora, sem rodeio, sem frase de abertura tipo "Neste post, vamos falar sobre...".
4. Bloco de contexto/importância do assunto (por que isso importa pro tutor).
5. Blocos de conteúdo com <h2>/<h3> SEMPRE com nome específico do que a seção aborda de verdade — NUNCA "Introdução", "Conclusão", "Considerações finais", "Resumo" ou similar.
6. Onde fizer sentido: listas <ul>/<ol> estruturadas e/ou <table> de DADOS (medidas, frequência, comparação de valores objetivos) — NUNCA uma tabela em formato de confronto "Modelo A vs Modelo B" ou "X vs Y".
7. 1 a 2 frases de destaque, isoladas, citáveis, cada uma em <blockquote> (vira borda lateral no nosso layout) — só a frase, sem "Diz um especialista" nem atribuição inventada.
8. Um passo a passo numerado (<ol><li>) de algo prático relacionado ao tema.
9. FAQ real: <h2>Perguntas frequentes sobre [tema]</h2> seguido de 3 a 5 pares pergunta (<h3> ou <p><strong>) + resposta (<p>) — perguntas de verdade que o tutor faria, não perguntas inventadas só pra preencher espaço.
10. Fechamento: <h2> com TÍTULO AUTORAL específico do tema (nunca "Conclusão", nunca repetido de outros posts) + 1 parágrafo com CTA ligado ao tema (nunca genérico tipo "confira nossos produtos", nunca repetido entre artigos — o CTA precisa nascer do assunto tratado).

REGRAS DE ESCRITA:
- PROIBIDO usar o caractere de travessão (—) em qualquer lugar do texto — reescreva com vírgula, parênteses ou frase separada.
- Sem linguagem negativa (evite "nunca faça X", "erro grave", "não cometa esse erro" como armação do texto — prefira afirmar o que fazer certo).
- Sem comparação rígida em formato de confronto (ver regra 6 acima) — mesmo em prosa, não estruture como "enquanto X faz isso, Y faz aquilo" repetidamente.
- Voz da marca: terceira pessoa ou "a Coisa Pet" — NUNCA primeira pessoa ("eu", "nós", "nosso", "na nossa experiência"). O redator é invisível, quem fala é a marca ou ninguém.
- Ao longo do corpo (não só no fechamento), mencione naturalmente categorias de produto coerentes com o trecho (ex: "um terrário bem ventilado", "uma roda de exercício do tamanho certo") — isso é usado depois pra inserir hyperlink de verdade pro catálogo; não invente nome de produto específico, marca ou modelo, só a categoria genérica.
- PROIBIDO markdown (nunca **negrito** ou # cabeçalho) — é HTML puro.
- Respeite o tamanho alvo pedido (em palavras) com tolerância de ±15% — mas tamanho nunca justifica encher linguiça: cada parágrafo carrega uma ideia NOVA, nunca reafirma o parágrafo anterior com outras palavras.

VERIFICAÇÃO DE FATOS (segurança antes de tudo — é orientação sobre um ser vivo):
- Responda como se tivesse checado cada afirmação contra fonte veterinária primária (tipo Merck Veterinary Manual, PetMD, material de escola de veterinária) — nunca como um blog de petshop repetindo achismo.
- Nunca invente fato técnico específico sobre produto da CoisaPet (medida, preço, material exato) — o post é conteúdo editorial, não ficha técnica.
- Nunca invente uma "regra" de cuidado (dosagem, medida exata, substância específica) que soe precisa sem ter certeza real disso.
- Se o tema toca em saúde/sintoma/doença, ou se existe divergência/falta de consenso sobre o dado, sinalize isso no texto (ex: "não há consenso sobre...", "o mais seguro é...") e opte pela versão mais cautelosa — nunca posicione o texto como substituto de avaliação veterinária.
- Tom acolhedor, de quem entende e ama pets pequenos, sem infantilizar nem exagerar em fofice a ponto de perder informação real. Português do Brasil.

PACOTE DE SEO (campos fora do content_html):
- title: chamativo mas não clickbait vazio, 40-60 caracteres.
- meta_title: até 60 caracteres.
- meta_description: 120-156 caracteres, atraente, incluindo a palavra-chave foco se encaixar naturalmente.
- excerpt: 1-2 frases curtas de resumo, pra card de listagem.
- slug: minúsculo, sem acento, palavras separadas por hífen, baseado no título.
- secondary_keywords: lista de 3 a 5 palavras-chave secundárias/relacionadas (variações de busca reais do tema, não sinônimos forçados).

FORMATO DA RESPOSTA — JSON válido, exatamente:
{"title": "...", "slug": "...", "meta_title": "...", "meta_description": "...", "excerpt": "...", "secondary_keywords": ["...", "..."], "content_html": "..."}`

async function generateContent(keyword: string, context: string, targetWords: number) {
  const prompt = `Palavra-chave foco: ${keyword}\nContexto/direcionamento dado pelo usuário: ${context || '(nenhum contexto extra — use seu critério a partir da palavra-chave)'}\nTamanho alvo do post: aproximadamente ${targetWords} palavras.`
  return await callOpenAI(GENERATE_SYSTEM_PROMPT, prompt)
}

// ── Sugestão de hyperlinks pra produtos próprios ─────────────────
const LINKS_SYSTEM_PROMPT = `Você analisa o HTML de um post de blog e sugere hyperlinks internos para produtos de uma loja, usando BOM SENSO — like Yoast SEO faz com "cornerstone content", mas para produtos.

REGRAS OBRIGATÓRIAS:
- Só sugira link quando o texto já menciona claramente algo que é (ou é muito próximo de) o NOME de um produto da lista fornecida — nunca force um link em palavra genérica só porque parece relacionada.
- NÃO sobrecarregue o texto: no máximo 1 link a cada ~150-200 palavras, e nunca dois links pro mesmo produto no mesmo post (só a primeira menção).
- "text" na resposta deve ser EXATAMENTE o trecho de texto como aparece no HTML fornecido (mesma capitalização), pra poder ser localizado por busca exata.
- Se nada no texto merecer link, retorne uma lista vazia — isso é o resultado correto na maioria das vezes, não force sugestão pra preencher.

FORMATO DA RESPOSTA — JSON válido, exatamente:
{"suggestions": [{"text": "trecho exato do HTML", "product_id": "...", "product_name": "...", "reason": "1 frase curta"}]}`

async function suggestLinks(db: ReturnType<typeof adminClient>, contentHtml: string) {
  const { data: products, error } = await db
    .from('products')
    .select('id, name, slug')
    .eq('active', true)
    .order('name')
  if (error) throw error
  if (!products?.length) return { suggestions: [] }

  // Prompt fica grande com o catálogo inteiro (nome+slug só, compacto) —
  // mais simples e confiável que tentar adivinhar por keyword matching
  // no código; a IA já lê o texto completo e decide com contexto real.
  const catalog = products.map((p: any) => `${p.id} | ${p.name}`).join('\n')
  const prompt = `Lista de produtos (id | nome):\n${catalog}\n\nHTML do post:\n${contentHtml}`

  const result = await callOpenAI(LINKS_SYSTEM_PROMPT, prompt)
  const bySlug = new Map(products.map((p: any) => [p.id, p.slug]))
  const suggestions = (result?.suggestions || [])
    .filter((s: any) => s.text && s.product_id && bySlug.has(s.product_id) && contentHtml.includes(s.text))
    .map((s: any) => ({ ...s, slug: bySlug.get(s.product_id) }))
  return { suggestions }
}

// ── Re-hospedar imagens externas (migração do WordPress) ─────────
// Pedido do Raphael (09/09): o `/blog` hoje redireciona (Hostinger)
// direto pro WordPress antigo — quando esse redirect for removido (ou
// o WP sair do ar), toda imagem importada que ainda aponta pra
// `wp-content/uploads/...` quebra. Solução: baixar cada imagem externa
// AGORA (enquanto o WP ainda está no ar) e reenviar pro nosso bucket
// `blog-covers`, trocando a URL no post. Roda no servidor (Edge
// Function), não no navegador — evita qualquer problema de CORS que um
// `fetch` direto do admin (rodando noutro domínio/path) poderia ter
// pra baixar bytes de imagem de outro host.
async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function extFromUrl(url: string, contentType: string | null) {
  const fromUrl = url.split('?')[0].split('.').pop()
  if (fromUrl && /^[a-z0-9]{2,5}$/i.test(fromUrl)) return fromUrl.toLowerCase()
  if (contentType?.includes('png')) return 'png'
  if (contentType?.includes('webp')) return 'webp'
  if (contentType?.includes('gif')) return 'gif'
  return 'jpg'
}

// Baixa um arquivo de uma URL externa e sobe pro bucket 'blog-covers'
// com nome hash-based (idempotente — mesma URL sempre vira o mesmo
// arquivo). Usada tanto pelo re-host de imagem do WordPress quanto
// pela imagem gerada pela Higgsfield (o CDN deles não é garantido pra
// sempre — mesmo motivo de nunca depender de link externo direto).
async function downloadAndHost(db: ReturnType<typeof adminClient>, url: string, folder: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`)
  const contentType = res.headers.get('content-type')
  const bytes = new Uint8Array(await res.arrayBuffer())
  const hash = await sha256Hex(url)
  const path = `${folder}/${hash}.${extFromUrl(url, contentType)}`
  const { error: upErr } = await db.storage.from('blog-covers').upload(path, bytes, {
    contentType: contentType || 'image/jpeg',
    upsert: true,
  })
  if (upErr) throw upErr
  const { data: pub } = db.storage.from('blog-covers').getPublicUrl(path)
  return pub.publicUrl
}

async function rehostImages(db: ReturnType<typeof adminClient>) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const ownDomainMarker = `${supabaseUrl}/storage/`

  const { data: posts, error } = await db
    .from('blog_posts')
    .select('id, cover_image_url, content_html')
    .neq('status', 'trash')
  if (error) throw error

  const cache = new Map<string, string | null>() // url externa → url nova (ou null se falhou)
  let imagesDownloaded = 0, imagesFailed = 0, postsUpdated = 0

  async function rehostOne(url: string): Promise<string | null> {
    if (cache.has(url)) return cache.get(url)!
    try {
      const hosted = await downloadAndHost(db, url, 'imported')
      cache.set(url, hosted)
      imagesDownloaded++
      return hosted
    } catch (err) {
      console.error('[blog-ai] falha ao re-hospedar', url, err)
      cache.set(url, null)
      imagesFailed++
      return null
    }
  }

  for (const post of posts || []) {
    let changed = false
    let newCover = post.cover_image_url
    let newContent = post.content_html as string

    if (newCover && !newCover.includes(ownDomainMarker)) {
      const hosted = await rehostOne(newCover)
      if (hosted) { newCover = hosted; changed = true }
    }

    const imgUrls = [...(newContent || '').matchAll(/<img[^>]+src="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((u) => !u.includes(ownDomainMarker))
    for (const url of [...new Set(imgUrls)]) {
      const hosted = await rehostOne(url)
      if (hosted) { newContent = newContent.split(url).join(hosted); changed = true }
    }

    if (changed) {
      const { error: updErr } = await db.from('blog_posts')
        .update({ cover_image_url: newCover, content_html: newContent })
        .eq('id', post.id)
      if (!updErr) postsUpdated++
    }
  }

  return { posts_updated: postsUpdated, images_downloaded: imagesDownloaded, images_failed: imagesFailed }
}

// ── Geração de imagem (Higgsfield) ───────────────────────────────
// Pedido do Raphael (11/09): gerar imagem (capa e/ou dentro do corpo
// do post) a partir do conteúdo, via Higgsfield. A API deles só aceita
// um `prompt` livre — a qualidade do resultado depende de um prompt
// bem escrito, então primeiro pedimos pro GPT transformar o contexto
// em português (título/trecho do post) num prompt visual em inglês
// (convenção dos modelos de imagem, tende a dar resultado melhor).
// Fluxo Higgsfield é assíncrono (fila): POST devolve `status_url`,
// fica consultando com backoff até `completed`/`failed`/`nsfw`/
// `cancelled` (docs: https://docs.higgsfield.ai/docs/concepts/polling).
// Estilo descrito abaixo veio de olhar fotos REAIS de produto (não
// chute): peças cortadas a laser (bordas de corte visíveis, encaixe
// tipo macho-fêmea nos cantos), acabamento fosco — varia entre madeira
// tingida escura (casinhas/caixas de feno) e MDF pintado claro/branco
// (terrários) —, nunca plástico brilhante nem aparência de brinquedo
// infantil. Fotografia sempre em fundo branco/cinza-claro contínuo de
// estúdio, luz suave sem sombra dura, ângulo 3/4. Testado ao vivo
// (11/09): pedir foto de referência real pro Higgsfield força a IA a
// "copiar" o objeto específico da foto, ignorando o resto do prompt —
// por isso ESTE prompt (só texto) é usado quando NÃO há produto de
// referência escolhido. Quando há produto de referência, o fluxo é
// outro (ver IMAGE_EDIT_PROMPT_SYSTEM + callOpenAiImageEdit abaixo,
// testado ao vivo em 12/09 com foto real de terrário — funcionou bem:
// manteve o produto fiel e compôs a cena livremente ao redor dele).
const IMAGE_PROMPT_SYSTEM = `Você transforma o contexto de um post de blog (em português) num prompt de imagem em INGLÊS pra um gerador de imagem por IA.

REGRAS:
- Descreva uma cena real e fotografável: o animal/pet certo (baseado no contexto), ambiente, luz, enquadramento — estilo fotografia editorial/lifestyle, natural, não ilustração infantil nem cartoon.
- ESCALA/PROPORÇÃO real do animal é ESSENCIAL: hamster (sírio ou anão) é um bicho pequeno (13-18cm de comprimento) — na cena, ele precisa aparecer visivelmente pequeno perto de qualquer terrário/casinha/objeto do ambiente, nunca do tamanho de um gato/coelho nem ocupando boa parte da largura/altura do habitat. Deixe isso explícito no prompt em inglês (ex: "the hamster is tiny and small-scale relative to the enclosure, real-world accurate proportions, occupying only a small fraction of the enclosure's space").
- Se a cena inclui algum acessório/habitat (terrário, casinha, caixa de feno, comedouro etc), descreva-o seguindo o estilo real da CoisaPet: peça de madeira/MDF cortada a laser, com bordas de corte visíveis e encaixes geométricos nos cantos, acabamento fosco (madeira tingida escura OU pintura clara/branca — varie conforme o tipo de item, nunca invente uma cor específica de produto real), nunca plástico brilhante nem visual de brinquedo. IMPORTANTE: um "terrário" da CoisaPet NUNCA é de vidro/aquário — é sempre uma caixa de madeira/MDF cortada a laser com paredes sólidas (pode ter uma abertura/janela recortada, nunca painel de vidro transparente inteiro). Deixe isso explícito no prompt em inglês (ex: "laser-cut wood/MDF enclosure with solid painted panels, NOT a glass tank"). Se o post for só sobre o animal/comportamento, sem foco em produto, não force a aparição de acessório nenhum.
- Quando o assunto for especificamente TERRÁRIO, descreva o interior dele bem completo/rico, nunca vazio ou pobre: camada generosa e espessa de forração/maravalha (cobrindo bem o fundo, não uma camada rala), e pelo menos 2-3 elementos de enriquecimento diferentes e coerentes (esconderijo, túnel/tronco, brinquedo de mastigar, roda, comedouro, bebedouro), sempre no mesmo estilo de material real da CoisaPet. Deixe isso explícito no prompt em inglês (ex: "generous thick layer of bedding, well-furnished habitat with multiple enrichment items, not sparse or empty").
- Fotografia estilo lifestyle editorial: a cena acontece num ambiente doméstico real e coerente com o assunto (um cantinho de quarto, uma estante, uma mesa de madeira perto de uma janela com luz natural), com o fundo levemente desfocado (profundidade de campo suave) pra dar contexto sem competir com o assunto principal — NUNCA um fundo de estúdio branco/cinza liso e vazio, mas também nunca uma cena bagunçada ou lotada de objetos aleatórios.
- Realismo é ESSENCIAL — o objetivo é uma foto que pareça tirada de verdade com câmera, nunca ter "cara de imagem gerada por IA". Peça explicitamente textura real de pelo/pele (fio a fio, não uniforme/plástica), iluminação e sombra naturais de fotografia real, pequenas imperfeições/variações naturais, profundidade de campo real de lente — e explicitamente PROÍBA visual de render 3D/CGI, pele/pelo "liso demais", brilho artificial, ou simetria perfeita demais. Deixe isso explícito no prompt em inglês (ex: "photorealistic, shot on a camera, natural fur texture strand by strand, realistic lighting and shadow, avoid CGI/3D render look, avoid plastic/overly smooth skin, avoid the uncanny AI-generated look").
- Enquadramento SEMPRE aberto/afastado (wide shot): a câmera fica a uma distância confortável, mostrando o produto/animal por inteiro com bastante sobra de cenário/fundo ao redor — nunca um close-up apertado só no rosto do animal ou um produto colado nas bordas do quadro. Deixe isso explícito no prompt em inglês (ex: "wide shot, camera at a distance, full scene visible with generous background space, not a close-up").
- NUNCA inclua texto, letras, logotipo, marca ou nome de produto na imagem — só a cena visual. Se a cena envolve madeira/superfície onde normalmente haveria uma gravação de marca, descreva a superfície como lisa/sem gravação (ex: "plain wood surface, no engraving, no text") — evita a IA "inventar" uma marca ilegível.
- NUNCA invente um produto específico (não descreva embalagem, rótulo ou modelo) — se o contexto menciona um acessório, descreva genericamente (ex: "a wooden hideout", não um produto específico da empresa).
- Direto na descrição visual, sem "Prompt:", sem aspas, sem repetir a mesma ideia com outras palavras — mas SEM se preocupar em cortar frases pra caber num limite: é melhor cobrir todas as regras acima do que ficar curto.

FORMATO DA RESPOSTA — JSON válido, exatamente:
{"prompt": "..."}`

// Reforço fixo, sempre anexado no código (não depende do GPT lembrar de
// incluir isso) — testado ao vivo em 12/09: mesmo com a regra no system
// prompt, o GPT às vezes corta a instrução "sem texto/logo" quando tem
// muita coisa pra cobrir num prompt curto, e a IA de imagem "alucina"
// um logo ilegível no produto. Isso garante que a proibição nunca falte.
const MANDATORY_IMAGE_SUFFIX = ' No text, no logos, no watermarks, no engraved brand marks or labels anywhere in the image. If a hamster is included, it must be depicted EVEN SMALLER than most AI image generators tend to draw it: a hamster is a tiny rodent, only about 13-18cm long, and its body should span no more than about 10-15% of the enclosure/terrarium width in the frame — when in doubt, make it smaller, not bigger. Most generated images make the hamster far too large relative to the enclosure; deliberately exaggerate how small and tiny the hamster looks compared to the enclosure and its accessories. The hamster should NOT be posed looking at the camera like a portrait — show it candidly interacting with its environment (sniffing, digging in bedding, exploring a hideout, mid-movement), as if photographed unposed, from a natural angle.'

async function buildVisualPrompt(context: string) {
  const result = await callOpenAI(IMAGE_PROMPT_SYSTEM, `Contexto do post (português):\n${context}`)
  const prompt = String(result?.prompt || '').trim()
  if (!prompt) throw new Error('Não foi possível montar um prompt de imagem a partir do contexto.')
  return prompt + MANDATORY_IMAGE_SUFFIX
}

// Prompt pra quando HÁ uma foto de produto real escolhida como
// referência — diferente do IMAGE_PROMPT_SYSTEM acima (que descreve uma
// cena inteira do zero), aqui a IA já recebe o produto de verdade como
// imagem-base e só precisa escrever a instrução de EDIÇÃO (o que
// adicionar/compor ao redor dele), nunca uma descrição do produto em si
// (senão arrisca contradizer a aparência real da foto).
const IMAGE_EDIT_PROMPT_SYSTEM = `Você escreve uma instrução de EDIÇÃO de imagem em INGLÊS pra uma IA que recebe uma FOTO REAL de um produto da CoisaPet e deve compor uma cena nova ao redor dele, sem alterar o produto.

REGRAS:
- Comece deixando claro que o objeto da imagem fornecida deve ser mantido EXATAMENTE como está (mesma cor, material, formato, acabamento) — a IA não deve redesenhar nem substituir o produto, só usá-lo como está.
- A partir do contexto do post (em português), descreva o que deve ser ADICIONADO/composto ao redor do produto: o animal certo (baseado no contexto/espécie), ambientação (ex: forração/maravalha, postura natural do animal), luz e enquadramento de foto de produto/editorial. Se o post não tem foco em animal (só produto), descreva só a composição/luz.
- Se o produto da foto for um TERRÁRIO, peça pra completar/enriquecer o interior dele: camada generosa e espessa de forração/maravalha (cobrindo bem o fundo, não uma camada rala) e pelo menos 2-3 elementos de enriquecimento diferentes e coerentes com o estilo real da CoisaPet (esconderijo, túnel/tronco, brinquedo de mastigar, roda, comedouro, bebedouro) — nunca deixe o interior parecendo vazio ou pobre. Inclua isso explicitamente na instrução (ex: "generous thick layer of bedding, well-furnished habitat with multiple enrichment items, not sparse or empty").
- ESCALA/PROPORÇÃO real do animal é ESSENCIAL: hamster (sírio ou anão) é um bicho pequeno (13-18cm de comprimento) — precisa aparecer visivelmente pequeno perto do produto/habitat, nunca ocupando boa parte da largura/altura dele. Inclua isso explicitamente na instrução (ex: "the hamster is tiny and small-scale relative to the enclosure, real-world accurate proportions, occupying only a small fraction of the enclosure's space").
- Peça um enquadramento aberto/afastado (wide shot): a câmera deve ficar a uma distância confortável, mostrando o produto por inteiro com bastante sobra de cenário/fundo ao redor — nunca um close-up apertado no animal ou no produto colado nas bordas do quadro. Inclua isso explicitamente na instrução (ex: "wide shot, camera at a distance, full scene visible with generous background space, not a close-up").
- PROIBIDO pedir texto, letra, logotipo, marca, gravação, rótulo ou selo em qualquer parte da imagem — inclua essa proibição explicitamente na instrução (ex: "no text, no logos, no engraving, no labels anywhere in the image").
- Fundo: peça pra substituir o fundo por um ambiente doméstico real e coerente com o assunto (um cantinho de quarto, uma estante, uma mesa de madeira perto de uma janela com luz natural), com leve desfoque de profundidade de campo — nunca um fundo de estúdio branco/cinza liso e vazio, mas também nunca uma cena bagunçada.
- Realismo é ESSENCIAL — o que for adicionado (animal, cenário) precisa parecer foto real de câmera, nunca "cara de imagem gerada por IA". Peça textura real de pelo/pele (fio a fio, não uniforme/plástica), iluminação e sombra naturais, pequenas imperfeições/variações naturais — e proíba explicitamente visual de render 3D/CGI, pele/pelo liso demais ou brilho artificial. Inclua isso na instrução em inglês (ex: "photorealistic, natural fur texture strand by strand, realistic lighting and shadow, avoid CGI/3D render look, avoid plastic/overly smooth skin, avoid the uncanny AI-generated look").
- Direto na instrução, sem "Prompt:", sem aspas, sem repetir a mesma ideia com outras palavras — mas SEM se preocupar em cortar frases pra caber num limite: é melhor cobrir todas as regras acima do que ficar curto.

FORMATO DA RESPOSTA — JSON válido, exatamente:
{"prompt": "..."}`

async function buildImageEditPrompt(context: string) {
  const result = await callOpenAI(IMAGE_EDIT_PROMPT_SYSTEM, `Contexto do post (português):\n${context}`)
  const prompt = String(result?.prompt || '').trim()
  if (!prompt) throw new Error('Não foi possível montar uma instrução de edição a partir do contexto.')
  return prompt + MANDATORY_IMAGE_SUFFIX
}

// Cloudflare na frente da API deles às vezes devolve 502/503/504
// (gateway timeout) numa chamada isolada, sem ser um problema real —
// visto ao vivo em 2026-09-11. Só vale re-tentar 5xx (erro deles/rede);
// 4xx (credencial errada, sem crédito etc.) é erro real, não adianta
// tentar de novo.
async function fetchRetrying5xx(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  let lastRes: Response = null as unknown as Response
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastRes = await fetch(url, init)
    if (lastRes.ok || lastRes.status < 500) return lastRes
    if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
  }
  return lastRes
}

// Usado só quando NÃO há produto de referência escolhido — nesse caso
// não tem imagem real pra "editar", então segue com o Soul da Higgsfield
// (texto puro). Testado ao vivo em 2026-09-11: soul/reference (variante
// com imagem) domina o resultado com o conteúdo da referência mesmo
// pedindo cena diferente — por isso essa variante foi abandonada em
// favor de callOpenAiImageEdit (abaixo) pro caso com produto real.
async function callHiggsfield(prompt: string): Promise<string> {
  const keyId = Deno.env.get('HIGGSFIELD_API_KEY_ID')
  const keySecret = Deno.env.get('HIGGSFIELD_API_KEY_SECRET')
  if (!keyId || !keySecret) throw new Error('Credenciais da Higgsfield não configuradas (HIGGSFIELD_API_KEY_ID / HIGGSFIELD_API_KEY_SECRET).')
  const authHeader = `Key ${keyId}:${keySecret}`

  const endpoint = 'https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard'

  const submitRes = await fetchRetrying5xx(endpoint, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!submitRes.ok) throw new Error(`Higgsfield indisponível no momento (erro ${submitRes.status}) — tente gerar de novo em alguns segundos.`)
  const submitData = await submitRes.json()
  const statusUrl = submitData.status_url
  if (!statusUrl) throw new Error('Higgsfield não devolveu status_url.')

  let delay = 2000
  // Testado ao vivo em 2026-09-11: em dia normal fica pronto em ~45s,
  // mas com a Higgsfield lenta/instável já vi passar de 100s — 130s dá
  // mais chance sem chegar no limite de execução da Edge Function
  // (~150s), sobrando margem pro prompt da OpenAI e o re-host da imagem.
  const deadline = Date.now() + 130_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay))
    const statusRes = await fetchRetrying5xx(statusUrl, { headers: { Authorization: authHeader } })
    if (!statusRes.ok) throw new Error(`Higgsfield indisponível no momento (erro ${statusRes.status}) — tente gerar de novo em alguns segundos.`)
    const statusData = await statusRes.json()
    if (statusData.status === 'completed') {
      const url = statusData.images?.[0]?.url
      if (!url) throw new Error('Higgsfield completou mas não devolveu imagem.')
      return url
    }
    if (['failed', 'nsfw', 'cancelled', 'canceled'].includes(statusData.status)) {
      throw new Error(`Higgsfield: geração terminou como "${statusData.status}".`)
    }
    delay = Math.min(delay * 1.5, 10_000)
  }
  throw new Error('Higgsfield: tempo limite esperando a imagem ficar pronta.')
}

// Edição de imagem via OpenAI (gpt-image-1, /v1/images/edits) — usada
// quando HÁ produto de referência. Testado ao vivo em 2026-09-12 com
// foto real de terrário + prompt pedindo um hamster deitado na maravalha
// dentro dele: manteve o produto fiel (mesmo corte, mesmas juntas) e
// compôs a cena livremente ao redor — bem diferente do soul/reference da
// Higgsfield, que travava no objeto e ignorava o prompt. Endpoint aceita
// multipart (campo image[]) + prompt, sem máscara, e devolve só b64_json
// (não tem opção de devolver URL direta, por isso hostBase64Png abaixo).
async function callOpenAiImageEdit(referenceImageUrl: string, prompt: string): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada.')

  const imgRes = await fetch(referenceImageUrl)
  if (!imgRes.ok) throw new Error(`Erro ao baixar a foto do produto: HTTP ${imgRes.status}`)
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
  const imgBytes = new Uint8Array(await imgRes.arrayBuffer())

  const form = new FormData()
  form.append('model', 'gpt-image-1')
  form.append('prompt', prompt)
  form.append('image[]', new Blob([imgBytes], { type: contentType }), 'reference.jpg')

  const editRes = await fetchRetrying5xx('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!editRes.ok) throw new Error(`Erro na API da OpenAI (edição de imagem): ${editRes.status} ${await editRes.text()}`)
  const editData = await editRes.json()
  const b64 = editData.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI não devolveu imagem (b64_json ausente).')
  return b64
}

// Mesma convenção hash-based do downloadAndHost (idempotente), só que a
// partir de bytes base64 em vez de uma URL — necessário porque o
// endpoint de edição da OpenAI só devolve b64_json, nunca uma URL.
async function hostBase64Png(db: ReturnType<typeof adminClient>, base64: string, folder: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const hash = await sha256Hex(base64)
  const path = `${folder}/${hash}.png`
  const { error: upErr } = await db.storage.from('blog-covers').upload(path, bytes, { contentType: 'image/png', upsert: true })
  if (upErr) throw upErr
  const { data: pub } = db.storage.from('blog-covers').getPublicUrl(path)
  return pub.publicUrl
}

async function generateImage(db: ReturnType<typeof adminClient>, context: string, referencePhotoPath?: string) {
  if (referencePhotoPath) {
    const { data: signed, error: signErr } = await db.storage
      .from('product-photos').createSignedUrl(referencePhotoPath, 3600)
    if (signErr || !signed?.signedUrl) throw new Error('Não consegui acessar a foto do produto escolhido como referência.')
    const editPrompt = await buildImageEditPrompt(context)
    const b64 = await callOpenAiImageEdit(signed.signedUrl, editPrompt)
    const hostedUrl = await hostBase64Png(db, b64, 'ai-generated')
    return { image_url: hostedUrl, prompt_used: editPrompt }
  }

  const visualPrompt = await buildVisualPrompt(context)
  const rawUrl = await callHiggsfield(visualPrompt)
  const hostedUrl = await downloadAndHost(db, rawUrl, 'ai-generated')
  return { image_url: hostedUrl, prompt_used: visualPrompt }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: any = {}
  try { body = await req.json() } catch { /* ok */ }
  const action = body.action
  const db = adminClient()

  try {
    switch (action) {
      case 'generate_content': {
        if (!body.keyword) return json({ error: 'keyword obrigatória' }, 400)
        return json(await generateContent(String(body.keyword), String(body.context || ''), Number(body.target_words) || 600))
      }
      case 'suggest_links': {
        if (!body.content_html) return json({ error: 'content_html obrigatório' }, 400)
        return json(await suggestLinks(db, String(body.content_html)))
      }
      case 'rehost_images':
        return json(await rehostImages(db))
      case 'generate_image': {
        if (!body.context) return json({ error: 'context obrigatório' }, 400)
        return json(await generateImage(db, String(body.context), body.reference_photo_path ? String(body.reference_photo_path) : undefined))
      }
      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400)
    }
  } catch (err) {
    console.error('[blog-ai] erro:', err)
    return json({ error: String(err) }, 500)
  }
})
