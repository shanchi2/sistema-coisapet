import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Eye, MousePointerClick, Newspaper, Clock3, CalendarClock, X, ExternalLink, Pencil, Loader2, Info, ArrowUpDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todayISO, toISODateBR } from '../../lib/dateBR'

// Calendário do Blog (19/10, pedido do Raphael): ver numa linha do tempo
// quando cada post entrou, o que está agendado e como cada um performou
// (visualizações, cliques nos links de produto, exibições/cliques do banner).
// Dados: blog_posts + blog_post_views (fase49) + blog_product_clicks (fase50)
// + blog_banner_events (fase68/96). Visualizações só existem desde 10/09/2026.

const TRACK_START = '2026-09-10'
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const DAY = 86400000
const siteUrl = slug => `https://www.coisapet.com.br/blog/${slug}`
const fmtInt = n => Math.round(n || 0).toLocaleString('pt-BR')
const fmtDec = n => (n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const dayOf = iso => toISODateBR(new Date(iso))
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const diffDays = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / DAY)

async function fetchAll(build) {
  const all = []
  for (let page = 0; page < 50; page++) {
    const { data, error } = await build().range(page * 1000, page * 1000 + 999)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

function Kpi({ icon: Icon, label, value, detail, tone = 'text-slate-800' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1"><Icon size={14} className="text-slate-400" /><p className="text-xs font-semibold text-slate-500 uppercase">{label}</p></div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      {detail && <p className="text-[11px] text-slate-400 mt-0.5">{detail}</p>}
    </div>
  )
}

// Barrinhas de visualizações por dia (uma série, uma cor; dica no hover)
function Spark({ days, height = 28, width = 120 }) {
  const max = Math.max(1, ...days.map(d => d.v))
  const bw = Math.max(1, width / days.length - 1)
  return (
    <svg width={width} height={height} className="block" role="img" aria-label="Visualizações por dia">
      {days.map((d, i) => (
        <rect key={d.day} x={i * (bw + 1)} y={height - Math.max(d.v ? 2 : 1, (d.v / max) * height)} width={bw} height={Math.max(d.v ? 2 : 1, (d.v / max) * height)}
          rx={bw > 3 ? 1.5 : 0} className={d.v ? 'fill-emerald-500' : 'fill-slate-200'}>
          <title>{new Date(d.day + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}: {d.v} visualizaç{d.v === 1 ? 'ão' : 'ões'}</title>
        </rect>
      ))}
    </svg>
  )
}

export function BlogCalendarPage() {
  const navigate = useNavigate()
  const today = todayISO()
  const [month, setMonth] = useState(today.slice(0, 7)) // AAAA-MM
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null) // post aberto no painel
  const [sort, setSort] = useState('date')

  useEffect(() => {
    (async () => {
      try {
        const [posts, views, clicks, banners] = await Promise.all([
          fetchAll(() => supabase.from('blog_posts').select('id, title, slug, status, published_at, scheduled_at, created_at, cover_image_url, focus_keyword, category:blog_categories(name, color)').neq('status', 'trash').order('id')),
          fetchAll(() => supabase.from('blog_post_views').select('slug, viewed_at, referrer').order('viewed_at')),
          fetchAll(() => supabase.from('blog_product_clicks').select('post_slug, product_slug, link_text, clicked_at').order('clicked_at')),
          fetchAll(() => supabase.from('blog_banner_events').select('post_slug, event_type, product_name, platform, created_at').order('created_at')),
        ])
        setData({ posts, views, clicks, banners })
      } catch (e) { setError(e.message || String(e)) }
    })()
  }, [])

  // Métricas por post (pelo slug) e visualizações por dia do blog inteiro
  const stats = useMemo(() => {
    if (!data) return null
    const by = {}
    const get = slug => (by[slug] ||= { views: 0, viewsByDay: {}, refs: {}, clicks: [], imp: 0, bclicks: [] })
    const blogByDay = {}
    for (const v of data.views) {
      const d = dayOf(v.viewed_at), s = get(v.slug)
      s.views++; s.viewsByDay[d] = (s.viewsByDay[d] || 0) + 1
      blogByDay[d] = (blogByDay[d] || 0) + 1
      const ref = v.referrer ? (() => { try { return new URL(v.referrer).hostname.replace(/^www\./, '') } catch { return 'outro' } })() : 'direto'
      s.refs[ref] = (s.refs[ref] || 0) + 1
    }
    for (const c of data.clicks) get(c.post_slug).clicks.push(c)
    for (const b of data.banners) {
      if (!b.post_slug) continue
      if (b.event_type === 'impression') get(b.post_slug).imp++
      else get(b.post_slug).bclicks.push(b)
    }
    return { by, blogByDay }
  }, [data])

  // Linha do tempo: um registro por post publicado/agendado, com as contas
  const rows = useMemo(() => {
    if (!data || !stats) return []
    const last7 = addDays(today, -6)
    return data.posts.filter(p => p.status !== 'draft').map(p => {
      const s = stats.by[p.slug] || { views: 0, viewsByDay: {}, refs: {}, clicks: [], imp: 0, bclicks: [] }
      const pub = p.status === 'scheduled' ? null : p.published_at && dayOf(p.published_at)
      const daysLive = pub ? Math.max(1, diffDays(pub, today) + 1) : 0
      const measuredFrom = pub ? (pub > TRACK_START ? pub : TRACK_START) : null
      const measuredDays = measuredFrom ? Math.max(1, diffDays(measuredFrom, today) + 1) : 0
      const v7 = Object.entries(s.viewsByDay).filter(([d]) => d >= last7).reduce((t, [, n]) => t + n, 0)
      const spark = Array.from({ length: 30 }, (_, i) => { const d = addDays(today, i - 29); return { day: d, v: s.viewsByDay[d] || 0 } })
      return { ...p, pub, daysLive, s, v7, perDay: measuredDays ? s.views / measuredDays : 0, spark, ctr: s.imp ? s.bclicks.length / s.imp : null }
    })
  }, [data, stats, today])

  const sorted = useMemo(() => {
    const r = [...rows]
    const key = { date: x => x.status === 'scheduled' ? new Date(x.scheduled_at).getTime() + 1e13 : new Date(x.published_at || 0).getTime(), views: x => x.s.views, perDay: x => x.perDay, v7: x => x.v7, clicks: x => x.s.clicks.length + x.s.bclicks.length }[sort]
    return r.sort((a, b) => key(b) - key(a))
  }, [rows, sort])

  // Calendário do mês (semanas começando na segunda)
  const cal = useMemo(() => {
    const first = month + '-01'
    const dow = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7
    const start = addDays(first, -dow)
    const nextMonth = addDays(first, 32).slice(0, 7) + '-01'
    const days = []
    for (let d = start; d < nextMonth || days.length % 7; d = addDays(d, 1)) days.push(d)
    const byDay = {}
    for (const r of rows) {
      const d = r.status === 'scheduled' ? r.scheduled_at && dayOf(r.scheduled_at) : r.pub
      if (d) (byDay[d] ||= []).push(r)
    }
    return { days, byDay }
  }, [month, rows])

  const monthInfo = useMemo(() => {
    if (!stats) return null
    const inMonth = d => d && d.slice(0, 7) === month
    const published = rows.filter(r => r.status === 'published' && inMonth(r.pub)).length
    const scheduled = rows.filter(r => r.status === 'scheduled').sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    const views = Object.entries(stats.blogByDay).filter(([d]) => inMonth(d)).reduce((t, [, n]) => t + n, 0)
    const pclicks = data.clicks.filter(c => inMonth(dayOf(c.clicked_at))).length
    const bclicks = data.banners.filter(b => b.event_type === 'click' && inMonth(dayOf(b.created_at))).length
    const lastPub = rows.filter(r => r.pub).map(r => r.pub).sort().pop()
    return { published, scheduled, views, pclicks, bclicks, sinceLast: lastPub ? diffDays(lastPub, today) : null, lastPub }
  }, [rows, stats, data, month, today])

  const maxDayViews = useMemo(() => Math.max(1, ...cal.days.map(d => stats?.blogByDay[d] || 0)), [cal, stats])
  const heat = v => {
    if (!v) return ''
    const r = v / maxDayViews
    return r > 0.66 ? 'bg-emerald-200/70' : r > 0.33 ? 'bg-emerald-100/80' : 'bg-emerald-50'
  }

  if (error) return <div className="p-8 text-rose-600 text-sm">{error}</div>
  if (!data) return <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-400"><Loader2 size={18} className="animate-spin" /> Carregando posts e métricas...</div>

  const ml = new Date(month + '-15T12:00:00Z').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const monthLabel = ml.charAt(0).toUpperCase() + ml.slice(1) // "Outubro de 2026"
  const shiftMonth = n => { const d = new Date(month + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)) }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title flex items-center gap-2"><CalendarDays size={22} className="text-violet-500" /> Calendário do Blog</h2>
          <p className="page-subtitle">Quando cada post entrou, o que está agendado e como cada um está indo</p>
        </div>
      </div>

      {/* Números do mês */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={Newspaper} label="Publicados no mês" value={fmtInt(monthInfo.published)} detail={monthLabel} tone="text-emerald-600" />
        <Kpi icon={CalendarClock} label="Agendados" value={fmtInt(monthInfo.scheduled.length)} detail={monthInfo.scheduled[0] ? `próximo: ${fmtDateTime(monthInfo.scheduled[0].scheduled_at)}` : 'nenhum na fila'} tone="text-amber-600" />
        <Kpi icon={Eye} label="Visualizações no mês" value={fmtInt(monthInfo.views)} detail="todas as páginas do blog" tone="text-sky-700" />
        <Kpi icon={MousePointerClick} label="Cliques no mês" value={fmtInt(monthInfo.pclicks + monthInfo.bclicks)} detail={`${fmtInt(monthInfo.pclicks)} em links de produto · ${fmtInt(monthInfo.bclicks)} em banners`} tone="text-violet-700" />
        <Kpi icon={Clock3} label="Sem post novo há" value={monthInfo.sinceLast == null ? '—' : `${monthInfo.sinceLast} dia${monthInfo.sinceLast === 1 ? '' : 's'}`} detail={monthInfo.lastPub ? `último em ${fmtDate(monthInfo.lastPub + 'T12:00:00Z')}` : ''} tone={monthInfo.sinceLast > 7 ? 'text-rose-600' : 'text-slate-800'} />
      </div>

      {/* Calendário */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Mês anterior"><ChevronLeft size={18} /></button>
          <p className="font-bold text-slate-800 min-w-[150px] text-center">{monthLabel}</p>
          <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Próximo mês"><ChevronRight size={18} /></button>
          {month !== today.slice(0, 7) && <button onClick={() => setMonth(today.slice(0, 7))} className="text-xs font-semibold text-violet-600">Voltar pra hoje</button>}
          <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> publicado</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> agendado</span>
            <span className="flex items-center gap-1">fundo do dia = visualizações do blog:
              <span className="w-3 h-3 rounded-sm bg-emerald-50 border border-slate-200" /><span className="w-3 h-3 rounded-sm bg-emerald-100" /><span className="w-3 h-3 rounded-sm bg-emerald-200" /> mais</span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map(w => <p key={w} className="text-[10px] font-bold uppercase text-slate-400 text-center pb-1">{w}</p>)}
          {cal.days.map(d => {
            const inMonth = d.slice(0, 7) === month
            const posts = cal.byDay[d] || []
            const v = stats.blogByDay[d] || 0
            return (
              <div key={d} className={`min-h-[92px] rounded-xl border p-1.5 flex flex-col gap-1 ${inMonth ? 'border-slate-200' : 'border-slate-100 opacity-45'} ${heat(v) || 'bg-white'} ${d === today ? 'ring-2 ring-violet-400' : ''}`}
                title={v ? `${v} visualizaç${v === 1 ? 'ão' : 'ões'} no blog neste dia` : undefined}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${d === today ? 'text-violet-600' : 'text-slate-500'}`}>{Number(d.slice(8))}</span>
                  {v > 0 && <span className="text-[10px] text-slate-500 flex items-center gap-0.5"><Eye size={10} />{v}</span>}
                </div>
                {posts.map(p => (
                  <button key={p.id} onClick={() => setOpen(p)} title={p.title}
                    className={`text-left text-[11px] leading-tight font-semibold rounded-md px-1.5 py-1 border-l-[3px] overflow-hidden max-h-[2.6rem] transition-colors ${p.status === 'scheduled' ? 'bg-amber-50 border-amber-400 text-amber-900 hover:bg-amber-100' : 'bg-white/90 border-emerald-500 text-slate-700 hover:bg-emerald-50'}`}>
                    <span className="line-clamp-2">{p.title}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Linha do tempo por post */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <p className="font-bold text-slate-800 flex-1">Linha do tempo dos posts</p>
          <span className="flex items-center gap-1.5 text-xs text-slate-500"><ArrowUpDown size={13} /> Ordenar:</span>
          <span className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
            {[['date', 'Data'], ['views', 'Visualizações'], ['perDay', 'Média/dia'], ['v7', 'Últimos 7 dias'], ['clicks', 'Cliques']].map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} className={`px-2.5 py-1 rounded-md font-semibold ${sort === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
            ))}
          </span>
        </div>
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-[13px] min-w-[1000px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                <th className="pl-4 pr-2 py-2 font-semibold">Post</th>
                <th className="px-2 font-semibold">Entrou</th>
                <th className="px-2 font-semibold text-right whitespace-nowrap">No ar</th>
                <th className="px-2 font-semibold text-right">Visualizações</th>
                <th className="px-2 font-semibold text-right" title="Média por dia desde que o post entrou (ou desde 10/09, quando a contagem começou)">Média/dia</th>
                <th className="px-2 font-semibold text-right">7 dias</th>
                <th className="px-2 font-semibold" title="Visualizações por dia nos últimos 30 dias">Últimos 30 dias</th>
                <th className="px-2 font-semibold text-right" title="Cliques nos links de produto dentro do texto">Links</th>
                <th className="pl-2 pr-4 font-semibold text-right" title="Exibições e cliques do banner de produto do post">Banner</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} onClick={() => setOpen(r)} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer">
                  <td className="pl-4 pr-2 py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-12 h-8 rounded-md bg-slate-100 overflow-hidden shrink-0">{r.cover_image_url && <img src={r.cover_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />}</div>
                      <div className="min-w-0">
                        <p className="text-slate-700 font-semibold leading-snug line-clamp-1">{r.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {r.status === 'scheduled' && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 rounded px-1.5">AGENDADO</span>}
                          {r.category && <span className="text-[10px] font-semibold rounded px-1.5" style={{ background: (r.category.color || '#94a3b8') + '22', color: '#334155' }}>{r.category.name}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 whitespace-nowrap text-slate-600">{r.status === 'scheduled' ? fmtDateTime(r.scheduled_at) : fmtDate(r.published_at)}</td>
                  <td className="px-2 text-right tabular-nums text-slate-500 whitespace-nowrap">{r.daysLive ? `${r.daysLive} d` : '—'}</td>
                  <td className="px-2 text-right tabular-nums font-bold text-slate-800">{fmtInt(r.s.views)}</td>
                  <td className="px-2 text-right tabular-nums text-slate-600">{r.pub ? fmtDec(r.perDay) : '—'}</td>
                  <td className="px-2 text-right tabular-nums text-slate-600">{fmtInt(r.v7)}</td>
                  <td className="px-2"><Spark days={r.spark} /></td>
                  <td className="px-2 text-right tabular-nums">{r.s.clicks.length ? <span className="font-semibold text-violet-700">{r.s.clicks.length}</span> : <span className="text-slate-300">0</span>}</td>
                  <td className="pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
                    {r.s.imp ? <span className="text-slate-600">{fmtInt(r.s.imp)} exib. · <b className="text-violet-700">{r.s.bclicks.length}</b> cliq.</span> : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-500 flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5 text-slate-400" />
          A contagem de visualizações começou em 10/09/2026 — posts mais antigos só têm números a partir daí (a média/dia já considera isso). Banners são contados desde 21/09 (exibições) e 06/10 (cliques).</p>
      </div>

      {open && <PostPanel post={rows.find(r => r.id === open.id) || open} onClose={() => setOpen(null)} onEdit={() => navigate(`/blog/${open.id}`)} />}
    </div>
  )
}

// ─── Painel de um post ─────────────────────────────────────────────
function PostPanel({ post: r, onClose, onEdit }) {
  const s = r.s || { views: 0, refs: {}, clicks: [], imp: 0, bclicks: [] }
  const refs = Object.entries(s.refs).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const prodClicks = Object.entries(s.clicks.reduce((m, c) => (m[c.link_text || c.product_slug] = (m[c.link_text || c.product_slug] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])
  const banner = Object.entries(s.bclicks.reduce((m, c) => { const k = `${c.product_name || 'Produto'} · ${c.platform === 'shopee' ? 'Shopee' : c.platform === 'ml' ? 'Mercado Livre' : c.platform || '—'}`; m[k] = (m[k] || 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1])
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <aside className="w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        {r.cover_image_url && <img src={r.cover_image_url} alt="" className="w-full h-40 object-cover" />}
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-start gap-2">
            <h3 className="font-bold text-slate-800 text-lg leading-snug flex-1">{r.title}</h3>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Fechar"><X size={18} /></button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {r.status === 'scheduled'
              ? <span className="font-bold bg-amber-100 text-amber-700 rounded-full px-2.5 py-1">Agendado pra {fmtDateTime(r.scheduled_at)}</span>
              : <span className="font-bold bg-emerald-100 text-emerald-700 rounded-full px-2.5 py-1">Publicado em {fmtDate(r.published_at)}{r.daysLive ? ` · ${r.daysLive} dias no ar` : ''}</span>}
            {r.focus_keyword && <span className="bg-slate-100 text-slate-600 rounded-full px-2.5 py-1">palavra-chave: {r.focus_keyword}</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Visualizações</p><p className="text-xl font-bold text-slate-800">{fmtInt(s.views)}</p><p className="text-[10px] text-slate-400">{fmtDec(r.perDay || 0)}/dia</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Links</p><p className="text-xl font-bold text-violet-700">{fmtInt(s.clicks.length)}</p><p className="text-[10px] text-slate-400">cliques no texto</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Banner</p><p className="text-xl font-bold text-violet-700">{fmtInt(s.bclicks.length)}</p><p className="text-[10px] text-slate-400">{fmtInt(s.imp)} exib.{r.ctr != null ? ` · ${fmtDec(r.ctr * 100)}%` : ''}</p></div>
          </div>
          {r.spark && <div><p className="text-xs font-bold text-slate-500 mb-1.5">Visualizações por dia (últimos 30 dias)</p><Spark days={r.spark} width={380} height={56} /></div>}
          {refs.length > 0 && (
            <div><p className="text-xs font-bold text-slate-500 mb-1.5">De onde vieram os leitores</p>
              {refs.map(([k, n]) => <div key={k} className="flex justify-between text-sm py-1 border-b border-slate-50"><span className="text-slate-600">{k}</span><b className="text-slate-800 tabular-nums">{n}</b></div>)}
            </div>
          )}
          {prodClicks.length > 0 && (
            <div><p className="text-xs font-bold text-slate-500 mb-1.5">Links de produto clicados</p>
              {prodClicks.map(([k, n]) => <div key={k} className="flex justify-between text-sm py-1 border-b border-slate-50"><span className="text-slate-600 truncate pr-2">{k}</span><b className="text-violet-700 tabular-nums">{n}</b></div>)}
            </div>
          )}
          {banner.length > 0 && (
            <div><p className="text-xs font-bold text-slate-500 mb-1.5">Cliques no banner</p>
              {banner.map(([k, n]) => <div key={k} className="flex justify-between text-sm py-1 border-b border-slate-50"><span className="text-slate-600 truncate pr-2">{k}</span><b className="text-violet-700 tabular-nums">{n}</b></div>)}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={onEdit} className="btn-primary flex-1 justify-center"><Pencil size={15} /> Editar post</button>
            {r.status === 'published' && <a href={siteUrl(r.slug)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"><ExternalLink size={15} /> Ver no site</a>}
          </div>
        </div>
      </aside>
    </div>
  )
}
