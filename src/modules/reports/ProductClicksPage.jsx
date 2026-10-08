import { useEffect, useMemo, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  MousePointerClick, RefreshCw, Search, X, Activity, TrendingUp, Newspaper, Radio,
  ShoppingBag, MessageCircle, Smartphone, Monitor, Tablet, Compass, LayoutGrid, Sparkles, Loader2, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dateBR'
import { Panel, StatTile, Delta, fmtInt } from '../dashboard/widgets'
import { BlogAnalyticsTab } from './BlogAnalyticsTab'

// Cliques no Site (refeita 08/10 no padrão do novo Dashboard).
// Fonte: product_clicks — cada clique de visitante do coisapet.com.br num
// botão que leva pra Shopee / Mercado Livre / WhatsApp, ou no "Clô"
// (botão flutuante de WhatsApp). Guarda produto, página do site, referrer
// (de onde o visitante veio) e navegador (celular × computador).
// Não temos visitas/pageviews — só cliques —, então não dá pra calcular
// taxa de conversão.

const TZ = 'America/Sao_Paulo'
const CHANNELS = {
  shopee:   { label: 'Shopee',              short: 'Shopee',   color: '#EE4D2D', icon: ShoppingBag },
  ml:       { label: 'Mercado Livre',       short: 'ML',       color: '#2D3277', icon: ShoppingBag },
  whatsapp: { label: 'WhatsApp (produto)',  short: 'WhatsApp', color: '#16a34a', icon: MessageCircle },
  clo:      { label: 'Clô (botão flutuante)', short: 'Clô',    color: '#a855f7', icon: MessageCircle },
}
const CH_KEYS = Object.keys(CHANNELS)
const PAGES = {
  home: { label: 'Página inicial', hint: 'vitrine da home' },
  plp:  { label: 'Listagem',       hint: 'categorias e busca' },
  pdp:  { label: 'Página do produto', hint: 'dentro do produto' },
  clo:  { label: 'Clô',            hint: 'botão flutuante, qualquer página' },
}
const PERIODS = [
  { key: 'hoje', label: 'Hoje' }, { key: 'ontem', label: 'Ontem' }, { key: '7', label: '7 dias' },
  { key: '30', label: '30 dias' }, { key: '90', label: '90 dias' }, { key: 'custom', label: 'Período' },
]
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DOW_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const toD = s => new Date(`${s}T12:00:00Z`)
const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const daysBetween = (a, b) => Math.round((toD(b) - toD(a)) / 86400000) + 1
const brDate = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts))
const brHour = ts => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ts)))
const fmtShort = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

const channelOf = c => (c.page === 'clo' ? 'clo' : CHANNELS[c.platform] ? c.platform : 'whatsapp')

// De onde o visitante veio (referrer da página onde ele clicou)
const ORIGINS = {
  instagram: { label: 'Instagram', color: '#E1306C' },
  google:    { label: 'Google', color: '#4285F4' },
  interno:   { label: 'Navegando no site', color: '#94a3b8', hint: 'veio de outra página da própria loja' },
  direto:    { label: 'Direto', color: '#64748b', hint: 'digitou o endereço, favorito ou app' },
  whatsapp:  { label: 'WhatsApp', color: '#16a34a' },
  facebook:  { label: 'Facebook', color: '#1877F2' },
  ia:        { label: 'ChatGPT / IA', color: '#10a37f' },
  outros:    { label: 'Outros sites', color: '#cbd5e1' },
}
function originOf(ref) {
  const r = (ref || '').toLowerCase()
  if (!r) return 'direto'
  if (r.includes('instagram')) return 'instagram'
  if (r.includes('google')) return 'google'
  if (r.includes('coisapet.com.br')) return 'interno'
  if (r.includes('whatsapp') || r.includes('wa.me') || r.includes('l.wl.co')) return 'whatsapp'
  if (r.includes('facebook') || r.includes('fb.')) return 'facebook'
  if (r.includes('chatgpt') || r.includes('openai') || r.includes('perplexity') || r.includes('gemini') || r.includes('bing')) return 'ia'
  return 'outros'
}
function deviceOf(ua) {
  const u = ua || ''
  if (/iPad|Tablet/i.test(u)) return 'tablet'
  if (/Mobi|iPhone|Android/i.test(u)) return 'celular'
  return 'computador'
}
const DEVICES = {
  celular:    { label: 'Celular', icon: Smartphone },
  computador: { label: 'Computador', icon: Monitor },
  tablet:     { label: 'Tablet', icon: Tablet },
}

