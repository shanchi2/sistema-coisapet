// Espelha ml-insights/index.ts — 1 Edge Function, várias ações via
// `action` no body, cada função de leitura/escrita isolada. Primeira
// ação: listar anúncios (Anúncios/get_item_list + get_item_base_info) e
// pausar/reativar. Sempre atrás de confirmação explícita na tela pra
// qualquer escrita — mesma regra do ml-insights.
//
// ⚠️ Nomes de campo da resposta do get_item_base_info construídos com
// base no formato documentado publicamente da v2, ainda a confirmar
// contra a API real (testar com o item de teste 885183339 antes de
// confiar 100%).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration, shopeeFetch, shopeeWrite } from '../_shared/shopee.ts'

// Chamada sob demanda pelo frontend (supabase.functions.invoke) — precisa
// de CORS, diferente do shopee-webhook/shopee-oauth-callback (esses são
// chamados pela própria Shopee, não pelo navegador). Mesmo padrão do
// ml-insights/index.ts.
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Shopee não devolve link público pronto no item — o padrão de URL sem
// slug (`/product/{shop_id}/{item_id}`) redireciona certo mesmo assim.
function itemPermalink(shopId: string, itemId: number) {
  return `https://shopee.com.br/product/${shopId}/${itemId}`
}

async function searchAllItemIds(integration: any, itemStatus: string): Promise<number[]> {
  const ids: number[] = []
  let offset = 0
  for (let i = 0; i < 20; i++) { // teto de segurança
    const page = await shopeeFetch('/api/v2/product/get_item_list', integration, {
      offset: String(offset), page_size: '100', item_status: itemStatus,
    })
    const items = page?.response?.item ?? []
    items.forEach((it: any) => ids.push(it.item_id))
    if (!page?.response?.has_next_page || !items.length) break
    offset = page?.response?.next_offset ?? (offset + items.length)
  }
  return ids
}

async function activeListings(integration: any) {
  const [normalIds, unlistIds] = await Promise.all([
    searchAllItemIds(integration, 'NORMAL'),
    searchAllItemIds(integration, 'UNLIST'),
  ])
  const ids = [...normalIds, ...unlistIds]
  if (!ids.length) return { results: [] }

  const results: any[] = []
  for (const group of chunk(ids, 50)) {
    try {
      const detail = await shopeeFetch('/api/v2/product/get_item_base_info', integration, {
        item_id_list: group.join(','),
      })
      ;(detail?.response?.item_list ?? []).forEach((item: any) => {
        if (!item?.item_id) return
        const price = item.price_info?.[0]?.current_price ?? item.price_info?.current_price ?? null
        const stock = item.stock_info_v2?.summary_info?.total_available_stock
          ?? item.stock_info_v2?.seller_stock?.[0]?.stock ?? item.stock_info?.stock_type ?? null
        results.push({
          item_id:            item.item_id,
          title:              item.item_name,
          thumbnail:          item.image?.image_url_list?.[0] || null,
          price,
          available_quantity: stock,
          status:             item.item_status === 'NORMAL' ? 'active' : item.item_status === 'UNLIST' ? 'paused' : (item.item_status || '').toLowerCase(),
          permalink:          itemPermalink(integration.shop_id, item.item_id),
        })
      })
    } catch { /* lote falho não derruba os outros */ }
  }
  return { results }
}

// DEBUG permanente — mesmo padrão do item_raw_debug do ml-insights, pra
// inspecionar a resposta bruta quando algo não bater.
async function itemContentDiagnosisDebug(integration: any, itemIds: number[]) {
  return await shopeeFetch('/api/v2/product/get_item_content_diagnosis_result', integration, {
    item_id_list: itemIds.join(','),
  })
}

// ── Estoque Full (SBS — armazém da própria Shopee) ───────────────────
// Endpoints/campos confirmados em 16/09 contra a API real (`/api/v2/sbs/
// get_bound_whs_info` e `/api/v2/sbs/get_current_inventory`, sign OK,
// chamada aceita) — só não deu pra ver dado de verdade porque a loja de
// TESTE/sandbox não está vinculada a nenhum armazém (a loja real da
// CoisaPet usa, confirmado com o Raphael). Formato de campo vem do SDK
// comunitário `congminh1254/shopee-sdk` (schema TS, ver
// [[coisapet_shopee_api_research]]) — igual qualquer campo só validado
// por doc de terceiro, ler tudo com `?? null`/optional chaining, nunca
// assumir presença, e revalidar assim que tiver dado real (produção
// aprovada + loja com estoque no armazém).
async function sbsBoundWarehouses(integration: any) {
  const res = await shopeeFetch('/api/v2/sbs/get_bound_whs_info', integration, {})
  const list = res?.response?.list ?? []
  const mine = list.find((l: any) => String(l.shop_id) === String(integration.shop_id)) ?? list[0]
  const boundWhs = (mine?.bound_whs ?? []).flatMap((b: any) => (b.whs_ids ?? []).map((id: string) => ({ whs_id: id, whs_region: b.whs_region })))
  return { bound: boundWhs.length > 0, warehouses: boundWhs }
}

async function sbsFulfillmentStock(integration: any, whsRegion: string) {
  const items: any[] = []
  for (let page = 1; page <= 30; page++) { // teto de segurança
    const res = await shopeeFetch('/api/v2/sbs/get_current_inventory', integration, {
      whs_region: whsRegion, page_no: String(page), page_size: '100',
    })
    const pageItems = res?.response?.item_list ?? []
    items.push(...pageItems)
    if (pageItems.length < 100) break
  }

  return items.map((item: any) => {
    const skus = (item.sku_list ?? []).map((sku: any) => {
      const whsList = (sku.whs_list ?? []).map((w: any) => ({
        whs_id:        w.whs_id ?? null,
        sellable_qty:  w.sellable_qty ?? 0,
        reserved_qty:  w.reserved_qty ?? 0,
        unsellable_qty: w.unsellable_qty ?? 0,
        coverage_days: w.coverage_days ?? null,
        selling_speed: w.selling_speed ?? null,
        last_30_sold:  w.last_30_sold ?? null,
      }))
      return {
        model_name:    sku.model_name ?? null,
        shop_item_id:  sku.shop_sku_list?.[0]?.shop_item_id ?? null,
        shop_model_id: sku.shop_sku_list?.[0]?.shop_model_id ?? null,
        whs_list:      whsList,
        sellable_total: whsList.reduce((s: number, w: any) => s + w.sellable_qty, 0),
      }
    })
    return {
      warehouse_item_id: item.warehouse_item_id ?? null,
      title:              item.item_name ?? null,
      thumbnail:          item.item_image ?? null,
      shop_item_id:       skus.find((s: any) => s.shop_item_id)?.shop_item_id ?? null,
      skus,
      sellable_total: skus.reduce((s: number, sku: any) => s + sku.sellable_total, 0),
    }
  })
}

