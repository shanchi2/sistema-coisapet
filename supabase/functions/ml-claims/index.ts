// Reclamações do Mercado Livre (09/10, fase104).
//
// action 'sync' (cron a cada 30 min + botão): busca as reclamações abertas
// e as fechadas dos últimos 90 dias, guarda só as CONTRA a CoisaPet
// (respondent = nossa conta) em `ml_claims`, com detalhe, motivo,
// mensagens, devolução e o produto do pedido.
// action 'send_message': manda mensagem ao comprador numa reclamação
// (o usuário escreve e confirma na tela — nunca automático).
// action 'note': anotação interna da equipe.
// Sem valores em R$.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration as getMl } from '../_shared/mercadolivre.ts'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const ML = 'https://api.mercadolibre.com'
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

async function mlGet(path: string, token: string) {
  const res = await fetch(`${ML}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`ML ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}
const tryGet = async (path: string, token: string) => { try { return await mlGet(path, token) } catch { return null } }

async function searchClaims(token: string, status: string, maxPages: number, sinceIso?: string) {
  const out: any[] = []
  for (let page = 0; page < maxPages; page++) {
    const r = await mlGet(`/post-purchase/v1/claims/search?status=${status}&limit=50&offset=${page * 50}&sort=last_updated:desc`, token)
    const data = r?.data ?? []
    out.push(...data)
    if (data.length < 50) break
    if (sinceIso && data[data.length - 1]?.last_updated < sinceIso) break
  }
  return out
}

const reasonCache: Record<string, any> = {}
async function reasonOf(id: string, token: string) {
  if (!id) return null
  if (!(id in reasonCache)) reasonCache[id] = await tryGet(`/post-purchase/v1/claims/reasons/${id}`, token)
  return reasonCache[id]
}

async function orderInfo(db: any, orderId: string, token: string) {
  const o = await tryGet(`/orders/${orderId}`, token)
  if (o?.order_items?.length) {
    const ids = [...new Set(o.order_items.map((i: any) => i.item?.id).filter(Boolean))]
    const thumbs: Record<string, string> = {}
    if (ids.length) {
      const multi = await tryGet(`/items?ids=${ids.join(',')}&attributes=id,thumbnail,permalink`, token)
      for (const e of multi || []) if (e?.body?.id) thumbs[e.body.id] = e.body.thumbnail
    }
    return {
      buyer: o.buyer?.nickname || null,
      date: o.date_created || null,
      items: o.order_items.map((i: any) => ({
        item_id: i.item?.id, title: i.item?.title, qty: i.quantity, sku: i.item?.seller_sku || null,
        variation: (i.item?.variation_attributes || []).map((a: any) => a.value_name).filter(Boolean).join(' / ') || null,
        thumbnail: thumbs[i.item?.id] || null,
      })),
      fulfilled_by_ml: o.shipping?.logistic_type === 'fulfillment' || (o.tags || []).includes('fulfillment') || null,
    }
  }
  // Sem acesso ao pedido na API: tenta o nosso banco
  const { data } = await db.from('orders').select('data_venda, items:order_items(titulo, variacao, qty, sku)').eq('source', 'ml').eq('num_venda', orderId).maybeSingle()
  if (data) return { buyer: null, date: data.data_venda, items: (data.items || []).map((i: any) => ({ title: i.titulo, variation: i.variacao, qty: i.qty, sku: i.sku })) }
  return null
}

function ourPlayer(c: any, uid: string) {
  return (c.players || []).find((p: any) => String(p.user_id) === uid && p.role === 'respondent')
}

async function enrich(db: any, c: any, token: string, uid: string, full: boolean) {
  const me = ourPlayer(c, uid)
  const reason = await reasonOf(c.reason_id, token)
  const row: any = {
    id: c.id, order_id: String(c.resource_id ?? ''), type: c.type, stage: c.stage, status: c.status,
    reason_id: c.reason_id, reason_name: reason?.name ?? null, reason_text: reason?.detail ?? null,
    our_actions: me?.available_actions ?? [], resolution: c.resolution ?? null,
    date_created: c.date_created, last_updated: c.last_updated, synced_at: new Date().toISOString(),
  }
  if (full) {
    const [detail, messages, ret] = await Promise.all([
      tryGet(`/post-purchase/v1/claims/${c.id}/detail`, token),
      tryGet(`/post-purchase/v1/claims/${c.id}/messages`, token),
      (c.related_entities || []).includes('return') || c.type === 'returns' ? tryGet(`/post-purchase/v2/claims/${c.id}/returns`, token) : Promise.resolve(null),
    ])
    Object.assign(row, {
      problem: detail?.problem ?? null, detail_title: detail?.title ?? null, detail_description: detail?.description ?? null,
      due_date: detail?.due_date ?? null, action_responsible: detail?.action_responsible ?? null,
      messages: Array.isArray(messages) ? messages.map((m: any) => ({
        from: m.sender_role, to: m.receiver_role, text: m.message, at: m.date_created || m.message_date, read: m.date_read,
        attachments: (m.attachments || []).length,
      })) : null,
      return_info: ret ? {
        status: ret.status, subtype: ret.subtype, refund_at: ret.refund_at, date_closed: ret.date_closed,
        shipments: (ret.shipments || []).map((s: any) => ({ status: s.status, tracking: s.tracking_number, to: s.destination?.name })),
      } : null,
    })
  }
  if (c.resource === 'order' && c.resource_id) row.order_info = await orderInfo(db, String(c.resource_id), token)
  return row
}

async function sync(db: any) {
  const integ = await getMl(db)
  const token = integ.access_token, uid = String(integ.ml_user_id)
  const since = new Date(Date.now() - 90 * 86400e3).toISOString()
  const [opened, closed] = await Promise.all([searchClaims(token, 'opened', 10), searchClaims(token, 'closed', 8, since)])
  const ours = (l: any[]) => l.filter(c => ourPlayer(c, uid))
  const open = ours(opened)
  const recent = ours(closed).filter(c => c.last_updated >= since)

  const { data: stored } = await db.from('ml_claims').select('id, last_updated, status, order_info')
  const byId = new Map((stored || []).map((s: any) => [Number(s.id), s]))
  const rows: any[] = []
  // Abertas: sempre completo (prazo/mensagens mudam sem mexer no last_updated)
  for (const g of chunk(open, 6)) rows.push(...await Promise.all(g.map(c => enrich(db, c, token, uid, true))))
  // Fechadas: só as novas ou que mudaram
  const changed = recent.filter(c => { const s: any = byId.get(Number(c.id)); return !s || s.status !== 'closed' || new Date(s.last_updated).getTime() !== new Date(c.last_updated).getTime() })
  for (const g of chunk(changed, 6)) rows.push(...await Promise.all(g.map(c => enrich(db, c, token, uid, !byId.get(Number(c.id))))))
  // Estavam abertas aqui e sumiram da lista de abertas: busca de novo
  const openIds = new Set(open.map(c => Number(c.id)))
  const vanished = (stored || []).filter((s: any) => s.status === 'opened' && !openIds.has(Number(s.id)) && !rows.some(r => r.id === Number(s.id)))
  for (const s of vanished) {
    const c = await tryGet(`/post-purchase/v1/claims/${s.id}`, token)
    if (c) rows.push(await enrich(db, c, token, uid, false))
  }
  for (const part of chunk(rows, 100)) {
    const { error } = await db.from('ml_claims').upsert(part)
    if (error) throw error
  }
  const result = `${open.length} abertas · ${recent.length} fechadas em 90 dias · ${rows.length} atualizadas`
  await db.from('ml_claims_sync').upsert({ id: 'default', synced_at: new Date().toISOString(), result, error: null })
  await db.from('attention_feed_cache').delete().eq('id', 'default') // barra do rodapé recalcula
  return { open: open.length, closed_90d: recent.length, updated: rows.length }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let body: any = {}
  try { body = await req.json() } catch { /* cron */ }
  const db = adminClient()
  try {
    if (!body.action || body.action === 'sync') return json({ ok: true, ...await sync(db) })

    if (body.action === 'send_message') {
      const text = String(body.message || '').trim()
      if (!text || text.length > 2000) return json({ error: 'Mensagem vazia ou longa demais (máx. 2000)' }, 400)
      const { data: claim } = await db.from('ml_claims').select('id, status, our_actions').eq('id', body.claim_id).maybeSingle()
      if (!claim || claim.status !== 'opened') return json({ error: 'Reclamação não está aberta' }, 400)
      if (!(claim.our_actions || []).some((a: any) => a.action === 'send_message_to_complainant')) return json({ error: 'O ML não permite mensagem ao comprador nesta etapa' }, 400)
      const integ = await getMl(db)
      const res = await fetch(`${ML}/post-purchase/v1/claims/${claim.id}/actions/send-message`, {
        method: 'POST', headers: { Authorization: `Bearer ${integ.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ receiver_role: 'complainant', message: text }),
      })
      if (!res.ok) return json({ error: `ML ${res.status}: ${(await res.text()).slice(0, 300)}` }, 502)
      try { await db.from('ml_item_updates').insert({ item_id: String(claim.id), action: 'claim_message', detail: { by: body.by ?? null, length: text.length } }) } catch { /* só log */ }
      const c = await mlGet(`/post-purchase/v1/claims/${claim.id}`, integ.access_token)
      await db.from('ml_claims').upsert(await enrich(db, c, integ.access_token, String(integ.ml_user_id), true))
      return json({ ok: true })
    }

    if (body.action === 'note') {
      const note = String(body.note ?? '').slice(0, 2000)
      const { error } = await db.from('ml_claims').update({ internal_note: note || null, internal_note_by: body.by ?? null, internal_note_at: new Date().toISOString() }).eq('id', body.claim_id)
      if (error) throw error
      return json({ ok: true })
    }

    return json({ error: 'ação desconhecida' }, 400)
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    try { if (!body.action || body.action === 'sync') await db.from('ml_claims_sync').upsert({ id: 'default', synced_at: new Date().toISOString(), error: msg.slice(0, 500) }) } catch { /* */ }
    return json({ ok: false, error: msg }, 500)
  }
})
