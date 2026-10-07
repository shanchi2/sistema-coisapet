// Valor real que entra na carteira — ML × Shopee (07/10, fase101).
//
// Busca, direto das plataformas, o LÍQUIDO de cada venda (depois das
// tarifas) e quando o dinheiro cai/caiu na carteira, e grava em
// `marketplace_finance`. A tela ML × Shopee compara isso com o bruto.
//   - ML: Mercado Pago /v1/payments/search (mesmo token do ML).
//   - Shopee: payment.get_escrow_detail_batch (líquido de cada pedido)
//     + payment.get_escrow_list (quando foi liberado).
// Ações: `sync` (cron de hora em hora + botão "Atualizar" na tela),
// `probe` (diagnóstico: devolve 1 exemplo cru de cada plataforma).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration as getMl } from '../_shared/mercadolivre.ts'
import { getValidIntegration as getShopee, shopeeFetch, shopeeWrite } from '../_shared/shopee.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const n = (v: any) => (v == null || v === '' ? null : Number(v))
const chunk = <T,>(arr: T[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

async function mpFetch(path: string, token: string) {
  const res = await fetch(`https://api.mercadopago.com${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

// ── ML / Mercado Pago ────────────────────────────────────────────────
function mlRow(p: any) {
  return {
    platform: 'ml',
    ref_id: String(p.id),
    order_ref: p.order?.id ? String(p.order.id) : (p.external_reference || null),
    sale_at: p.date_approved || p.date_created,
    status: p.status,
    gross: n(p.transaction_amount),
    net: n(p.transaction_details?.net_received_amount),
    refunded: n(p.transaction_amount_refunded) || 0,
    fees: p.fee_details || null,
    release_at: p.money_release_date || null,
    released: p.money_release_status === 'released',
    raw: { description: p.description, operation_type: p.operation_type, payment_type: p.payment_type_id, coupon_amount: p.coupon_amount, shipping_amount: p.shipping_amount, total_paid: p.transaction_details?.total_paid_amount, money_release_status: p.money_release_status },
    synced_at: new Date().toISOString(),
  }
}
async function syncMl(db: any, days: number) {
  const integ = await getMl(db)
  const rows: any[] = []
  for (let offset = 0; offset < 10000; offset += 100) {
    const data = await mpFetch(`/v1/payments/search?sort=date_created&criteria=asc&range=date_created&begin_date=NOW-${days}DAYS&end_date=NOW&limit=100&offset=${offset}`, integ.access_token)
    const results = (data.results || []).filter((p: any) => p.operation_type === 'regular_payment' && p.order?.type === 'mercadolibre')
    rows.push(...results.map(mlRow))
    if ((data.results || []).length < 100) break
  }
  for (const part of chunk(rows, 500)) {
    const { error } = await db.from('marketplace_finance').upsert(part, { onConflict: 'platform,ref_id' })
    if (error) throw error
  }
  return { payments: rows.length }
}

// ── Shopee ───────────────────────────────────────────────────────────
function shopeeIncome(detail: any) {
  const inc = detail?.order_income || {}
  const gross = n(inc.order_selling_price) ?? n(inc.order_original_price) ?? n(inc.original_price) ?? n(inc.buyer_total_amount)
  return {
    gross, net: n(inc.escrow_amount),
    fees: {
      commission_fee: n(inc.commission_fee), service_fee: n(inc.service_fee), seller_transaction_fee: n(inc.seller_transaction_fee),
      actual_shipping_fee: n(inc.actual_shipping_fee), shopee_shipping_rebate: n(inc.shopee_shipping_rebate),
      seller_discount: n(inc.seller_discount), voucher_from_seller: n(inc.voucher_from_seller), reverse_shipping_fee: n(inc.reverse_shipping_fee),
    },
  }
}
async function syncShopee(db: any, days: number) {
  const integ = await getShopee(db)
  const now = Math.floor(Date.now() / 1000)
  const from = now - days * 86400

  // 1) O que foi LIBERADO na carteira (janelas de até 14 dias)
  const released: Record<string, { payout: number, at: string }> = {}
  for (let start = from; start < now; start += 14 * 86400) {
    const end = Math.min(now, start + 14 * 86400 - 1)
    for (let page = 1; page <= 100; page++) {
      const r = await shopeeFetch('/api/v2/payment/get_escrow_list', integ, {
        release_time_from: String(start), release_time_to: String(end), page_size: '100', page_no: String(page),
      })
      const list = r.response?.escrow_list || []
      list.forEach((e: any) => { released[e.order_sn] = { payout: Number(e.payout_amount), at: new Date(e.escrow_release_time * 1000).toISOString() } })
      if (!r.response?.more || !list.length) break
    }
  }

  // 2) Líquido de cada pedido vendido no período (+ os liberados acima)
  const sinceIso = new Date(from * 1000).toISOString()
  const { data: ords } = await db.from('orders').select('num_venda, data_venda, marketplace_status, status_ml')
    .eq('source', 'shopee').gte('data_venda', sinceIso).limit(20000)
  const saleAt: Record<string, string> = {}
  ;(ords || []).forEach((o: any) => { if (o.num_venda) saleAt[o.num_venda] = o.data_venda })
  // Não rebusca quem já está liberado e com líquido gravado
  const { data: done } = await db.from('marketplace_finance').select('ref_id').eq('platform', 'shopee').eq('released', true).not('net', 'is', null)
  const skip = new Set((done || []).map((d: any) => d.ref_id))
  const sns = [...new Set([...Object.keys(saleAt), ...Object.keys(released)])].filter(sn => !skip.has(sn) || released[sn])

  const rows: any[] = []
  for (const part of chunk(sns, 50)) {
    let resp: any
    try { resp = await shopeeWrite('/api/v2/payment/get_escrow_detail_batch', integ, { order_sn_list: part }) }
    catch (e) { console.error('[marketplace-finance] escrow batch', String(e)); continue }
    const list = Array.isArray(resp.response) ? resp.response : (resp.response?.order_list || resp.response?.escrow_detail_list || [])
    for (const item of list) {
      const det = item.escrow_detail || item
      const sn = det.order_sn
      if (!sn) continue
      const inc = shopeeIncome(det)
      const rel = released[sn]
      rows.push({
        platform: 'shopee', ref_id: sn, order_ref: sn,
        sale_at: saleAt[sn] || null,
        status: rel ? 'released' : 'pending',
        gross: inc.gross, net: rel ? rel.payout : inc.net, refunded: 0, fees: inc.fees,
        release_at: rel?.at || null, released: !!rel,
        raw: { order_income: det.order_income ? { escrow_amount: det.order_income.escrow_amount, buyer_total_amount: det.order_income.buyer_total_amount } : null },
        synced_at: new Date().toISOString(),
      })
    }
  }
  for (const part of chunk(rows, 500)) {
    const { error } = await db.from('marketplace_finance').upsert(part, { onConflict: 'platform,ref_id' })
    if (error) throw error
  }
  return { orders: rows.length, released: Object.keys(released).length }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let body: any = {}
  try { body = await req.json() } catch { /* cron manda vazio */ }
  const action = body.action || 'sync'
  const days = Math.min(Math.max(Number(body.days) || 45, 1), 120)
  const db = adminClient()

  if (action === 'probe') {
    const out: any = {}
    try {
      const ml = await getMl(db)
      const d = await mpFetch('/v1/payments/search?sort=date_created&criteria=desc&limit=1&range=date_created&begin_date=NOW-2DAYS&end_date=NOW', ml.access_token)
      out.ml = { paging: d.paging, sample: d.results?.[0] ? mlRow(d.results[0]) : null }
    } catch (e) { out.ml_error = String(e) }
    try {
      const sh = await getShopee(db)
      const now = Math.floor(Date.now() / 1000)
      const list = await shopeeFetch('/api/v2/payment/get_escrow_list', sh, { release_time_from: String(now - 7 * 86400), release_time_to: String(now), page_size: '3', page_no: '1' })
      out.shopee_list = list.response
      const sn = body.order_sn || list.response?.escrow_list?.[0]?.order_sn
      if (sn) out.shopee_detail = (await shopeeWrite('/api/v2/payment/get_escrow_detail_batch', sh, { order_sn_list: [sn] })).response
    } catch (e) { out.shopee_error = String(e) }
    return json(out)
  }

  if (action === 'sync') {
    const result: any = {}
    for (const [platform, fn] of [['ml', syncMl], ['shopee', syncShopee]] as const) {
      if (body.platform && body.platform !== platform) continue
      try {
        result[platform] = await fn(db, days)
        await db.from('marketplace_finance_sync').upsert({ platform, synced_at: new Date().toISOString(), result: JSON.stringify(result[platform]), error: null })
      } catch (e) {
        result[platform] = { error: String(e) }
        await db.from('marketplace_finance_sync').upsert({ platform, synced_at: new Date().toISOString(), error: String(e).slice(0, 500) })
      }
    }
    return json({ ok: true, ...result })
  }
  return json({ error: 'ação desconhecida' }, 400)
})
