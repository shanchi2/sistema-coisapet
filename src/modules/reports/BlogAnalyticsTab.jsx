import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area,
} from 'recharts'
import { Eye, FileText, Clock, Search, X, Globe, ExternalLink, TrendingUp, MousePointerClick, Package } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function fmtDate(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
function fmtHour(h) { return `${String(h).padStart(2, '0')}h` }

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs font-bold" style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

// Agrupa o referrer bruto (URL completa ou vazio) numa origem legível —
// mesma lógica que qualquer analytics básico usa: sem referrer = acesso
// direto (digitou a URL, veio de app, ou é 1ª visita da sessão); com
// referrer, extrai só o domínio e reconhece os mais comuns.
function sourceFromReferrer(referrer) {
  if (!referrer) return 'Direto'
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '')
    if (host.includes('google.'))                        return 'Google'
    if (host.includes('instagram.'))                      return 'Instagram'
    if (host.includes('facebook.') || host.includes('fb.')) return 'Facebook'
    if (host.includes('tiktok.'))                         return 'TikTok'
    if (host.includes('whatsapp.') || host.includes('wa.me')) return 'WhatsApp'
    if (host.includes('coisapet.'))                       return 'Site (interno)'
    return host
  } catch {
    return 'Direto'
  }
}

async function fetchAllPaged(table, select, applyFilters) {
  let all = []
  let from = 0
  const batchSize = 1000
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + batchSize - 1)
    q = applyFilters(q)
    const { data, error } = await q
    if (error || !data || data.length === 0) break
    all = [...all, ...data]
    if (data.length < batchSize) break
    from += batchSize
  }
  return all
}