function rangeOf(key, custom) {
  const today = todayISO()
  if (key === 'hoje') return { from: today, to: today }
  if (key === 'ontem') { const y = addDays(today, -1); return { from: y, to: y } }
  if (key === 'custom') return custom
  return { from: addDays(today, -(Number(key) - 1)), to: today }
}
const prevOf = ({ from, to }) => { const n = daysBetween(from, to); return { from: addDays(from, -n), to: addDays(from, -1) } }

async function fetchClicks(from, to) {
  const all = []
  for (let page = 0; page < 60; page++) {
    const { data, error } = await supabase.from('product_clicks')
      .select('id, product_id, product_name, platform, page, clicked_at, referrer, user_agent')
      .gte('clicked_at', `${from}T00:00:00-03:00`).lt('clicked_at', `${addDays(to, 1)}T00:00:00-03:00`)
      .order('clicked_at').range(page * 1000, page * 1000 + 999)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

// ── Peças visuais ─────────────────────────────────────────────────
function SplitBar({ parts, total, height = 'h-2.5' }) {
  return (
    <div className={`${height} rounded-full overflow-hidden flex bg-slate-100`} style={{ gap: 2 }}>
      {parts.filter(p => p.value > 0).map(p => (
        <div key={p.key} style={{ width: `${(p.value / Math.max(1, total)) * 100}%`, background: p.color }} title={`${p.label}: ${fmtInt(p.value)}`} />
      ))}
    </div>
  )
}
function HBarList({ rows, total }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(r => (
        <div key={r.key}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[13px] text-slate-700 font-medium truncate">{r.label}{r.hint && <span className="text-[11px] text-slate-400 font-normal"> · {r.hint}</span>}</span>
            <span className="text-[13px] font-bold text-slate-800 tabular-nums shrink-0">{fmtInt(r.value)} <span className="text-[11px] font-normal text-slate-400">{pct(r.value, total)}%</span></span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color || '#8b5cf6' }} /></div>
        </div>
      ))}
    </div>
  )
}
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      {CH_KEYS.map(k => <span key={k} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHANNELS[k].color }} />{CHANNELS[k].short}</span>)}
    </div>
  )
}
function StackTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((t, p) => t + (p.value || 0), 0)
  return (
    <div className="bg-slate-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl">
      <p className="font-bold mb-1">{DOW[toD(label).getUTCDay()]}, {fmtShort(label)} · {fmtInt(total)} cliques</p>
      {[...payload].reverse().map(p => <p key={p.dataKey}><span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: p.color }} />{CHANNELS[p.dataKey].short}: {fmtInt(p.value)}</p>)}
    </div>
  )
}

// Mapa de calor dia da semana × hora
function Heatmap({ grid }) {
  const max = Math.max(1, ...grid.flat())
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: '34px repeat(24, minmax(0, 1fr))' }}>
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-[9px] text-slate-400 text-center">{h % 3 === 0 ? `${h}h` : ''}</span>)}
          {grid.map((row, d) => [
            <span key={`l${d}`} className="text-[10px] text-slate-500 font-semibold self-center">{DOW[d]}</span>,
            ...row.map((v, h) => (
              <div key={`${d}-${h}`} className="h-5 rounded-[3px]" title={`${DOW_LONG[d]} ${h}h: ${v} clique${v === 1 ? '' : 's'}`}
                style={{ background: v ? `rgba(139, 92, 246, ${0.12 + 0.88 * (v / max)})` : '#f1f5f9' }} />
            )),
          ])}
        </div>
        <div className="flex items-center gap-1.5 justify-end mt-2 text-[10px] text-slate-400">
          menos {[0.15, 0.4, 0.65, 1].map(a => <span key={a} className="w-3 h-3 rounded-[3px]" style={{ background: `rgba(139, 92, 246, ${a})` }} />)} mais
        </div>
      </div>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────
