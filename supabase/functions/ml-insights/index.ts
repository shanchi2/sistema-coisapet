// Chamada sob demanda pelo frontend (supabase.functions.invoke), NÃO por
// webhook do ML — diferente de ml-process-webhook. Serve as telas de
// "Otimização ML" (Saúde dos Anúncios / Perguntas & Reputação): leitura
// pura da API do ML, nenhuma escrita no banco nem no próprio anúncio.
// Deploy COM verificação de JWT ligada (sem --no-verify-jwt), pra só
// usuário logado no sistema poder chamar.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration, mlFetch, mlWrite } from '../_shared/mercadolivre.ts'
import { toISODateBR } from '../_shared/dateBR.ts'

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

// Log de "última atualização" (Fase 38) — 1 linha por gravação real
// feita pelo sistema num anúncio. Nunca derruba a ação principal se
// falhar (é só um registro, não faz parte do fluxo crítico de escrita).
async function logItemUpdate(db: ReturnType<typeof adminClient>, itemId: string, action: string, detail?: unknown) {
  try {
    await db.from('ml_item_updates').insert({ item_id: itemId, action, detail: detail ?? null })
  } catch { /* log falho não é motivo pra falhar a gravação real */ }
}

async function itemUpdateHistory(db: ReturnType<typeof adminClient>, itemId: string) {
  const { data, error } = await db.from('ml_item_updates')
    .select('action, detail, updated_at')
    .eq('item_id', itemId)
    .order('updated_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return { results: data || [] }
}

// Tela "Histórico de Atualizações" (pedido do Raphael em 2026-09-08) —
// TODAS as gravações que o sistema já fez em QUALQUER anúncio, mais
// recente primeiro, não só de 1 item por vez (isso já existia via
// `itemUpdateHistory`, usado no detalhe de cada anúncio). Enriquece com
// título/thumbnail/permalink do item pra ficar legível — item pode ter
// sido excluído/pausado depois, então a busca em lote nunca derruba a
// página inteira (each catch isolado).
//
// Agrupado por anúncio (Fase 45) — se o mesmo item teve 2+ gravações
// (ex: ficha técnica E título/descrição), aparece 1 vez só, juntando as
// ações distintas. `offset`/`limit` paginam ANÚNCIOS (grupos), não
// linhas cruas do log — busca até 1000 linhas recentes do log (teto de
// segurança bem acima do volume atual) pra poder agrupar antes de
// paginar; se um dia passar disso, os itens mais antigos somem da
// lista, mas o volume atual está longe disso.
async function allItemUpdates(integration: any, db: ReturnType<typeof adminClient>, offset: number, limit: number) {
  const { data, error } = await db.from('ml_item_updates')
    .select('id, item_id, action, detail, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  const rows = data || []

  type Group = { item_id: string; updated_at: string; actions: Map<string, unknown> }
  const groups = new Map<string, Group>()
  for (const r of rows) {
    if (!r.item_id) continue
    let g = groups.get(r.item_id)
    if (!g) {
      g = { item_id: r.item_id, updated_at: r.updated_at, actions: new Map() }
      groups.set(r.item_id, g)
    }
    // rows já vêm DESC — a primeira ocorrência de cada tipo de ação
    // pra este item já é a mais recente daquele tipo.
    if (!g.actions.has(r.action)) g.actions.set(r.action, r.detail)
  }
  const allGroups = [...groups.values()].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  const total = allGroups.length
  const page = allGroups.slice(offset, offset + limit)

  const itemIds = page.map((g) => g.item_id)
  const titles = new Map<string, string>()
  const thumbs = new Map<string, string>()
  const permalinks = new Map<string, string>()
  for (const group of chunk(itemIds, 20)) {
    try {
      const multi = await mlFetch(`/items?ids=${group.join(',')}&attributes=id,title,thumbnail,permalink`, integration.access_token)
      ;(multi || []).forEach((entry: any) => {
        const item = entry?.body
        if (!item?.id) return
        titles.set(item.id, item.title)
        if (item.thumbnail) thumbs.set(item.id, item.thumbnail)
        if (item.permalink) permalinks.set(item.id, item.permalink)
      })
    } catch { /* lote falho não derruba os outros — fica só sem título/foto */ }
  }

  const { data: checks } = await db.from('ml_item_sync_checks')
    .select('item_id, checked_at, checked_by')
    .in('item_id', itemIds.length ? itemIds : [''])
  const checkByItem = new Map((checks || []).map((c: any) => [c.item_id, c]))

  const results = page.map((g) => {
    const check = checkByItem.get(g.item_id) as any
    // "checado" só vale se não surgiu NENHUMA mudança nova depois do
    // check — senão volta a aparecer como pendente sozinho.
    const checked = !!check && new Date(check.checked_at).getTime() >= new Date(g.updated_at).getTime()
    return {
      item_id: g.item_id,
      item_title: titles.get(g.item_id) || null,
      item_thumbnail: thumbs.get(g.item_id) || null,
      permalink: permalinks.get(g.item_id) || null,
      updated_at: g.updated_at,
      actions: [...g.actions.entries()].map(([action, detail]) => ({ action, detail })),
      checked,
      checked_at: check?.checked_at ?? null,
      checked_by: check?.checked_by ?? null,
    }
  })
  return { results, total, offset, limit }
}

// Escrita simples — sem confirmação explícita porque não muda NADA no
// Mercado Livre nem é visível pro comprador; é só um "já fiz isso"
// interno do Atendimento marcando que replicou a mudança na Shopee.
async function setItemSyncCheck(db: ReturnType<typeof adminClient>, itemId: string, checked: boolean, checkedBy?: string) {
  if (checked) {
    await db.from('ml_item_sync_checks').upsert({ item_id: itemId, checked_at: new Date().toISOString(), checked_by: checkedBy ?? null })
  } else {
    await db.from('ml_item_sync_checks').delete().eq('item_id', itemId)
  }
  return { ok: true, item_id: itemId, checked }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// GET /item/{id}/performance — sucessor do antigo /health (descontinuado).
// Formato confirmado ao vivo em 2026-09-02 (chamada real contra 223 itens
// da conta): raw.level é "good"|"medium"|"bad", ou ausente quando o ML
// ainda não calculou (item novo — ~5% dos casos reais, "não informado" é
// legítimo nesse caso). As pendências ficam dentro de
// raw.buckets[].variables[] (status "PENDING"|"COMPLETED"), cada uma já
// com `title` pronto pra exibir — NÃO em raw.results/actions como a
// primeira versão (escrita sem ver a resposta real) supunha; por isso
// ~95% dos itens apareciam "Não informado" antes desta correção, mesmo
// tendo diagnóstico de verdade.
const PERFORMANCE_LEVEL_TO_STATUS: Record<string, string> = { good: 'healthy', medium: 'warning', bad: 'unhealthy' }
function normalizePerformance(raw: any) {
  const status = raw?.level ? (PERFORMANCE_LEVEL_TO_STATUS[raw.level] ?? null) : null
  const pending = (raw?.buckets || []).flatMap((b: any) =>
    (b?.variables || []).filter((v: any) => v?.status === 'PENDING'),
  )
  return { status, pending_count: pending.length, pending, raw }
}

async function itemsHealth(integration: any, offset: number, limit: number) {
  const search = await mlFetch(
    `/users/${integration.ml_user_id}/items/search?status=active&offset=${offset}&limit=${limit}`,
    integration.access_token,
  )
  const ids: string[] = search.results || []
  const total = search.paging?.total ?? ids.length

  const results = await mapWithConcurrency(ids, 6, async (id) => {
    try {
      const perf = await mlFetch(`/item/${id}/performance`, integration.access_token)
      return { item_id: id, ...normalizePerformance(perf) }
    } catch (err) {
      return { item_id: id, error: String(err) }
    }
  })
  return { total, offset, limit, results }
}

async function attributesAudit(integration: any, offset: number, limit: number) {
  const search = await mlFetch(
    `/users/${integration.ml_user_id}/items/search?status=active&offset=${offset}&limit=${limit}`,
    integration.access_token,
  )
  const ids: string[] = search.results || []
  const total = search.paging?.total ?? ids.length

  const categoryCache = new Map<string, any[]>()
  const results = await mapWithConcurrency(ids, 6, async (id) => {
    try {
      const item = await mlFetch(`/items/${id}?attributes=id,title,category_id,attributes,shipping,permalink,thumbnail`, integration.access_token)
      const categoryId = item.category_id
      let catAttrs = categoryCache.get(categoryId)
      if (!catAttrs) {
        catAttrs = await mlFetch(`/categories/${categoryId}/attributes`, integration.access_token)
        categoryCache.set(categoryId, catAttrs!)
      }
      const required = (catAttrs || []).filter((a: any) => a?.tags?.required)
      const filledIds = new Set(
        (item.attributes || [])
          .filter((a: any) => a.value_id != null || (a.value_name && String(a.value_name).trim()))
          .map((a: any) => a.id),
      )
      const missing = required.filter((a: any) => !filledIds.has(a.id)).map((a: any) => ({ id: a.id, name: a.name }))
      return {
        item_id: id, title: item.title, category_id: categoryId, missing_count: missing.length, missing,
        shipping: extractShippingInfo(item), permalink: item.permalink || null, thumbnail: item.thumbnail || null,
      }
    } catch (err) {
      return { item_id: id, error: String(err) }
    }
  })
  return { total, offset, limit, results }
}

// `logistic_type: 'fulfillment'` = Full; qualquer outro valor com
// `free_shipping: true` (self_service, drop_off, xd_drop_off) = frete
// grátis "normal", sem ser Full — as duas coisas são independentes na API
// do ML, por isso reportamos separado em vez de um badge só.
function extractShippingInfo(item: any) {
  const s = item?.shipping ?? {}
  return {
    free_shipping: !!s.free_shipping,
    logistic_type: s.logistic_type ?? null,
    is_full: s.logistic_type === 'fulfillment',
  }
}

// Tráfego & Conversão — visitas (API) × vendas (NOSSO banco) × palavra-
// chave em alta por categoria. Usa multiget em lotes de 20 pra atributos
// (SELLER_SKU + category_id) E pra visitas, em vez de 1 chamada por
// item — bem mais barato que os scans de items_health/attributes_audit.
// Categoria/tendência é cacheada por category_id dentro da própria
// varredura (só 1 chamada de /trends por categoria distinta, não por item).
async function trafficAudit(integration: any, db: ReturnType<typeof adminClient>, offset: number, limit: number, days: number) {
  const search = await mlFetch(
    `/users/${integration.ml_user_id}/items/search?status=active&offset=${offset}&limit=${limit}`,
    integration.access_token,
  )
  const ids: string[] = search.results || []
  const total = search.paging?.total ?? ids.length
  if (!ids.length) return { total, offset, limit, results: [] }

  const itemMeta = new Map<string, {
    sku: string | null; title: string | null; category_id: string | null; available_quantity: number | null
    shipping: any; date_created: string | null; permalink: string | null; thumbnail: string | null
  }>()
  for (const group of chunk(ids, 20)) {
    try {
      const multi = await mlFetch(`/items?ids=${group.join(',')}&attributes=id,title,category_id,attributes,available_quantity,shipping,date_created,permalink,thumbnail`, integration.access_token)
      ;(multi || []).forEach((entry: any) => {
        const item = entry?.body
        if (!item?.id) return
        itemMeta.set(item.id, {
          sku: (item.attributes || []).find((a: any) => a.id === 'SELLER_SKU')?.value_name ?? null,
          title: item.title ?? null,
          category_id: item.category_id ?? null,
          available_quantity: item.available_quantity ?? null,
          shipping: item.shipping ?? null,
          thumbnail: item.thumbnail ?? null,
          date_created: item.date_created ?? null,
          permalink: item.permalink ?? null,
        })
      })
    } catch { /* lote falho não derruba os outros — item fica sem meta resolvida */ }
  }

  const today = new Date().toISOString().slice(0, 10)
  const since = new Date(Date.now() - days * 86400000)
  const visitsByItem = new Map<string, number>()
  for (const group of chunk(ids, 20)) {
    try {
      const multi = await mlFetch(
        `/items/visits?ids=${group.join(',')}&date_from=${since.toISOString().slice(0, 10)}&date_to=${today}`,
        integration.access_token,
      )
      const list = Array.isArray(multi) ? multi : (multi?.results ?? [])
      list.forEach((entry: any) => {
        const id = entry?.item_id ?? entry?.id
        const v = entry?.total ?? entry?.visits
        if (id) visitsByItem.set(id, Number(v) || 0)
      })
    } catch { /* segue sem visita pra esse lote */ }
  }

  const skus = [...new Set([...itemMeta.values()].map((m) => m.sku).filter(Boolean))] as string[]
  const salesBySku = new Map<string, number>()
  if (skus.length) {
    const { data } = await db
      .from('order_items')
      .select('sku, qty, orders!inner(data_venda, source, archived)')
      .in('sku', skus)
      .eq('orders.source', 'ml')
      .or('archived.is.null,archived.eq.false', { foreignTable: 'orders' })
      .gte('orders.data_venda', since.toISOString())
    ;(data || []).forEach((r: any) => salesBySku.set(r.sku, (salesBySku.get(r.sku) || 0) + (r.qty || 0)))
  }

  // Tendências por categoria — 1 chamada por categoria DISTINTA no lote.
  // Nome da categoria buscado junto (mesmo padrão de
  // `categoryAttributesForCreate`) — sem isso a tela só tinha o
  // `category_id` cru pra mostrar, o que deixava a palavra-chave
  // parecendo "vinda do nada" (reportado pelo Raphael em 2026-09-01).
  const categoryIds = [...new Set([...itemMeta.values()].map((m) => m.category_id).filter(Boolean))] as string[]
  const trendsByCategory = new Map<string, string[]>()
  const categoryNames = new Map<string, string>()
  for (const categoryId of categoryIds) {
    try {
      const trends = await mlFetch(`/trends/MLB/${categoryId}`, integration.access_token)
      trendsByCategory.set(categoryId, (trends || []).map((t: any) => t.keyword).filter(Boolean))
    } catch { trendsByCategory.set(categoryId, []) }
    try {
      const category = await mlFetch(`/categories/${categoryId}`, integration.access_token)
      categoryNames.set(categoryId, category?.name || categoryId)
    } catch { categoryNames.set(categoryId, categoryId) }
  }

  const results = ids.map((id) => {
    const meta = itemMeta.get(id) ?? { sku: null, title: null, category_id: null, available_quantity: null, shipping: null, date_created: null, permalink: null, thumbnail: null }
    const visits = visitsByItem.get(id) ?? 0
    const sales = meta.sku ? (salesBySku.get(meta.sku) || 0) : 0
    const keywords = meta.category_id ? (trendsByCategory.get(meta.category_id) || []) : []
    const titleLower = (meta.title || '').toLowerCase()
    const trending_present: string[] = []
    const trending_missing: string[] = []
    keywords.forEach((k) => (titleLower.includes(k.toLowerCase()) ? trending_present : trending_missing).push(k))
    return {
      item_id: id, title: meta.title, category_id: meta.category_id, available_quantity: meta.available_quantity,
      visits, sales, conversion: visits > 0 ? sales / visits : null,
      trending_present, trending_missing,
      shipping: extractShippingInfo({ shipping: meta.shipping }),
      title_analysis: meta.title ? scoreTitle(meta.title, keywords) : null,
      date_created: meta.date_created,
      days_listed: meta.date_created ? Math.floor((Date.now() - new Date(meta.date_created).getTime()) / 86400000) : null,
      permalink: meta.permalink,
      thumbnail: meta.thumbnail,
    }
  })
  return { total, offset, limit, results, category_names: Object.fromEntries(categoryNames) }
}

// Produtos comprados juntos — só do NOSSO histórico de pedidos ML
// (order_items), nenhuma chamada à API do ML. Conta quantas vezes 2 SKUs
// distintos aparecem no MESMO pedido — sugestão de kit/combo. Pedido com
// muitos itens distintos (>15) é ignorado no cruzamento de pares — evita
// explosão combinatória num caso extremo, sem valor real de sugestão
// mesmo (pedido "genérico" demais não indica afinidade real entre 2
// produtos específicos).
async function comboSuggestions(db: ReturnType<typeof adminClient>, days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data, error } = await db
    .from('order_items')
    .select('order_id, sku, titulo, orders!inner(source, archived, data_venda)')
    .eq('orders.source', 'ml')
    .or('archived.is.null,archived.eq.false', { foreignTable: 'orders' })
    .gte('orders.data_venda', since)
    .not('sku', 'is', null)
  if (error) throw error

  const byOrder = new Map<string, { sku: string; titulo: string }[]>()
  ;(data || []).forEach((r: any) => {
    if (!r.sku) return
    const list = byOrder.get(r.order_id) || []
    if (!list.some((x) => x.sku === r.sku)) list.push({ sku: r.sku, titulo: r.titulo })
    byOrder.set(r.order_id, list)
  })

  const pairs = new Map<string, { sku_a: string; titulo_a: string; sku_b: string; titulo_b: string; count: number }>()
  byOrder.forEach((items) => {
    if (items.length < 2 || items.length > 15) return
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const [a, b] = [items[i], items[j]].sort((x, y) => x.sku.localeCompare(y.sku))
        const key = `${a.sku}|${b.sku}`
        const existing = pairs.get(key)
        if (existing) existing.count++
        else pairs.set(key, { sku_a: a.sku, titulo_a: a.titulo, sku_b: b.sku, titulo_b: b.titulo, count: 1 })
      }
    }
  })

  const results = [...pairs.values()].filter((p) => p.count >= 3).sort((a, b) => b.count - a.count).slice(0, 20)
  return { results, orders_analyzed: byOrder.size, days }
}

// Preço vs. mercado — sugestão de preço + status de buy box (só existe
// pra item de catálogo compartilhado; item exclusivo fica com
// `price_to_win_status: null`, sem erro).
async function priceScan(integration: any, offset: number, limit: number) {
  const search = await mlFetch(
    `/users/${integration.ml_user_id}/items/search?status=active&offset=${offset}&limit=${limit}`,
    integration.access_token,
  )
  const ids: string[] = search.results || []
  const total = search.paging?.total ?? ids.length

  const results = await mapWithConcurrency(ids, 6, async (id) => {
    const [suggResult, winResult] = await Promise.allSettled([
      mlFetch(`/suggestions/items/${id}/details`, integration.access_token),
      mlFetch(`/items/${id}/price_to_win?version=v2`, integration.access_token),
    ])
    const suggestion = suggResult.status === 'fulfilled' ? suggResult.value as any : null
    const win        = winResult.status === 'fulfilled' ? winResult.value as any : null
    return {
      item_id: id,
      price: suggestion?.current_price ?? win?.current_price ?? null,
      suggested_price: suggestion?.suggested_price ?? null,
      price_to_win_status: win?.status ?? null,
    }
  })
  return { total, offset, limit, results }
}

