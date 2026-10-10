// Avaliações do Mercado Livre (10/10, fase105). A API só dá avaliação
// anúncio por anúncio (GET /reviews/item/{id}), então:
//   sync  → varre os anúncios do ML (lista da `marketplace_stock`), os que
//           foram sincronizados há mais tempo primeiro, com orçamento de
//           tempo — o que não couber vai na próxima rodada (cron). Guarda
//           a média/contagem por anúncio em `ml_review_items` e as
//           avaliações em `ml_reviews`.
//   probe → devolve a resposta crua de 1 anúncio (diagnóstico).
// O ML não deixa o vendedor responder avaliação — só leitura.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration } from '../_shared/mercadolivre.ts'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const ML = 'https://api.mercadolibre.com'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// O ML devolve 429 se bater rápido demais — espera e tenta de novo (até 3x)
async function mlGet(path: string, token: string) {
  let res: Response
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${ML}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    if (res.status !== 429 || attempt >= 3) break
    await res.body?.cancel()
    await sleep(1500 * (attempt + 1))
  }
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`ML ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function itemReviews(itemId: string, token: string) {
  const reviews: any[] = []
  let head: any = null
  for (let offset = 0; offset < 200; offset += 50) {
    const r = await mlGet(`/reviews/item/${itemId}?limit=50&offset=${offset}`, token)
    if (!r) break
    head ||= r
    const page = r.reviews ?? []
    reviews.push(...page)
    if (page.length < 50 || reviews.length >= (r.paging?.total ?? 0)) break
  }
  return { head, reviews }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let body: any = {}
  try { body = await req.json() } catch { /* */ }
  const db = adminClient()
  try {
    const integ = await getValidIntegration(db)
    const token = integ.access_token

    if (body.action === 'probe') {
      const r = await mlGet(`/reviews/item/${body.item_id}?limit=${body.limit || 3}`, token)
      return json({ ok: true, raw: r })
    }

    if (body.action === 'sync') {
      const started = Date.now()
      const budget = Math.min(Number(body.budget_ms) || 100_000, 130_000)
      const { data: st } = await db.from('marketplace_stock').select('item_id').eq('platform', 'ml')
      const ids = [...new Set((st || []).map((r: any) => String(r.item_id)))]
      const { data: done } = await db.from('ml_review_items').select('item_id, synced_at')
      const last = new Map((done || []).map((r: any) => [r.item_id, r.synced_at]))
      // Nunca sincronizados primeiro, depois os mais antigos
      ids.sort((a, b) => String(last.get(a) || '').localeCompare(String(last.get(b) || '')))
      let items = 0, reviews = 0, errors = 0
      const samples: string[] = []
      const queue = [...ids]
      const worker = async () => {
        while (queue.length && Date.now() - started < budget) {
          const id = queue.shift()!
          try {
            const { head, reviews: list } = await itemReviews(id, token)
            const levels = head?.rating_levels ?? null
            const total = head?.paging?.total ?? list.length
            await db.from('ml_review_items').upsert({ item_id: id, rating_average: head?.rating_average ?? null, total, levels, synced_at: new Date().toISOString() })
            // A mesma avaliação pode vir repetida entre páginas — dedup pelo id
            const uniq = [...new Map(list.map((v: any) => [v.id, v])).values()]
            if (uniq.length) {
              const rows = uniq.map((v: any) => ({
                id: v.id, item_id: id, rate: v.rate ?? null, title: v.title ?? null, content: v.content ?? null,
                created_at_ml: v.date_created ?? null, likes: v.likes ?? 0, dislikes: v.dislikes ?? 0, status: v.status ?? null,
                raw: { relevance: v.relevance ?? null, buying_date: v.buying_date ?? null, media: (v.media ?? []).filter((m: any) => m?.status === 'published').map((m: any) => ({ id: m.id, type: m.type })) },
                synced_at: new Date().toISOString(),
              }))
              const { error } = await db.from('ml_reviews').upsert(rows)
              if (error) throw error
              reviews += rows.length
            }
            items++
          } catch (e) { errors++; if (samples.length < 4) samples.push(`${id}: ${String((e as any)?.message ?? JSON.stringify(e)).slice(0, 200)}`) }
        }
      }
      await Promise.all(Array.from({ length: 2 }, worker))
      return json({ ok: true, items, reviews, errors, samples, remaining: queue.length, total_items: ids.length })
    }

    return json({ error: 'ação desconhecida' }, 400)
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500)
  }
})