// Saúde dos Anúncios — confirmado ao vivo em 16/09 contra o item de
// teste real: `get_item_content_diagnosis_result` devolve
// `response.success_item_list[]` com `quality_level` (número) e
// `unfinished_task[]` ({issue_type, suggestion em inglês}). Sem
// pendência = saudável; 1 pendência = atenção; 2+ = perdendo exposição
// (mesmos 3 níveis do ML, adaptado pro que a Shopee realmente devolve —
// não tentei inventar limite pelo `quality_level` em si, a escala
// completa dele não foi confirmada).
async function itemsHealth(integration: any) {
  const ids = await searchAllItemIds(integration, 'NORMAL')
  if (!ids.length) return { results: [] }

  const results: any[] = []
  for (const group of chunk(ids, 50)) {
    try {
      const [diag, base] = await Promise.all([
        shopeeFetch('/api/v2/product/get_item_content_diagnosis_result', integration, { item_id_list: group.join(',') }),
        shopeeFetch('/api/v2/product/get_item_base_info', integration, { item_id_list: group.join(',') }),
      ])
      const baseById = new Map((base?.response?.item_list ?? []).map((b: any) => [b.item_id, b]))
      ;(diag?.response?.success_item_list ?? []).forEach((d: any) => {
        const b = baseById.get(d.item_id)
        const tasks = d.unfinished_task || []
        results.push({
          item_id:       d.item_id,
          title:         b?.item_name || null,
          thumbnail:     b?.image?.image_url_list?.[0] || null,
          permalink:     itemPermalink(integration.shop_id, d.item_id),
          quality_level: d.quality_level ?? null,
          status:        tasks.length === 0 ? 'healthy' : tasks.length === 1 ? 'warning' : 'unhealthy',
          pending:       tasks.map((t: any) => ({ issue_type: t.issue_type, suggestion: t.suggestion })),
          pending_count: tasks.length,
        })
      })
    } catch { /* lote falho não derruba os outros */ }
  }
  results.sort((a, b) => b.pending_count - a.pending_count)
  return { results }
}

// Detalhe completo de 1 anúncio — pra tela "Saúde dos Anúncios > detalhe"
// (Visão Geral + edição rápida de preço/estoque). Campos confirmados ao
// vivo em 16/09 contra o item de teste real (885183339, sem variação):
// `price_info[0].current_price`, `stock_info_v2.seller_stock[0]`
// ({location_id, stock}), `description_info.extended_description
// .field_list[{field_type:'text', text}]`, `update_time`/`create_time`
// em epoch (segundos). Variação (`has_model`) não testada ainda — item
// de teste não tem nenhuma; se `has_model=true`, a edição de preço/
// estoque abaixo (feita no nível do item, `model_id:0`) não serve, mas
// ao menos os dados de leitura (`models.response.model`) já vêm prontos
// pra tratar isso numa próxima parte.
async function itemDetail(integration: any, itemId: number) {
  const [base, models, diag] = await Promise.all([
    shopeeFetch('/api/v2/product/get_item_base_info', integration, {
      item_id_list: String(itemId),
      response_optional_fields: 'item_name,description,price_info,stock_info_v2,image,item_status,update_time,create_time,has_model,condition,weight,dimension,category_id,brand,description_info',
    }),
    shopeeFetch('/api/v2/product/get_model_list', integration, { item_id: String(itemId) }).catch(() => null),
    shopeeFetch('/api/v2/product/get_item_content_diagnosis_result', integration, { item_id_list: String(itemId) }).catch(() => null),
  ])
  const item = base?.response?.item_list?.[0]
  if (!item) throw new Error('Anúncio não encontrado')

  const descriptionText = (item.description_info?.extended_description?.field_list ?? [])
    .filter((f: any) => f.field_type === 'text').map((f: any) => f.text).join('\n') || item.description || ''

  const diagItem = diag?.response?.success_item_list?.find((d: any) => d.item_id === itemId)
  const tasks = diagItem?.unfinished_task ?? []

  return {
    item_id:     item.item_id,
    title:       item.item_name,
    description: descriptionText,
    images:         item.image?.image_url_list ?? [],
    image_id_list:  item.image?.image_id_list ?? [],
    thumbnail:      item.image?.image_url_list?.[0] || null,
    price:       item.price_info?.[0]?.current_price ?? null,
    currency:    item.price_info?.[0]?.currency ?? 'BRL',
    stock:       item.stock_info_v2?.summary_info?.total_available_stock ?? null,
    status:      item.item_status === 'NORMAL' ? 'active' : item.item_status === 'UNLIST' ? 'paused' : (item.item_status || '').toLowerCase(),
    has_model:   !!item.has_model,
    models:      models?.response?.model ?? [],
    condition:   item.condition ?? null,
    weight:      item.weight ?? null,
    dimension:   item.dimension ?? null,
    category_id: item.category_id ?? null,
    brand:       item.brand?.original_brand_name || null,
    create_time: item.create_time ? item.create_time * 1000 : null,
    update_time: item.update_time ? item.update_time * 1000 : null,
    permalink:   itemPermalink(integration.shop_id, item.item_id),
    quality_level: diagItem?.quality_level ?? null,
    pending:       tasks.map((t: any) => ({ issue_type: t.issue_type, suggestion: t.suggestion })),
  }
}

async function updateItemPrice(integration: any, db: ReturnType<typeof adminClient>, itemId: number, price: number) {
  const res = await shopeeWrite('/api/v2/product/update_price', integration, {
    item_id: itemId, price_list: [{ model_id: 0, original_price: price }],
  })
  await db.from('shopee_item_updates').insert({ item_id: String(itemId), action: 'update_price', detail: { price } })
  return { ok: true, item_id: itemId, price, raw: res }
}

async function updateItemStock(integration: any, db: ReturnType<typeof adminClient>, itemId: number, stock: number) {
  const res = await shopeeWrite('/api/v2/product/update_stock', integration, {
    item_id: itemId, stock_list: [{ model_id: 0, seller_stock: [{ location_id: 'BRZ', stock }] }],
  })
  await db.from('shopee_item_updates').insert({ item_id: String(itemId), action: 'update_stock', detail: { stock } })
  return { ok: true, item_id: itemId, stock, raw: res }
}