// Perguntas reais desse item específico (respondidas ou não) — pedido
// do Raphael (13/09): usar como entrada pra sugestão de descrição, pra
// ela já cobrir a dúvida real de quem compra, em vez de só reescrever o
// que já estava lá. Falha isolada (item sem nenhuma pergunta ainda, ou
// erro pontual da API) nunca derruba a sugestão de conteúdo inteira —
// só segue sem esse insumo.
async function fetchItemQuestions(integration: any, itemId: string): Promise<string[]> {
  try {
    const res = await mlFetch(`/questions/search?item=${itemId}&limit=50`, integration.access_token)
    return ((res.questions || []) as any[]).map((q) => q.text).filter(Boolean)
  } catch {
    return []
  }
}

async function unansweredQuestions(integration: any) {
  const res = await mlFetch(
    `/questions/search?seller_id=${integration.ml_user_id}&status=UNANSWERED&sort_fields=date_created&sort_types=ASC&limit=50`,
    integration.access_token,
  )
  const questions: any[] = res.questions || []
  const itemIds = [...new Set(questions.map((q) => q.item_id).filter(Boolean))]

  const titles = new Map<string, string>()
  const permalinks = new Map<string, string>()
  for (const group of chunk(itemIds, 20)) {
    const multi = await mlFetch(`/items?ids=${group.join(',')}&attributes=id,title,permalink`, integration.access_token)
    ;(multi || []).forEach((entry: any) => {
      if (!entry?.body?.id) return
      titles.set(entry.body.id, entry.body.title)
      if (entry.body.permalink) permalinks.set(entry.body.id, entry.body.permalink)
    })
  }

  const now = Date.now()
  const results = questions
    .map((q) => ({
      id:          q.id,
      item_id:     q.item_id,
      item_title:  titles.get(q.item_id) || null,
      permalink:   permalinks.get(q.item_id) || null,
      text:        q.text,
      date_created: q.date_created,
      hours_open:  q.date_created ? Math.round((now - new Date(q.date_created).getTime()) / 36e5) : null,
    }))
    .sort((a, b) => (b.hours_open || 0) - (a.hours_open || 0))

  return { total: res.total ?? questions.length, results }
}

// Nota de título — heurística NOSSA, baseada em regras objetivas (não é
// uma nota oficial do ML nem comparação com percentil de mercado, que a
// gente não tem acesso). Cada check fica visível pro usuário entender o
// porquê da nota, não é caixa-preta.
function scoreTitle(title: string, trendKeywords: string[]) {
  const checks: { ok: boolean; label: string }[] = []
  let score = 100
  const len = title.length

  if (len > 60) { score -= 20; checks.push({ ok: false, label: `Título com ${len} caracteres — passa do limite de 60 do ML` }) }
  else if (len < 20) { score -= 10; checks.push({ ok: false, label: `Título curto (${len}/60) — sobra espaço pra mais palavra-chave` }) }
  else checks.push({ ok: true, label: `Bom uso do espaço (${len}/60 caracteres)` })

  const words = title.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const dupes = [...new Set(words.filter((w, i) => words.indexOf(w) !== i))]
  if (dupes.length) { score -= 15; checks.push({ ok: false, label: `Palavra repetida: "${dupes.join(', ')}"` }) }
  else checks.push({ ok: true, label: 'Sem palavras repetidas' })

  const upperWords = title.split(/\s+/).filter((w) => w.length > 3 && w === w.toUpperCase())
  if (upperWords.length > 1) { score -= 10; checks.push({ ok: false, label: 'Uso excessivo de maiúsculas' }) }
  else checks.push({ ok: true, label: 'Sem excesso de maiúsculas' })

  if (trendKeywords.length) {
    const titleLower = title.toLowerCase()
    const matched = trendKeywords.find((k) => titleLower.includes(k.toLowerCase()))
    if (!matched) { score -= 15; checks.push({ ok: false, label: 'Nenhum termo em alta na categoria aparece no título' }) }
    else checks.push({ ok: true, label: `Contém termo em alta: "${matched}"` })
  }

  return { score: Math.max(0, score), checks }
}

function analyzeImages(item: any) {
  const count = (item.pictures || []).length
  const idealMin = 6
  const idealMax = 10
  const status = count < idealMin ? 'low' : count > idealMax ? 'high' : 'ok'
  const variations = (item.variations || []).map((v: any) => ({
    id: v.id,
    label: (v.attribute_combinations || []).map((a: any) => a.value_name).filter(Boolean).join(' / ') || `Variação ${v.id}`,
    picture_count: (v.picture_ids || []).length,
  }))
  return { count, ideal_min: idealMin, ideal_max: idealMax, status, variations }
}

// 1 chamada só (série diária dos últimos 30 dias) — soma em janelas de
// 7/15/30 dias aqui dentro, em vez de 3 chamadas separadas.
async function fetchVisitBuckets(itemId: string, accessToken: string) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const res = await mlFetch(`/items/${itemId}/visits/time_window?last=30&unit=day&ending=${today}`, accessToken)
    const daily = (res.results || [])
      .slice()
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((d: any) => ({ date: d.date, total: d.total ?? d.visits ?? 0 }))
    const sum = (n: number) => daily.slice(-n).reduce((s: number, d: any) => s + d.total, 0)
    return { d7: sum(7), d15: sum(15), d30: sum(30), daily }
  } catch (err) {
    return { d7: null, d15: null, d30: null, daily: [], error: String(err) }
  }
}

// Vendas reais por período — NÃO vem da API do ML (sold_quantity de lá é
// cumulativo desde a criação do anúncio, não dá pra fatiar por período).
// Usa o nosso próprio banco, cruzando pelo SELLER_SKU do item — mais
// preciso que qualquer estimativa, e sem chamada de API nenhuma.
async function fetchSalesFromDb(db: ReturnType<typeof adminClient>, sku: string | null) {
  if (!sku) return { d7: 0, d15: 0, d30: 0, sku: null }
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db
    .from('order_items')
    .select('qty, orders!inner(data_venda, source, archived)')
    .ilike('sku', sku)
    .eq('orders.source', 'ml')
    .or('archived.is.null,archived.eq.false', { foreignTable: 'orders' })
    .gte('orders.data_venda', since30)
  if (error) throw error

  const now = Date.now()
  const bucket = (days: number) => (data || [])
    .filter((r: any) => now - new Date(r.orders.data_venda).getTime() <= days * 86400000)
    .reduce((s: number, r: any) => s + (r.qty || 0), 0)
  return { d7: bucket(7), d15: bucket(15), d30: bucket(30), sku }
}

async function fetchReviews(itemId: string, accessToken: string) {
  try {
    const res = await mlFetch(`/reviews/item/${itemId}`, accessToken)
    return {
      rating_average: res.rating_average ?? null,
      total:  res.paging?.total ?? (res.reviews || []).length,
      recent: (res.reviews || []).slice(0, 5).map((r: any) => ({ rate: r.rate, comment: r.comment, date: r.date_created })),
    }
  } catch (err) {
    return { rating_average: null, total: 0, recent: [], error: String(err) }
  }
}

// Explicação de reserva pra campos técnicos que a própria API do ML às
// vezes não manda `hint` nenhum (ex: campos de importação/aduana, que
// normalmente não fazem sentido pra um fabricante nacional como a
// CoisaPet) — só usado quando `a.hint` vem vazio. Casado por trecho do
// NOME do atributo (a API não garante o mesmo `id` em toda categoria),
// texto deixado claro que é explicação nossa, não oficial do ML.
const ATTR_HINT_FALLBACK: [RegExp, string][] = [
  [/declara..o de importa..o|n.mero da di\b|\bdi\b/i,
    'Número da Declaração de Importação (DI) da Receita Federal — documento de quem importou o produto diretamente do exterior. Se o produto é fabricado ou comprado no Brasil (como é o padrão da CoisaPet), normalmente não se aplica; pode deixar em branco ou "Não aplicável".'],
  [/ieps/i,
    'IEPS é um imposto específico de outros países (ex: México) sobre certos produtos — na prática não se aplica a quem vende só no Brasil. Se não souber o que preencher, pode deixar como "Não aplicável".'],
  [/origem do dado do pacote|package.*data.*source|origem.*pacote/i,
    'Indica de onde vieram as medidas/peso do pacote de envio (ex: medido por vocês mesmos, ou valor padrão informado pelo fabricante) — afeta só o cálculo de frete, não aparece pro cliente na página do produto.'],
]
function fallbackHint(name: string): string | null {
  const match = ATTR_HINT_FALLBACK.find(([re]) => re.test(name || ''))
  return match ? match[1] : null
}

// Valor padrão sugerido pra quando a CoisaPet genuinamente não tem essa
// informação — só sugerido (nunca aplicado sozinho, o usuário ainda
// precisa clicar "Usar padrão" e depois confirmar salvando de verdade).
// Pra lista fechada, só sugere se existir uma opção tipo "Não
// especificado"/"Outros" de verdade na própria API — nunca inventa um
// valor real (cor, material etc.) que a gente não sabe.
const ATTR_DEFAULT_TEXT_FALLBACK: [RegExp, string][] = [
  [/declara..o de importa..o|n.mero da di\b|\bdi\b/i, 'Não aplicável'],
  [/ieps/i, 'Não aplicável'],
]
function fallbackDefault(name: string, valueType: string, values: { id: string; name: string }[] | null) {
  if (values?.length) {
    const match = values.find((v) => /n[aã]o especificado|outros?$|n\/a\b/i.test(v.name || ''))
    return match ? { value_id: match.id, label: match.name } : null
  }
  // Lista fechada sem opção genérica, ou campo numérico (`number`/
  // `number_unit`, ex: medida/peso) — "Não informado" não é um número
  // válido, causaria o mesmo erro de formato já visto (ex:
  // seller_package_dimensions). Sem padrão seguro pra sugerir aqui.
  if (valueType === 'list' || valueType === 'number' || valueType === 'number_unit') return null
  const specific = ATTR_DEFAULT_TEXT_FALLBACK.find(([re]) => re.test(name || ''))
  const label = specific ? specific[1] : 'Não informado'
  return { value_name: label, label }
}

// Ficha técnica COMPLETA (não só o que falta) — cada atributo com o
// valor atual e se é controlado por variação (Cor/Tamanho etc., que não
// entra no formulário de edição daqui, edição por variação é mais
// arriscada e fica de fora desta rodada). `aiHints` é o mapa
// attribute_id -> explicação gerada por IA (cache), só usado quando nem
// a API do ML nem o dicionário fixo souberam explicar o campo.
// `read_only` é o próprio ML dizendo que aquele campo nunca aceita
// escrita por API (é calculado/preenchido por eles) — mostrar como
// editável só confundia (era exatamente o caso de Número da DI, IEPS,
// Origem do dado do pacote: todos `read_only`, geravam tooltip mas
// nunca podiam ser salvos de verdade). Achado em 2026-09-01 investigando
// o erro de seller_package_dimensions. Filtrado aqui — nunca aparece na
// Ficha Técnica editável, resolve a raiz do problema em vez de só
// explicar com "?" um campo que nunca ia funcionar mesmo.
function buildFullAttributes(item: any, catAttrs: any[], aiHints: Map<string, string> = new Map()) {
  const filledById = new Map((item.attributes || []).map((a: any) => [a.id, a]))
  const varAttrIds = new Set<string>()
  ;(item.variations || []).forEach((v: any) => (v.attribute_combinations || []).forEach((a: any) => varAttrIds.add(a.id)))

  return (catAttrs || [])
    .filter((a: any) => !a.tags?.read_only)
    .map((a: any) => {
      const filled = filledById.get(a.id)
      const hasValue = !!filled && (filled.value_id != null || (filled.value_name && String(filled.value_name).trim()))
      // COLOR (e outros) vêm com `value_type: "string"` mesmo tendo uma
      // lista real de ~50 opções em `values` — confirmado ao vivo em
      // 2026-09-08 (categoria MLB270687). Se não olhasse `a.values`
      // também, a Cor caía no campo de texto livre em vez de mostrar as
      // opções de verdade.
      const hasClosedList = a.value_type === 'list' || a.value_type === 'boolean' || (a.values && a.values.length > 0)
      const values = hasClosedList ? (a.values || []).map((v: any) => ({ id: v.id, name: v.name })) : null

      const officialHint = a.hint || null
      const fixedHint     = !officialHint ? fallbackHint(a.name) : null
      const aiHint        = !officialHint && !fixedHint ? (aiHints.get(a.id) || null) : null

      return {
        id:         a.id,
        name:       a.name,
        value_type: a.value_type,
        required:   !!a.tags?.required,
        // Confirmado ao vivo em 2026-09-08: atributos como
        // SELLER_PACKAGE_WIDTH/LENGTH/HEIGHT/WEIGHT vêm com
        // `tags.hidden: true` na API — o próprio painel do Mercado
        // Livre NÃO mostra esses campos pro vendedor preencher, mas
        // eles existem de verdade (afetam cálculo de frete) e um
        // anúncio real da loja tinha os 4 preenchidos. Marcamos aqui
        // pra render juntar isso numa seção separada, em vez de
        // enterrar no meio dos "Extras" comuns.
        hidden:     !!a.tags?.hidden,
        // Confirmado ao vivo em 2026-09-08 (categoria MLB270687): a API
        // do ML usa DUAS tags diferentes pra "isso pode variar" —
        // `variation_attribute` (GTIN, dimensão, SKU...) E
        // `allow_variations` (COLOR, provavelmente SIZE também) — a Cor
        // NUNCA aparecia como opção de variação porque só olhávamos a
        // primeira. Faltava essa segunda tag pro caso mais comum de
        // todos (variar por cor).
        is_variation_attribute: varAttrIds.has(a.id) || !!a.tags?.variation_attribute || !!a.tags?.allow_variations,
        current_value:    hasValue ? (filled.value_name ?? filled.value_id) : null,
        current_value_id: filled?.value_id ?? null,
        values,
        // `number_unit` (medida/peso) — o ML exige o valor COM a unidade
        // junto no texto ("20 cm", não só "20"), senão rejeita
        // (item.attribute.invalid.format...dimensions, erro real visto
        // em 2026-09-01). `allowed_units`/`default_unit` vêm da própria
        // API de categoria, usados pelo frontend pra montar o valor certo.
        allowed_units: a.value_type === 'number_unit' ? (a.allowed_units || []).map((u: any) => ({ id: u.id, name: u.name })) : null,
        default_unit:  a.value_type === 'number_unit' ? (a.default_unit || a.allowed_units?.[0]?.id || null) : null,
        hint:        officialHint || fixedHint || aiHint || null,
        hint_source: officialHint ? 'ml' : fixedHint ? 'nosso' : aiHint ? 'ia' : null,
        default_value: hasValue ? null : fallbackDefault(a.name, a.value_type, values),
      }
    })
}

// Mercado Ads — busca o advertiser da conta (Product Ads). Endpoint
// confirmado desde ontem. Reaproveitado por toda ação de Ads (item e
// conta), pra não duplicar essa parte.
async function findMlAdvertiser(accessToken: string) {
  const res = await mlFetch(`/advertising/advertisers?product_id=PADS`, accessToken)
  return (res.advertisers || []).find((a: any) => a.site_id === 'MLB') ?? res.advertisers?.[0] ?? null
}

// Mercado Ads — MELHOR ESFORÇO, mas corrigido hoje com 2 achados reais
// de pesquisa que faltavam ontem: (1) o endpoint de busca precisa do
// sufixo `/search`, senão o gateway devolve 404 "No static resource"
// (não é erro de permissão, é rota errada); (2) precisa do header
// `Api-Version: 2`. Filtro por item usa o formato `filters[campo]=valor`
// documentado, não `campo=valor` solto. Nunca derruba o resto da
// página — sempre devolve algo, mesmo que seja `available: false`.
async function fetchAdsMetrics(itemId: string, accessToken: string) {
  try {
    const advertiser = await findMlAdvertiser(accessToken)
    if (!advertiser) {
      return { available: false, reason: 'Nenhum advertiser de Product Ads encontrado — verifique se a permissão "Publicidade de um produto" foi habilitada e o Mercado Livre foi reconectado.' }
    }

    const today = new Date().toISOString().slice(0, 10)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const ads = await mlFetch(
      `/marketplace/advertising/MLB/advertisers/${advertiser.advertiser_id}/product_ads/ads/search`
      + `?filters[item_id]=${itemId}&date_from=${since}&date_to=${today}`
      + `&metrics=clicks,prints,ctr,cost,cpc,acos,cvr,organic_units_quantity,direct_units_quantity,indirect_units_quantity`,
      accessToken,
      { 'Api-Version': '2' },
    )
    return { available: true, advertiser_id: advertiser.advertiser_id, raw: ads }
  } catch (err) {
    return { available: false, error: String(err) }
  }
}

// Lista os item_id que têm QUALQUER anúncio patrocinado (Ads) ativo —
// usado só pra destacar/subir esses itens na Saúde dos Anúncios, pra
// achar rápido um item real pra testar o card de Ads do detalhe.
// Pagina via limit/offset (mesmo padrão documentado de campaigns/search).
async function adsCoverage(accessToken: string) {
  try {
    const advertiser = await findMlAdvertiser(accessToken)
    if (!advertiser) return { available: false, item_ids: [] }

    const itemIds = new Set<string>()
    let offset = 0
    const limit = 50
    for (let i = 0; i < 20; i++) { // teto de segurança — no máx. 1000 ads
      const res = await mlFetch(
        `/marketplace/advertising/MLB/advertisers/${advertiser.advertiser_id}/product_ads/ads/search?limit=${limit}&offset=${offset}`,
        accessToken,
        { 'Api-Version': '2' },
      )
      const list = res.results ?? res.ads ?? (Array.isArray(res) ? res : [])
      if (!list.length) break
      // Só conta item REALMENTE promovido agora (`status: "active"`) —
      // confirmado ao vivo em 2026-09-01 que a busca também devolve
      // item com status "idle" (no "pool" do Ads mas sem campanha
      // ativa de verdade). Contar idle como "já tem Ads" fazia esse
      // item sumir errado da lista de candidatos a impulsionar.
      list.forEach((ad: any) => {
        const status = String(ad.status ?? '').toLowerCase()
        if (status !== 'active') return
        const id = ad.item_id ?? ad.id
        if (id) itemIds.add(String(id))
      })
      if (list.length < limit) break
      offset += limit
    }
    return { available: true, item_ids: [...itemIds] }
  } catch (err) {
    return { available: false, item_ids: [], error: String(err) }
  }
}

