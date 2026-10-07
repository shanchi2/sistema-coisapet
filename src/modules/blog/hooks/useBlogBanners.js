import { useCallback, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { fetchAllRows } from '../../../lib/fetchAllRows'
import { toISODateBR } from '../../../lib/dateBR'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

export function useBlogBanners() {
  const [loading, setLoading] = useState(false)

  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase.from('blog_banner_settings').select('*').eq('id', 'default').maybeSingle()
    if (error) { toast.error('Erro ao carregar configuração dos banners.'); throw error }
    return data
  }, [])

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase.from('product_categories').select('id, name').order('name')
    if (error) throw error
    return data || []
  }, [])

  const updateSettings = useCallback(async (patch) => {
    setLoading(true)
    try {
      const me = getSession()
      const { error } = await supabase.from('blog_banner_settings')
        .update({ ...patch, updated_at: new Date().toISOString(), updated_by: me?.id || null })
        .eq('id', 'default')
      if (error) throw error
      toast.success('Configuração salva.')
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // Estatística dos banners (refeita 06/10 — fase96): exibições e cliques
  // gravados pelo próprio site (coisapet-site) em blog_banner_events, com
  // post, produto, plataforma e se o banner mostrava cupom.
  const fetchStats = useCallback(async (days = 30) => {
    setLoading(true)
    try {
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const events = await fetchAllRows((from, to) => supabase
        .from('blog_banner_events')
        .select('id, event_type, product_id, product_name, platform, post_slug, coupon_shown, created_at')
        .gte('created_at', since)
        // Só eventos do site (sempre têm post). O "Sortear exemplo" da tela
        // chama a function antiga, que grava exibição sem post — não conta.
        .not('post_slug', 'is', null)
        .neq('post_slug', 'teste-claude') // clique de teste de 06/10 (DELETE travou no MCP)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to))

      const impressions = events.filter(e => e.event_type === 'impression')
      const clicks      = events.filter(e => e.event_type === 'click')
      const inc = (map, key, init, field) => {
        const cur = map.get(key) || { ...init, impressions: 0, clicks: 0 }
        cur[field]++
        map.set(key, cur)
      }

      // Por plataforma / produto / post / com×sem cupom
      const byPlatform = new Map(), byProduct = new Map(), byPost = new Map(), byCoupon = new Map(), ranking = new Map()
      events.forEach(e => {
        const field = e.event_type === 'click' ? 'clicks' : 'impressions'
        const plat = normPlatform(e.platform)
        inc(byPlatform, plat, { label: plat }, field)
        inc(byProduct, e.product_id || e.product_name || '—', { name: e.product_name || 'Sem nome' }, field)
        if (e.post_slug) inc(byPost, e.post_slug, { slug: e.post_slug }, field)
        if (e.coupon_shown != null) inc(byCoupon, e.coupon_shown ? 'com' : 'sem', { label: e.coupon_shown ? 'Com cupom' : 'Sem cupom' }, field)
        if (e.event_type === 'click') {
          const k = `${e.post_slug}|${e.product_id || e.product_name}|${plat}`
          const cur = ranking.get(k) || { post_slug: e.post_slug, product: e.product_name || 'Sem nome', platform: plat, clicks: 0 }
          cur.clicks++
          ranking.set(k, cur)
        }
      })

      // Título dos posts (o evento guarda só o slug)
      const slugs = [...byPost.keys()]
      const titles = {}
      if (slugs.length) {
        const { data: posts } = await supabase.from('blog_posts').select('slug, title').in('slug', slugs)
        ;(posts || []).forEach(p => { titles[p.slug] = p.title })
      }

      // Cliques e exibições por dia (gráficos da aba Relatórios)
      const perDay = {}, viewsDay = {}
      for (let d = days - 1; d >= 0; d--) {
        const k = toISODateBR(new Date(Date.now() - d * 86400000))
        perDay[k] = 0; viewsDay[k] = 0
      }
      clicks.forEach(e => { const k = toISODateBR(new Date(e.created_at)); if (perDay[k] !== undefined) perDay[k]++ })
      impressions.forEach(e => { const k = toISODateBR(new Date(e.created_at)); if (viewsDay[k] !== undefined) viewsDay[k]++ })

      const ctr = x => (x.impressions ? (x.clicks / x.impressions) * 100 : null)
      const withCtr = arr => arr.map(x => ({ ...x, ctr: ctr(x) }))
      return {
        total_impressions: impressions.length,
        total_clicks: clicks.length,
        ctr: impressions.length ? (clicks.length / impressions.length) * 100 : 0,
        last_event: events.length ? events[events.length - 1].created_at : null,
        daily: Object.entries(perDay).map(([day, total]) => ({ day, total, views: viewsDay[day] })),
        by_platform: withCtr([...byPlatform.values()]).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
        by_coupon: withCtr([...byCoupon.values()]),
        by_product: withCtr([...byProduct.values()]).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 15),
        by_post: withCtr([...byPost.values()].map(p => ({ ...p, title: titles[p.slug] || p.slug })))
          .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 15),
        ranking: [...ranking.values()].map(r => ({ ...r, title: titles[r.post_slug] || r.post_slug || '—' }))
          .sort((a, b) => b.clicks - a.clicks),
      }
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, fetchSettings, fetchCategories, updateSettings, fetchStats }
}

// O site pode mandar "Shopee", "shopee", "Mercado Livre", "ml"...
function normPlatform(p) {
  const v = String(p || '').toLowerCase()
  if (v.includes('shopee')) return 'Shopee'
  if (v === 'ml' || v.includes('mercado') || v.includes('meli')) return 'Mercado Livre'
  return 'Outro'
}
