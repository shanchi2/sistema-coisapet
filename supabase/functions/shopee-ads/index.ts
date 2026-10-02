// Shopee Ads (Publicidade da Shopee / "Shopee Ads") — Edge Function
// própria, separada do shopee-insights (que já passa de 1300 linhas).
// Mesmo desenho: 1 função, várias ações via `action` no body.
//
// Endpoints/campos: módulo `ads` da Open Platform v2, schema conforme o
// SDK comunitário `congminh1254/shopee-sdk` (src/schemas/ads.ts — gerado
// a partir da doc oficial). Igual a qualquer campo validado só por doc de
// terceiro: tudo lido com `?? null`/optional chaining e com a ação
// `ads_raw` pra inspecionar a resposta crua quando algo não bater.
//
// ⚠️ CRÉDITOS: a API da Shopee NÃO tem endpoint pra recarregar saldo de
// Ads (recarga é pagamento, só pelo Seller Center). O que dá pra fazer
// pela API: ler o saldo real (get_total_balance) e se a recarga
// automática está ligada (get_shop_toggle_info). O resto do controle de
// créditos (histórico de recargas, previsão, alerta) mora no nosso banco
// (fase92) — ver ShopeeAdsCreditsTab.jsx.
//
// Escrita (pausar/retomar campanha, mudar orçamento, ROAS alvo, keywords):
// SEMPRE atrás de confirmação explícita na tela (ConfirmWriteModal), uma
// por vez, nunca em lote nem automática — mesma regra do shopee-insights.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration, shopeeFetch, shopeeWrite } from '../_shared/shopee.ts'
import { balance, balanceSnapshot } from '../_shared/shopeeAds.ts'

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

// A API de Ads usa data "DD-MM-YYYY" (ex.: "30-11-2025"); o front manda
// ISO "YYYY-MM-DD". Converte nos dois sentidos.
function isoToShopee(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}
function shopeeToIso(s: string | null | undefined) {
  if (!s) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s
}
function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
// Quebra um intervalo em janelas de até `maxDays` dias — a API recusa
// mais de 1 mês por chamada (confirmado ao vivo 02/10), então períodos
// longos (90 dias, ano) viram várias chamadas de 30 dias.
function splitRange(startIso: string, endIso: string, maxDays = 30) {
  const out: { start: string; end: string }[] = []
  let cur = startIso
  while (cur <= endIso) {
    const end = addDaysIso(cur, maxDays - 1)
    out.push({ start: cur, end: end < endIso ? end : endIso })
    cur = addDaysIso(end, 1)
  }
  return out
}

const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v))

// Normaliza 1 linha de métrica — os dois formatos da API (desempenho
// geral da loja x por campanha) usam nomes um pouco diferentes. Confirmado
// AO VIVO em 02/10 contra a loja real:
// - geral (get_all_cpc_ads_*): `broad_gmv`, `broad_order`,
//   `broad_item_sold`; `broad_conversions`/`direct_conversions` são TAXA
//   (0.0146 = 1,46%), não quantidade — nunca usar como nº de pedidos;
// - por campanha (get_product_campaign_*): `broad_gmv`, `broad_order`, e
//   `broad_order_amount` que é QUANTIDADE (igual ao nº de pedidos/itens),
//   não valor em R$; não tem `broad_item_sold`.
// - `ctr` vem em fração (0.0355 = 3,55%); `cpc` por campanha na verdade
//   é custo por conversão. Por isso CTR/CPC/ROAS/ACOS são recalculados no
//   front a partir de cliques/impressões/gasto/vendas, nunca lidos prontos.
// - Data no formato DD-MM-YYYY; histórico existe pelo menos desde abr/2026;
//   intervalo máximo por chamada: 1 mês (`ads.performance.error_date_range_too_long`).
function normMetrics(m: any) {
  const expense    = num(m?.expense)
  const broadGmv   = num(m?.broad_gmv)
  const directGmv  = num(m?.direct_gmv)
  const impression = num(m?.impression)
  const clicks     = num(m?.clicks)
  const broadOrder = num(m?.broad_order)
  const directOrder = num(m?.direct_order)
  return {
    date:         shopeeToIso(m?.date) ?? null,
    hour:         m?.hour ?? null,
    impression, clicks, expense,
    broad_gmv:    broadGmv,
    direct_gmv:   directGmv,
    broad_order:  broadOrder,
    direct_order: directOrder,
    broad_item_sold:  num(m?.broad_item_sold ?? m?.broad_order_amount),
    direct_item_sold: num(m?.direct_item_sold ?? m?.direct_order_amount),
  }
}