async function updateItemStatus(integration: any, db: ReturnType<typeof adminClient>, itemId: number, unlist: boolean) {
  const res = await shopeeWrite('/api/v2/product/unlist_item', integration, {
    item_list: [{ item_id: itemId, unlist }],
  })
  await db.from('shopee_item_updates').insert({
    item_id: String(itemId), action: 'toggle_status', detail: { unlist },
  })
  return { ok: true, item_id: itemId, unlist, raw: res }
}

// ── Conteúdo & IA (título/descrição) ─────────────────────────────────
// Mesmo espírito do suggestContent do ml-insights, mas sem os dados que
// a Shopee não confirma pra nós ainda (tendência de categoria, perguntas
// reais de comprador) — usa só o que já temos: título/descrição/ficha
// técnica atuais do próprio item_detail.
const SHOPEE_CONTENT_SYSTEM_PROMPT = `Você é um especialista em copywriting e SEO para anúncios da Shopee Brasil, escrevendo para um FABRICANTE (não revendedor) de produtos pet personalizados/artesanais.

Sua tarefa é sugerir um título e uma descrição MELHORES para um anúncio, usando SOMENTE os fatos fornecidos (título atual, descrição atual, e ficha técnica: peso, dimensões, condição, marca).

REGRA MAIS IMPORTANTE — NUNCA INVENTAR FATO:
Nunca invente característica, material, medida, garantia, prazo ou qualquer especificação que não esteja explicitamente nos dados fornecidos. Isso seria propaganda enganosa num anúncio real de venda. Se uma informação não foi fornecida, simplesmente não mencione.

REGRAS DO TÍTULO:
- Máximo 120 caracteres (limite da Shopee, bem maior que o do Mercado Livre).
- Estrutura: tipo de produto primeiro, depois os atributos que o comprador mais usa pra buscar (material, tamanho/medida, uso, diferencial real).
- NUNCA use palavra promocional/subjetiva: "grátis", "promoção", "oferta", "imperdível", "o melhor", "top", "barato".
- Sem tudo em maiúsculo, sem emoji, sem caractere especial solto, sem palavra repetida.

REGRAS DA DESCRIÇÃO (bastante informação E tom fofo/carinhoso — nunca um parágrafo curto e genérico de propaganda vazia, mas também nunca um catálogo técnico frio):
- Estrutura: (1) abertura curta e fofa apresentando o produto, (2) bloco "Especificações técnicas:" com "- Nome: valor" pra cada dado de ficha técnica fornecido, (3) parágrafo sobre uso/personalização se aplicável, (4) frase final fofa de fechamento/chamada pra compra. Separe blocos com \\n\\n.
- Tom fofo, carinhoso e vendável nos blocos de texto corrido — loja especializada em produtos pra pets pequenos.
- PROIBIDO usar asterisco (*) ou # pra destacar palavra — o campo da Shopee é texto puro.
- Texto corrido em português do Brasil.

FORMATO DA RESPOSTA — JSON válido, exatamente:
{"title": "...", "description": "...", "changes_summary": "..."}`