export function ProductClicksPage() {
  const today = todayISO()
  const [periodKey, setPeriodKey] = useState('30')
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today })
  const [tab, setTab] = useState('overview')
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [channel, setChannel] = useState('')
  const [search, setSearch] = useState('')
  const [openProd, setOpenProd] = useState(null)

  const range = rangeOf(periodKey, custom)
  const prev = prevOf(range)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows(await fetchClicks(prev.from, range.to)) } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [prev.from, range.to])
  useEffect(() => { load() }, [load, refreshKey])
  // Aba "Ao vivo": atualiza sozinha a cada 30 s
  useEffect(() => {
    if (tab !== 'live') return
    const t = setInterval(() => setRefreshKey(k => k + 1), 30000)
    return () => clearInterval(t)
  }, [tab])

  const inR = (c, r) => { const d = brDate(c.clicked_at); return d >= r.from && d <= r.to }
  const cur = useMemo(() => (rows || []).filter(c => inR(c, range) && (!channel || channelOf(c) === channel)), [rows, range.from, range.to, channel]) // eslint-disable-line react-hooks/exhaustive-deps
  const old = useMemo(() => (rows || []).filter(c => inR(c, prev) && (!channel || channelOf(c) === channel)), [rows, prev.from, prev.to, channel]) // eslint-disable-line react-hooks/exhaustive-deps

  const A = useMemo(() => {
    const count = (list, fn) => list.reduce((m, c) => { const k = fn(c); m[k] = (m[k] || 0) + 1; return m }, {})
    const byCh = count(cur, channelOf), byChPrev = count(old, channelOf)
    const byOrigin = count(cur, c => originOf(c.referrer))
    const byDevice = count(cur, c => deviceOf(c.user_agent))
    const byPage = count(cur, c => (PAGES[c.page] ? c.page : 'home'))
    const days = []; for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d)
    const daily = Object.fromEntries(days.map(d => [d, { day: d, ...Object.fromEntries(CH_KEYS.map(k => [k, 0])) }]))
    cur.forEach(c => { const d = daily[brDate(c.clicked_at)]; if (d) d[channelOf(c)]++ })
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0))
    cur.forEach(c => { heat[toD(brDate(c.clicked_at)).getUTCDay()][brHour(c.clicked_at)]++ })
    const prods = {}
    const prevProds = count(old.filter(c => c.page !== 'clo'), c => c.product_name || '—')
    cur.forEach(c => {
      if (c.page === 'clo') return
      const k = c.product_name || '—'
      const p = (prods[k] ||= { name: k, total: 0, ch: {}, pages: {}, origins: {}, days: {} })
      p.total++; p.ch[channelOf(c)] = (p.ch[channelOf(c)] || 0) + 1
      p.pages[c.page] = (p.pages[c.page] || 0) + 1
      const o = originOf(c.referrer); p.origins[o] = (p.origins[o] || 0) + 1
      const d = brDate(c.clicked_at); p.days[d] = (p.days[d] || 0) + 1
    })
    const products = Object.values(prods).map(p => ({ ...p, prev: prevProds[p.name] || 0 })).sort((a, b) => b.total - a.total)
    // Destaques em frase
    const hourTot = Array(24).fill(0); heat.forEach(r => r.forEach((v, h) => { hourTot[h] += v }))
    const peakH = hourTot.indexOf(Math.max(...hourTot))
    const dowTot = heat.map(r => r.reduce((a, b) => a + b, 0))
    const peakD = dowTot.indexOf(Math.max(...dowTot))
    return { byCh, byChPrev, byOrigin, byDevice, byPage, daily: Object.values(daily), heat, products, peakH, peakD, days }
  }, [cur, old, range.from, range.to])

  const total = cur.length, totalPrev = old.length
  const topCh = CH_KEYS.slice().sort((a, b) => (A.byCh[b] || 0) - (A.byCh[a] || 0))[0]
  const ext = Object.entries(A.byOrigin).filter(([k]) => !['interno', 'direto'].includes(k)).sort((a, b) => b[1] - a[1])[0]
  const mobile = pct(A.byDevice.celular || 0, total)
  const rising = A.products.filter(p => p.total >= 3).map(p => ({ ...p, gain: p.total - p.prev })).sort((a, b) => b.gain - a.gain)[0]

  const tabs = [
    { id: 'overview', label: 'Visão geral', icon: Activity },
    { id: 'products', label: 'Produtos', icon: TrendingUp },
    { id: 'blog', label: 'Blog', icon: Newspaper },
    { id: 'live', label: 'Ao vivo', icon: Radio },
  ]
  const filteredProducts = A.products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
  const maxProd = Math.max(1, ...A.products.slice(0, 1).map(p => p.total))

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200">
            <MousePointerClick size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Cliques no Site</h1>
            <p className="text-sm text-slate-500">Quem clicou no coisapet.com.br pra comprar na Shopee, no ML ou falar no WhatsApp</p>
          </div>
        </div>
        <button onClick={() => setRefreshKey(k => k + 1)} disabled={loading} className="btn-secondary py-1.5 text-sm disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Período + filtro de canal */}
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriodKey(p.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${periodKey === p.key ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>{p.label}</button>
        ))}
        {periodKey === 'custom' && (
          <span className="flex items-center gap-1.5 text-sm">
            <input type="date" value={custom.from} max={custom.to} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="input py-1 text-sm w-auto" />
            <span className="text-slate-400">até</span>
            <input type="date" value={custom.to} min={custom.from} max={today} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="input py-1 text-sm w-auto" />
          </span>
        )}
        <span className="text-xs text-slate-400">{fmtShort(range.from)}{range.to !== range.from ? ` a ${fmtShort(range.to)}` : ''} · comparando com {fmtShort(prev.from)}{prev.to !== prev.from ? ` a ${fmtShort(prev.to)}` : ''}</span>
        {tab !== 'blog' && (
          <select value={channel} onChange={e => setChannel(e.target.value)} className="ml-auto text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600">
            <option value="">Todos os canais</option>
            {CH_KEYS.map(k => <option key={k} value={k}>{CHANNELS[k].label}</option>)}
          </select>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{error}</div>}

      {tab === 'blog' ? (
        <BlogAnalyticsTab period={periodKey === 'hoje' ? 0 : periodKey === 'ontem' ? -1 : periodKey === 'custom' ? -99 : Number(periodKey)} customFrom={custom.from} customTo={custom.to} refreshKey={refreshKey} />
      ) : rows === null ? (
        <div className="card py-24 text-center"><Loader2 size={24} className="mx-auto animate-spin text-slate-300" /></div>
      ) : tab === 'overview' ? (
        <>
          {/* Números do período */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatTile icon={MousePointerClick} tone="violet" label="Cliques no período" value={fmtInt(total)}
              detail={<Delta current={total} previous={totalPrev} suffix="vs período anterior" />} />
            {CH_KEYS.map(k => (
              <StatTile key={k} icon={CHANNELS[k].icon} label={CHANNELS[k].label} value={fmtInt(A.byCh[k] || 0)}
                detail={<span className="flex items-center gap-2"><span className="font-semibold text-slate-500">{pct(A.byCh[k] || 0, total)}% dos cliques</span><Delta current={A.byCh[k] || 0} previous={A.byChPrev[k] || 0} suffix="" /></span>}>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct(A.byCh[k] || 0, total)}%`, background: CHANNELS[k].color }} /></div>
              </StatTile>
            ))}
          </div>

          {/* Resumo em frases */}
          {total > 0 && (
            <div className="card !p-4 flex items-start gap-3">
              <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><Sparkles size={16} /></span>
              <ul className="text-sm text-slate-600 leading-relaxed grid md:grid-cols-2 gap-x-6 gap-y-1">
                <li><b style={{ color: CHANNELS[topCh].color }}>{CHANNELS[topCh].short}</b> leva <b>{pct(A.byCh[topCh] || 0, total)}%</b> dos cliques.</li>
                {ext && <li><b>{ORIGINS[ext[0]].label}</b> é quem mais traz visitante de fora: <b>{pct(ext[1], total)}%</b> dos cliques.</li>}
                <li><b>{mobile}%</b> dos cliques vêm do <b>celular</b>.</li>
                {A.peakH >= 0 && total >= 10 && <li>Horário mais forte: <b>{A.peakH}h–{A.peakH + 1}h</b>; dia mais forte: <b>{DOW_LONG[A.peakD]}</b>.</li>}
                {rising && rising.gain > 0 && <li className="md:col-span-2">Produto que mais cresceu: <b>{rising.name}</b> ({rising.prev} → {rising.total} cliques).</li>}
              </ul>
            </div>
          )}

          {/* Por dia */}
          <Panel title="Cliques por dia" subtitle="Separado pelo destino do clique" right={<Legend />}>
            {total === 0 ? <p className="text-sm text-slate-400 text-center py-10">Nenhum clique nesse período.</p> : (
              <div style={{ height: 230 }} className="-ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={A.daily} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="day" tickFormatter={fmtShort} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#f1f5f9' }} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                    <Tooltip content={<StackTooltip />} cursor={{ fill: '#f8fafc' }} />
                    {CH_KEYS.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={CHANNELS[k].color} maxBarSize={28} radius={i === CH_KEYS.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Panel title="De onde vieram" subtitle="Site de origem de quem clicou">
              <HBarList total={total} rows={Object.entries(A.byOrigin).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: ORIGINS[k].label, hint: ORIGINS[k].hint, value: v, color: ORIGINS[k].color }))} />
            </Panel>
            <Panel title="Onde no site clicaram" subtitle="Em qual página estava o botão">
              <HBarList total={total} rows={Object.entries(A.byPage).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: PAGES[k].label, hint: PAGES[k].hint, value: v, color: '#8b5cf6' }))} />
            </Panel>
            <Panel title="Aparelho" subtitle="Pelo navegador de quem clicou">
              <div className="flex flex-col gap-4">
                {Object.entries(DEVICES).map(([k, d]) => {
                  const v = A.byDevice[k] || 0
                  return (
                    <div key={k} className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0"><d.icon size={17} className="text-slate-500" /></span>
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between mb-1"><span className="text-[13px] font-medium text-slate-700">{d.label}</span><span className="text-lg font-black text-slate-800 tabular-nums">{pct(v, total)}%</span></div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-sky-500" style={{ width: `${pct(v, total)}%` }} /></div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{fmtInt(v)} cliques</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>
          </div>

          <Panel title="Quando clicam" subtitle="Dia da semana × hora · quanto mais forte a cor, mais cliques">
            <Heatmap grid={A.heat} />
          </Panel>

          <Panel title="Produtos mais clicados" subtitle="Top 8 · veja todos na aba Produtos" right={<Legend />}>
            <ProductRows products={A.products.slice(0, 8)} max={maxProd} onOpen={p => { setTab('products'); setOpenProd(p.name) }} />
          </Panel>
        </>
      ) : tab === 'products' ? (
        <Panel title={`${fmtInt(A.products.length)} produtos clicados`} subtitle="Clique num produto pra ver de onde vieram e em que página" right={
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Search size={12} className="text-slate-400" />
            <input className="bg-transparent outline-none text-xs text-slate-700 w-44 placeholder:text-slate-400" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} className="text-slate-400"><X size={11} /></button>}
          </div>}>
          <ProductRows products={filteredProducts} max={maxProd} expandable openName={openProd} onOpen={p => setOpenProd(o => o === p.name ? null : p.name)} days={A.days} />
          {!filteredProducts.length && <p className="text-sm text-slate-400 text-center py-8">Nenhum produto.</p>}
        </Panel>
      ) : (
        <LiveFeed clicks={cur} />
      )}
    </div>
  )
}

function ProductRows({ products, max, onOpen, expandable, openName, days }) {
  return (
    <div className="divide-y divide-slate-50 -mx-1">
      {products.map((p, i) => {
        const parts = CH_KEYS.map(k => ({ key: k, label: CHANNELS[k].short, value: p.ch[k] || 0, color: CHANNELS[k].color }))
        const open = expandable && openName === p.name
        return (
          <div key={p.name}>
            <button onClick={() => onOpen?.(p)} className="w-full text-left px-1 py-2.5 hover:bg-slate-50/70 rounded-lg grid grid-cols-[22px_minmax(0,1.5fr)_minmax(0,1.6fr)_84px_14px] gap-3 items-center">
              <span className="text-xs font-bold text-slate-300">{i + 1}</span>
              <span className="text-[13px] text-slate-700 font-medium truncate" title={p.name}>{p.name}</span>
              <div style={{ width: `${Math.max(8, (p.total / max) * 100)}%` }}><SplitBar parts={parts} total={p.total} /></div>
              <span className="text-right">
                <span className="text-sm font-black text-slate-800 tabular-nums">{fmtInt(p.total)}</span>
                <span className="block text-[10px] leading-tight"><Delta current={p.total} previous={p.prev} suffix="" /></span>
              </span>
              {expandable ? <ChevronDown size={14} className={`text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`} /> : <span />}
            </button>
            {open && (
              <div className="px-8 pb-4 pt-1 grid md:grid-cols-3 gap-5 bg-slate-50/50 rounded-xl mb-2">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase mb-2">Destino</p>
                  <HBarList total={p.total} rows={parts.filter(x => x.value).map(x => ({ ...x, label: CHANNELS[x.key].label }))} />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase mb-2">De onde vieram</p>
                  <HBarList total={p.total} rows={Object.entries(p.origins).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: ORIGINS[k].label, value: v, color: ORIGINS[k].color }))} />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase mb-2">Por dia</p>
                  <div className="flex items-end h-20" style={{ gap: 2 }}>
                    {(days || []).map(d => { const v = p.days[d] || 0; const m = Math.max(1, ...Object.values(p.days)); return <div key={d} className="flex-1 rounded-t-[2px] bg-violet-400" style={{ height: `${(v / m) * 100}%`, minHeight: v ? 2 : 0 }} title={`${fmtShort(d)}: ${v}`} /> })}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Página: {Object.entries(p.pages).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${PAGES[k]?.label || k} ${v}`).join(' · ')}</p>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function LiveFeed({ clicks }) {
  const [q, setQ] = useState('')
  const list = [...clicks].reverse().filter(c => !q || (c.product_name || '').toLowerCase().includes(q.toLowerCase())).slice(0, 300)
  const ago = ts => {
    const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
    if (m < 1) return 'agora'
    if (m < 60) return `há ${m} min`
    if (m < 1440) return `há ${Math.round(m / 60)} h`
    return new Date(ts).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
  return (
    <Panel title="Últimos cliques" subtitle="Atualiza sozinho a cada 30 segundos" right={
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
        <Search size={12} className="text-slate-400" />
        <input className="bg-transparent outline-none text-xs text-slate-700 w-44 placeholder:text-slate-400" placeholder="Buscar produto..." value={q} onChange={e => setQ(e.target.value)} />
      </div>}>
      <div className="divide-y divide-slate-50 -mx-1 max-h-[640px] overflow-y-auto">
        {list.map(c => {
          const ch = CHANNELS[channelOf(c)], o = ORIGINS[originOf(c.referrer)], dv = DEVICES[deviceOf(c.user_agent)]
          return (
            <div key={c.id} className="flex items-center gap-3 px-1 py-2.5">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: ch.color + '18' }}><ch.icon size={16} style={{ color: ch.color }} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-700 truncate">{c.page === 'clo' ? 'Falou com a Clô no WhatsApp' : c.product_name}</p>
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold" style={{ color: ch.color }}>{ch.short}</span>·
                  <span className="flex items-center gap-1"><LayoutGrid size={10} />{PAGES[c.page]?.label || c.page}</span>·
                  <span className="flex items-center gap-1"><Compass size={10} />{o.label}</span>·
                  <span className="flex items-center gap-1"><dv.icon size={10} />{dv.label}</span>
                </p>
              </div>
              <span className="text-[11px] text-slate-500 shrink-0">{ago(c.clicked_at)}</span>
            </div>
          )
        })}
        {!list.length && <p className="text-sm text-slate-400 text-center py-10">Nenhum clique nesse período.</p>}
      </div>
    </Panel>
  )
}