function sumMetrics(rows: ReturnType<typeof normMetrics>[]) {
  const t = { impression: 0, clicks: 0, expense: 0, broad_gmv: 0, direct_gmv: 0, broad_order: 0, direct_order: 0, broad_item_sold: 0, direct_item_sold: 0 }
  rows.forEach(r => {
    t.impression += r.impression; t.clicks += r.clicks; t.expense += r.expense
    t.broad_gmv += r.broad_gmv; t.direct_gmv += r.direct_gmv
    t.broad_order += r.broad_order; t.direct_order += r.direct_order
    t.broad_item_sold += r.broad_item_sold; t.direct_item_sold += r.direct_item_sold
  })
  return t
}

// ── Desempenho geral da loja (todas as campanhas CPC) ─────────────────
async function shopDaily(integration: any, startIso: string, endIso: string) {
  const rows: ReturnType<typeof normMetrics>[] = []
  for (const w of splitRange(startIso, endIso)) {
    const res = await shopeeFetch('/api/v2/ads/get_all_cpc_ads_daily_performance', integration, {
      start_date: isoToShopee(w.start), end_date: isoToShopee(w.end),
    })
    const list = Array.isArray(res?.response) ? res.response : (res?.response?.list ?? [])
    list.forEach((m: any) => rows.push(normMetrics(m)))
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return rows
}

async function shopHourly(integration: any, dateIso: string) {
  const res = await shopeeFetch('/api/v2/ads/get_all_cpc_ads_hourly_performance', integration, {
    performance_date: isoToShopee(dateIso),
  })
  const list = Array.isArray(res?.response) ? res.response : (res?.response?.list ?? [])
  return list.map(normMetrics).sort((a: any, b: any) => num(a.hour) - num(b.hour))
}

async function dashboard(integration: any, startIso: string, endIso: string) {
  const days = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 86400000) + 1
  const prevEnd = addDaysIso(startIso, -1)
  const prevStart = addDaysIso(prevEnd, -(days - 1))

  const [bal, cur, prev] = await Promise.allSettled([
    balance(integration),
    shopDaily(integration, startIso, endIso),
    shopDaily(integration, prevStart, prevEnd),
  ])
  const daily = cur.status === 'fulfilled' ? cur.value : []
  const prevDaily = prev.status === 'fulfilled' ? prev.value : []
  return {
    period: { start: startIso, end: endIso, days, prev_start: prevStart, prev_end: prevEnd },
    balance: bal.status === 'fulfilled' ? bal.value : { error: String((bal as any).reason?.message || (bal as any).reason) },
    daily,
    totals: sumMetrics(daily),
    prev_totals: sumMetrics(prevDaily),
    daily_error: cur.status === 'rejected' ? String(cur.reason?.message || cur.reason) : null,
  }
}

// ── Campanhas ─────────────────────────────────────────────────────────
async function campaignIds(integration: any) {
  const list: { campaign_id: number; ad_type: string }[] = []
  let offset = 0
  for (let i = 0; i < 30; i++) { // teto de segurança — 3000 campanhas
    const res = await shopeeFetch('/api/v2/ads/get_product_level_campaign_id_list', integration, {
      offset: String(offset), limit: '100',
    })
    const page = res?.response?.campaign_list ?? []
    page.forEach((c: any) => list.push({ campaign_id: c.campaign_id, ad_type: c.ad_type }))
    if (!res?.response?.has_next_page || !page.length) break
    offset += page.length
  }
  return list
}

async function campaignSettings(integration: any, ids: number[]) {
  const out = new Map<number, any>()
  for (const group of chunk(ids, 100)) {
    const res = await shopeeFetch('/api/v2/ads/get_product_level_campaign_setting_info', integration, {
      info_type_list: '1,2,3,4', campaign_id_list: group.join(','),
    })
    ;(res?.response?.campaign_list ?? []).forEach((c: any) => out.set(Number(c.campaign_id), c))
  }
  return out
}