export function BlogAnalyticsTab({ period, customFrom, customTo, refreshKey }) {
  const [views,   setViews]   = useState([])
  const [posts,   setPosts]   = useState([])
  const [productClicks, setProductClicks] = useState([])
  const [products,      setProducts]      = useState([])
  const [loading, setLoading] = useState(true)
  const [searchPost,    setSearchPost]    = useState('')
  const [searchProdClick, setSearchProdClick] = useState('')

  useEffect(() => {
    if (period === -99 && !customFrom && !customTo) return
    load()
  }, [period, customFrom, customTo, refreshKey]) // eslint-disable-line

  async function load() {
    setLoading(true)

    let dateFrom = null, dateTo = null
    if (period === -99) {
      if (customFrom) dateFrom = customFrom + 'T00:00:00'
      if (customTo)   dateTo   = customTo   + 'T23:59:59'
    } else if (period === 0) {
      const from = new Date(); from.setHours(0, 0, 0, 0)
      dateFrom = from.toISOString()
    } else if (period === -1) {
      const from = new Date(); from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0)
      const to   = new Date(); to.setHours(0, 0, 0, 0)
      dateFrom = from.toISOString(); dateTo = to.toISOString()
    } else {
      const from = new Date(); from.setDate(from.getDate() - period)
      dateFrom = from.toISOString()
    }

    const [viewRows, postRows, clickRows, productRows] = await Promise.all([
      fetchAllPaged('blog_post_views', 'id, slug, referrer, viewed_at', (q) => {
        q = q.order('viewed_at', { ascending: true })
        if (dateFrom) q = q.gte('viewed_at', dateFrom)
        if (dateTo)   q = q.lte('viewed_at', dateTo)
        return q
      }),
      supabase.from('blog_posts').select('slug, title, status, category:blog_categories(name, color)').neq('status', 'trash')
        .then(({ data }) => data || []),
      fetchAllPaged('blog_product_clicks', 'id, post_slug, product_slug, link_text, clicked_at', (q) => {
        q = q.order('clicked_at', { ascending: true })
        if (dateFrom) q = q.gte('clicked_at', dateFrom)
        if (dateTo)   q = q.lte('clicked_at', dateTo)
        return q
      }),
      supabase.from('products').select('slug, name').eq('active', true).then(({ data }) => data || []),
    ])

    setViews(viewRows)
    setPosts(postRows)
    setProductClicks(clickRows)
    setProducts(productRows)
    setLoading(false)
  }

  const postBySlug    = useMemo(() => new Map(posts.map(p => [p.slug, p])), [posts])
  const productBySlug = useMemo(() => new Map(products.map(p => [p.slug, p])), [products])

  const total = views.length
  const totalProductClicks = productClicks.length
  const conversionRate = total > 0 ? ((totalProductClicks / total) * 100).toFixed(1) : '0'
  const uniquePosts = useMemo(() => new Set(views.map(v => v.slug)).size, [views])
  const avgPerPost = uniquePosts > 0 ? (total / uniquePosts).toFixed(1) : '0'

  const byDay = useMemo(() => {
    const map = {}
    views.forEach(v => {
      const d = fmtDate(v.viewed_at)
      if (!map[d]) map[d] = { date: d, total: 0 }
      map[d].total++
    })
    return Object.values(map)
  }, [views])

  const byHour = useMemo(() => {
    const map = {}
    for (let h = 0; h < 24; h++) map[h] = { hour: fmtHour(h), total: 0 }
    views.forEach(v => { map[new Date(v.viewed_at).getHours()].total++ })
    return Object.values(map)
  }, [views])

  const bySource = useMemo(() => {
    const map = {}
    views.forEach(v => {
      const src = sourceFromReferrer(v.referrer)
      map[src] = (map[src] || 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [views])

  const byPost = useMemo(() => {
    const map = {}
    views.forEach(v => {
      if (!map[v.slug]) map[v.slug] = { slug: v.slug, total: 0 }
      map[v.slug].total++
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [views])

  const peakHour = byHour.reduce((a, b) => (b.total > a.total ? b : a), byHour[0] || {})

  // Cliques agrupados por par post+produto — responde "qual matéria
  // gerou clique em qual produto" direto, sem precisar cruzar 2 tabelas
  // na cabeça.
  const byPostProduct = useMemo(() => {
    const map = {}
    productClicks.forEach(c => {
      const key = `${c.post_slug}::${c.product_slug}`
      if (!map[key]) map[key] = { post_slug: c.post_slug, product_slug: c.product_slug, total: 0 }
      map[key].total++
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [productClicks])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center"><Eye size={20} className="text-violet-500" /></div>
          <div>
            <p className="text-xs text-slate-400 font-semibold">Visualizações</p>
            <p className="text-3xl font-black text-slate-800">{total.toLocaleString('pt-BR')}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center"><FileText size={20} className="text-sky-500" /></div>
          <div>
            <p className="text-xs text-slate-400 font-semibold">Posts visualizados</p>
            <p className="text-3xl font-black text-slate-800">{uniquePosts}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center"><TrendingUp size={20} className="text-amber-500" /></div>
          <div>
            <p className="text-xs text-slate-400 font-semibold">Média por post</p>
            <p className="text-3xl font-black text-slate-800">{avgPerPost}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center"><MousePointerClick size={20} className="text-rose-500" /></div>
          <div>
            <p className="text-xs text-slate-400 font-semibold">Cliques pra produto</p>
            <p className="text-3xl font-black text-slate-800">{totalProductClicks.toLocaleString('pt-BR')}</p>
            {total > 0 && <p className="text-[10px] text-slate-400">{conversionRate}% das visualizações</p>}
          </div>
        </div>
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center"><Globe size={20} className="text-emerald-500" /></div>
          <div>
            <p className="text-xs text-slate-400 font-semibold">Principal origem</p>
            <p className="text-lg font-black text-slate-800 truncate max-w-[140px]">{bySource[0]?.name || '—'}</p>
          </div>
        </div>
      </div>

      {/* Evolução + Fontes */}
      <div className="grid grid-cols-[1fr_300px] gap-6">
        <div className="card p-5">
          <p className="font-bold text-slate-700 text-sm mb-1">Evolução de visualizações</p>
          <p className="text-xs text-slate-400 mb-4">Visualizações do blog por dia</p>
          {byDay.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-300"><p className="text-sm">Sem dados no período</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={byDay} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <defs>
                  <linearGradient id="grad-blog-views" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="total" name="Visualizações" stroke="#8b5cf6" strokeWidth={2} fill="url(#grad-blog-views)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <p className="font-bold text-slate-700 text-sm mb-1">De onde vêm</p>
          <p className="text-xs text-slate-400 mb-4">Origem do tráfego</p>
          {bySource.length === 0 ? (
            <p className="text-sm text-slate-300 text-center py-8">Sem dados</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {bySource.slice(0, 8).map(s => (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-600 truncate">{s.name}</span>
                    <span className="text-xs font-black text-slate-800">{s.value}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.round((s.value / total) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hora + Top posts */}
      <div className="grid grid-cols-[1fr_1fr] gap-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Clock size={15} className="text-violet-500" />
            <div>
              <p className="font-bold text-slate-700 text-sm">Distribuição por hora</p>
              <p className="text-xs text-slate-400">Quando os visitantes leem mais</p>
            </div>
            {peakHour.total > 0 && (
              <div className="ml-auto text-right">
                <p className="text-[10px] text-slate-400">Hora de pico</p>
                <p className="text-base font-black text-violet-600">{peakHour.hour}</p>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={byHour} margin={{ top: 0, right: 0, bottom: 0, left: -25 }} barSize={10}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Visualizações" radius={[4, 4, 0, 0]} fill="#8b5cf6" fillOpacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 flex-wrap">
            <FileText size={15} className="text-violet-500" />
            <span className="font-bold text-slate-700 text-sm">Posts mais lidos</span>
            <div className="ml-auto flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <Search size={12} className="text-slate-400 shrink-0" />
              <input className="bg-transparent outline-none text-xs text-slate-700 w-32 placeholder:text-slate-400"
                placeholder="Buscar post..." value={searchPost} onChange={e => setSearchPost(e.target.value)} />
              {searchPost && <button onClick={() => setSearchPost('')} className="text-slate-400 hover:text-slate-600"><X size={11} /></button>}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {byPost.length === 0 ? (
              <p className="text-sm text-slate-300 text-center py-8">Sem dados no período</p>
            ) : (
              byPost
                .filter(p => !searchPost || (postBySlug.get(p.slug)?.title || p.slug).toLowerCase().includes(searchPost.toLowerCase()))
                .map((p, i) => {
                  const post = postBySlug.get(p.slug)
                  return (
                    <div key={p.slug} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50">
                      <span className="text-sm font-black text-slate-300 w-5 text-center shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{post?.title || p.slug}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {post?.category && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: `${post.category.color}18`, color: post.category.color }}>
                              {post.category.name}
                            </span>
                          )}
                          <a href={`https://coisapet.com.br/blog/${p.slug}`} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-slate-400 hover:text-violet-500 flex items-center gap-0.5">
                            /{p.slug} <ExternalLink size={9} />
                          </a>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-black text-slate-800">{p.total}</p>
                        <p className="text-[10px] text-slate-400">visualizações</p>
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </div>
      </div>

      {/* Cliques em produto, por post — o funil "leu → clicou no produto" */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <Package size={15} className="text-violet-500" />
          <span className="font-bold text-slate-700 text-sm">Cliques em produto a partir do Blog</span>
          <span className="text-xs text-slate-400">{byPostProduct.length} combinação(ões) post → produto</span>
          <div className="ml-auto flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Search size={12} className="text-slate-400 shrink-0" />
            <input className="bg-transparent outline-none text-xs text-slate-700 w-40 placeholder:text-slate-400"
              placeholder="Buscar produto ou post..." value={searchProdClick} onChange={e => setSearchProdClick(e.target.value)} />
            {searchProdClick && <button onClick={() => setSearchProdClick('')} className="text-slate-400 hover:text-slate-600"><X size={11} /></button>}
          </div>
        </div>
        {byPostProduct.length === 0 ? (
          <p className="text-sm text-slate-300 text-center py-10">
            Sem cliques em produto registrados no período — provavelmente falta colar o snippet de tracking no site.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {byPostProduct
              .filter(c => {
                if (!searchProdClick) return true
                const q = searchProdClick.toLowerCase()
                const productName = productBySlug.get(c.product_slug)?.name || c.product_slug
                const postTitle = postBySlug.get(c.post_slug)?.title || c.post_slug
                return productName.toLowerCase().includes(q) || postTitle.toLowerCase().includes(q)
              })
              .map((c, i) => {
                const product = productBySlug.get(c.product_slug)
                const post = postBySlug.get(c.post_slug)
                return (
                  <div key={`${c.post_slug}::${c.product_slug}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50">
                    <span className="text-sm font-black text-slate-300 w-6 text-center shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{product?.name || c.product_slug}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        via <span className="text-violet-500 font-semibold">{post?.title || c.post_slug}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-slate-800">{c.total}</p>
                      <p className="text-[10px] text-slate-400">cliques</p>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