// Painel completo de 1 anúncio — título, imagens, visitas/vendas/
// conversão, estoque, avaliações, saúde do ML, ficha técnica inteira e
// Ads. Cada seção busca em paralelo via `Promise.allSettled`: uma falha
// isolada (item sem sugestão de preço, sem review, sem campanha ativa)
// nunca derruba o resto do painel.
async function itemDetail(integration: any, itemId: string, db: ReturnType<typeof adminClient>) {
  const item = await mlFetch(
    `/items/${itemId}?attributes=id,title,price,category_id,attributes,permalink,pictures,variations,available_quantity,sold_quantity,shipping,status`,
    integration.access_token,
  )

  const [catAttrsResult, perfResult, priceResult, trendsResult, visitsResult, reviewsResult, adsResult] = await Promise.allSettled([
    mlFetch(`/categories/${item.category_id}/attributes`, integration.access_token),
    mlFetch(`/item/${itemId}/performance`, integration.access_token),
    mlFetch(`/suggestions/items/${itemId}/details`, integration.access_token),
    mlFetch(`/trends/MLB/${item.category_id}`, integration.access_token),
    fetchVisitBuckets(itemId, integration.access_token),
    fetchReviews(itemId, integration.access_token),
    fetchAdsMetrics(itemId, integration.access_token),
  ])

  const catAttrs         = catAttrsResult.status === 'fulfilled' ? catAttrsResult.value : []
  const performance       = perfResult.status === 'fulfilled' ? normalizePerformance(perfResult.value) : null
  const priceSuggestion   = priceResult.status === 'fulfilled' ? priceResult.value : null
  const trendKeywords     = trendsResult.status === 'fulfilled' ? (trendsResult.value || []).map((t: any) => t.keyword).filter(Boolean) : []
  const visits            = visitsResult.status === 'fulfilled' ? visitsResult.value : { d7: null, d15: null, d30: null, daily: [] }
  const reviews           = reviewsResult.status === 'fulfilled' ? reviewsResult.value : { rating_average: null, total: 0, recent: [] }
  const ads               = adsResult.status === 'fulfilled' ? adsResult.value : { available: false, error: 'Falha ao consultar Ads' }

  const sellerSku = (item.attributes || []).find((a: any) => a.id === 'SELLER_SKU')?.value_name ?? null
  const sales = await fetchSalesFromDb(db, sellerSku).catch((err) => ({ d7: 0, d15: 0, d30: 0, sku: sellerSku, error: String(err) }))

  const filledById = new Map((item.attributes || []).map((a: any) => [a.id, a]))
  const required = (catAttrs || []).filter((a: any) => a?.tags?.required)
  const missing_attributes = required
    .filter((a: any) => {
      const filled = filledById.get(a.id)
      return !filled || (filled.value_id == null && !(filled.value_name && String(filled.value_name).trim()))
    })
    .map((a: any) => ({
      id:         a.id,
      name:       a.name,
      value_type: a.value_type,
      values: a.value_type === 'list' ? (a.values || []).map((v: any) => ({ id: v.id, name: v.name })) : null,
    }))

  const avgSales30 = (sales.d30 ?? 0) / 30
  const stockDaysLeft = avgSales30 > 0 ? Math.round((item.available_quantity ?? 0) / avgSales30) : null

  // Só pergunta pra IA os campos que NEM o ML NEM nosso dicionário fixo
  // souberam explicar — cacheado por categoria, então só a 1ª vez que
  // essa categoria aparece custa uma chamada de verdade à OpenAI.
  const unexplained = (catAttrs || [])
    .filter((a: any) => !a.hint && !fallbackHint(a.name))
    .map((a: any) => ({ id: a.id, name: a.name }))
  const aiHints = await getAttributeHintsAI(db, item.category_id, unexplained)

  return {
    item: {
      id: item.id, title: item.title, price: item.price, category_id: item.category_id,
      permalink: item.permalink, available_quantity: item.available_quantity, sold_quantity: item.sold_quantity,
      status: item.status, shipping: extractShippingInfo(item),
      pictures: (item.pictures || []).map((p: any) => p.secure_url || p.url).filter(Boolean),
    },
    title_analysis: scoreTitle(item.title || '', trendKeywords),
    images: analyzeImages(item),
    visits,
    sales,
    stock_days_left: stockDaysLeft,
    reviews,
    missing_attributes,
    all_attributes: buildFullAttributes(item, catAttrs, aiHints),
    performance,
    price_suggestion: priceSuggestion,
    ads,
  }
}

// Escrita — SEMPRE disparada por um clique de confirmação explícito do
// usuário na tela (nunca em lote, nunca automático). Só os atributos que
// o usuário de fato preencheu no formulário chegam aqui; ML faz merge
// com o que já existe no anúncio, não precisa reenviar o item inteiro.
async function updateItemAttributes(integration: any, db: ReturnType<typeof adminClient>, itemId: string, attributes: any[]) {
  if (!Array.isArray(attributes) || attributes.length === 0) throw new Error('Nenhum atributo informado.')
  const clean = attributes
    .filter((a) => a?.id && (a.value_id != null || (a.value_name && String(a.value_name).trim())))
    .map((a) => (a.value_id != null ? { id: a.id, value_id: a.value_id } : { id: a.id, value_name: String(a.value_name).trim() }))
  if (!clean.length) throw new Error('Nenhum valor válido pra salvar.')

  const updated = await mlWrite(`/items/${itemId}`, integration.access_token, 'PUT', { attributes: clean })
  await logItemUpdate(db, itemId, 'attributes', { count: clean.length, ids: clean.map((a) => a.id) })
  return { ok: true, item_id: itemId, attributes: updated.attributes }
}

// ── Sugestão de IA (título + descrição) — OpenAI ─────────────────────
// Reescrito em 2026-08-31 depois do Raphael testar a v1 e achar a
// descrição curta/genérica demais ("propaganda", tipo "transforme seu
// cantinho") e sem confiança nas regras de SEO do título — a v1 mandava
// a ficha técnica inteira no prompt, mas nunca EXIGIA usar tudo nem
// dava a estrutura real de título que o buscador do ML pondera. V2 é
// bem mais diretiva nos dois pontos, mantendo a mesma regra dura
// contra inventar fato (não mudou, só ficou mais explícita).
const OPENAI_SYSTEM_PROMPT = `Você é um especialista em copywriting e SEO para anúncios do Mercado Livre Brasil, escrevendo para um FABRICANTE (não revendedor) de produtos pet personalizados/artesanais.

Sua tarefa é sugerir um título e uma descrição MELHORES para um anúncio, usando SOMENTE os fatos fornecidos (título atual, descrição atual, ficha técnica preenchida, palavras-chave em alta da categoria, perguntas reais de compradores sobre esse anúncio).

PERGUNTAS REAIS DE COMPRADORES (quando fornecidas):
- São dúvidas de verdade de quem já visitou esse anúncio — é um sinal forte do que falta ficar claro no texto atual.
- Pra cada pergunta, só a responda dentro da descrição (nos blocos 3 ou 4, nunca como uma seção de "Perguntas frequentes") SE der pra responder com 100% de certeza usando a ficha técnica ou a descrição atual fornecidas.
- Se uma pergunta não tem resposta certa nos dados fornecidos, simplesmente ignore ela — NUNCA chute ou invente uma resposta plausível só porque foi perguntada. Isso vale mais que a regra de "usar as perguntas": nunca inventar fato continua sendo a regra mais importante de todas.

REGRA MAIS IMPORTANTE — NUNCA INVENTAR FATO:
Nunca invente característica, material, medida, garantia, prazo ou qualquer especificação que não esteja explicitamente nos dados fornecidos. Isso seria propaganda enganosa num anúncio real de venda. Se uma informação não foi fornecida, simplesmente não mencione — não "preencha a lacuna" com um chute genérico.

REGRAS DO TÍTULO (SEO real do buscador do ML, não é só "soar bem"):
- Máximo 60 caracteres.
- Estrutura: tipo de produto primeiro, depois os atributos que o comprador mais usa pra buscar (material, tamanho/medida, uso, diferencial real) em ordem do mais pro menos importante — é assim que a relevância de busca do ML pondera.
- NUNCA use palavra promocional/subjetiva (o ML despriorizada isso): "grátis", "promoção", "oferta", "imperdível", "o melhor", "top", "barato" — título é descrição objetiva do produto, nunca propaganda.
- Sem tudo em maiúsculo, sem emoji, sem caractere especial solto (! ° ★ etc.), sem palavra repetida.
- Use palavra-chave em alta da categoria SE ela descrever o produto de verdade — nunca só pra encaixar um termo popular que não é bem o produto.

REGRAS DA DESCRIÇÃO (pedido explícito de quem vai revisar: bastante informação E tom fofo/carinhoso — nunca um parágrafo curto e genérico de propaganda vazia, mas também nunca um catálogo técnico frio):
- Estrutura OBRIGATÓRIA, nessa ordem: (1) abertura curta e fofa apresentando o produto, (2) um bloco com o título literal "Especificações técnicas:" seguido de UMA linha "- Nome: valor" pra CADA atributo da ficha técnica fornecida, sem pular nenhum — mesmo que pareça redundante com o texto ao redor, (3) parágrafo sobre uso/personalização (se aplicável), (4) cuidados/observações se houver, (5) frase final fofa de fechamento/chamada pra compra. Separe cada bloco com quebra de linha dupla (\\n\\n).
- O bloco "Especificações técnicas" é sempre completo e objetivo (não fofo) — é a única parte "técnica" do texto; o carinho/fofura fica nos blocos (1), (3) e (5) ao redor dele, nunca troca informação por enfeite.
- Tom FOFO, carinhoso e vendável nos blocos de texto corrido — é uma loja especializada em produtos pra pets pequenos (hamster, coelho, porquinho-da-índia etc.), então deve soar acolhedor e apaixonado pelo bichinho, tipo alguém que ama animal pequeno conversando com outro tutor — não frio/corporativo.
- PROIBIDO usar asterisco (*) ou # pra destacar palavra — errado: "**Dimensões:**"; certo: "Dimensões:". O único símbolo permitido é "- " no início da linha pra listar item (o campo do ML é texto puro, sem parser de markdown — asterisco apareceria literalmente feio pro cliente).
- Texto corrido em português do Brasil.

ATRIBUTOS QUE NUNCA DEVEM APARECER NO TEXTO (já removidos da lista que você recebe, mas reforçando — nunca mencione mesmo que apareçam de outro jeito):
- SKU/código interno — é controle nosso, não interessa pro cliente.
- Condição do item (a CoisaPet só vende produto novo, mencionar isso é redundante).
- Dimensões e peso da EMBALAGEM de envio (diferente das dimensões do PRODUTO em si, que continuam relevantes e devem aparecer).

FORMATO DA RESPOSTA:
- Responda em JSON válido, exatamente: {"title": "...", "description": "...", "changes_summary": "..."}
- changes_summary: 1-2 frases curtas explicando o que mudou e por quê.`