async function campaignDaily(integration: any, ids: number[], startIso: string, endIso: string) {
  const out = new Map<number, { meta: any; rows: ReturnType<typeof normMetrics>[] }>()
  for (const group of chunk(ids, 100)) {
    for (const w of splitRange(startIso, endIso)) {
      const res = await shopeeFetch('/api/v2/ads/get_product_campaign_daily_performance', integration, {
        start_date: isoToShopee(w.start), end_date: isoToShopee(w.end), campaign_id_list: group.join(','),
      })
      const blocks = Array.isArray(res?.response) ? res.response : [res?.response].filter(Boolean)
      blocks.forEach((b: any) => (b?.campaign_list ?? []).forEach((c: any) => {
        const id = Number(c.campaign_id)
        const cur = out.get(id) || { meta: { ad_type: c.ad_type, ad_name: c.ad_name, campaign_placement: c.campaign_placement }, rows: [] }
        ;(c.metrics_list ?? []).forEach((m: any) => cur.rows.push(normMetrics(m)))
        out.set(id, cur)
      }))
    }
  }
  return out
}

function shapeCampaign(id: number, adTypeFromList: string, setting: any, perf: any) {
  const ci = setting?.common_info ?? {}
  const rows = (perf?.rows ?? []).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
  const dur = ci.campaign_duration ?? {}
  return {
    campaign_id:        id,
    ad_type:            ci.ad_type ?? perf?.meta?.ad_type ?? adTypeFromList ?? null,   // auto | manual
    name:               ci.ad_name ?? perf?.meta?.ad_name ?? null,
    status:             ci.campaign_status ?? null,                                    // ongoing | paused | ended (vistos ao vivo) | scheduled...
    bidding_method:     ci.bidding_method ?? null,                                     // auto | manual
    placement:          ci.campaign_placement ?? perf?.meta?.campaign_placement ?? null, // search | discovery | all
    budget:             ci.campaign_budget ?? null,                                    // orçamento DIÁRIO; 0 = ilimitado
    start_time:         dur.start_time ?? null,
    end_time:           dur.end_time ?? null,                                          // 0 = sem fim
    item_ids:           ci.item_id_list ?? [],
    roas_target:        setting?.auto_bidding_info?.roas_target ?? null,
    enhanced_cpc:       setting?.manual_bidding_info?.enhanced_cpc ?? null,
    keywords:           (setting?.manual_bidding_info?.selected_keywords ?? []).map((k: any) => ({
      keyword: k.keyword, status: k.status ?? null, match_type: k.match_type ?? null, bid: k.bid_price_per_click ?? null,
    })),
    discovery_locations: (setting?.manual_bidding_info?.discovery_ads_locations ?? []).map((l: any) => ({
      location: l.location, status: l.status ?? null, bid: l.bid_price ?? null,
    })),
    auto_products:      (setting?.auto_product_ads_info ?? []).map((p: any) => ({
      item_id: p.item_id ?? null, name: p.product_name ?? null, status: p.status ?? null,
    })),
    daily:  rows,
    totals: sumMetrics(rows),
  }
}

// Pega título/foto dos itens das campanhas (pra tela não mostrar só ID).
async function itemsInfo(integration: any, itemIds: number[]) {
  const out: Record<string, { title: string | null; thumbnail: string | null; price: number | null; status: string | null }> = {}
  for (const group of chunk([...new Set(itemIds)].filter(Boolean), 50)) {
    try {
      const res = await shopeeFetch('/api/v2/product/get_item_base_info', integration, { item_id_list: group.join(',') })
      ;(res?.response?.item_list ?? []).forEach((it: any) => {
        out[String(it.item_id)] = {
          title:     it.item_name ?? null,
          thumbnail: it.image?.image_url_list?.[0] ?? null,
          price:     it.price_info?.[0]?.current_price ?? null,
          status:    it.item_status ?? null,
        }
      })
    } catch { /* lote falho não derruba os outros */ }
  }
  return out
}