async function callOpenAI(userPrompt: string, systemPrompt: string) {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('Chave da OpenAI não configurada (OPENAI_API_KEY).')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0.4,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    }),
  })
  if (!res.ok) throw new Error(`Erro na API da OpenAI: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Resposta vazia da OpenAI.')
  return JSON.parse(content)
}

function buildShopeeFichaTecnica(item: any) {
  const lines: string[] = []
  if (item.weight) lines.push(`Peso: ${item.weight} kg`)
  if (item.dimension) lines.push(`Dimensões da embalagem: ${item.dimension.package_length}x${item.dimension.package_width}x${item.dimension.package_height} cm`)
  if (item.brand) lines.push(`Marca: ${item.brand}`)
  if (item.condition) lines.push(`Condição: ${item.condition === 'NEW' ? 'Novo' : item.condition}`)
  return lines.join('\n')
}

async function suggestItemContent(integration: any, itemId: number) {
  const item = await itemDetail(integration, itemId)
  const ficha = buildShopeeFichaTecnica(item)
  const prompt = [
    `Título atual: ${item.title}`,
    `Descrição atual: ${item.description || '(sem descrição cadastrada ainda)'}`,
    ficha ? `Ficha técnica preenchida (use na descrição):\n${ficha}` : 'Ficha técnica: nenhum dado preenchido ainda.',
  ].join('\n\n')
  const suggestion = await callOpenAI(prompt, SHOPEE_CONTENT_SYSTEM_PROMPT)
  return {
    current:   { title: item.title, description: item.description },
    suggested: { title: suggestion.title, description: suggestion.description, changes_summary: suggestion.changes_summary },
  }
}

// Só muda o(s) campo(s) enviado(s) — confirmado ao vivo em 16/09 contra
// o item de teste real: description/item_name/image/weight/dimension são
// todos parciais nesse endpoint (diferente do PUT de variations do ML,
// que substitui o array inteiro — ver [[coisapet_ml_variations_put_gotcha]]).
// EXCEÇÃO confirmada também ao vivo: `image.image_id_list`, quando
// enviado, SUBSTITUI a lista inteira de fotos — por isso toda função que
// mexe em foto (anexar/excluir abaixo) sempre lê a lista atual primeiro e
// manda a lista completa de novo, nunca só o que mudou.
async function applyItemContent(integration: any, db: ReturnType<typeof adminClient>, itemId: number, payload: { title?: string; description?: string }) {
  const body: Record<string, unknown> = { item_id: itemId }
  if (payload.title != null) body.item_name = payload.title
  if (payload.description != null) { body.description_type = 'normal'; body.description = payload.description }
  await shopeeWrite('/api/v2/product/update_item', integration, body)
  await db.from('shopee_item_updates').insert({ item_id: String(itemId), action: 'update_content', detail: payload })
  return { ok: true, item_id: itemId }
}

async function updateItemTechnical(integration: any, db: ReturnType<typeof adminClient>, itemId: number, fields: { weight?: number; dimension?: { package_length: number; package_width: number; package_height: number } }) {
  const body: Record<string, unknown> = { item_id: itemId }
  if (fields.weight != null) body.weight = fields.weight
  if (fields.dimension) body.dimension = fields.dimension
  await shopeeWrite('/api/v2/product/update_item', integration, body)
  await db.from('shopee_item_updates').insert({ item_id: String(itemId), action: 'update_technical', detail: fields })
  return { ok: true, item_id: itemId }
}

// ── Imagens & IA ──────────────────────────────────────────────────────
const SHOPEE_IMAGE_SUGGEST_SYSTEM_PROMPT = `Você é um especialista em fotografia de produto e conversão de anúncios da Shopee Brasil, ajudando um FABRICANTE de produtos pet personalizados/artesanais a decidir que NOVAS fotos gerar por IA pra um anúncio, a partir da foto real do produto já existente.

Sugira de 2 a 4 ideias concretas de imagem, usando SOMENTE os fatos fornecidos (título, ficha técnica, descrição atual).

REGRA MAIS IMPORTANTE — NUNCA INVENTAR FATO:
Nunca proponha uma imagem que sugira característica, material, medida ou uso que não esteja nos dados fornecidos. Se não há dado suficiente, prefira uma ideia mais genérica (ex: "mostrar o produto em uso num ambiente doméstico", "close-up do material/acabamento") em vez de inventar contexto.

Baseie as ideias na ficha técnica e na descrição: ângulos que mostrem melhor o material/acabamento, o produto em contexto de uso real, escala/tamanho comparado a algo reconhecível, ou o produto com o pet certo interagindo (só se o tipo de pet for claro pelo título/categoria).

CADA SUGESTÃO PRECISA TER:
- title: título curto em português (max ~8 palavras).
- reason: 1 frase em português explicando por que essa foto ajuda a vender/esclarecer dúvida.
- prompt: instrução de EDIÇÃO DE IMAGEM pronta, em INGLÊS, pra uma IA que recebe a FOTO REAL do produto como imagem-base e compõe a cena ao redor dele SEM alterar o produto em si.

FORMATO DA RESPOSTA — JSON válido, exatamente:
{"suggestions": [{"title": "...", "reason": "...", "prompt": "..."}]}`

async function suggestItemImages(integration: any, itemId: number) {
  const item = await itemDetail(integration, itemId)
  const ficha = buildShopeeFichaTecnica(item)
  const prompt = [
    `Título do anúncio: ${item.title}`,
    `Descrição atual: ${item.description || '(sem descrição cadastrada ainda)'}`,
    ficha ? `Ficha técnica preenchida:\n${ficha}` : 'Ficha técnica: nenhum dado preenchido ainda.',
  ].join('\n\n')
  const result = await callOpenAI(prompt, SHOPEE_IMAGE_SUGGEST_SYSTEM_PROMPT)
  return {
    suggestions: (result?.suggestions || []).filter((s: any) => s?.title && s?.prompt),
    images: item.images,
    image_id_list: item.image_id_list,
  }
}

// Cloudflare/OpenAI às vezes devolve 502/503/504 sem ser um problema
// real — só vale re-tentar 5xx (mesmo padrão do ml-insights/blog-ai).
async function fetchRetrying5xx(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  let lastRes: Response = null as unknown as Response
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastRes = await fetch(url, init)
    if (lastRes.ok || lastRes.status < 500) return lastRes
    if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
  }
  return lastRes
}

const MANDATORY_ITEM_IMAGE_SUFFIX = ' Keep the product itself (shape, color, material, size, proportions, finish) EXACTLY as shown in the reference photo, unless explicitly asked to change one specific attribute like color. No text, no logos, no watermarks, no engraved brand marks or labels anywhere in the image. Photorealistic, shot on a camera, natural lighting and shadow, real material texture, avoid CGI/3D render look, avoid plastic/overly smooth look, avoid the uncanny AI-generated look. Square composition (1:1), product fully visible with comfortable framing, not cropped at the edges. If an animal is shown, depict it at realistic real-world scale for its species and candidly interacting with the product, not stiffly posed facing the camera.'

async function callOpenAiImageEditItem(referenceImageUrl: string, prompt: string): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada.')
  const imgRes = await fetch(referenceImageUrl)
  if (!imgRes.ok) throw new Error(`Erro ao baixar a foto do produto: HTTP ${imgRes.status}`)
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
  const imgBytes = new Uint8Array(await imgRes.arrayBuffer())

  const form = new FormData()
  form.append('model', 'gpt-image-1')
  form.append('prompt', prompt)
  form.append('size', '1024x1024') // Shopee mostra as fotos em 1:1, diferente do vertical do ML
  form.append('image[]', new Blob([imgBytes], { type: contentType }), 'reference.jpg')

  const editRes = await fetchRetrying5xx('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
  })
  if (!editRes.ok) throw new Error(`Erro na API da OpenAI (edição de imagem): ${editRes.status} ${await editRes.text()}`)
  const editData = await editRes.json()
  const b64 = editData.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI não devolveu imagem (b64_json ausente).')
  return b64
}

async function generateItemImage(pictureUrl: string, prompt: string) {
  if (!pictureUrl) throw new Error('Nenhuma foto de referência do produto foi informada.')
  if (!prompt) throw new Error('Nenhuma instrução de imagem foi informada.')
  const finalPrompt = prompt + MANDATORY_ITEM_IMAGE_SUFFIX
  const imageBase64 = await callOpenAiImageEditItem(pictureUrl, finalPrompt)
  return { image_base64: imageBase64, prompt_used: finalPrompt }
}

const CUSTOM_IMAGE_PROMPT_SYSTEM = `Você traduz um pedido curto em português (de um lojista, sobre a foto de um produto) numa instrução de EDIÇÃO de imagem em INGLÊS, pra uma IA que recebe a FOTO REAL do produto e deve aplicar só a mudança pedida.

REGRAS:
- Preserve exatamente a intenção do pedido — não invente mudança extra que não foi pedida, nem remova parte do pedido.
- Deixe claro que tudo no produto deve continuar igual (forma, material, proporção, acabamento) EXCETO o que foi pedido explicitamente.
- Direto na instrução, sem "Prompt:", sem aspas.

FORMATO DA RESPOSTA — JSON válido, exatamente:
{"prompt": "..."}`

async function generateItemImageCustom(pictureUrl: string, instructionPt: string) {
  const result = await callOpenAI(`Pedido do lojista (português): ${instructionPt}`, CUSTOM_IMAGE_PROMPT_SYSTEM)
  const prompt = String(result?.prompt || '').trim()
  if (!prompt) throw new Error('Não foi possível montar uma instrução de edição a partir do pedido.')
  return generateItemImage(pictureUrl, prompt)
}

// Upload multipart pro media_space da Shopee — não dá pra reaproveitar
// shopeeWrite (sempre manda JSON), mesma assinatura de escrita de loja.
async function uploadShopeeImage(integration: any, imageBase64: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000)
  const partnerId = Deno.env.get('SHOPEE_PARTNER_ID')!
  const path = '/api/v2/media_space/upload_image'
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(Deno.env.get('SHOPEE_PARTNER_KEY')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(`${partnerId}${path}${timestamp}${integration.access_token}${integration.shop_id}`))
  const sign = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
  const params = new URLSearchParams({
    partner_id: partnerId, timestamp: String(timestamp), sign,
    shop_id: integration.shop_id, access_token: integration.access_token,
  })
  const bytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0))
  const form = new FormData()
  form.append('image', new Blob([bytes], { type: 'image/png' }), 'ai-generated.png')

  const base = Deno.env.get('SHOPEE_API_BASE') || 'https://openplatform.sandbox.test-stable.shopee.sg'
  const res = await fetch(`${base}${path}?${params}`, { method: 'POST', body: form })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(`Erro na API da Shopee (${path}): ${res.status} ${JSON.stringify(data)}`)
  const imageId = data?.response?.image_info?.image_id
  if (!imageId) throw new Error('Shopee não devolveu image_id no upload.')
  return imageId
}

// `image.image_id_list` no update_item SUBSTITUI a lista inteira
// (confirmado ao vivo 16/09) — por isso sempre lê a lista atual do
// próprio item antes de montar a nova, nunca confia num estado local
// que possa estar desatualizado.
async function attachItemImage(integration: any, db: ReturnType<typeof adminClient>, itemId: number, imageBase64: string) {
  const imageId = await uploadShopeeImage(integration, imageBase64)
  const current = await itemDetail(integration, itemId)
  const newList = [...current.image_id_list, imageId]
  await shopeeWrite('/api/v2/product/update_item', integration, { item_id: itemId, image: { image_id_list: newList } })
  await db.from('shopee_item_updates').insert({ item_id: String(itemId), action: 'picture_added', detail: { image_id: imageId } })
  return { ok: true, image_id: imageId }
}

async function deleteItemImage(integration: any, db: ReturnType<typeof adminClient>, itemId: number, imageId: string) {
  const current = await itemDetail(integration, itemId)
  const newList = current.image_id_list.filter((id: string) => id !== imageId)
  if (!newList.length) throw new Error('Não é possível excluir: o anúncio precisa ter pelo menos 1 foto.')
  await shopeeWrite('/api/v2/product/update_item', integration, { item_id: itemId, image: { image_id_list: newList } })
  await db.from('shopee_item_updates').insert({ item_id: String(itemId), action: 'picture_removed', detail: { image_id: imageId } })
  return { ok: true }
}

// ── Desempenho ────────────────────────────────────────────────────────
// Mesma decisão de arquitetura da Visão Geral: não busca ao vivo na API
// da Shopee (não temos endpoint de métrica por item confirmado ainda,
// ver [[coisapet_shopee_api_research]] — Ads API fica pra quando o
// Raphael priorizar), lê direto dos NOSSOS pedidos já sincronizados.
// Casamento é por TÍTULO exato (`order_items.titulo` = `item_name` da
// Shopee) — não temos `item_id` salvo no pedido, só SKU/título (ver
// `shopee-process-webhook/index.ts`); funciona bem pra item sem
// variação, pode ficar impreciso se o título mudar depois de vendas
// antigas (fica documentado, não escondido).
// ── Cupons (Voucher) ──────────────────────────────────────────────────
// Endpoints/campos vieram do SDK comunitário `congminh1254/shopee-sdk`
// (ver [[coisapet_shopee_api_research]]) — testar leitura contra o
// sandbox antes de confiar 100%, mesma regra de sempre. Diferente do ML
// (só leitura, cupom é criado no painel deles), aqui é CRUD completo de
// verdade — toda escrita passa por confirmação explícita na tela.
async function voucherList(integration: any, status: string, pageNo: number, pageSize: number) {
  return await shopeeFetch('/api/v2/voucher/get_voucher_list', integration, {
    status, page_no: String(pageNo), page_size: String(pageSize),
  })
}

async function voucherDetail(integration: any, voucherId: number) {
  return await shopeeFetch('/api/v2/voucher/get_voucher', integration, { voucher_id: String(voucherId) })
}

async function createVoucher(integration: any, db: ReturnType<typeof adminClient>, payload: Record<string, unknown>) {
  const res = await shopeeWrite('/api/v2/voucher/add_voucher', integration, payload)
  await db.from('shopee_item_updates').insert({ item_id: 'campaign', action: 'voucher_created', detail: payload })
  return res
}

async function updateVoucher(integration: any, db: ReturnType<typeof adminClient>, payload: Record<string, unknown>) {
  const res = await shopeeWrite('/api/v2/voucher/update_voucher', integration, payload)
  await db.from('shopee_item_updates').insert({ item_id: 'campaign', action: 'voucher_updated', detail: payload })
  return res
}

async function endVoucherNow(integration: any, db: ReturnType<typeof adminClient>, voucherId: number) {
  const res = await shopeeWrite('/api/v2/voucher/end_voucher', integration, { voucher_id: voucherId })
  await db.from('shopee_item_updates').insert({ item_id: 'campaign', action: 'voucher_ended', detail: { voucher_id: voucherId } })
  return res
}

async function deleteVoucherNow(integration: any, db: ReturnType<typeof adminClient>, voucherId: number) {
  const res = await shopeeWrite('/api/v2/voucher/delete_voucher', integration, { voucher_id: voucherId })
  await db.from('shopee_item_updates').insert({ item_id: 'campaign', action: 'voucher_deleted', detail: { voucher_id: voucherId } })
  return res
}

// ── Flash Sale (loja) ────────────────────────────────────────────────
async function flashSaleTimeSlots(integration: any, startTime: number, endTime: number) {
  return await shopeeFetch('/api/v2/shop_flash_sale/get_time_slot_id', integration, {
    start_time: String(startTime), end_time: String(endTime),
  })
}

async function flashSaleList(integration: any, type: number, offset: number, limit: number) {
  return await shopeeFetch('/api/v2/shop_flash_sale/get_shop_flash_sale_list', integration, {
    type: String(type), offset: String(offset), limit: String(limit),
  })
}

async function flashSaleDetail(integration: any, flashSaleId: number) {
  return await shopeeFetch('/api/v2/shop_flash_sale/get_shop_flash_sale', integration, { flash_sale_id: String(flashSaleId) })
}

async function flashSaleItemCriteria(integration: any) {
  return await shopeeFetch('/api/v2/shop_flash_sale/get_item_criteria', integration, {})
}

async function createFlashSale(integration: any, db: ReturnType<typeof adminClient>, timeslotId: number) {
  const res = await shopeeWrite('/api/v2/shop_flash_sale/create_shop_flash_sale', integration, { timeslot_id: timeslotId })
  await db.from('shopee_item_updates').insert({ item_id: 'campaign', action: 'flash_sale_created', detail: { timeslot_id: timeslotId } })
  return res
}

async function updateFlashSaleStatus(integration: any, db: ReturnType<typeof adminClient>, flashSaleId: number, status: number) {
  const res = await shopeeWrite('/api/v2/shop_flash_sale/update_shop_flash_sale', integration, { flash_sale_id: flashSaleId, status })
  await db.from('shopee_item_updates').insert({ item_id: 'campaign', action: 'flash_sale_status', detail: { flash_sale_id: flashSaleId, status } })
  return res
}

async function deleteFlashSale(integration: any, db: ReturnType<typeof adminClient>, flashSaleId: number) {
  const res = await shopeeWrite('/api/v2/shop_flash_sale/delete_shop_flash_sale', integration, { flash_sale_id: flashSaleId })
  await db.from('shopee_item_updates').insert({ item_id: 'campaign', action: 'flash_sale_deleted', detail: { flash_sale_id: flashSaleId } })
  return res
}

async function flashSaleItems(integration: any, flashSaleId: number, offset: number, limit: number) {
  return await shopeeFetch('/api/v2/shop_flash_sale/get_shop_flash_sale_items', integration, {
    flash_sale_id: String(flashSaleId), offset: String(offset), limit: String(limit),
  })
}

async function addFlashSaleItems(integration: any, db: ReturnType<typeof adminClient>, flashSaleId: number, items: unknown[]) {
  const res = await shopeeWrite('/api/v2/shop_flash_sale/add_shop_flash_sale_items', integration, { flash_sale_id: flashSaleId, items })
  await db.from('shopee_item_updates').insert({ item_id: 'campaign', action: 'flash_sale_items_added', detail: { flash_sale_id: flashSaleId, items } })
  return res
}

async function updateFlashSaleItems(integration: any, db: ReturnType<typeof adminClient>, flashSaleId: number, items: unknown[]) {
  const res = await shopeeWrite('/api/v2/shop_flash_sale/update_shop_flash_sale_items', integration, { flash_sale_id: flashSaleId, items })
  await db.from('shopee_item_updates').insert({ item_id: 'campaign', action: 'flash_sale_items_updated', detail: { flash_sale_id: flashSaleId, items } })
  return res
}

async function deleteFlashSaleItems(integration: any, db: ReturnType<typeof adminClient>, flashSaleId: number, itemIds: number[]) {
  const res = await shopeeWrite('/api/v2/shop_flash_sale/delete_shop_flash_sale_items', integration, { flash_sale_id: flashSaleId, item_ids: itemIds })
  await db.from('shopee_item_updates').insert({ item_id: 'campaign', action: 'flash_sale_items_removed', detail: { flash_sale_id: flashSaleId, item_ids: itemIds } })
  return res
}

// ── Retornos e pedidos cancelados (Fase, 24/09) ──────────────────────
// Espelha a tela "Retornos e Pedidos cancelados" do Seller Center.
// Leitura + as 2 ações que aparecem lá (Disputar / Finalizar sem
// disputas e reembolsar) — sempre atrás de confirmação explícita na
// tela, nunca em lote. Campos de resposta ainda não confirmados 100%
// ao vivo (documentação pública da v2, formato pode variar um pouco) —
// normaliza com fallback em vários nomes possíveis.
async function returnsList(integration: any, db: ReturnType<typeof adminClient>, params: { page_no: number; page_size: number; status?: string; create_time_from?: number; create_time_to?: number }) {
  const query: Record<string, string> = {
    page_no: String(params.page_no || 1),
    page_size: String(Math.min(params.page_size || 40, 100)),
  }
  if (params.status && params.status !== 'ALL') query.status = params.status
  if (params.create_time_from) query.create_time_from = String(params.create_time_from)
  if (params.create_time_to) query.create_time_to = String(params.create_time_to)
  const res = await shopeeFetch('/api/v2/returns/get_return_list', integration, query)
  let list = res?.response?.return ?? res?.return ?? []

  // Enriquece com a data da compra de verdade — o retorno da Shopee só
  // traz order_sn, não a data do pedido; o pedido já está sincronizado
  // no nosso banco (shopee-process-webhook), então cruza por num_venda
  // em vez de bater na API da Shopee de novo pra isso.
  const orderSns = [...new Set(list.map((r: any) => r.order_sn).filter(Boolean))]
  if (orderSns.length) {
    const { data: orders } = await db.from('orders').select('num_venda, data_venda').eq('source', 'shopee').in('num_venda', orderSns)
    const purchaseDateBySn: Record<string, string> = {}
    ;(orders || []).forEach((o: any) => { purchaseDateBySn[o.num_venda] = o.data_venda })
    list = list.map((r: any) => ({ ...r, purchase_date: purchaseDateBySn[r.order_sn] || null }))
  }
  return { results: list, more: !!(res?.response?.more ?? res?.more) }
}

// Classificação financeira do resultado — mesma lógica usada no
// relatório e (espelhada) no front pra colorir cada linha. REFUND_PAID
// é a única certeza de "saiu dinheiro"; CANCELLED/REJECTED = pedido
// encerrou sem reembolso (o valor ficou com a gente); o resto ou ainda
// tá em aberto (precisa de ação/aguardando) ou é status raro/não
// confirmado (cai em "outro", nunca chuta resultado financeiro errado).
const LOST_STATUSES    = new Set(['REFUND_PAID'])
const KEPT_STATUSES    = new Set(['CANCELLED', 'REJECTED'])
const PENDING_STATUSES = new Set(['REQUESTED', 'PROCESSING', 'JUDGING', 'ACCEPTED'])

// Relatório agregado (Fase, 24/09) — pedido do Raphael: total perdido
// (reembolsado), total recuperado (sem reembolso) e o que ainda precisa
// de ação, num período. Pagina até MAX_PAGES por segurança (teto de
// ~3000 retornos) — se bater no teto, `truncated:true` avisa o front.
async function returnsSummary(integration: any, days: number) {
  const now = Math.floor(Date.now() / 1000)
  const since = now - days * 86400
  const PAGE_SIZE = 100
  const MAX_CALLS = 40 // teto de segurança (até ~4000 retornos no período)

  // Achado ao vivo (24/09): create_time_from sozinho funciona liso, mas
  // combinado com create_time_to a Shopee devolve lista vazia sempre —
  // mesmo dentro do limite de 15 dias entre os dois (bug/limitação não
  // documentada, confirmado testando manualmente). Como o "até quando"
  // do relatório é sempre "agora", nem precisa de create_time_to —
  // só create_time_from resolve, sem o bug.
  let all: any[] = []
  let truncated = false
  let pageNo = 1
  while (pageNo <= MAX_CALLS) {
    const res = await shopeeFetch('/api/v2/returns/get_return_list', integration, {
      page_no: String(pageNo), page_size: String(PAGE_SIZE), create_time_from: String(since),
    })
    const list = res?.response?.return ?? res?.return ?? []
    all = all.concat(list)
    const more = !!(res?.response?.more ?? res?.more)
    if (!more || list.length === 0) break
    if (pageNo === MAX_CALLS) truncated = true
    pageNo++
  }

  let lostAmount = 0, lostCount = 0, keptAmount = 0, keptCount = 0
  let pendingAmount = 0, pendingCount = 0
  let urgentCount = 0   // ainda dá tempo (due_date nos próximos 3 dias)
  let overdueCount = 0  // prazo já passou, nunca respondido
  const reasonCounts: Record<string, number> = {}

  for (const r of all) {
    const amt = Number(r.refund_amount) || 0
    reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1
    if (LOST_STATUSES.has(r.status)) { lostAmount += amt; lostCount++ }
    else if (KEPT_STATUSES.has(r.status)) { keptAmount += amt; keptCount++ }
    else if (PENDING_STATUSES.has(r.status)) {
      pendingAmount += amt; pendingCount++
      const daysLeft = r.due_date ? (r.due_date - now) / 86400 : null
      if (daysLeft != null && daysLeft < 0) overdueCount++
      else if (daysLeft != null && daysLeft <= 3) urgentCount++
    }
  }

  return {
    period_days: days,
    total: all.length,
    truncated,
    lost:    { amount: lostAmount, count: lostCount },
    kept:    { amount: keptAmount, count: keptCount },
    pending: { amount: pendingAmount, count: pendingCount, urgent_count: urgentCount, overdue_count: overdueCount },
    by_reason: Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([reason, count]) => ({ reason, count })),
  }
}

async function returnDetail(integration: any, returnSn: string) {
  const res = await shopeeFetch('/api/v2/returns/get_return_detail', integration, { return_sn: returnSn })
  return res?.response ?? res
}

async function returnDisputeReasons(integration: any, returnSn: string) {
  const res = await shopeeFetch('/api/v2/returns/get_return_dispute_reason', integration, { return_sn: returnSn })
  return res?.response ?? res
}

async function returnConfirm(integration: any, db: ReturnType<typeof adminClient>, returnSn: string) {
  const res = await shopeeWrite('/api/v2/returns/confirm', integration, { return_sn: returnSn })
  await db.from('shopee_item_updates').insert({ item_id: returnSn, action: 'return_confirm', detail: {} })
  return { ok: true, return_sn: returnSn, raw: res }
}

async function returnDispute(
  integration: any, db: ReturnType<typeof adminClient>, returnSn: string,
  payload: { email: string; dispute_reason: string; dispute_text_reason?: string; images?: string[] },
) {
  const res = await shopeeWrite('/api/v2/returns/dispute', integration, { return_sn: returnSn, ...payload })
  await db.from('shopee_item_updates').insert({ item_id: returnSn, action: 'return_dispute', detail: payload })
  return { ok: true, return_sn: returnSn, raw: res }
}

async function itemPerformance(db: ReturnType<typeof adminClient>, title: string) {
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString()
  const { data: rows, error } = await db
    .from('order_items')
    .select('qty, preco_unit, orders!inner(id, data_venda, status_ml, source)')
    .eq('orders.source', 'shopee')
    .eq('titulo', title)
    .gte('orders.data_venda', since90)
  if (error) throw error

  const isCancelled = (s: string) => !!s && s.toLowerCase().includes('cancelad')
  const since30 = Date.now() - 30 * 86400000
  const valid = (rows || []).filter((r: any) => !isCancelled(r.orders.status_ml))
  const sum = (arr: any[], f: (r: any) => number) => arr.reduce((s, r) => s + f(r), 0)
  const d30 = valid.filter((r: any) => new Date(r.orders.data_venda).getTime() >= since30)

  return {
    units_30d:   sum(d30, r => Number(r.qty) || 0),
    revenue_30d: sum(d30, r => (Number(r.preco_unit) || 0) * (Number(r.qty) || 0)),
    units_90d:   sum(valid, r => Number(r.qty) || 0),
    revenue_90d: sum(valid, r => (Number(r.preco_unit) || 0) * (Number(r.qty) || 0)),
    orders_90d:  new Set(valid.map((r: any) => r.orders.id)).size,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }

  const db = adminClient()

  try {
    const integration = await getValidIntegration(db)

    switch (body.action) {
      case 'active_listings':
        return json(await activeListings(integration))
      case 'update_item_status':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await updateItemStatus(integration, db, Number(body.item_id), !!body.unlist))
      case 'item_content_diagnosis_debug':
        if (!body.item_ids) return json({ error: 'item_ids obrigatório' }, 400)
        return json(await itemContentDiagnosisDebug(integration, body.item_ids))
      case 'sbs_bound_warehouses':
        return json(await sbsBoundWarehouses(integration))
      case 'sbs_fulfillment_stock':
        return json({ results: await sbsFulfillmentStock(integration, String(body.whs_region || 'BR')) })
      case 'items_health':
        return json(await itemsHealth(integration))
      case 'item_detail':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await itemDetail(integration, Number(body.item_id)))
      case 'update_item_price':
        if (!body.item_id || body.price == null) return json({ error: 'item_id e price obrigatórios' }, 400)
        return json(await updateItemPrice(integration, db, Number(body.item_id), Number(body.price)))
      case 'update_item_stock':
        if (!body.item_id || body.stock == null) return json({ error: 'item_id e stock obrigatórios' }, 400)
        return json(await updateItemStock(integration, db, Number(body.item_id), Number(body.stock)))
      case 'suggest_item_content':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await suggestItemContent(integration, Number(body.item_id)))
      case 'apply_item_content':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await applyItemContent(integration, db, Number(body.item_id), { title: body.title, description: body.description }))
      case 'update_item_technical':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await updateItemTechnical(integration, db, Number(body.item_id), { weight: body.weight, dimension: body.dimension }))
      case 'suggest_item_images':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await suggestItemImages(integration, Number(body.item_id)))
      case 'generate_item_image':
        return json(await generateItemImage(String(body.picture_url), String(body.prompt)))
      case 'generate_item_image_custom':
        return json(await generateItemImageCustom(String(body.picture_url), String(body.instruction)))
      case 'attach_item_image':
        if (!body.item_id || !body.image_base64) return json({ error: 'item_id e image_base64 obrigatórios' }, 400)
        return json(await attachItemImage(integration, db, Number(body.item_id), String(body.image_base64)))
      case 'delete_item_image':
        if (!body.item_id || !body.image_id) return json({ error: 'item_id e image_id obrigatórios' }, 400)
        return json(await deleteItemImage(integration, db, Number(body.item_id), String(body.image_id)))
      case 'item_performance':
        if (!body.title) return json({ error: 'title obrigatório' }, 400)
        return json(await itemPerformance(db, String(body.title)))

      case 'voucher_list':
        return json(await voucherList(integration, String(body.status || 'all'), Number(body.page_no || 1), Number(body.page_size || 50)))
      case 'voucher_detail':
        if (!body.voucher_id) return json({ error: 'voucher_id obrigatório' }, 400)
        return json(await voucherDetail(integration, Number(body.voucher_id)))
      case 'voucher_create':
        return json(await createVoucher(integration, db, body.payload || {}))
      case 'voucher_update':
        return json(await updateVoucher(integration, db, body.payload || {}))
      case 'voucher_end':
        if (!body.voucher_id) return json({ error: 'voucher_id obrigatório' }, 400)
        return json(await endVoucherNow(integration, db, Number(body.voucher_id)))
      case 'voucher_delete':
        if (!body.voucher_id) return json({ error: 'voucher_id obrigatório' }, 400)
        return json(await deleteVoucherNow(integration, db, Number(body.voucher_id)))

      case 'flash_sale_time_slots':
        if (!body.start_time || !body.end_time) return json({ error: 'start_time e end_time obrigatórios' }, 400)
        return json(await flashSaleTimeSlots(integration, Number(body.start_time), Number(body.end_time)))
      case 'flash_sale_list':
        return json(await flashSaleList(integration, Number(body.type ?? 0), Number(body.offset || 0), Number(body.limit || 20)))
      case 'flash_sale_detail':
        if (!body.flash_sale_id) return json({ error: 'flash_sale_id obrigatório' }, 400)
        return json(await flashSaleDetail(integration, Number(body.flash_sale_id)))
      case 'flash_sale_item_criteria':
        return json(await flashSaleItemCriteria(integration))
      case 'flash_sale_create':
        if (!body.timeslot_id) return json({ error: 'timeslot_id obrigatório' }, 400)
        return json(await createFlashSale(integration, db, Number(body.timeslot_id)))
      case 'flash_sale_update_status':
        if (!body.flash_sale_id || !body.status) return json({ error: 'flash_sale_id e status obrigatórios' }, 400)
        return json(await updateFlashSaleStatus(integration, db, Number(body.flash_sale_id), Number(body.status)))
      case 'flash_sale_delete':
        if (!body.flash_sale_id) return json({ error: 'flash_sale_id obrigatório' }, 400)
        return json(await deleteFlashSale(integration, db, Number(body.flash_sale_id)))
      case 'flash_sale_items':
        if (!body.flash_sale_id) return json({ error: 'flash_sale_id obrigatório' }, 400)
        return json(await flashSaleItems(integration, Number(body.flash_sale_id), Number(body.offset || 0), Number(body.limit || 50)))
      case 'flash_sale_add_items':
        if (!body.flash_sale_id || !body.items) return json({ error: 'flash_sale_id e items obrigatórios' }, 400)
        return json(await addFlashSaleItems(integration, db, Number(body.flash_sale_id), body.items))
      case 'flash_sale_update_items':
        if (!body.flash_sale_id || !body.items) return json({ error: 'flash_sale_id e items obrigatórios' }, 400)
        return json(await updateFlashSaleItems(integration, db, Number(body.flash_sale_id), body.items))
      case 'flash_sale_delete_items':
        if (!body.flash_sale_id || !body.item_ids) return json({ error: 'flash_sale_id e item_ids obrigatórios' }, 400)
        return json(await deleteFlashSaleItems(integration, db, Number(body.flash_sale_id), body.item_ids))

      case 'returns_list':
        return json(await returnsList(integration, db, {
          page_no: Number(body.page_no || 1), page_size: Number(body.page_size || 40), status: body.status,
          create_time_from: body.create_time_from ? Number(body.create_time_from) : undefined,
          create_time_to: body.create_time_to ? Number(body.create_time_to) : undefined,
        }))
      case 'returns_summary':
        return json(await returnsSummary(integration, Number(body.days || 90)))
      case 'return_detail':
        if (!body.return_sn) return json({ error: 'return_sn obrigatório' }, 400)
        return json(await returnDetail(integration, String(body.return_sn)))
      case 'return_dispute_reasons':
        if (!body.return_sn) return json({ error: 'return_sn obrigatório' }, 400)
        return json(await returnDisputeReasons(integration, String(body.return_sn)))
      case 'return_confirm':
        if (!body.return_sn) return json({ error: 'return_sn obrigatório' }, 400)
        return json(await returnConfirm(integration, db, String(body.return_sn)))
      case 'return_dispute':
        if (!body.return_sn || !body.email || !body.dispute_reason) return json({ error: 'return_sn, email e dispute_reason obrigatórios' }, 400)
        return json(await returnDispute(integration, db, String(body.return_sn), {
          email: body.email, dispute_reason: body.dispute_reason,
          dispute_text_reason: body.dispute_text_reason, images: body.images,
        }))

      default:
        return json({ error: `Ação desconhecida: ${body.action}` }, 400)
    }
  } catch (err) {
    console.error('[shopee-insights] erro:', err)
    return json({ error: String(err) }, 500)
  }
})