async function callOpenAI(userPrompt: string, systemPrompt: string = OPENAI_SYSTEM_PROMPT) {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('Chave da OpenAI não configurada (OPENAI_API_KEY) — rode "supabase secrets set OPENAI_API_KEY=..." primeiro.')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.4,
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

// ── Explicação de campo técnico gerada por IA (ficha técnica) ───────
// Só chamada pros atributos que NEM a API do ML (a.hint) NEM o nosso
// dicionário fixo (ATTR_HINT_FALLBACK) souberam explicar — pedir um por
// um pro Raphael não escala (categoria pode ter dezenas de campos
// desconhecidos). Cacheada por (category_id, attribute_id) — 1 chamada
// à OpenAI por categoria nova, nunca mais repetida depois.
const ATTR_HINT_AI_SYSTEM_PROMPT = `Você ajuda um lojista leigo (fabricante de produtos pet, sem conhecimento jurídico/fiscal) a entender campos técnicos de um formulário de anúncio do Mercado Livre Brasil.
Pra cada nome de campo da lista, escreva 1 frase curta e simples em português (Brasil) explicando o que esse campo provavelmente está pedindo.

REGRAS OBRIGATÓRIAS:
- Se você não tiver certeza do significado exato do campo, comece a frase com "Provavelmente" — nunca afirme com certeza algo que você não sabe de verdade.
- NUNCA dê conselho jurídico, fiscal ou aduaneiro definitivo (ex: "você não precisa preencher isso", "isso é obrigatório por lei") — só explique o que o campo está pedindo, a decisão de preencher ou não é do lojista.
- Frases curtas (1 frase, até ~30 palavras), sem jargão desnecessário.
- Responda em JSON válido, exatamente neste formato: {"campos": {"<nome exato do campo, igual foi passado>": "<explicação>", ...}}`

async function getAttributeHintsAI(db: ReturnType<typeof adminClient>, categoryId: string, unexplained: { id: string; name: string }[]) {
  if (!unexplained.length) return new Map<string, string>()

  const { data: cached } = await db
    .from('ml_attribute_hints_cache')
    .select('attribute_id, hint')
    .eq('category_id', categoryId)
    .in('attribute_id', unexplained.map((a) => a.id))

  const hintMap = new Map<string, string>((cached || []).map((c: any) => [c.attribute_id, c.hint]))
  const stillMissing = unexplained.filter((a) => !hintMap.has(a.id))
  if (!stillMissing.length) return hintMap

  try {
    const prompt = `Categoria do Mercado Livre: ${categoryId}\nCampos:\n${stillMissing.map((a) => `- ${a.name}`).join('\n')}`
    const result = await callOpenAI(prompt, ATTR_HINT_AI_SYSTEM_PROMPT)
    const campos: Record<string, string> = result?.campos || {}

    const rows = stillMissing
      .filter((a) => campos[a.name])
      .map((a) => ({ category_id: categoryId, attribute_id: a.id, attribute_name: a.name, hint: campos[a.name] }))
    if (rows.length) {
      await db.from('ml_attribute_hints_cache').upsert(rows, { onConflict: 'category_id,attribute_id' })
      rows.forEach((r) => hintMap.set(r.attribute_id, r.hint))
    }
  } catch {
    // Sem OPENAI_API_KEY configurada, ou falha na chamada — só não gera
    // hint pra esses campos agora (o "?" simplesmente não aparece pra
    // eles), nunca derruba o resto da ficha técnica.
  }
  return hintMap
}

// Atributos que nunca devem chegar no texto pro cliente — filtrado aqui
// no código (mais confiável que só pedir pra IA "não mencionar", que ela
// pode esquecer). SKU é controle interno nosso; condição sempre é
// "Novo" (CoisaPet não revende usado, é redundante); dimensão/peso da
// EMBALAGEM de envio (diferente da dimensão do PRODUTO, que continua
// relevante) não interessa pro cliente. Pedido do Raphael em 2026-08-31.
const CONTENT_EXCLUDE_ATTR_IDS = new Set(['SELLER_SKU', 'PACKAGE_LENGTH', 'PACKAGE_WIDTH', 'PACKAGE_HEIGHT', 'PACKAGE_WEIGHT'])
const CONTENT_EXCLUDE_NAME_PATTERNS = [/^sku$/i, /condi[cç][aã]o do item/i, /(comprimento|largura|altura|peso).*embalagem/i, /embalagem.*(comprimento|largura|altura|peso)/i]
// "Desenho" é confuso pro cliente nesse contexto (produtos pet) — o
// Raphael prefere que apareça como "Cor/Variação" no texto gerado.
const CONTENT_RENAME_PATTERNS: [RegExp, string][] = [[/^desenho$/i, 'Cor/Variação']]

function sanitizeAttrsForContent(attrs: any[]) {
  return attrs
    .filter((a) => a.current_value)
    .filter((a) => !CONTENT_EXCLUDE_ATTR_IDS.has(a.id))
    .filter((a) => !CONTENT_EXCLUDE_NAME_PATTERNS.some((re) => re.test(a.name || '')))
    .map((a) => {
      const renamed = CONTENT_RENAME_PATTERNS.find(([re]) => re.test(a.name || ''))
      return renamed ? { ...a, name: renamed[1] } : a
    })
}

function buildContentPrompt(item: any, currentDescription: string, attrs: any[], trendKeywords: string[], questions: string[]) {
  const filledAttrs = sanitizeAttrsForContent(attrs).map((a: any) => `${a.name}: ${a.current_value}`).join('\n')
  return [
    `Título atual: ${item.title}`,
    `Descrição atual: ${currentDescription || '(sem descrição cadastrada ainda)'}`,
    filledAttrs
      ? `Ficha técnica preenchida (USE TODOS OS ITENS ABAIXO na descrição, não só 1 ou 2):\n${filledAttrs}`
      : 'Ficha técnica: nenhum atributo preenchido ainda.',
    trendKeywords.length ? `Palavras-chave em alta nessa categoria (use só se fizerem sentido pro produto): ${trendKeywords.join(', ')}` : '',
    questions.length ? `Perguntas reais de compradores sobre ESSE anúncio (responda na descrição só as que der pra responder com certeza usando os dados acima; ignore as outras):\n${questions.map((q) => `- ${q}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

async function suggestContent(integration: any, itemId: string) {
  const item = await mlFetch(`/items/${itemId}?attributes=id,title,category_id,attributes`, integration.access_token)

  let currentDescription = ''
  try {
    const descRes = await mlFetch(`/items/${itemId}/description`, integration.access_token)
    currentDescription = descRes.plain_text || ''
  } catch { /* item pode não ter descrição cadastrada ainda — segue com string vazia */ }

  const [[catAttrsResult, trendsResult], questions] = await Promise.all([
    Promise.allSettled([
      mlFetch(`/categories/${item.category_id}/attributes`, integration.access_token),
      mlFetch(`/trends/MLB/${item.category_id}`, integration.access_token),
    ]),
    fetchItemQuestions(integration, itemId),
  ])
  const catAttrs = catAttrsResult.status === 'fulfilled' ? catAttrsResult.value : []
  const trendKeywords = trendsResult.status === 'fulfilled' ? (trendsResult.value || []).map((t: any) => t.keyword).filter(Boolean) : []
  const attrs = buildFullAttributes(item, catAttrs)

  const prompt = buildContentPrompt(item, currentDescription, attrs, trendKeywords, questions)
  const suggestion = await callOpenAI(prompt)

  return {
    current:   { title: item.title, description: currentDescription },
    suggested: { title: suggestion.title, description: suggestion.description, changes_summary: suggestion.changes_summary },
    questions_considered: questions,
  }
}

// ── Sugestão e geração de imagem com IA (foto real do produto) ──────
// Pedido do Raphael (13/09): igual ao suggestContent acima, mas pra
// FOTO em vez de texto — sugere 2-4 ideias de imagem a partir das
// mesmas fontes (perguntas reais + ficha técnica/descrição), e gera a
// imagem de verdade a partir da foto real do produto (nunca do zero).
// Mesmo endpoint da OpenAI já usado no blog-ai (gpt-image-1,
// /v1/images/edits) — reaproveitado aqui em vez de importado de um
// módulo compartilhado porque cada function já é auto-contida nesse
// projeto (mesmo padrão de fetchItemQuestions/callOpenAI duplicados).
// Diferenças-chave em relação ao blog: (1) sempre vertical (1024x1536 —
// melhor visibilidade no app do ML, pedido explícito), (2) a foto de
// referência é a própria foto pública do anúncio no CDN do ML, nunca
// precisa de signed URL nem bucket próprio, (3) mantém geração mesmo
// sem nenhuma pergunta (cai só na ficha técnica/descrição).
const IMAGE_SUGGEST_SYSTEM_PROMPT = `Você é um especialista em fotografia de produto e conversão de anúncios do Mercado Livre Brasil, ajudando um FABRICANTE de produtos pet personalizados/artesanais a decidir que NOVAS fotos gerar por IA pra um anúncio, a partir da foto real do produto já existente.

Sua tarefa é sugerir de 2 a 4 ideias concretas de imagem, usando SOMENTE os fatos fornecidos (título, ficha técnica, descrição atual e, quando houver, perguntas reais de compradores sobre esse anúncio).

REGRA MAIS IMPORTANTE — NUNCA INVENTAR FATO:
Nunca proponha uma imagem que sugira característica, material, medida ou uso que não esteja nos dados fornecidos. Se não há dado suficiente pra uma ideia específica, prefira uma ideia mais genérica (ex: "mostrar o produto em uso num ambiente doméstico", "close-up do material/acabamento") em vez de inventar contexto.

QUANDO HÁ PERGUNTAS REAIS DE COMPRADORES:
- Cada pergunta é um sinal forte de o que uma foto poderia esclarecer melhor que o texto (tamanho, como é usado, cabe onde, com o que é compatível) — priorize ideias que respondam essas dúvidas visualmente.
- Só proponha isso se a resposta for 100% verificável pela ficha técnica/descrição fornecida — nunca invente pra "responder" uma pergunta.

QUANDO NÃO HÁ PERGUNTAS (produto sem perguntas ainda):
- Baseie as ideias só na ficha técnica e na descrição: ângulos que mostrem melhor o material/acabamento, o produto em contexto de uso real, escala/tamanho comparado a algo reconhecível, ou o produto com o pet certo interagindo (só se o tipo de pet for claro pelo título/categoria/ficha técnica).

CADA SUGESTÃO PRECISA TER:
- title: título curto em português (max ~8 palavras) do que a foto vai mostrar.
- reason: 1 frase em português explicando por que essa foto ajuda a vender/esclarecer dúvida.
- prompt: instrução de EDIÇÃO DE IMAGEM pronta, em INGLÊS, pra uma IA que recebe a FOTO REAL do produto como imagem-base e deve compor a cena ao redor dele SEM alterar o produto em si (mesma cor/material/formato/acabamento) — só adicionar ambientação, ângulo, contexto de uso ou (quando fizer sentido) o pet certo interagindo com o produto em escala realista. Nunca descreva o produto do zero, só o que muda ao redor dele.

FORMATO DA RESPOSTA — JSON válido, exatamente:
{"suggestions": [{"title": "...", "reason": "...", "prompt": "..."}]}`

function buildImageSuggestPrompt(item: any, currentDescription: string, attrs: any[], questions: string[]) {
  const filledAttrs = sanitizeAttrsForContent(attrs).map((a: any) => `${a.name}: ${a.current_value}`).join('\n')
  return [
    `Título do anúncio: ${item.title}`,
    `Descrição atual: ${currentDescription || '(sem descrição cadastrada ainda)'}`,
    filledAttrs ? `Ficha técnica preenchida:\n${filledAttrs}` : 'Ficha técnica: nenhum atributo preenchido ainda.',
    questions.length
      ? `Perguntas reais de compradores sobre ESSE anúncio (priorize ideias de foto que esclareçam essas dúvidas, só quando verificável pelos dados acima):\n${questions.map((q) => `- ${q}`).join('\n')}`
      : 'Nenhuma pergunta de comprador ainda registrada pra esse anúncio — baseie as sugestões só na ficha técnica e descrição.',
  ].filter(Boolean).join('\n\n')
}

// Só a galeria (fotos reais do anúncio, organizadas por variação) —
// NENHUMA chamada de IA aqui. Separado de suggestItemImages em 18/09
// (pedido do Raphael): antes um botão só fazia as duas coisas juntas,
// gastando token da OpenAI toda vez que alguém só queria ver/gerenciar
// as fotos ou subir uma imagem própria manualmente.
async function loadItemGallery(integration: any, itemId: string) {
  const item = await mlFetch(
    `/items/${itemId}?attributes=id,title,category_id,attributes,pictures,variations`,
    integration.access_token,
  )

  const pictures = (item.pictures || []).map((p: any) => ({ id: p.id, url: p.secure_url || p.url })).filter((p: any) => p.url)
  const pictureUrlById = new Map(pictures.map((p: any) => [p.id, p.url]))

  // Pedido do Raphael (14/09): a aba precisa organizar por variação de
  // verdade (não só "1 foto representante" por cor) — cada variação
  // mostra TODAS as fotos vinculadas a ela (uma foto pode aparecer em
  // mais de uma variação se for compartilhada no ML, o que é normal).
  // `general_pictures` = fotos do item que não estão em NENHUMA
  // variação — inclui as órfãs que o bug de 13/09 gerava, agora
  // visíveis na tela pra poder limpar em vez de ficarem escondidas.
  const linkedPictureIds = new Set((item.variations || []).flatMap((v: any) => v.picture_ids || []))
  const generalPictures = pictures.filter((p: any) => !linkedPictureIds.has(p.id))

  const variationLabel = (v: any) => (v.attribute_combinations || []).map((a: any) => a.value_name).filter(Boolean).join(' / ') || `Variação ${v.id}`
  // Uma foto pode estar em VÁRIAS variações ao mesmo tempo (comum quando
  // ainda não foi trocada a foto genérica de cada cor) — sem sinalizar
  // isso na tela, excluir "a foto de Preto" bloqueava com um erro que
  // citava outras variações que o Raphael nem estava olhando, parecendo
  // bug (14/09, 2º relato). Cada foto agora carrega `shared_with` (nome
  // das OUTRAS variações que também a usam) pra ficar óbvio antes de
  // tentar excluir.
  const variationsByPictureId = new Map<string, string[]>()
  for (const v of item.variations || []) {
    for (const pid of v.picture_ids || []) {
      if (!variationsByPictureId.has(pid)) variationsByPictureId.set(pid, [])
      variationsByPictureId.get(pid)!.push(variationLabel(v))
    }
  }
  const variations = (item.variations || []).map((v: any) => ({
    id: v.id,
    label: variationLabel(v),
    pictures: (v.picture_ids || [])
      .map((id: string) => ({
        id, url: pictureUrlById.get(id),
        shared_with: (variationsByPictureId.get(id) || []).filter((label) => label !== variationLabel(v)),
      }))
      .filter((p: any) => p.url),
  }))

  return {
    pictures,
    general_pictures: generalPictures,
    variations,
  }
}

// Só a IA (sugestões de foto) — chamada separada, só quando o botão
// "Sugestão de prompts" é clicado de propósito (18/09). Não repete o
// fetch de pictures/variations, isso já é responsabilidade de
// loadItemGallery.
async function suggestItemImages(integration: any, itemId: string) {
  const item = await mlFetch(
    `/items/${itemId}?attributes=id,title,category_id,attributes,pictures,variations`,
    integration.access_token,
  )

  let currentDescription = ''
  try {
    const descRes = await mlFetch(`/items/${itemId}/description`, integration.access_token)
    currentDescription = descRes.plain_text || ''
  } catch { /* item pode não ter descrição cadastrada ainda — segue com string vazia */ }

  const [[catAttrsResult], questions] = await Promise.all([
    Promise.allSettled([mlFetch(`/categories/${item.category_id}/attributes`, integration.access_token)]),
    fetchItemQuestions(integration, itemId),
  ])
  const catAttrs = catAttrsResult.status === 'fulfilled' ? catAttrsResult.value : []
  const attrs = buildFullAttributes(item, catAttrs)

  const prompt = buildImageSuggestPrompt(item, currentDescription, attrs, questions)
  const result = await callOpenAI(prompt, IMAGE_SUGGEST_SYSTEM_PROMPT)

  return {
    suggestions: (result?.suggestions || []).filter((s: any) => s?.title && s?.prompt),
    questions_considered: questions,
  }
}

// Cloudflare/OpenAI às vezes devolve 502/503/504 numa chamada isolada
// sem ser um problema real (mesmo comportamento já visto no blog-ai) —
// só vale re-tentar 5xx, 4xx é erro real (credencial, conteúdo etc.).
async function fetchRetrying5xx(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  let lastRes: Response = null as unknown as Response
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastRes = await fetch(url, init)
    if (lastRes.ok || lastRes.status < 500) return lastRes
    if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
  }
  return lastRes
}

// Reforço fixo sempre anexado no código, nunca só no system prompt —
// mesmo motivo do blog-ai (MANDATORY_IMAGE_SUFFIX): o GPT às vezes
// derruba uma instrução quando tem muita coisa pra cobrir num prompt
// curto. Aqui é uma versão genérica (não hamster-específica, já que o
// catálogo cobre hamster, gerbil, porquinho-da-índia, coelho, chinchila
// e tartaruga) — vertical sempre, produto fiel, sem texto/logo.
const MANDATORY_ITEM_IMAGE_SUFFIX = ' Keep the product itself (shape, color, material, size, proportions, finish) EXACTLY as shown in the reference photo, unless explicitly asked to change one specific attribute like color. No text, no logos, no watermarks, no engraved brand marks or labels anywhere in the image. Photorealistic, shot on a camera, natural lighting and shadow, real material texture, avoid CGI/3D render look, avoid plastic/overly smooth look, avoid the uncanny AI-generated look. Vertical portrait composition (2:3), product fully visible with comfortable framing, not cropped at the edges. If an animal is shown, depict it at realistic real-world scale for its species and candidly interacting with the product, not stiffly posed facing the camera.'

// Edição de imagem via OpenAI (gpt-image-1, /v1/images/edits) — mesmo
// endpoint/lógica do blog-ai, só que sempre com `size` vertical (pedido
// explícito: fotos verticais têm melhor visibilidade no app do ML) e
// baixando direto da URL pública do CDN do ML (nunca precisa de signed
// URL, ao contrário do blog que usa o bucket privado product-photos).
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
  form.append('size', '1024x1536')
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

async function generateItemImage(pictureUrl: string, prompt: string) {
  if (!pictureUrl) throw new Error('Nenhuma foto de referência do produto foi informada.')
  if (!prompt) throw new Error('Nenhuma instrução de imagem foi informada.')
  const finalPrompt = prompt + MANDATORY_ITEM_IMAGE_SUFFIX
  const imageBase64 = await callOpenAiImageEditItem(pictureUrl, finalPrompt)
  return { image_base64: imageBase64, prompt_used: finalPrompt }
}

// Caminho simples do "prompt personalizado" (pedido do Raphael: "gere
// uma imagem deste item na cor rosa, sem mudar nada apenas a cor") — só
// traduz/organiza o pedido em português pra uma instrução de edição em
// inglês, preservando a intenção exata, antes de cair no mesmo
// generateItemImage acima (mesmo sufixo obrigatório, mesma geração).
const CUSTOM_IMAGE_PROMPT_SYSTEM = `Você traduz um pedido curto em português (de um lojista, sobre a foto de um produto) numa instrução de EDIÇÃO de imagem em INGLÊS, pra uma IA que recebe a FOTO REAL do produto e deve aplicar só a mudança pedida.

REGRAS:
- Preserve exatamente a intenção do pedido — não invente mudança extra que não foi pedida, nem remova parte do pedido.
- Deixe claro que tudo no produto deve continuar igual (forma, material, proporção, acabamento) EXCETO o que foi pedido explicitamente.
- Direto na instrução, sem "Prompt:", sem aspas.

FORMATO DA RESPOSTA — JSON válido, exatamente:
{"prompt": "..."}`

async function buildCustomEditPrompt(instructionPt: string) {
  const result = await callOpenAI(`Pedido do lojista (português): ${instructionPt}`, CUSTOM_IMAGE_PROMPT_SYSTEM)
  const prompt = String(result?.prompt || '').trim()
  if (!prompt) throw new Error('Não foi possível montar uma instrução de edição a partir do pedido.')
  return prompt
}

// Adiciona a imagem gerada (aprovada na tela) como NOVA foto do
// anúncio real — sempre disparado atrás de confirmação explícita
// (ConfirmWriteModal), nunca substitui/remove fotos existentes, só
// acrescenta. Reaproveita o mesmo uploadPicture já usado na criação de
// anúncio (devolve só o id da foto), depois faz merge com o array de
// fotos já existente antes do PUT — o ML substitui o array inteiro, não
// faz merge sozinho.
// Bug real reportado pelo Raphael (14/09): a imagem gerada ATÉ subia pro
// ML (confirmado consultando o item de verdade — o id da foto aparecia
// no array geral `pictures`), mas nunca ficava visível nem "pra variação
// escolhida nem pra geral". Causa raiz: item com variação só mostra pro
// comprador (e no app) as fotos que estão em `variations[].picture_ids`
// daquela variação — uma foto que só existe no array geral do item, sem
// estar linkada em nenhuma variação, fica órfã e não aparece em lugar
// nenhum de verdade. Corrigido: quando a foto base escolhida veio de uma
// variação específica (`variationId`), a foto nova entra TAMBÉM no
// `picture_ids` daquela variação, além do array geral (que continua
// precisando ser atualizado primeiro/junto — a variação só pode
// referenciar um id que já existe no item).
// Regra de ouro pra qualquer escrita em `variations` — NUNCA montar isso
// à mão de outro jeito. Incidente real 14/09 (ver coisapet.md e memória
// `coisapet-ml-variations-put-gotcha`): o PUT `/items/{id}` trata
// `variations` como SUBSTITUIÇÃO TOTAL do array, nunca merge por id —
// mandar só as variações que mudaram apaga de verdade todas as outras
// do anúncio real (já aconteceu: apagou 5 de 8 variações de um item ao
// vivo, precisou restaurar na mão). Por isso essa função SEMPRE recebe
// a lista COMPLETA de variações existentes e só deixa `mutatePictureIds`
// mexer no `picture_ids` de cada uma — nunca ecoa de volta campos que o
// próprio ML rejeita como só-leitura (catalog_product_id, inventory_id,
// item_relations, user_product_id, sold_quantity — confirmado ao vivo
// que só `catalog_product_id` de volta já derruba o PUT inteiro com
// "not_modifiable").
function buildVariationsForWrite(existing: any[], mutatePictureIds: (v: any) => string[]): any[] {
  return (existing || []).map((v: any) => ({
    id: v.id,
    price: v.price,
    attribute_combinations: v.attribute_combinations,
    available_quantity: v.available_quantity,
    sale_terms: v.sale_terms,
    seller_custom_field: v.seller_custom_field,
    picture_ids: mutatePictureIds(v),
  }))
}

// Bug real reportado pelo Raphael (14/09): a imagem gerada ATÉ subia pro
// ML (confirmado consultando o item de verdade — o id da foto aparecia
// no array geral `pictures`), mas nunca ficava visível nem "pra variação
// escolhida nem pra geral". Causa raiz: item com variação só mostra pro
// comprador (e no app) as fotos que estão em `variations[].picture_ids`
// daquela variação — uma foto que só existe no array geral do item, sem
// estar linkada em nenhuma variação, fica órfã e não aparece em lugar
// nenhum de verdade. Corrigido: quando a foto base escolhida veio de uma
// variação específica (`variationId`), a foto nova entra TAMBÉM no
// `picture_ids` daquela variação, além do array geral (que continua
// precisando ser atualizado primeiro/junto — a variação só pode
// referenciar um id que já existe no item).
async function attachItemImage(integration: any, db: ReturnType<typeof adminClient>, itemId: string, imageBase64: string, variationId?: number) {
  const uploaded = await uploadPicture(integration.access_token, imageBase64, `ai-generated-${Date.now()}.png`, 'image/png')
  const current = await mlFetch(`/items/${itemId}?attributes=pictures,variations`, integration.access_token)
  const pictures = [...(current.pictures || []).map((p: any) => ({ id: p.id })), { id: uploaded.id }]
  const payload: Record<string, unknown> = { pictures }

  if (variationId && (current.variations || []).length) {
    payload.variations = buildVariationsForWrite(current.variations, (v) =>
      v.id === variationId ? [...(v.picture_ids || []), uploaded.id] : v.picture_ids)
  }

  await mlWrite(`/items/${itemId}`, integration.access_token, 'PUT', payload)
  await logItemUpdate(db, itemId, 'picture_added', { picture_id: uploaded.id, variation_id: variationId ?? null })
  return { ok: true, picture_id: uploaded.id }
}

// Exclui uma foto do anúncio de verdade — remove do array geral E de
// qualquer variação que a referencie (nunca deixa órfã pro lado
// contrário do bug acima). Sempre atrás de confirmação explícita na
// tela, mesma regra de qualquer escrita real no ML.
async function deleteItemImage(integration: any, db: ReturnType<typeof adminClient>, itemId: string, pictureId: string) {
  const current = await mlFetch(`/items/${itemId}?attributes=pictures,variations`, integration.access_token)
  const pictures = (current.pictures || []).filter((p: any) => p.id !== pictureId).map((p: any) => ({ id: p.id }))
  if (!pictures.length) throw new Error('Não é possível excluir: o anúncio precisa ter pelo menos 1 foto.')

  // Confirmado ao vivo (14/09): o ML rejeita a variação inteira se ela
  // ficar com `picture_ids` vazio ("Null or Empty is not valid") — se a
  // foto é a ÚNICA de alguma variação, bloqueia aqui com mensagem clara
  // em vez de deixar o erro cru da API estourar na tela.
  const wouldEmptyVariations = (current.variations || [])
    .filter((v: any) => (v.picture_ids || []).length === 1 && v.picture_ids[0] === pictureId)
    .map((v: any) => (v.attribute_combinations || []).map((a: any) => a.value_name).filter(Boolean).join(' / ') || `Variação ${v.id}`)
  if (wouldEmptyVariations.length) {
    throw new Error(`Não é possível excluir: essa foto é COMPARTILHADA e é a única foto da variação "${wouldEmptyVariations.join('", "')}" também — o Mercado Livre exige pelo menos 1 foto por variação. Adicione outra foto pra essa(s) variação(ões) antes de excluir esta.`)
  }

  const payload: Record<string, unknown> = { pictures }

  if ((current.variations || []).length) {
    payload.variations = buildVariationsForWrite(current.variations, (v) =>
      (v.picture_ids || []).filter((id: string) => id !== pictureId))
  }

  await mlWrite(`/items/${itemId}`, integration.access_token, 'PUT', payload)
  await logItemUpdate(db, itemId, 'picture_removed', { picture_id: pictureId })
  return { ok: true }
}

// Pedido do Raphael (14/09): poder escolher qual foto é a "principal" de
// uma variação — a 1ª do `picture_ids` é a que o ML usa como capa/miniatura
// pra quem escolhe aquela cor. Só reordena (nunca adiciona/remove nada) —
// serve tanto pra promover uma foto boa que já existe quanto, combinado
// com gerar uma foto nova, pra tirar a genérica compartilhada da posição
// de destaque mesmo antes de poder excluí-la de vez (ela só pode ser
// excluída quando deixar de ser a ÚNICA foto de alguma variação).
async function reorderVariationPicture(integration: any, db: ReturnType<typeof adminClient>, itemId: string, variationId: number, pictureId: string) {
  const current = await mlFetch(`/items/${itemId}?attributes=pictures,variations`, integration.access_token)
  const target = (current.variations || []).find((v: any) => v.id === variationId)
  if (!target) throw new Error('Variação não encontrada.')
  if (!(target.picture_ids || []).includes(pictureId)) throw new Error('Essa foto não pertence a essa variação.')

  // Sempre reenvia `pictures` explícito também, mesmo sem mudar nada nele
  // — igual `attachItemImage`/`deleteItemImage` já faziam. Suspeita real
  // (14/09): um PUT só com `variations` (sem `pictures` no corpo) parece
  // ter feito o ML remover sozinho 1 foto do array geral (e da variação
  // Cobre) que não tinha nenhuma relação com a escrita pedida — nunca
  // mais omitir esse campo em nenhuma escrita de variação, custe o que
  // custar em verbosidade.
  const payload = {
    pictures: (current.pictures || []).map((p: any) => ({ id: p.id })),
    variations: buildVariationsForWrite(current.variations, (v: any) =>
      v.id === variationId ? [pictureId, ...(v.picture_ids || []).filter((id: string) => id !== pictureId)] : v.picture_ids),
  }

  await mlWrite(`/items/${itemId}`, integration.access_token, 'PUT', payload)
  await logItemUpdate(db, itemId, 'picture_reordered', { variation_id: variationId, picture_id: pictureId })
  return { ok: true }
}

// Pedido do Raphael (14/09, 3º relato): a foto genérica compartilhada
// (usada por 7 das 8 variações do exemplo real) não podia ser removida
// de UMA variação específica que já tinha fotos próprias (ex: Branco,
// com 3 fotos) porque `deleteItemImage` sempre olha o item inteiro — se
// qualquer OUTRA variação (Azul, Preto etc.) ainda depende só dela,
// bloqueia certo, mas isso impedia até tirar ela de uma variação que já
// não precisa mais dela. Essa função resolve exatamente esse caso:
// desvincula a foto só da variação escolhida (nunca mexe no array geral
// `pictures` nem em nenhuma OUTRA variação) — a foto continua existindo
// no anúncio e em quem mais a usa, só sai da galeria dessa variação.
async function unlinkVariationPicture(integration: any, db: ReturnType<typeof adminClient>, itemId: string, variationId: number, pictureId: string) {
  const current = await mlFetch(`/items/${itemId}?attributes=pictures,variations`, integration.access_token)
  const target = (current.variations || []).find((v: any) => v.id === variationId)
  if (!target) throw new Error('Variação não encontrada.')
  const remaining = (target.picture_ids || []).filter((id: string) => id !== pictureId)
  if (!remaining.length) throw new Error('Não é possível remover: essa é a única foto dessa variação. Adicione outra foto pra ela antes.')

  // Ver nota em `reorderVariationPicture` — sempre reenvia `pictures`
  // explícito, nunca deixar de fora de um PUT que mexe em `variations`.
  const payload = {
    pictures: (current.pictures || []).map((p: any) => ({ id: p.id })),
    variations: buildVariationsForWrite(current.variations, (v: any) => (v.id === variationId ? remaining : v.picture_ids)),
  }

  await mlWrite(`/items/${itemId}`, integration.access_token, 'PUT', payload)
  await logItemUpdate(db, itemId, 'picture_unlinked', { variation_id: variationId, picture_id: pictureId })
  return { ok: true }
}

// Pedido do Raphael (15/09): gerava a imagem usando uma foto da variação
// Amadeirado como referência (pra pedir "faz ela preta"), mas o resultado
// ficava vinculado ao Amadeirado (a variação da foto BASE) em vez do
// Preto (a variação de destino de verdade) — e não tinha como mover
// depois, só excluir e regerar. Essa função move uma foto já existente
// de uma variação pra outra num único PUT (tira de origem, acrescenta em
// destino, sem duplicar se já estiver lá) — mesma regra de sempre:
// reenvia TODAS as variações e `pictures` explícito.
async function moveVariationPicture(integration: any, db: ReturnType<typeof adminClient>, itemId: string, pictureId: string, fromVariationId: number, toVariationId: number) {
  const current = await mlFetch(`/items/${itemId}?attributes=pictures,variations`, integration.access_token)
  const fromV = (current.variations || []).find((v: any) => v.id === fromVariationId)
  const toV = (current.variations || []).find((v: any) => v.id === toVariationId)
  if (!fromV || !toV) throw new Error('Variação não encontrada.')
  if (!(fromV.picture_ids || []).includes(pictureId)) throw new Error('Essa foto não pertence à variação de origem.')
  if ((fromV.picture_ids || []).length === 1) {
    throw new Error('Não é possível mover: essa é a única foto dessa variação — o Mercado Livre exige pelo menos 1 foto por variação. Adicione outra foto lá antes de mover esta.')
  }

  const payload = {
    pictures: (current.pictures || []).map((p: any) => ({ id: p.id })),
    variations: buildVariationsForWrite(current.variations, (v: any) => {
      if (v.id === fromVariationId) return (v.picture_ids || []).filter((id: string) => id !== pictureId)
      if (v.id === toVariationId) return (v.picture_ids || []).includes(pictureId) ? v.picture_ids : [...(v.picture_ids || []), pictureId]
      return v.picture_ids
    }),
  }

  await mlWrite(`/items/${itemId}`, integration.access_token, 'PUT', payload)
  await logItemUpdate(db, itemId, 'picture_moved', { picture_id: pictureId, from_variation_id: fromVariationId, to_variation_id: toVariationId })
  return { ok: true }
}

// Escrita — mesma regra de sempre: só dispara atrás de confirmação
// explícita do usuário. title/description são independentes — dá pra
// aplicar só um dos dois.
// Erros conhecidos da API que merecem explicação em português em vez do
// JSON cru. Causa raiz real confirmada em 2026-08-31 (testado ao vivo +
// pesquisa): a causa NÃO é "ser uma família de variações" em si — é que
// o ML trava edição de título (e do campo que o substitui nesse formato
// novo, family_name) de QUALQUER anúncio que já teve pelo menos 1 venda,
// pra impedir o vendedor de trocar o título depois que o comprador já
// avaliou em cima dele. Confirmado no item de teste: `sold_quantity: 13`
// — a 1ª tentativa (título) e a 2ª (family_name, fallback abaixo) falham
// pelo MESMO motivo de fundo, só com mensagens de erro diferentes da API.
function friendlyMlError(raw: string): string {
  if (/field family name is invalid/i.test(raw)) {
    return 'Esse anúncio já teve pelo menos 1 venda — o Mercado Livre trava a edição de título (e do campo que faz esse papel nesse formato mais novo de anúncio) depois da primeira venda, pra impedir trocar o título depois que o cliente já avaliou em cima dele. Não é bug nosso, é regra do próprio ML — a descrição continua editável normalmente, só o título fica travado nesse tipo de anúncio.'
  }
  if (/cannot modify the title if the item has a family_name/i.test(raw)) {
    return 'Esse anúncio está no formato de família de variações do ML e nem o jeito alternativo (editar via family_name) funcionou — provavelmente porque já teve alguma venda (o ML trava título de anúncio já vendido). Só dá pra mudar o título direto no painel deles, se é que dá.'
  }
  // Erro de validação de criação de anúncio (atributo obrigatório faltando,
  // categoria não aceita publicação, etc.) — o ML devolve um array `cause`
  // com o motivo de cada campo. Extrai e lista em vez de esconder o JSON
  // cru, sem inventar explicação pra nada que a API não disse de verdade.
  const jsonStart = raw.indexOf('{')
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart))
      const causes = (parsed?.cause || []).map((c: any) => c?.message || c?.code).filter(Boolean)
      if (causes.length) return `O Mercado Livre recusou: ${causes.join('; ')}`
      if (parsed?.message) return `O Mercado Livre recusou: ${parsed.message}`
    } catch { /* não era JSON — mostra o texto cru mesmo */ }
  }
  return raw
}