async function campaigns(integration: any, startIso: string, endIso: string) {
  const idList = await campaignIds(integration)
  if (!idList.length) return { campaigns: [], items: {} }
  const ids = idList.map(c => Number(c.campaign_id))
  const [settings, perf] = await Promise.all([
    campaignSettings(integration, ids),
    campaignDaily(integration, ids, startIso, endIso),
  ])
  const list = idList.map(c => shapeCampaign(Number(c.campaign_id), c.ad_type, settings.get(Number(c.campaign_id)), perf.get(Number(c.campaign_id))))
  const allItems = list.flatMap(c => [...c.item_ids, ...c.auto_products.map((p: any) => p.item_id)])
  const items = await itemsInfo(integration, allItems)
  return { campaigns: list, items }
}

async function campaignHourly(integration: any, campaignId: number, dateIso: string) {
  const res = await shopeeFetch('/api/v2/ads/get_product_campaign_hourly_performance', integration, {
    performance_date: isoToShopee(dateIso), campaign_id_list: String(campaignId),
  })
  const blocks = Array.isArray(res?.response) ? res.response : [res?.response].filter(Boolean)
  const c = blocks.flatMap((b: any) => b?.campaign_list ?? []).find((x: any) => Number(x.campaign_id) === campaignId)
  return (c?.metrics_list ?? []).map(normMetrics).sort((a: any, b: any) => num(a.hour) - num(b.hour))
}

// ── Recomendações ─────────────────────────────────────────────────────
async function recommendedKeywords(integration: any, itemId: number, input?: string) {
  const params: Record<string, string> = { item_id: String(itemId) }
  if (input) params.input_keyword = input
  const res = await shopeeFetch('/api/v2/ads/get_recommended_keyword_list', integration, params)
  return {
    item_id: itemId,
    keywords: (res?.response?.suggested_keywords ?? []).map((k: any) => ({
      keyword: k.keyword, quality_score: k.quality_score ?? null, search_volume: k.search_volume ?? null, suggested_bid: k.suggested_bid ?? null,
    })),
  }
}

async function recommendedItems(integration: any) {
  const res = await shopeeFetch('/api/v2/ads/get_recommended_item_list', integration, {})
  const list = Array.isArray(res?.response) ? res.response : (res?.response?.item_list ?? [])
  const items = await itemsInfo(integration, list.map((i: any) => i.item_id))
  return {
    results: list.map((i: any) => ({
      item_id: i.item_id,
      tags: i.sku_tag_list ?? [],
      item_status: i.item_status_list ?? [],
      ongoing_ad_types: i.ongoing_ad_type_list ?? [],
      ...(items[String(i.item_id)] || {}),
    })),
  }
}

async function recommendedRoi(integration: any, itemId: number) {
  const res = await shopeeFetch('/api/v2/ads/get_product_recommended_roi_target', integration, {
    reference_id: 'recommendation', item_id: String(itemId),
  })
  return res?.response ?? null
}

// ── Escrita (sempre 1 por vez, confirmada na tela) ───────────────────
const AUTO_ACTIONS   = new Set(['start', 'pause', 'resume', 'stop', 'change_budget', 'change_duration'])
const MANUAL_ACTIONS = new Set(['start', 'pause', 'resume', 'stop', 'change_budget', 'change_duration', 'change_roas_target', 'change_enhanced_cpc'])

async function editCampaign(integration: any, db: ReturnType<typeof adminClient>, body: any) {
  const campaignId = Number(body.campaign_id)
  const adType = String(body.ad_type || '').toLowerCase()
  const action = String(body.edit_action || '')
  const allowed = adType === 'auto' ? AUTO_ACTIONS : MANUAL_ACTIONS
  if (!allowed.has(action)) throw new Error(`Ação "${action}" não suportada pra campanha ${adType || '?'}`)

  const payload: Record<string, unknown> = {
    reference_id: `coisapet-${campaignId}-${Date.now()}`,
    campaign_id: campaignId,
    edit_action: action,
  }
  if (body.budget != null)      payload.budget = Number(body.budget)
  if (body.start_date)          payload.start_date = isoToShopee(String(body.start_date))
  if (body.end_date)            payload.end_date = isoToShopee(String(body.end_date))
  if (body.roas_target != null && adType !== 'auto') payload.roas_target = Number(body.roas_target)
  if (body.enhanced_cpc != null && adType !== 'auto') payload.enhanced_cpc = !!body.enhanced_cpc

  const path = adType === 'auto' ? '/api/v2/ads/edit_auto_product_ads' : '/api/v2/ads/edit_manual_product_ads'
  const res = await shopeeWrite(path, integration, payload)
  await db.from('shopee_ads_actions_log').insert({
    campaign_id: String(campaignId), action, detail: { ...payload, before: body.before ?? null }, user_name: body.user_name ?? null,
  })
  return { ok: true, raw: res }
}

