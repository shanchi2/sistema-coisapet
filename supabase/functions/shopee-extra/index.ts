// Shopee — recursos que faltavam pra igualar com o ML (Fase 3 da
// unificação, 10/10). Testados ao vivo antes:
//   item_extra_info → product.get_item_extra_info (vendas, visitas,
//                     curtidas, nota e nº de avaliações por anúncio)
//   comments        → product.get_comment (avaliações da loja toda, cursor)
//   reply_comment   → product.reply_comment (responder avaliação — sempre
//                     depois de confirmação na tela, nunca automático)
//   chat_unread     → sellerchat.get_conversation_list (conversas não lidas)
//   history         → histórico unificado ML + Shopee (tabelas de log)
// (shop.get_shop_performance devolve 404 pro nosso app.)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration, shopeeFetch, shopeeWrite } from '../_shared/shopee.ts'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let body: any = {}
  try { body = await req.json() } catch { /* */ }
  const db = adminClient()
  try {
    if (body.action === 'history') {
      // Histórico unificado (ml_item_updates + shopee_item_updates só são
      // lidas com service role). Até 5000 linhas por plataforma no período.
      const since = new Date(Date.now() - Math.min(Number(body.days) || 30, 180) * 86400e3).toISOString()
      const read = async (table: string) => {
        const all: any[] = []
        for (let p = 0; p < 5; p++) {
          const { data, error } = await db.from(table).select('id, item_id, action, detail, updated_at').gte('updated_at', since).order('updated_at', { ascending: false }).range(p * 1000, p * 1000 + 999)
          if (error) throw error
          all.push(...(data || []))
          if (!data || data.length < 1000) break
        }
        return all
      }
      const [ml, shopee, checks] = await Promise.all([read('ml_item_updates'), read('shopee_item_updates'), db.from('ml_item_sync_checks').select('item_id, checked_at, checked_by')])
      return json({ ok: true, ml, shopee, checks: checks.data || [] })
    }

    const integ = await getValidIntegration(db)

    if (body.action === 'item_extra_info') {
      const ids = [...new Set((body.item_ids || []).map((x: any) => String(x)).filter(Boolean))].slice(0, 500)
      const out: any[] = []
      for (const g of chunk(ids, 50)) {
        const r = await shopeeFetch('/api/v2/product/get_item_extra_info', integ, { item_id_list: g.join(',') })
        out.push(...(r?.response?.item_list ?? []).map((i: any) => ({ item_id: String(i.item_id), sale: i.sale ?? 0, views: i.views ?? 0, likes: i.likes ?? 0, rating_star: i.rating_star ?? null, comment_count: i.comment_count ?? 0 })))
      }
      return json({ ok: true, results: out })
    }

    if (body.action === 'comments') {
      // Avaliações mais recentes da loja (ou de 1 anúncio), até `max` ou até `since`
      const max = Math.min(Number(body.max) || 200, 1000)
      const sinceSec = body.since ? Math.floor(Date.parse(body.since) / 1000) : 0
      const list: any[] = []
      let cursor = ''
      for (let i = 0; i < 20 && list.length < max; i++) {
        const params: Record<string, string> = { page_size: '100', cursor }
        if (body.item_id) params.item_id = String(body.item_id)
        const r = await shopeeFetch('/api/v2/product/get_comment', integ, params)
        const page = r?.response?.item_comment_list ?? []
        list.push(...page)
        cursor = r?.response?.next_cursor ?? ''
        if (!r?.response?.more || !page.length || !cursor) break
        if (sinceSec && page[page.length - 1]?.create_time < sinceSec) break
      }
      const results = list.filter(c => !sinceSec || c.create_time >= sinceSec).slice(0, max).map((c: any) => ({
        comment_id: String(c.comment_id), item_id: String(c.item_id), model_id: c.model_id_list?.[0] ? String(c.model_id_list[0]) : null,
        order_sn: c.order_sn, buyer: c.buyer_username, rating: c.rating_star, text: c.comment || '', at: c.create_time ? new Date(c.create_time * 1000).toISOString() : null,
        hidden: !!c.hidden, editable: c.editable,
        reply: c.comment_reply?.reply ? { text: c.comment_reply.reply, at: c.comment_reply.create_time ? new Date(c.comment_reply.create_time * 1000).toISOString() : null, hidden: !!c.comment_reply.hidden } : null,
        media: { images: c.media?.image_url_list ?? [], videos: (c.media?.video_url_list ?? []).length },
      }))
      return json({ ok: true, results })
    }

    if (body.action === 'reply_comment') {
      const text = String(body.text || '').trim()
      if (!text || text.length > 500) return json({ error: 'Resposta vazia ou longa demais (máx. 500)' }, 400)
      const r = await shopeeWrite('/api/v2/product/reply_comment', integ, { comment_list: [{ comment_id: Number(body.comment_id), comment: text }] })
      const fail = (r?.response?.result_list ?? []).find((x: any) => x.fail_error)
      if (fail) return json({ error: `Shopee: ${fail.fail_message || fail.fail_error}` }, 502)
      try { await db.from('shopee_item_updates').insert({ item_id: String(body.item_id || ''), action: 'comment_reply', detail: { comment_id: String(body.comment_id), by: body.by ?? null, text } }) } catch { /* só log */ }
      return json({ ok: true })
    }

    if (body.action === 'chat_unread') {
      let unread = 0, convs = 0, next: any = null
      for (let i = 0; i < 5; i++) {
        const params: Record<string, string> = { direction: 'older', type: 'unread', page_size: '50' }
        if (next?.next_message_time_nano) params.next_message_time_nano = String(next.next_message_time_nano)
        const r = await shopeeFetch('/api/v2/sellerchat/get_conversation_list', integ, params)
        const list = r?.response?.conversations ?? []
        convs += list.length
        unread += list.reduce((t: number, c: any) => t + (c.unread_count || 0), 0)
        next = r?.response?.page_result?.next_cursor
        if (!r?.response?.page_result?.more || !list.length) break
      }
      return json({ ok: true, conversations: convs, messages: unread })
    }

    if (body.action === 'probe') {
      const out: any = {}
      for (const c of body.calls || []) {
        try { out[c.path] = JSON.stringify(await shopeeFetch(c.path, integ, c.params || {})).slice(0, body.max || 3000) } catch (e) { out[c.path] = 'ERR ' + String(e).slice(0, 500) }
      }
      return json(out)
    }

    return json({ error: 'ação desconhecida' }, 400)
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500)
  }
})