// Título e descrição são escritas INDEPENDENTES na API do ML (endpoints
// diferentes) — se uma falhar, a outra continua sendo tentada e aplicada
// normalmente, em vez de tudo falhar junto (bug real: título rejeitado
// por restrição de família de variações fazia a descrição, que não
// tinha nenhum problema, nunca nem ser tentada).
async function applyContent(integration: any, db: ReturnType<typeof adminClient>, itemId: string, title?: string, description?: string) {
  const results: { title?: boolean; description?: boolean } = {}
  const errors: { title?: string; description?: string } = {}

  if (title) {
    try {
      await mlWrite(`/items/${itemId}`, integration.access_token, 'PUT', { title })
      results.title = true
    } catch (err) {
      const raw = String(err)
      if (/cannot modify the title if the item has a family_name/i.test(raw)) {
        // Anúncio migrado pro modelo "User Products" do ML (achado por
        // pesquisa em 2026-08-31, confirmado ao vivo): nesse formato o
        // título é CALCULADO a partir do campo `family_name`, não editável
        // direto. Escrever em `family_name` recalcula e substitui o
        // título automaticamente — tenta esse caminho antes de desistir.
        // Risco controlado: `family_name` é compartilhado só entre os
        // itens da mesma "família" (user_product_id) — checar quantos
        // itens tem na família antes de generalizar isso pra item com
        // várias variações de verdade (não testado nesse caso ainda).
        try {
          await mlWrite(`/items/${itemId}`, integration.access_token, 'PUT', { family_name: title })
          results.title = true
        } catch (err2) {
          errors.title = friendlyMlError(String(err2))
        }
      } else {
        errors.title = friendlyMlError(raw)
      }
    }
  }
  if (description != null) {
    try {
      await mlWrite(`/items/${itemId}/description?api_version=2`, integration.access_token, 'PUT', { plain_text: description })
      results.description = true
    } catch (err) {
      errors.description = friendlyMlError(String(err))
    }
  }

  if (!results.title && !results.description) {
    throw new Error([errors.title, errors.description].filter(Boolean).join(' | ') || 'Nada pra aplicar.')
  }
  if (results.title || results.description) {
    await logItemUpdate(db, itemId, 'content', { title: !!results.title, description: !!results.description })
  }
  return { ok: true, item_id: itemId, ...results, errors: Object.keys(errors).length ? errors : undefined }
}

// ── Gestão de anúncios ativos (pausar/reativar, preço, estoque) ──────
// Lista TODOS os anúncios (ativo + pausado) pra tela de gestão — 2
// buscas de ids (`status=active` / `status=paused`) + 1 multiget em
// lotes de 20 (mesmo padrão de `trafficAudit`) pra trazer thumbnail/
// preço/estoque/status de uma vez, sem 1 chamada por item.
// Bug real reportado pelo Raphael (14/09): na tela de Desconto em massa,
// alguns itens da lista "Já com desconto" apareciam só com o código
// (MLB...) em vez do título. Causa: essa busca só pegava a 1ª página (100
// primeiros) de cada status — com 233 anúncios ativos na conta, quem
// ficava depois do 100º nunca entrava em `bulkItems`, e o front cai no
// fallback de mostrar o id cru quando não acha o título correspondente.
// Corrigido: pagina por `offset` até esgotar cada status (mesmo padrão
// de paginação já usado em outras varreduras deste arquivo).
async function searchAllItemIds(integration: any, status: string): Promise<string[]> {
  const ids: string[] = []
  const limit = 100
  let offset = 0
  for (let i = 0; i < 20; i++) { // teto de segurança — no máx. 2000 itens
    const page = await mlFetch(`/users/${integration.ml_user_id}/items/search?status=${status}&limit=${limit}&offset=${offset}`, integration.access_token)
    ids.push(...(page.results || []))
    const total = page.paging?.total ?? ids.length
    offset += limit
    if (offset >= total || !page.results?.length) break
  }
  return ids
}

async function activeListings(integration: any) {
  const [activeIds, pausedIds] = await Promise.all([
    searchAllItemIds(integration, 'active'),
    searchAllItemIds(integration, 'paused'),
  ])
  const ids = [...activeIds, ...pausedIds]
  if (!ids.length) return { results: [] }

  const results: any[] = []
  for (const group of chunk(ids, 20)) {
    try {
      const multi = await mlFetch(`/items?ids=${group.join(',')}&attributes=id,title,thumbnail,price,available_quantity,status,permalink`, integration.access_token)
      ;(multi || []).forEach((entry: any) => {
        const item = entry?.body
        if (!item?.id) return
        results.push({
          item_id: item.id, title: item.title, thumbnail: item.thumbnail,
          price: item.price, available_quantity: item.available_quantity,
          status: item.status, permalink: item.permalink || null,
        })
      })
    } catch { /* lote falho não derruba os outros */ }
  }
  return { results }
}

// Estoque Full — confirmado ao vivo em 2026-09-03 contra a API real
// (a doc oficial bloqueia fetch direto na pesquisa, então testei os
// caminhos possíveis um por um): `logistic_type=fulfillment` no filtro
// de busca devolve só os anúncios no Full; `available_quantity` do
// próprio item já É o estoque real no Full pra item SEM variação; item
// COM variação (cor/tamanho no mesmo anúncio) tem um `inventory_id` por
// variação, e só dá pra saber o estoque de cada uma via
// `/inventories/{inventory_id}/stock/fulfillment` (devolve total/
// disponível/indisponível, com motivo quando indisponível). NÃO existe
// endpoint de agendamento/envio de reposição pro centro de distribuição
// — confirmado testando vários caminhos prováveis, todos 404 — isso só
// é feito manualmente no painel do vendedor do próprio Mercado Livre.
// Testado ao vivo em 2026-09-13 (pedido do Raphael — números do Full não
// batiam com o painel do ML): pra item SEM variação, `item.available_quantity`
// vindo de `/items` NÃO é o estoque real do Full — achado um caso real
// onde o item dizia 93 unidades e o estoque de verdade no centro de
// distribuição (confirmado contra `/inventories/{id}/stock/fulfillment`
// E contra a tela "Controle de estoque" do próprio painel do ML) era 0.
// A fonte de verdade é sempre o endpoint de inventário, com ou sem
// variação — todo item Full tem um `inventory_id` próprio (mesmo sem
// variação), só não estava sendo pedido nem usado antes.
async function fulfillmentStock(integration: any, db: ReturnType<typeof adminClient>) {
  // Inclui `paused` além de `active` (pedido do Raphael, 13/09): um
  // anúncio pausado pode ter estoque real chegando no Full mesmo assim
  // (lote já despachado da fábrica antes de o anúncio ser reativado) —
  // antes esse estoque ficava invisível no sistema.
  const [activeSearch, pausedSearch] = await Promise.all([
    mlFetch(`/users/${integration.ml_user_id}/items/search?status=active&logistic_type=fulfillment&limit=100`, integration.access_token),
    mlFetch(`/users/${integration.ml_user_id}/items/search?status=paused&logistic_type=fulfillment&limit=100`, integration.access_token),
  ])
  const idsSet = new Set<string>([...(activeSearch.results || []), ...(pausedSearch.results || [])])

  // Item recém entrando no Full (lote já despachado, mas o ML ainda não
  // reclassificou o anúncio como `logistic_type: fulfillment`) não
  // aparece nas buscas acima — testado ao vivo em 13/09 com um caso
  // real ("Gaiola Terrário", `shipping.tags` tinha `fbm_in_process` mas
  // `logistic_type` ainda `xd_drop_off`). Complementa com qualquer
  // anúncio referenciado num envio NOSSO ainda "em aberto" — ou seja,
  // que não terminou. Usar "não está numa lista de status terminais" em
  // vez de listar os status "em andamento": testado ao vivo, `received`
  // com `sub_status: open` (lote chegou mas ainda processando) É um
  // status real que apareceu numa conta de verdade e não é nem
  // `working` nem `confirmed` — mais seguro excluir só os terminais
  // conhecidos do que tentar adivinhar todo status "em andamento".
  const TERMINAL_SHIPMENT_STATUSES = ['closed_ok', 'closed_with_changes', 'cancelled', 'expired']
  const { data: openShipments } = await db.from('ml_full_inbound_shipments').select('id').not('status', 'in', `(${TERMINAL_SHIPMENT_STATUSES.join(',')})`)
  const openShipmentIds = (openShipments || []).map((s: any) => s.id)
  if (openShipmentIds.length) {
    const { data: pendingItems } = await db.from('ml_full_inbound_items').select('ml_code').in('shipment_id', openShipmentIds)
    for (const row of (pendingItems || [])) if (row.ml_code) idsSet.add(row.ml_code)
  }

  const ids: string[] = [...idsSet]
  if (!ids.length) return { results: [] }

  const results: any[] = []
  const inventoryIds = new Set<string>()

  for (const group of chunk(ids, 20)) {
    try {
      const multi = await mlFetch(`/items?ids=${group.join(',')}&attributes=id,title,thumbnail,permalink,available_quantity,variations,inventory_id,status`, integration.access_token)
      for (const entry of (multi || [])) {
        const item = entry?.body
        if (!item?.id) continue

        if (item.variations?.length) {
          const variations = await mapWithConcurrency(item.variations, 5, async (v: any) => {
            const label = (v.attribute_combinations || []).map((a: any) => a.value_name).filter(Boolean).join(' / ') || `Variação ${v.id}`
            if (v.inventory_id) inventoryIds.add(v.inventory_id)
            // Sem inventory_id = variação ainda não entrou no Full de
            // verdade (visto ao vivo em 13/09: produto no meio da
            // transição, algumas cores já com inventory_id, outras
            // ainda não) — `v.available_quantity` aqui é o MESMO campo
            // não confiável pro Full que já corrigimos acima pro item
            // inteiro; melhor mostrar "não confirmado" (null, não conta
            // na soma) do que repetir o mesmo erro numa variação.
            if (!v.inventory_id) return { variation_id: v.id, label, inventory_id: null, available: null, total: null, not_available: null, not_available_detail: [], unconfirmed: true }
            try {
              const stock = await mlFetch(`/inventories/${v.inventory_id}/stock/fulfillment`, integration.access_token)
              return {
                variation_id: v.id, label, inventory_id: v.inventory_id,
                total: stock.total ?? null, available: stock.available_quantity ?? null,
                not_available: stock.not_available_quantity ?? null, not_available_detail: stock.not_available_detail ?? [],
              }
            } catch (err) {
              return { variation_id: v.id, label, inventory_id: v.inventory_id, available: null, total: null, not_available: null, not_available_detail: [], error: String(err) }
            }
          })
          results.push({
            item_id: item.id, title: item.title, thumbnail: item.thumbnail, permalink: item.permalink || null, status: item.status,
            available_quantity: variations.reduce((s: number, v: any) => s + (v.available ?? 0), 0),
            variations,
          })
        } else if (item.inventory_id) {
          inventoryIds.add(item.inventory_id)
          try {
            const stock = await mlFetch(`/inventories/${item.inventory_id}/stock/fulfillment`, integration.access_token)
            results.push({
              item_id: item.id, title: item.title, thumbnail: item.thumbnail, permalink: item.permalink || null, status: item.status,
              inventory_id: item.inventory_id,
              available_quantity: stock.available_quantity ?? 0,
              not_available: stock.not_available_quantity ?? null, not_available_detail: stock.not_available_detail ?? [],
              variations: null,
            })
          } catch {
            // Falha isolada: melhor mostrar o número (possivelmente
            // impreciso) do item do que sumir com ele da lista.
            results.push({
              item_id: item.id, title: item.title, thumbnail: item.thumbnail, permalink: item.permalink || null, status: item.status,
              inventory_id: item.inventory_id,
              available_quantity: item.available_quantity ?? 0,
              variations: null,
            })
          }
        } else {
          results.push({
            item_id: item.id, title: item.title, thumbnail: item.thumbnail, permalink: item.permalink || null, status: item.status,
            available_quantity: item.available_quantity ?? 0,
            variations: null,
          })
        }
      }
    } catch { /* lote falho não derruba os outros */ }
  }

  // Cruza com a Gestão de Envios Full (pedido do Raphael, 13/09: "fazer
  // essas 2 telas conversarem") — o estoque "a caminho" que aparece no
  // painel do ML não vem do endpoint de inventário (testado: sempre
  // devolve 0 pra unidade ainda não recebida), vem mesmo do envio em
  // aberto. `ml_full_inbound_items.ml_code` guarda o ID do ANÚNCIO
  // (pode repetir por variação), não o SKU/inventory_id — o inventory_id
  // real de cada unidade só existe dentro de `raw->>'inventoryId'`
  // (confirmado ao vivo cruzando um caso real: SKU "IOXE55033" batendo
  // com o envio #74259426, variação "Amadeirado", 20 un. declaradas).
  const incomingByInventory = new Map<string, any[]>()
  if (inventoryIds.size) {
    const list = [...inventoryIds]
    const { data: incomingRows, error: incomingErr } = await db
      .from('ml_full_inbound_items')
      .select('shipment_id, declared_qty, raw, shipment:ml_full_inbound_shipments(status, name, appointment_date, reception_date)')
      .filter('raw->>inventoryId', 'in', `(${list.map((v) => `"${v}"`).join(',')})`)
    if (!incomingErr) {
      for (const row of (incomingRows || [])) {
        const shipmentStatus = (row as any).shipment?.status
        if (TERMINAL_SHIPMENT_STATUSES.includes(shipmentStatus)) continue // só envio ainda em aberto, não finalizado/cancelado
        const invId = (row as any).raw?.inventoryId
        if (!invId) continue
        const arr = incomingByInventory.get(invId) || []
        arr.push({
          shipment_id: (row as any).shipment_id, qty: (row as any).declared_qty,
          status: shipmentStatus, name: (row as any).shipment?.name,
          appointment_date: (row as any).shipment?.appointment_date,
        })
        incomingByInventory.set(invId, arr)
      }
    }
  }
  for (const item of results) {
    if (item.inventory_id) item.incoming = incomingByInventory.get(item.inventory_id) || []
    if (item.variations) {
      for (const v of item.variations) v.incoming = v.inventory_id ? (incomingByInventory.get(v.inventory_id) || []) : []
    }
  }

  return { results }
}

