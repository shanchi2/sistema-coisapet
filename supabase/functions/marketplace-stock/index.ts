// Estoque dos anúncios — ML × Shopee num lugar só (09/10, fase102).
//
// Lê o estoque de CADA VARIAÇÃO de todos os anúncios ativos e pausados
// das duas plataformas e grava uma foto em `marketplace_stock` (a tela
// "Estoque nos Marketplaces" lê dela). Atualizado por cron de hora em
// hora + botão "Atualizar agora".
//   - ML: /users/{id}/items/search (active + paused) → /items?ids= com
//     variations; Full = shipping.logistic_type 'fulfillment'.
//   - Shopee: product.get_item_list (NORMAL + UNLIST) → get_item_base_info;
//     quem tem variação → product.get_model_list (estoque por modelo).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration as getMl } from '../_shared/mercadolivre.ts'
import { getValidIntegration as getShopee, shopeeFetch } from '../_shared/shopee.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
const ML = 'https://api.mercadolibre.com'

async function mlGet(path: string, token: string) {
  const res = await fetch(`${ML}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`ML ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

// ── Mercado Livre ────────────────────────────────────────────────────
async function mlIds(integ: any, status: string) {
  const ids: string[] = []
  for (let offset = 0; offset < 2000; offset += 100) {
    const p = await mlGet(`/users/${integ.ml_user_id}/items/search?status=${status}&limit=100&offset=${offset}`, integ.access_token)
    ids.push(...(p.results || []))
    if (offset + 100 >= (p.paging?.total ?? 0) || !p.results?.length) break
  }
  return ids
}
const skuOf = (obj: any) => obj?.seller_custom_field
  || (obj?.attributes || []).find((a: any) => a.id === 'SELLER_SKU')?.value_name || null

async function mlRows(integ: any) {
  const ids = [...await mlIds(integ, 'active'), ...await mlIds(integ, 'paused')]
  const rows: any[] = []
  for (const group of chunk(ids, 20)) {
    const multi = await mlGet(`/items?ids=${group.join(',')}&attributes=id,title,thumbnail,available_quantity,sold_quantity,status,sub_status,permalink,shipping,variations,seller_custom_field,attributes`, integ.access_token)
    for (const e of multi || []) {
      const it = e?.body
      if (!it?.id) continue
      const base = {
        platform: 'ml', item_id: it.id, title: it.title, thumbnail: it.thumbnail, permalink: it.permalink,
        status: it.status, sub_status: (it.sub_status || []).join(',') || null,
        is_full: it.shipping?.logistic_type === 'fulfillment',
      }
      const vars = it.variations || []
      if (!vars.length) {
        rows.push({ ...base, variation_id: '', variation: null, sku: skuOf(it), stock: it.available_quantity ?? null })
      } else {
        for (const v of vars) {
          rows.push({
            ...base, variation_id: String(v.id),
            variation: (v.attribute_combinations || []).map((a: any) => a.value_name).filter(Boolean).join(' / ') || null,
            sku: skuOf(v) || skuOf(it), stock: v.available_quantity ?? null,
          })
        }
      }
    }
  }
  return rows
}

// ── Shopee ───────────────────────────────────────────────────────────
async function shopeeIds(integ: any, st: string) {
  const ids: number[] = []
  let offset = 0
  for (let i = 0; i < 30; i++) {
    const p = await shopeeFetch('/api/v2/product/get_item_list', integ, { offset: String(offset), page_size: '100', item_status: st })
    const items = p?.response?.item ?? []
    items.forEach((x: any) => ids.push(x.item_id))
    if (!p?.response?.has_next_page || !items.length) break
    offset = p?.response?.next_offset ?? offset + items.length
  }
  return ids
}
const shopeeStock = (o: any) => o?.stock_info_v2?.summary_info?.total_available_stock
  ?? o?.stock_info_v2?.seller_stock?.reduce?.((t: number, s: any) => t + (s.stock || 0), 0) ?? null

async function shopeeRows(integ: any) {
  const ids = [...await shopeeIds(integ, 'NORMAL'), ...await shopeeIds(integ, 'UNLIST')]
  const rows: any[] = []
  for (const group of chunk(ids, 50)) {
    const d = await shopeeFetch('/api/v2/product/get_item_base_info', integ, { item_id_list: group.join(',') })
    for (const it of d?.response?.item_list ?? []) {
      const base = {
        platform: 'shopee', item_id: String(it.item_id), title: it.item_name,
        thumbnail: it.image?.image_url_list?.[0] || null,
        permalink: `https://shopee.com.br/product/${integ.shop_id}/${it.item_id}`,
        status: it.item_status === 'NORMAL' ? 'active' : it.item_status === 'UNLIST' ? 'paused' : String(it.item_status || '').toLowerCase(),
        sub_status: null, is_full: false,
      }
      if (!it.has_model) {
        rows.push({ ...base, variation_id: '', variation: null, sku: it.item_sku || null, stock: shopeeStock(it) })
        continue
      }
      try {
        const m = await shopeeFetch('/api/v2/product/get_model_list', integ, { item_id: String(it.item_id) })
        const tiers = m?.response?.tier_variation || []
        for (const md of m?.response?.model || []) {
          const name = (md.tier_index || []).map((ti: number, k: number) => tiers[k]?.option_list?.[ti]?.option).filter(Boolean).join(' / ') || md.model_name || null
          rows.push({ ...base, variation_id: String(md.model_id), variation: name, sku: md.model_sku || it.item_sku || null, stock: shopeeStock(md) })
        }
      } catch (e) {
        rows.push({ ...base, variation_id: '', variation: '(variações não lidas)', sku: it.item_sku || null, stock: shopeeStock(it) })
      }
    }
  }
  return rows
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let body: any = {}
  try { body = await req.json() } catch { /* cron */ }
  const db = adminClient()
  const out: any = {}
  for (const [platform, fn, get] of [['ml', mlRows, getMl], ['shopee', shopeeRows, getShopee]] as const) {
    if (body.platform && body.platform !== platform) continue
    try {
      const rows = await fn(await get(db))
      const now = new Date().toISOString()
      if (body.action === 'probe') { out[platform] = { count: rows.length, sample: rows.slice(0, 4) }; continue }
      // Foto completa da plataforma: apaga a anterior e grava a nova
      await db.from('marketplace_stock').delete().eq('platform', platform)
      for (const part of chunk(rows.map(r => ({ ...r, synced_at: now })), 500)) {
        const { error } = await db.from('marketplace_stock').insert(part)
        if (error) throw error
      }
      out[platform] = { rows: rows.length }
      await db.from('marketplace_stock_sync').upsert({ platform, synced_at: now, result: `${rows.length} variações`, error: null })
    } catch (e) {
      out[platform] = { error: String(e) }
      await db.from('marketplace_stock_sync').upsert({ platform, synced_at: new Date().toISOString(), error: String(e).slice(0, 500) })
    }
  }
  return json({ ok: true, ...out })
})