async function editKeywords(integration: any, db: ReturnType<typeof adminClient>, body: any) {
  const campaignId = Number(body.campaign_id)
  const selected = (body.selected_keywords || []).map((k: any) => ({
    edit_action: String(k.edit_action),                       // add | delete | restore | change_bid_price | change_match_type
    keyword: String(k.keyword),
    ...(k.match_type ? { match_type: String(k.match_type) } : {}),
    ...(k.bid_price_per_click != null ? { bid_price_per_click: Number(k.bid_price_per_click) } : {}),
  }))
  if (!selected.length) throw new Error('Nenhuma palavra-chave enviada')
  const res = await shopeeWrite('/api/v2/ads/edit_manual_product_ad_keywords', integration, {
    reference_id: `coisapet-kw-${campaignId}-${Date.now()}`, campaign_id: campaignId, selected_keywords: selected,
  })
  await db.from('shopee_ads_actions_log').insert({
    campaign_id: String(campaignId), action: 'edit_keywords', detail: { selected_keywords: selected }, user_name: body.user_name ?? null,
  })
  const failed = (Array.isArray(res?.response) ? res.response : [res?.response]).flatMap((r: any) => r?.failed_edits ?? [])
  return { ok: true, failed, raw: res }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: any
  try { body = await req.json() } catch { body = {} }

  const db = adminClient()
  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10) // "hoje" em Brasília
  const start = String(body.start_date || addDaysIso(today, -29))
  const end   = String(body.end_date || today)

  try {
    const integration = await getValidIntegration(db)

    switch (body.action) {
      case 'ads_balance':
        return json(await balance(integration))
      case 'ads_dashboard':
        return json(await dashboard(integration, start, end))
      case 'ads_shop_daily': // série longa pros relatórios (máx. ~13 meses)
        if (start < addDaysIso(end, -400)) return json({ error: 'Período máximo: 400 dias' }, 400)
        return json({ results: await shopDaily(integration, start, end) })
      case 'ads_shop_hourly':
        return json({ results: await shopHourly(integration, String(body.date || today)) })
      case 'ads_campaigns':
        return json(await campaigns(integration, start, end))
      case 'ads_campaign_hourly':
        if (!body.campaign_id) return json({ error: 'campaign_id obrigatório' }, 400)
        return json({ results: await campaignHourly(integration, Number(body.campaign_id), String(body.date || today)) })
      case 'ads_recommended_keywords':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json(await recommendedKeywords(integration, Number(body.item_id), body.input_keyword))
      case 'ads_recommended_items':
        return json(await recommendedItems(integration))
      case 'ads_recommended_roi':
        if (!body.item_id) return json({ error: 'item_id obrigatório' }, 400)
        return json({ result: await recommendedRoi(integration, Number(body.item_id)) })
      case 'ads_edit_campaign':
        if (!body.campaign_id || !body.edit_action) return json({ error: 'campaign_id e edit_action obrigatórios' }, 400)
        return json(await editCampaign(integration, db, body))
      case 'ads_edit_keywords':
        if (!body.campaign_id) return json({ error: 'campaign_id obrigatório' }, 400)
        return json(await editKeywords(integration, db, body))
      case 'ads_balance_snapshot':
        return json(await balanceSnapshot(integration, db, 'tela'))
      case 'ads_raw': {
        // DEBUG — só GET e só dentro de /api/v2/ads/ (nada de escrita aqui)
        const path = String(body.path || '')
        if (!path.startsWith('/api/v2/ads/get_')) return json({ error: 'ads_raw só aceita /api/v2/ads/get_*' }, 400)
        return json(await shopeeFetch(path, integration, body.params || {}))
      }
      default:
        return json({ error: `Ação desconhecida: ${body.action}` }, 400)
    }
  } catch (err) {
    const msg = String((err as Error)?.message || err)
    console.error('[shopee-ads] erro:', msg)
    if (msg === 'SHOPEE_NOT_CONNECTED') return json({ error: 'Shopee não conectada' }, 400)
    return json({ error: msg }, 500)
  }
})