// Pausar/reativar, editar preço, editar estoque — os 3 casos viram 1
// PUT só, mandando SÓ os campos que o usuário realmente mudou (mesmo
// espírito de `updateItemAttributes`, que também só manda o que foi
// preenchido). Sempre atrás de confirmação explícita na tela.
async function updateItemFields(integration: any, db: ReturnType<typeof adminClient>, itemId: string, fields: Record<string, unknown>) {
  const allowed = ['status', 'price', 'available_quantity']
  const clean: Record<string, unknown> = {}
  for (const k of allowed) if (fields?.[k] != null) clean[k] = fields[k]
  if (!Object.keys(clean).length) throw new Error('Nenhum campo pra salvar.')
  try {
    const updated = await mlWrite(`/items/${itemId}`, integration.access_token, 'PUT', clean)
    await logItemUpdate(db, itemId, 'quick_fields', clean)
    return { ok: true, item_id: itemId, status: updated.status, price: updated.price, available_quantity: updated.available_quantity }
  } catch (err) {
    throw new Error(friendlyMlError(String(err)))
  }
}

// ── Criação de anúncio novo ───────────────────────────────────────────
// Endpoint de predição de categoria a partir do título — AINDA NÃO
// confirmado ao vivo (a doc oficial bloqueou fetch direto na pesquisa,
// igual já aconteceu com Ads/performance antes). Ação de debug separada,
// permanente (mesmo padrão de `item_raw_debug`/`order_shipment_debug`),
// pra testar com título real antes de confiar no formato da resposta.
async function categoryPredictDebug(accessToken: string, title: string) {
  return await mlFetch(`/sites/MLB/domain_discovery/search?q=${encodeURIComponent(title)}`, accessToken)
}

// Wrapper já formatado pro frontend — lista enxuta de candidatos pra
// escolher. Se o formato real (confirmado via `category_predict_debug`)
// vier diferente do esperado aqui, é só ajustar o `.map` abaixo.
async function predictCategory(accessToken: string, title: string) {
  const raw = await categoryPredictDebug(accessToken, title)
  const list = Array.isArray(raw) ? raw : (raw?.results ?? [])
  return {
    candidates: list.map((c: any) => ({
      category_id:   c.category_id ?? c.id,
      category_name: c.category_name ?? c.name ?? null,
      domain_name:   c.domain_name ?? null,
    })).filter((c: any) => c.category_id),
  }
}

// Ficha técnica "vazia" pra preencher do zero — reaproveita
// `buildFullAttributes` passando `{}` no lugar de um item real (a
// function já lida bem com isso: nenhum atributo aparece como
// preenchido, current_value fica sempre null).
async function categoryAttributesForCreate(accessToken: string, categoryId: string) {
  const [catAttrs, category] = await Promise.all([
    mlFetch(`/categories/${categoryId}/attributes`, accessToken),
    mlFetch(`/categories/${categoryId}`, accessToken).catch(() => null),
  ])
  return { category_id: categoryId, category_name: category?.name ?? null, attributes: buildFullAttributes({}, catAttrs) }
}

// Upload de foto — recebe o arquivo em base64 do frontend, decodifica e
// repassa como multipart pro ML (o `fetch` do Deno monta o multipart
// sozinho a partir de um FormData, não precisa montar string à mão).
// Devolve o `id` da foto — é isso que entra em `pictures: [{id}]` na
// hora de criar o anúncio.
async function uploadPicture(accessToken: string, fileBase64: string, fileName: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0))
  const fd = new FormData()
  fd.append('file', new Blob([bytes], { type: mimeType || 'image/jpeg' }), fileName || 'foto.jpg')
  const res = await fetch('https://api.mercadolibre.com/pictures/items/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
  })
  if (!res.ok) throw new Error(friendlyMlError(`${res.status} ${await res.text()}`))
  const data = await res.json()
  return { id: data.id, raw: data }
}

// Copia campos "estruturais" de 1 anúncio real já ativo do vendedor
// (de preferência da mesma categoria) em vez de adivinhar valor de
// campo que a API valida sem erro claro na hora — mesmo raciocínio já
// usado em outras correções deste módulo. Sem nenhum anúncio ativo pra
// copiar (loja nova/zerada), cai num default fixo razoável pro Brasil.
async function fetchStructuralDefaults(integration: any, categoryId: string) {
  const FALLBACK = { listing_type_id: 'gold_special', buying_mode: 'buy_it_now', currency_id: 'BRL', shipping_mode: 'me2' }
  try {
    let search = await mlFetch(`/users/${integration.ml_user_id}/items/search?category=${categoryId}&status=active&limit=1`, integration.access_token)
    if (!search.results?.length) {
      search = await mlFetch(`/users/${integration.ml_user_id}/items/search?status=active&limit=1`, integration.access_token)
    }
    const sampleId = search.results?.[0]
    if (!sampleId) return FALLBACK
    const sample = await mlFetch(`/items/${sampleId}?attributes=listing_type_id,buying_mode,currency_id,shipping`, integration.access_token)
    return {
      listing_type_id: sample.listing_type_id || FALLBACK.listing_type_id,
      buying_mode:      sample.buying_mode || FALLBACK.buying_mode,
      currency_id:      sample.currency_id || FALLBACK.currency_id,
      shipping_mode:    sample.shipping?.mode || FALLBACK.shipping_mode,
    }
  } catch {
    return FALLBACK
  }
}

// Cria o anúncio de verdade. Sempre atrás de confirmação explícita na
// tela de revisão. Descrição é ESCRITA SEPARADA (só existe depois do
// item existir, diferente de `applyContent` onde título/descrição são
// independentes) — mas segue o mesmo espírito de sucesso parcial: se o
// item foi criado mas a descrição falhou, devolve o item criado mesmo
// assim + erro isolado da descrição, nunca esconde que o anúncio já
// está no ar sem descrição.
async function createItem(integration: any, db: ReturnType<typeof adminClient>, itemPayload: any, description?: string) {
  let created: any
  try {
    created = await mlWrite('/items', integration.access_token, 'POST', itemPayload)
  } catch (err) {
    throw new Error(friendlyMlError(String(err)))
  }

  let descriptionError: string | undefined
  if (description && description.trim()) {
    try {
      await mlWrite(`/items/${created.id}/description?api_version=2`, integration.access_token, 'PUT', { plain_text: description.trim() })
    } catch (err) {
      descriptionError = friendlyMlError(String(err))
    }
  }
  await logItemUpdate(db, created.id, 'create', { title: created.title })
  return { ok: true, item: { id: created.id, permalink: created.permalink, title: created.title }, description_error: descriptionError }
}

// Receita/vendas do período — direto da API de Pedidos do ML
// (`/orders/search`), NÃO do nosso banco. Trocado em 2026-09-01: a
// versão antiga somava `order_items` do nosso banco e batia bem abaixo
// do painel real do ML (confirmado comparando os dois — 338 unidades
// nossas contra 543 reais em 30 dias). Causa raiz: antes de 24/08 (quando
// a integração automática com a API entrou no ar) a captura de pedido
// era só manual e claramente incompleta — não é bug de cálculo, é
// histórico incompleto de antes da integração, mas qualquer janela de
// 30/90 dias cruza esse período. Puxar direto da API resolve de vez,
// sem depender da completude do nosso próprio histórico de sincronização.
//
// `total_amount` de cada `order` já vem pronto (não precisa somar
// `order_items[].unit_price × quantity` na mão) — confirmado ao vivo
// em 2026-09-01. Pedido em "pacote" (N produtos comprados juntos) vem
// como N registros de `order` distintos, cada um com o `total_amount`
// só da sua parte (somar todos dá o total certo do pacote) — mas
// compartilham o mesmo `pack_id`, que é o "número da venda" de verdade
// pro ML (mesma regra já usada em `ml-process-webhook`). Por isso
// receita/unidades somam TODOS os registros, mas "quantidade de vendas"
// conta `pack_id ?? id` DISTINTOS, senão um pacote de 3 produtos vira
// "3 vendas" em vez de 1.
async function fetchAccountRevenueFromMl(integration: any, days: number) {
  const now = new Date()
  const periodStart = new Date(now.getTime() - days * 86400000)
  const prevStart = new Date(now.getTime() - 2 * days * 86400000)

  const orders: any[] = []
  let offset = 0
  for (let i = 0; i < 40; i++) { // teto de segurança — até 2000 pedidos
    const res = await mlFetch(
      `/orders/search?seller=${integration.ml_user_id}`
      + `&order.date_created.from=${encodeURIComponent(prevStart.toISOString())}`
      + `&order.date_created.to=${encodeURIComponent(now.toISOString())}`
      + `&limit=50&offset=${offset}`,
      integration.access_token,
    )
    const results = res.results || []
    orders.push(...results)
    if (results.length < 50) break
    offset += 50
  }

  const isCurrent = (o: any) => new Date(o.date_created).getTime() >= periodStart.getTime()
  const current  = orders.filter(isCurrent)
  const previous = orders.filter((o: any) => !isCurrent(o))
  const notCancelled = (arr: any[]) => arr.filter((o: any) => o.status !== 'cancelled')
  const orderKey = (o: any) => String(o.pack_id ?? o.id)
  const itemUnits = (o: any) => (o.order_items || []).reduce((s: number, it: any) => s + (it.quantity || 0), 0)

  const revenueOf = (arr: any[]) => notCancelled(arr).reduce((s, o) => s + (o.total_amount || 0), 0)
  const unitsOf   = (arr: any[]) => notCancelled(arr).reduce((s, o) => s + itemUnits(o), 0)

  const revenue     = revenueOf(current)
  const revenuePrev = revenueOf(previous)
  const units       = unitsOf(current)
  const orderCount  = new Set(notCancelled(current).map(orderKey)).size
  const cancelledCount = new Set(current.filter((o: any) => o.status === 'cancelled').map(orderKey)).size
  const distinctBuyers = new Set(notCancelled(current).map((o: any) => o.buyer?.id).filter(Boolean)).size
  const avgTicket   = orderCount > 0 ? revenue / orderCount : 0
  const revenueChangePct = revenuePrev > 0 ? (revenue - revenuePrev) / revenuePrev : null

  // toISODateBR (não slice/getDay direto): `order.date_created` vem da
  // API do ML com fuso -04:00 (confirmado ao vivo, NÃO é -03:00 de
  // Brasília nem UTC) — cortar a string direto pegava o dia nesse fuso
  // errado, então venda entre meia-noite e 1h da manhã (Brasília) caía
  // no dia ANTERIOR. Achado 20/09 (Raphael: total de ontem à noite
  // batendo estranho com o de hoje de manhã — confirmado comparando a
  // resposta bruta da API antes/depois da correção, ~R$1000 migrou de
  // um dia pro outro só nessa correção).
  const byDay = new Map<string, { revenue: number; units: number }>()
  notCancelled(current).forEach((o: any) => {
    const day = toISODateBR(new Date(o.date_created))
    const entry = byDay.get(day) ?? { revenue: 0, units: 0 }
    entry.revenue += o.total_amount || 0
    entry.units += itemUnits(o)
    byDay.set(day, entry)
  })
  const daily = [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date))
  const peakDay = daily.reduce((a: any, b: any) => (b.revenue > (a?.revenue || 0) ? b : a), null as any)

  const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const byWeekday = WEEKDAYS.map((label) => ({ label, revenue: 0 }))
  notCancelled(current).forEach((o: any) => {
    // dia da semana em Brasília — new Date().getDay() usaria o fuso do
    // servidor (UTC), errando perto da meia-noite igual o `day` acima.
    const d = new Date(toISODateBR(new Date(o.date_created)) + 'T12:00:00').getDay()
    byWeekday[d].revenue += o.total_amount || 0
  })

  const byProduct = new Map<string, { titulo: string; sku: string | null; qty: number; revenue: number }>()
  notCancelled(current).forEach((o: any) => {
    ;(o.order_items || []).forEach((it: any) => {
      const key = it.item?.seller_sku || it.item?.title
      if (!key) return
      const entry = byProduct.get(key) ?? { titulo: it.item?.title || key, sku: it.item?.seller_sku || null, qty: 0, revenue: 0 }
      entry.qty += it.quantity || 0
      entry.revenue += (it.unit_price || 0) * (it.quantity || 0)
      byProduct.set(key, entry)
    })
  })
  const topProducts = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  const calendar: { date: string; has_sale: boolean }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = toISODateBR(new Date(now.getTime() - i * 86400000))
    calendar.push({ date: d, has_sale: byDay.has(d) })
  }

  return {
    revenue, revenue_prev: revenuePrev, revenue_change_pct: revenueChangePct,
    units, order_count: orderCount, avg_ticket: avgTicket,
    cancelled_count: cancelledCount, distinct_buyers: distinctBuyers,
    daily, peak_day: peakDay, by_weekday: byWeekday, top_products: topProducts, calendar,
    source: 'ml_api',
  }
}

// Ads agregado da CONTA — soma métricas de todas as campanhas do
// período; usado só pra aproximar Orgânico × Ads (não é atribuição por
// pedido). Corrigido hoje: faltava o sufixo `/search` (rota errada, daí
// o 404 "No static resource" de ontem — não era permissão) e o header
// `Api-Version: 2`.
async function fetchAccountAdsSummary(accessToken: string, days: number) {
  try {
    const advertiser = await findMlAdvertiser(accessToken)
    if (!advertiser) return { available: false, reason: 'Sem advertiser de Ads encontrado — verifique a permissão "Publicidade de um produto" no app do ML.' }

    const today = new Date().toISOString().slice(0, 10)
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const res = await mlFetch(
      // Nomes de métrica confirmados na doc oficial hoje — o erro 400
      // "Metrics ... is not valid" de antes era `direct_units_amount`/
      // `indirect_units_amount`, que não existem; o certo é
      // `direct_amount`/`indirect_amount` (sem "units").
      `/marketplace/advertising/MLB/advertisers/${advertiser.advertiser_id}/product_ads/campaigns/search`
      + `?date_from=${since}&date_to=${today}`
      + `&metrics=cost,direct_amount,indirect_amount,direct_units_quantity,indirect_units_quantity,clicks,prints`,
      accessToken,
      { 'Api-Version': '2' },
    )
    const campaigns = res.results || res.campaigns || (Array.isArray(res) ? res : [])
    const sum = (field: string) => campaigns.reduce((s: number, c: any) => s + Number(c?.metrics?.[field] ?? c?.[field] ?? 0), 0)
    return {
      available: true,
      advertiser_id: advertiser.advertiser_id,
      cost: sum('cost'),
      ads_revenue: sum('direct_amount') + sum('indirect_amount'),
      ads_units:   sum('direct_units_quantity') + sum('indirect_units_quantity'),
      raw: res,
    }
  } catch (err) {
    return { available: false, error: String(err) }
  }
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDatePt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

// Narrativa em TEXTO TEMPLATE — nunca IA, nunca número inventado. Só
// frases montadas com dados que a gente de fato calculou.
function buildNarrative(rev: any, rep: any) {
  if (!rev || rev.units === 0) return 'Ainda não há vendas suficientes nesse período pra gerar um resumo.'
  const parts: string[] = []
  const levelLabel = rep?.seller_reputation?.level_id ? String(rep.seller_reputation.level_id).replace(/^\d_/, '').replace('_', ' ') : null

  parts.push(`Você faturou ${fmtBRL(rev.revenue)} com ${rev.units} unidade${rev.units === 1 ? '' : 's'} vendida${rev.units === 1 ? '' : 's'}${levelLabel ? ` (reputação ${levelLabel})` : ''}.`)
  if (rev.peak_day) parts.push(`Seu melhor dia foi ${fmtDatePt(rev.peak_day.date)}, com ${fmtBRL(rev.peak_day.revenue)} faturados.`)
  if (rev.revenue_change_pct != null) {
    const pct = Math.abs(rev.revenue_change_pct * 100).toFixed(0)
    parts.push(`Sua receita ${rev.revenue_change_pct >= 0 ? 'subiu' : 'caiu'} ${pct}% em relação ao período anterior equivalente.`)
  }
  return parts.join(' ')
}

async function accountDashboard(integration: any, days: number) {
  const [revResult, repResult, adsResult] = await Promise.allSettled([
    fetchAccountRevenueFromMl(integration, days),
    reputation(integration),
    fetchAccountAdsSummary(integration.access_token, days),
  ])

  const revenue = revResult.status === 'fulfilled' ? revResult.value : null
  const rep     = repResult.status === 'fulfilled' ? repResult.value : null
  const ads     = adsResult.status === 'fulfilled' ? adsResult.value : { available: false, error: 'Falha ao consultar Ads' }

  const organicRevenue = revenue && (ads as any).available
    ? Math.max(revenue.revenue - ((ads as any).ads_revenue || 0), 0)
    : null

  return {
    period_days: days,
    revenue,
    reputation: rep,
    ads,
    organic_revenue: organicRevenue,
    narrative: revenue ? buildNarrative(revenue, rep) : null,
  }
}

// Reclamações por produto — MELHOR ESFORÇO (endpoint nunca usado antes,
// formato de filtro exato não confirmado ao vivo). `resource_id` da
// claim é o pedido no ML — resolve pro SKU usando o NOSSO banco
// (orders.num_venda → order_items.sku), sem precisar chamar a API de
// novo por claim.
async function claimsByProduct(integration: any, db: ReturnType<typeof adminClient>) {
  let claims: any[] = []
  try {
    const res = await mlFetch(`/post-purchase/v1/claims/search?stage=dispute`, integration.access_token)
    claims = res?.data ?? res?.results ?? (Array.isArray(res) ? res : [])
  } catch (err) {
    return { available: false, error: String(err) }
  }
  if (!claims.length) return { available: true, total_claims: 0, results: [] }

  const resourceIds = [...new Set(claims.map((c: any) => String(c.resource_id ?? c.resource ?? '')).filter(Boolean))]
  const skuByOrderNum = new Map<string, string[]>()
  if (resourceIds.length) {
    const { data: orders } = await db.from('orders').select('id, num_venda').in('num_venda', resourceIds).eq('source', 'ml')
    const orderIdByNum = new Map((orders || []).map((o: any) => [o.num_venda, o.id]))
    const orderDbIds = [...orderIdByNum.values()]
    if (orderDbIds.length) {
      const { data: items } = await db.from('order_items').select('order_id, sku').in('order_id', orderDbIds)
      const skusByOrderId = new Map<string, string[]>()
      ;(items || []).forEach((it: any) => {
        if (!it.sku) return
        const arr = skusByOrderId.get(it.order_id) || []
        arr.push(it.sku)
        skusByOrderId.set(it.order_id, arr)
      })
      orderIdByNum.forEach((dbId: string, num: string) => skuByOrderNum.set(num, skusByOrderId.get(dbId) || []))
    }
  }

  const bySku = new Map<string, { sku: string; total: number; reasons: Map<string, number> }>()
  claims.forEach((c: any) => {
    const num = String(c.resource_id ?? c.resource ?? '')
    const skus = skuByOrderNum.get(num) || []
    const reason = String(c.reason_id ?? c.type ?? 'outro')
    skus.forEach((sku) => {
      const entry = bySku.get(sku) ?? { sku, total: 0, reasons: new Map() }
      entry.total += 1
      entry.reasons.set(reason, (entry.reasons.get(reason) || 0) + 1)
      bySku.set(sku, entry)
    })
  })

  const results = [...bySku.values()]
    .map((e) => ({ sku: e.sku, total: e.total, reasons: Object.fromEntries(e.reasons) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)

  return { available: true, total_claims: claims.length, results, raw_sample: claims.slice(0, 3) }
}

// Promoções — MELHOR ESFORÇO, menor confiança do painel: o formato de
// resposta de 1 candidato foi confirmado na pesquisa
// (`{id, item_id, promotion_id, type, status:{id}}`), mas o formato
// exato de LISTAGEM em massa (query params pra "todos os meus
// candidatos pendentes") não foi. Nunca derruba a tela — sempre
// devolve algo, com `raw_sample` pra ajuste rápido se o formato não bater.
// ── Campanhas & Promoções (Fase 37) ───────────────────────────────────
// Substitui o antigo `promotionsOverview`, que chamava
// `/seller-promotions/candidates` sem ID — confirmado ao vivo em
// 2026-09-01 que isso dá 404 (a doc só documenta busca por
// `candidate_id` específico, vindo de notificação; nunca existiu como
// listagem geral). `/seller-promotions/users/{id}` é o jeito certo,
// documentado, e devolve os convites reais — testado ao vivo, a
// CoisaPet tem a campanha "9.9" (tipo DEAL) rodando agora.
async function promotionInvites(integration: any) {
  const res = await mlFetch(`/seller-promotions/users/${integration.ml_user_id}?app_version=v2`, integration.access_token)
  return { results: res?.results ?? [] }
}

// Candidatos de 1 campanha tradicional (DEAL) — `min/max/suggested_discounted_price`
// já vêm calculados pelo próprio ML (confirmado ao vivo: 223 candidatos
// reais na campanha "9.9"). Pagina por `search_after` (documentado,
// TTL de 5min) até acabar ou até o teto de segurança de páginas.
async function promotionCandidates(integration: any, promotionId: string, promotionType: string) {
  const results: any[] = []
  let searchAfter: string | null = null
  for (let i = 0; i < 20; i++) { // teto de segurança — no máx. 1000 itens
    const url = `/seller-promotions/promotions/${promotionId}/items?promotion_type=${promotionType}&app_version=v2&limit=50`
      + (searchAfter ? `&search_after=${searchAfter}` : '')
    const page = await mlFetch(url, integration.access_token)
    results.push(...(page.results || []))
    searchAfter = page.paging?.searchAfter || null
    if (!searchAfter || !page.results?.length) break
  }
  return { results }
}

// Cupons do vendedor (SELLER_COUPON_CAMPAIGN) — pedido do Raphael
// (09/09): ele cria cupom direto no painel do ML e depois não acha
// mais onde ver status/orçamento/quantos já usaram. Confirmado na doc
// oficial (2026-09-09): a API NÃO tem endpoint de "listar meus
// cupons" — só `/seller-promotions/users/{id}` (o mesmo que já
// usamos em `promotionInvites`, devolve todo tipo de convite/campanha
// misturado) e depois o detalhe por ID um por um. Aqui filtramos por
// tipo e enriquecemos cada um com o detalhe completo — é o detalhe
// (não a listagem resumida) que traz `budget`/`remaining_budget`/
// `used_coupons`/`coupon_code`.
async function couponsList(integration: any) {
  const listRes = await mlFetch(`/seller-promotions/users/${integration.ml_user_id}?app_version=v2`, integration.access_token)
  const coupons = (listRes?.results ?? []).filter((p: any) => p.type === 'SELLER_COUPON_CAMPAIGN')

  const detailed = await Promise.all(coupons.map(async (c: any) => {
    try {
      const detail = await mlFetch(`/seller-promotions/promotions/${c.id}?promotion_type=SELLER_COUPON_CAMPAIGN&app_version=v2`, integration.access_token)
      return { ...c, ...detail }
    } catch (err) {
      return { ...c, detail_error: String(err) }
    }
  }))

  return { results: detailed }
}

// Escrita — SEMPRE atrás de confirmação explícita na tela. Indica 1
// item pra campanha tradicional (v1 só cobre `promotion_type: 'DEAL'`,
// o único com o fluxo de escrita 100% confirmado na doc oficial).
// `stock` (obrigatório só pra LIGHTNING — quantidade que o vendedor
// reserva pra oferta relâmpago; quando esgota, a promoção nesse item
// encerra sozinha, confirmado na doc oficial 13/09) é opcional aqui pra
// não quebrar DEAL/SELLER_CAMPAIGN, que não usam esse campo.
async function promotionJoinItem(integration: any, db: ReturnType<typeof adminClient>, itemId: string, promotionId: string, promotionType: string, dealPrice: number, topDealPrice?: number, stock?: number) {
  try {
    const body: Record<string, unknown> = { deal_price: dealPrice, promotion_id: promotionId, promotion_type: promotionType }
    if (topDealPrice != null) body.top_deal_price = topDealPrice
    if (stock != null) body.stock = stock
    const res = await mlWrite(`/seller-promotions/items/${itemId}?app_version=v2`, integration.access_token, 'POST', body)
    await logItemUpdate(db, itemId, 'promotion_join', { promotion_id: promotionId, promotion_type: promotionType, deal_price: dealPrice, stock })
    return { ok: true, item_id: itemId, ...res }
  } catch (err) {
    throw new Error(friendlyMlError(String(err)))
  }
}

async function promotionLeaveItem(integration: any, db: ReturnType<typeof adminClient>, itemId: string, promotionId: string, promotionType: string) {
  const url = `https://api.mercadolibre.com/seller-promotions/items/${itemId}?promotion_type=${promotionType}&promotion_id=${promotionId}&app_version=v2`
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${integration.access_token}` } })
  if (!res.ok) throw new Error(friendlyMlError(`${res.status} ${await res.text()}`))
  await logItemUpdate(db, itemId, 'promotion_leave', { promotion_id: promotionId, promotion_type: promotionType })
  return { ok: true, item_id: itemId }
}

// ── Desconto em massa (Campanha do vendedor) ─────────────────────────
// Pedido do Raphael (13/09): maioria dos anúncios não tem "de/por" — a
// campanha DEAL acima é por convite do ML (item pré-selecionado por
// eles); esta é o tipo self-service (`SELLER_CAMPAIGN`), o vendedor
// escolhe quais itens e quanto de desconto, sem depender de convite.
// Confirmado na doc oficial (13/09): sub_type só pode ser
// `FLEXIBLE_PERCENTAGE` (FIXED_PERCENTAGE foi descontinuado em 07/2025),
// prazo máximo de 14 dias, e escreve nos MESMOS endpoints
// `/seller-promotions/items/{id}` já usados por promotionJoinItem/
// promotionLeaveItem acima — só muda o `promotion_type` enviado.
// Elegibilidade exigida pelo ML (não validamos aqui, deixamos o erro
// real dele aparecer por item, mesmo espírito de createItem/
// applyContent): reputação verde, item ativo, condição novo, exposição
// paga (não gratuita).
// ML exige start_date/finish_date em formato LOCAL "YYYY-MM-DDTHH:mm:ss"
// (bug real reportado pelo Raphael em 14/09: "Start and finish dates
// must be in local format" — confirmado na doc oficial). O <input
// type="date"> do formulário só devolve "YYYY-MM-DD" (sem hora), então
// completa aqui antes de mandar. Doc confirma que o próprio ML já
// assume início do dia pro start_date e fim do dia pro finish_date
// mesmo com T00:00:00 nos dois — não precisa calcular 23:59:59.
function toMlLocalDateTime(date: string): string {
  return date.includes('T') ? date : `${date}T00:00:00`
}

async function sellerCampaignCreate(integration: any, db: ReturnType<typeof adminClient>, name: string, startDate: string, finishDate: string) {
  try {
    const res = await mlWrite(`/seller-promotions/promotions?app_version=v2`, integration.access_token, 'POST', {
      promotion_type: 'SELLER_CAMPAIGN',
      sub_type: 'FLEXIBLE_PERCENTAGE',
      name, start_date: toMlLocalDateTime(startDate), finish_date: toMlLocalDateTime(finishDate),
    })
    await logItemUpdate(db, String(res.id), 'seller_campaign_create', { name, start_date: startDate, finish_date: finishDate })
    return { ok: true, ...res }
  } catch (err) {
    throw new Error(friendlyMlError(String(err)))
  }
}

async function sellerCampaignDelete(integration: any, db: ReturnType<typeof adminClient>, promotionId: string) {
  const url = `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}?promotion_type=SELLER_CAMPAIGN&app_version=v2`
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${integration.access_token}` } })
  if (!res.ok) throw new Error(friendlyMlError(`${res.status} ${await res.text()}`))
  await logItemUpdate(db, promotionId, 'seller_campaign_delete', {})
  return { ok: true }
}

// "Há quantos dias foi a última alteração" (pedido explícito do
// Raphael, pra nunca esquecer uma campanha rodando sem mexer há tempo)
// — data da gravação real mais recente (indicar ou tirar item da
// campanha), não da criação dela. Fonte: nosso próprio log
// `ml_item_updates` (já gravado por promotionJoinItem/
// promotionLeaveItem de qualquer forma), não precisa perguntar de novo
// pro ML. `promotionId` opcional (16/09: agora dá pra ter várias
// campanhas SELLER_CAMPAIGN ao mesmo tempo — sem filtrar por ID, o
// "última alteração" de uma vazava pra todas as outras).
async function sellerCampaignLastChange(db: ReturnType<typeof adminClient>, promotionId?: string) {
  let query = db.from('ml_item_updates')
    .select('updated_at')
    .in('action', ['promotion_join', 'promotion_leave'])
    .filter('detail->>promotion_type', 'eq', 'SELLER_CAMPAIGN')
  if (promotionId) query = query.filter('detail->>promotion_id', 'eq', promotionId)
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(1)
  if (error) throw error
  return { last_change: data?.[0]?.updated_at ?? null }
}

// Escrita — SEMPRE atrás de confirmação explícita na tela (mesmo padrão
// de `promotionJoinItem`). Endpoint documentado da API pública do ML:
// POST /answers, body { question_id, text }. Existe pra resolver o caso
// de perguntas antigas — o painel do próprio ML só deixa filtrar até 30
// dias (confirmado ao vivo em 2026-09-07), então uma pergunta de meses
// atrás fica "presa" sem UI pra responder; a API não tem essa limitação.
async function answerQuestion(integration: any, db: ReturnType<typeof adminClient>, questionId: number, text: string) {
  try {
    const res = await mlWrite(`/answers`, integration.access_token, 'POST', { question_id: questionId, text })
    if (res?.item_id) await logItemUpdate(db, String(res.item_id), 'question_answer', { question_id: questionId, text })
    return { ok: true, question_id: questionId, ...res }
  } catch (err) {
    throw new Error(friendlyMlError(String(err)))
  }
}

// ── Rascunho de resposta por IA (Perguntas do ML) ────────────────
// Pedido do Raphael (11/09): perguntas repetitivas ("serve pra
// hamster sírio?", "vem montado?", "acompanha rodinha?") consomem
// tempo do atendimento. A IA SUGERE a resposta — quem manda de
// verdade continua sendo `answerQuestion` acima, clicado por um
// humano depois de revisar (decisão explícita do Raphael: nunca
// enviar sozinha, sempre com aprovação).
//
// Fonte da verdade é SEMPRE a ficha do produto (tabela `products`,
// campos de fase54) — nunca o modelo "sabendo" por conta própria.
// Cruza o item do ML com nosso produto pelo SELLER_SKU, mesmo padrão
// já usado em `buildContentSuggestions` (linha ~525).
const QUESTION_ANSWER_SYSTEM_PROMPT = `Você ajuda a responder perguntas de clientes feitas em anúncios do Mercado Livre da CoisaPet — fabricante de produtos personalizados pra pets pequenos (hamster, gerbil, porquinho-da-índia, coelho, chinchila, tartaruga).

REGRAS OBRIGATÓRIAS (segurança antes de tudo — é resposta pública pra cliente real):
- Responda SÓ com base nos dados da ficha do produto fornecidos abaixo. NUNCA invente medida, compatibilidade, material, prazo ou qualquer informação que não esteja nos dados.
- Se o dado que a pergunta pede não estiver preenchido na ficha (campo vazio/null), NÃO chute — diga isso com "confidence":"low" e explique em "missing_data" o que falta, pra um humano completar antes de enviar.
- Pergunta de compatibilidade de espécie: se a espécie perguntada NÃO estiver na lista "compatible_species" da ficha, responda que não é indicado pra essa espécie (a lista é o que testamos/garantimos) — não invente justificativa técnica que não está nos dados.
- Tom cordial e direto, como atendente de verdade — sem saudação institucional longa, sem assinatura, sem emoji em excesso.
- Português do Brasil, resposta curta (o padrão de resposta do Mercado Livre é curto, até uns 500 caracteres).

FORMATO DA RESPOSTA — JSON válido, exatamente:
{"answer": "...", "confidence": "high" | "low", "missing_data": "o que falta preencher na ficha pra ter certeza, ou null se confidence for high"}`

async function draftQuestionAnswer(integration: any, db: ReturnType<typeof adminClient>, questionId: number, questionText: string, itemId: string) {
  const item = await mlFetch(`/items/${itemId}?attributes=id,title,attributes`, integration.access_token)
  const sellerSku = (item.attributes || []).find((a: any) => a.id === 'SELLER_SKU')?.value_name ?? null

  let product: any = null
  if (sellerSku) {
    const { data } = await db.from('products')
      .select('name, description, short_description, width_cm, height_cm, depth_cm, weight_g, compatible_species, comes_assembled, includes_wheel, wheel_diameter_cm, accessories_included')
      .eq('sku', sellerSku).maybeSingle()
    product = data
  }

  const productContext = product
    ? JSON.stringify(product)
    : 'Produto não encontrado no catálogo interno (SKU do anúncio não bateu com nenhum produto cadastrado) — não há ficha confiável, responda só com "confidence":"low" e "missing_data" explicando isso.'

  const prompt = `Pergunta do cliente: "${questionText}"\n\nTítulo do anúncio: ${item.title}\n\nFicha do produto (nosso banco, fonte da verdade):\n${productContext}`
  const result = await callOpenAI(prompt, QUESTION_ANSWER_SYSTEM_PROMPT)

  return {
    question_id: questionId,
    answer: result.answer,
    confidence: result.confidence,
    missing_data: result.missing_data ?? null,
    matched_sku: sellerSku,
    matched_product_name: product?.name ?? null,
  }
}

async function responseTime(integration: any) {
  return await mlFetch(`/users/${integration.ml_user_id}/questions/response_time`, integration.access_token)
}

async function reputation(integration: any) {
  const user = await mlFetch(`/users/${integration.ml_user_id}`, integration.access_token)
  return { nickname: user.nickname, seller_reputation: user.seller_reputation ?? null }
}

// Debug temporário — pesquisando o formato real de criação/ativação de
// Product Ads (impulsionar anúncio direto do sistema, pedido do
// Raphael em 2026-09-01). SÓ LEITURA (GET), nada de escrita ainda.
// `path` é o sufixo depois de /advertisers/{id}/, pra testar variações
// sem precisar redeploy a cada tentativa.
// Debug genérico — GET cru autenticado em qualquer path da API do ML.
// Usado pra confirmar ao vivo o formato do `/seller-promotions/*`
// (Fase 37) antes de finalizar as actions reais. Só leitura.
async function mlRawGetDebug(accessToken: string, path: string) {
  try {
    return { ok: true, res: await mlFetch(path, accessToken, { 'Api-Version': '2' }) }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

async function adsCampaignsDebug(accessToken: string, path: string, method = 'GET') {
  const advertiser = await findMlAdvertiser(accessToken)
  if (!advertiser) return { error: 'Sem advertiser encontrado' }
  const url = `https://api.mercadolibre.com/marketplace/advertising/MLB/advertisers/${advertiser.advertiser_id}/${path}`
  if (method === 'OPTIONS') {
    const res = await fetch(url, { method: 'OPTIONS', headers: { Authorization: `Bearer ${accessToken}`, 'Api-Version': '2' } })
    return { url, status: res.status, allow: res.headers.get('allow'), body: await res.text() }
  }
  try {
    const res = await mlFetch(url, accessToken, { 'Api-Version': '2' })
    return { url, ok: true, res }
  } catch (err) {
    return { url, ok: false, error: String(err) }
  }
}

// Tela "Publicidade" (Fase 45, pedido do Raphael em 2026-09-07) — painel
// completo de Product Ads: TODAS as campanhas + TODOS os anúncios
// patrocinados da conta, com métricas do período, cruzando anúncio →
// nome da campanha. Formato de campanha/anúncio confirmado ao vivo hoje
// via `ads_campaigns_debug` (`roas` já vem pronto da API, não precisa
// calcular). Paginação de anúncios com o mesmo teto de segurança de
// `adsCoverage` (máx. 1000). Nunca derruba a tela — cada bloco
// (campanhas / anúncios / anúncios pausados fora do Ads) é isolado via
// `Promise.allSettled`.
async function adsDashboard(integration: any, days: number) {
  const accessToken = integration.access_token
  const advertiser = await findMlAdvertiser(accessToken)
  if (!advertiser) {
    return {
      available: false,
      reason: 'Nenhum advertiser de Product Ads encontrado — verifique se a permissão "Publicidade de um produto" foi habilitada e o Mercado Livre foi reconectado.',
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const metricsParam = 'metrics=cost,direct_amount,indirect_amount,direct_units_quantity,indirect_units_quantity,organic_units_quantity,clicks,prints,ctr,cpc,acos,roas,cvr'

  const [campaignsResult, adsResult, listingsResult] = await Promise.allSettled([
    mlFetch(
      `/marketplace/advertising/MLB/advertisers/${advertiser.advertiser_id}/product_ads/campaigns/search`
      + `?date_from=${since}&date_to=${today}&${metricsParam}`,
      accessToken,
      { 'Api-Version': '2' },
    ),
    (async () => {
      const results: any[] = []
      let offset = 0
      const limit = 50
      for (let i = 0; i < 20; i++) { // teto de segurança — no máx. 1000 anúncios
        const res = await mlFetch(
          `/marketplace/advertising/MLB/advertisers/${advertiser.advertiser_id}/product_ads/ads/search`
          + `?limit=${limit}&offset=${offset}&date_from=${since}&date_to=${today}&${metricsParam}`,
          accessToken,
          { 'Api-Version': '2' },
        )
        const list = res.results ?? res.ads ?? (Array.isArray(res) ? res : [])
        if (!list.length) break
        results.push(...list)
        if (list.length < limit) break
        offset += limit
      }
      return results
    })(),
    activeListings(integration),
  ])

  const campaignsRaw = campaignsResult.status === 'fulfilled'
    ? (campaignsResult.value.results || campaignsResult.value.campaigns || (Array.isArray(campaignsResult.value) ? campaignsResult.value : []))
    : []
  const adsRaw = adsResult.status === 'fulfilled' ? adsResult.value : []
  const listings = listingsResult.status === 'fulfilled' ? (listingsResult.value.results || []) : []

  const num = (v: any) => Number(v ?? 0) || 0
  const campaignNameById = new Map<string, string>()

  const campaigns = campaignsRaw.map((c: any) => {
    const m = c.metrics || {}
    campaignNameById.set(String(c.id ?? c.campaign_id), c.name || `Campanha ${c.id ?? c.campaign_id}`)
    return {
      id: c.id ?? c.campaign_id,
      name: c.name || null,
      status: String(c.status ?? '').toLowerCase(),
      strategy: c.strategy ?? null,
      acos_target: c.acos_target ?? null,
      roas_target: c.roas_target ?? null,
      budget: c.budget ?? null,
      daily_budget: c.daily_budget ?? null,
      cost: num(m.cost),
      revenue: num(m.direct_amount) + num(m.indirect_amount),
      units: num(m.direct_units_quantity) + num(m.indirect_units_quantity),
      clicks: num(m.clicks),
      prints: num(m.prints),
      ctr: m.ctr != null ? Number(m.ctr) : null,
      cpc: m.cpc != null ? Number(m.cpc) : null,
      acos: m.acos != null ? Number(m.acos) : null,
      roas: m.roas != null ? Number(m.roas) : null,
    }
  })

  const ads = adsRaw.map((a: any) => {
    const m = a.metrics || {}
    const campaignId = String(a.campaign_id ?? '')
    return {
      item_id: a.item_id ?? a.id ?? null,
      title: a.title ?? null,
      thumbnail: a.thumbnail ?? a.picture_id ?? null,
      permalink: a.permalink ?? null,
      price: a.price ?? null,
      status: String(a.status ?? '').toLowerCase(),
      current_level: a.current_level ?? null,
      buy_box_winner: a.buy_box_winner ?? null,
      campaign_id: a.campaign_id ?? null,
      campaign_name: campaignNameById.get(campaignId) ?? null,
      cost: num(m.cost),
      revenue: num(m.direct_amount) + num(m.indirect_amount),
      direct_units: num(m.direct_units_quantity),
      indirect_units: num(m.indirect_units_quantity),
      organic_units: num(m.organic_units_quantity),
      clicks: num(m.clicks),
      prints: num(m.prints),
      ctr: m.ctr != null ? Number(m.ctr) : null,
      cpc: m.cpc != null ? Number(m.cpc) : null,
      acos: m.acos != null ? Number(m.acos) : null,
      roas: m.roas != null ? Number(m.roas) : null,
      cvr: m.cvr != null ? Number(m.cvr) : null,
    }
  })

  const adsItemIds = new Set(ads.map((a) => String(a.item_id)))
  const pausedWithoutAds = listings.filter((l: any) => String(l.status).toLowerCase() === 'paused' && !adsItemIds.has(String(l.item_id)))

  const summary = {
    cost: campaigns.reduce((s, c) => s + c.cost, 0),
    revenue: campaigns.reduce((s, c) => s + c.revenue, 0),
    clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
    prints: campaigns.reduce((s, c) => s + c.prints, 0),
    campaigns_active: campaigns.filter((c) => c.status === 'active').length,
    campaigns_total: campaigns.length,
    ads_active: ads.filter((a) => a.status === 'active').length,
    ads_idle: ads.filter((a) => a.status === 'idle').length,
    ads_paused: ads.filter((a) => a.status === 'paused').length,
    ads_with_spend: ads.filter((a) => a.cost > 0).length,
    ads_total: ads.length,
  }
  const ctrAvg = summary.prints > 0 ? summary.clicks / summary.prints : null
  const roasAvg = summary.cost > 0 ? summary.revenue / summary.cost : null

  return {
    available: true,
    period_days: days,
    advertiser_id: advertiser.advertiser_id,
    summary: { ...summary, ctr_avg: ctrAvg, roas_avg: roasAvg },
    campaigns,
    ads,
    paused_without_ads: pausedWithoutAds,
    errors: {
      campaigns: campaignsResult.status === 'rejected' ? String(campaignsResult.reason) : null,
      ads: adsResult.status === 'rejected' ? String(adsResult.reason) : null,
      listings: listingsResult.status === 'rejected' ? String(listingsResult.reason) : null,
    },
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: any = {}
  try { body = await req.json() } catch { /* body vazio é ok pra algumas actions */ }
  const action = body.action
  const offset = Number(body.offset ?? 0)
  const limit  = Math.min(Number(body.limit ?? 50), 50)

  const db = adminClient()
  try {
    const integration = await getValidIntegration(db)

    switch (action) {
      case 'items_health':      return json(await itemsHealth(integration, offset, limit))
      case 'attributes_audit':  return json(await attributesAudit(integration, offset, limit))
      case 'questions':         return json(await unansweredQuestions(integration))
      case 'answer_question': {
        if (!body.question_id || !body.text) return json({ error: 'question_id e text obrigatórios' }, 400)
        return json(await answerQuestion(integration, db, Number(body.question_id), String(body.text)))
      }
      case 'draft_answer': {
        if (!body.question_id || !body.text || !body.item_id) return json({ error: 'question_id, text e item_id obrigatórios' }, 400)
        return json(await draftQuestionAnswer(integration, db, Number(body.question_id), String(body.text), String(body.item_id)))
      }
      case 'response_time':     return json(await responseTime(integration))
      case 'reputation':        return json(await reputation(integration))
      case 'order_shipment_debug': {
        if (!body.order_id) return json({ error: 'order_id obrigatório' }, 400)
        const order = await mlFetch(`/orders/${body.order_id}`, integration.access_token)
        const shipment = order.shipping?.id
          ? await mlFetch(`/shipments/${order.shipping.id}`, integration.access_token, { 'x-format-new': 'true' })
          : null
        return json({ order_shipping: order.shipping ?? null, shipment })
      }
      case 'item_raw_debug': {
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        const item = await mlFetch(`/items/${body.item_id}?attributes=id,title,category_id,attributes,family_name,catalog_listing,catalog_product_id,user_product_id,sold_quantity`, integration.access_token)
        if (body.with_category_attrs && item.category_id) {
          (item as any).category_attributes = await mlFetch(`/categories/${item.category_id}/attributes`, integration.access_token)
        }
        let siblings = null
        if (item.user_product_id) {
          try {
            siblings = await mlFetch(`/users/${integration.ml_user_id}/items/search?user_product_id=${item.user_product_id}`, integration.access_token)
          } catch (err) { siblings = { error: String(err) } }
        }
        return json({ item, siblings })
      }
      case 'item_detail':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await itemDetail(integration, body.item_id, db))
      case 'item_update_history':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await itemUpdateHistory(db, body.item_id))
      case 'all_item_updates':
        return json(await allItemUpdates(integration, db, offset, limit))
      case 'set_item_sync_check': {
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await setItemSyncCheck(db, body.item_id, !!body.checked, body.checked_by))
      }
      case 'update_item_attributes':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await updateItemAttributes(integration, db, body.item_id, body.attributes))
      case 'account_dashboard':
        return json(await accountDashboard(integration, Number(body.period) || 30))
      case 'traffic_audit':
        return json(await trafficAudit(integration, db, offset, limit, Number(body.days) || 30))
      case 'price_scan':
        return json(await priceScan(integration, offset, limit))
      case 'claims_by_product':
        return json(await claimsByProduct(integration, db))
      case 'ads_coverage':
        return json(await adsCoverage(integration.access_token))
      case 'ads_dashboard':
        return json(await adsDashboard(integration, Number(body.days ?? 30)))
      case 'promotion_invites':
        return json(await promotionInvites(integration))
      case 'coupons_list':
        return json(await couponsList(integration))
      case 'promotion_candidates':
        if (!body.promotion_id || !body.promotion_type) return json({ error: 'promotion_id e promotion_type obrigatórios' }, 400)
        return json(await promotionCandidates(integration, body.promotion_id, body.promotion_type))
      case 'promotion_join_item':
        if (!body.item_id || !body.promotion_id || !body.promotion_type || body.deal_price == null) return json({ error: 'item_id, promotion_id, promotion_type e deal_price obrigatórios' }, 400)
        return json(await promotionJoinItem(
          integration, db, body.item_id, body.promotion_id, body.promotion_type, Number(body.deal_price),
          body.top_deal_price != null ? Number(body.top_deal_price) : undefined,
          body.stock != null ? Number(body.stock) : undefined,
        ))
      case 'promotion_leave_item':
        if (!body.item_id || !body.promotion_id || !body.promotion_type) return json({ error: 'item_id, promotion_id e promotion_type obrigatórios' }, 400)
        return json(await promotionLeaveItem(integration, db, body.item_id, body.promotion_id, body.promotion_type))
      case 'seller_campaign_create':
        if (!body.name || !body.start_date || !body.finish_date) return json({ error: 'name, start_date e finish_date obrigatórios' }, 400)
        return json(await sellerCampaignCreate(integration, db, String(body.name), String(body.start_date), String(body.finish_date)))
      case 'seller_campaign_delete':
        if (!body.promotion_id) return json({ error: 'promotion_id obrigatório' }, 400)
        return json(await sellerCampaignDelete(integration, db, body.promotion_id))
      case 'seller_campaign_last_change':
        return json(await sellerCampaignLastChange(db, body.promotion_id))
      case 'combo_suggestions':
        return json(await comboSuggestions(db, Number(body.days) || 180))
      case 'suggest_content':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await suggestContent(integration, body.item_id))
      case 'apply_content':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await applyContent(integration, db, body.item_id, body.title, body.description))
      case 'load_item_gallery':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await loadItemGallery(integration, body.item_id))
      case 'suggest_item_images':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await suggestItemImages(integration, body.item_id))
      case 'generate_item_image':
        if (!body.picture_url || !body.prompt) return json({ error: 'picture_url e prompt obrigatórios' }, 400)
        return json(await generateItemImage(String(body.picture_url), String(body.prompt)))
      case 'generate_item_image_custom': {
        if (!body.picture_url || !body.instruction) return json({ error: 'picture_url e instruction obrigatórios' }, 400)
        const translated = await buildCustomEditPrompt(String(body.instruction))
        return json(await generateItemImage(String(body.picture_url), translated))
      }
      case 'attach_item_image':
        if (!body.item_id || !body.image_base64) return json({ error: 'item_id e image_base64 obrigatórios' }, 400)
        return json(await attachItemImage(integration, db, body.item_id, String(body.image_base64), body.variation_id != null ? Number(body.variation_id) : undefined))
      case 'delete_item_image':
        if (!body.item_id || !body.picture_id) return json({ error: 'item_id e picture_id obrigatórios' }, 400)
        return json(await deleteItemImage(integration, db, body.item_id, String(body.picture_id)))
      case 'reorder_variation_picture':
        if (!body.item_id || body.variation_id == null || !body.picture_id) return json({ error: 'item_id, variation_id e picture_id obrigatórios' }, 400)
        return json(await reorderVariationPicture(integration, db, body.item_id, Number(body.variation_id), String(body.picture_id)))
      case 'unlink_variation_picture':
        if (!body.item_id || body.variation_id == null || !body.picture_id) return json({ error: 'item_id, variation_id e picture_id obrigatórios' }, 400)
        return json(await unlinkVariationPicture(integration, db, body.item_id, Number(body.variation_id), String(body.picture_id)))
      case 'move_variation_picture':
        if (!body.item_id || !body.picture_id || body.from_variation_id == null || body.to_variation_id == null) return json({ error: 'item_id, picture_id, from_variation_id e to_variation_id obrigatórios' }, 400)
        return json(await moveVariationPicture(integration, db, body.item_id, String(body.picture_id), Number(body.from_variation_id), Number(body.to_variation_id)))
      case 'active_listings':
        return json(await activeListings(integration))
      case 'fulfillment_stock':
        return json(await fulfillmentStock(integration, db))
      case 'update_item_fields':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await updateItemFields(integration, db, body.item_id, body.fields || {}))
      case 'category_predict_debug':
        if (!body.title) return json({ error: 'title obrigatório' }, 400)
        return json(await categoryPredictDebug(integration.access_token, body.title))
      case 'predict_category':
        if (!body.title) return json({ error: 'title obrigatório' }, 400)
        return json(await predictCategory(integration.access_token, body.title))
      case 'category_attributes_for_create':
        if (!body.category_id) return json({ error: 'category_id obrigatório' }, 400)
        return json(await categoryAttributesForCreate(integration.access_token, body.category_id))
      case 'upload_picture':
        if (!body.file_base64) return json({ error: 'file_base64 obrigatório' }, 400)
        return json(await uploadPicture(integration.access_token, body.file_base64, body.file_name, body.mime_type))
      case 'structural_defaults':
        if (!body.category_id) return json({ error: 'category_id obrigatório' }, 400)
        return json(await fetchStructuralDefaults(integration, body.category_id))
      case 'create_item':
        if (!body.item) return json({ error: 'item obrigatório' }, 400)
        return json(await createItem(integration, db, body.item, body.description))
      case 'ads_campaigns_debug':
        if (!body.path) return json({ error: 'path obrigatório' }, 400)
        return json(await adsCampaignsDebug(integration.access_token, body.path, body.method || 'GET'))
      case 'ml_raw_get_debug':
        if (!body.path) return json({ error: 'path obrigatório' }, 400)
        return json(await mlRawGetDebug(integration.access_token, body.path))
      default:                  return json({ error: `Ação desconhecida: ${action}` }, 400)
    }
  } catch (err) {
    console.error('[ml-insights] erro:', err)
    if (String(err).includes('ML_NOT_CONNECTED')) {
      return json({ error: 'Mercado Livre não está conectado.' }, 409)
    }
    return json({ error: String(err) }, 500)
  }
})
