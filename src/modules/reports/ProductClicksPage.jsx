import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, Legend,
} from 'recharts'
import {
  MousePointerClick, TrendingUp, RefreshCw, Search, X,
  ShoppingBag, Calendar, Clock, BarChart2, Activity,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ── Config ────────────────────────────────────────────────────
const PLATFORM_CFG = {
  shopee:   { label: 'Shopee',          color: '#EE4D2D', emoji: '🛍️' },
  ml:       { label: 'Mercado Livre',   color: '#f59e0b', emoji: '🛒' },
  whatsapp: { label: 'WhatsApp',        color: '#25d366', emoji: '💬' },
  clo:      { label: 'Clô (Flutuante)', color: '#a855f7', emoji: '🐾' },
}

const PAGE_CFG = {
  home: { label: 'Home',      color: '#6366f1' },
  plp:  { label: 'Listagem',  color: '#0ea5e9' },
  pdp:  { label: 'Produto',   color: '#f59e0b' },
  clo:  { label: 'Clô',       color: '#a855f7' },
}

const PERIODS = [
  { label: 'Hoje',              days: 0   },
  { label: 'Ontem',             days: -1  },
  { label: '7 dias',            days: 7   },
  { label: '30 dias',           days: 30  },
  { label: '90 dias',           days: 90  },
  { label: 'Personalizado',     days: -99 },
]

function fmtDate(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })
}
function fmtHour(h) { return `${String(h).padStart(2,'0')}h` }

// ── Tooltip customizado ────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs font-bold" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────
export function ProductClicksPage() {
  const [clicks,   setClicks]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [period,   setPeriod]   = useState(7)
  const [platform,   setPlatform]   = useState('')
  const [page,       setPage]       = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const [searchProd,setSearchProd] = useState('')
  const [searchFeed,setSearchFeed] = useState('')
  const [activeTab, setActiveTab] = useState('overview') // overview | produtos | feed

  useEffect(() => {
    if (period === -99 && !customFrom && !customTo) return // espera datas
    loadClicks()
  }, [period, customFrom, customTo]) // eslint-disable-line

  async function loadClicks() {
    setLoading(true)

    // Monta filtros de data
    let dateFrom = null
    let dateTo   = null

    if (period === -99) {
      if (customFrom) dateFrom = customFrom + 'T00:00:00'
      if (customTo)   dateTo   = customTo   + 'T23:59:59'
    } else if (period === 0) {
      const from = new Date(); from.setHours(0,0,0,0)
      dateFrom = from.toISOString()
    } else if (period === -1) {
      const from = new Date(); from.setDate(from.getDate() - 1); from.setHours(0,0,0,0)
      const to   = new Date(); to.setHours(0,0,0,0)
      dateFrom = from.toISOString()
      dateTo   = to.toISOString()
    } else {
      const from = new Date(); from.setDate(from.getDate() - period)
      dateFrom = from.toISOString()
    }

    // Busca em lotes de 1000 (paginação) para contornar o limite do Supabase
    let allData = []
    let from    = 0
    const batchSize = 1000

    while (true) {
      let q = supabase
        .from('product_clicks')
        .select('*')
        .order('clicked_at', { ascending: true })
        .range(from, from + batchSize - 1)

      if (dateFrom) q = q.gte('clicked_at', dateFrom)
      if (dateTo)   q = q.lte('clicked_at', dateTo)

      const { data, error } = await q
      if (error || !data || data.length === 0) break

      allData = [...allData, ...data]

      // Se retornou menos que o batch, chegamos ao fim
      if (data.length < batchSize) break
      from += batchSize
    }

    setClicks(allData)
    setLoading(false)
  }

  // Filtro local
  const filtered = useMemo(() => clicks.filter(c =>
    (!platform || c.platform === platform) &&
    (!page || c.page === page)
  ), [clicks, platform, page])

  // ── Métricas ────────────────────────────────────────────────
  const total = filtered.length
  const byPlat = {
    shopee:   filtered.filter(c => c.platform==='shopee').length,
    ml:       filtered.filter(c => c.platform==='ml').length,
    whatsapp: filtered.filter(c => c.platform==='whatsapp' && c.page!=='clo').length,
    clo:      filtered.filter(c => c.page==='clo').length,
  }

  // Cliques por dia
  const byDay = useMemo(() => {
    const map = {}
    filtered.forEach(c => {
      const d = fmtDate(c.clicked_at)
      if (!map[d]) map[d] = { date: d, total: 0, shopee: 0, ml: 0, whatsapp: 0, clo: 0 }
      map[d].total++
      const plat = c.page === 'clo' ? 'clo' : c.platform
      if (map[d][plat] !== undefined) map[d][plat]++
    })
    return Object.values(map)
  }, [filtered])

  // Cliques por hora
  const byHour = useMemo(() => {
    const map = {}
    for (let h = 0; h < 24; h++) map[h] = { hour: fmtHour(h), total: 0 }
    filtered.forEach(c => {
      const h = new Date(c.clicked_at).getHours()
      map[h].total++
    })
    return Object.values(map)
  }, [filtered])

  // Cliques por plataforma (pizza)
  const platPie = Object.entries(PLATFORM_CFG).map(([k, v]) => ({
    name: v.label, value: byPlat[k] || 0, color: v.color, emoji: v.emoji,
  })).filter(p => p.value > 0)

  // Cliques por página
  const byPageData = Object.entries(PAGE_CFG).map(([k, v]) => ({
    name: v.label,
    value: filtered.filter(c => c.page === k).length,
    color: v.color,
  })).filter(p => p.value > 0)

  // Top produtos
  const byProduct = useMemo(() => {
    const map = {}
    filtered.forEach(c => {
      if (!map[c.product_name]) map[c.product_name] = { name: c.product_name, total: 0, shopee:0, ml:0, whatsapp:0, clo:0 }
      map[c.product_name].total++
      const plat = c.page === 'clo' ? 'clo' : c.platform
      if (map[c.product_name][plat] !== undefined) map[c.product_name][plat]++
    })
    return Object.values(map).sort((a,b) => b.total - a.total)
  }, [filtered])

  // Hora de pico
  const peakHour = byHour.reduce((a,b) => b.total > a.total ? b : a, byHour[0] || {})

  // Taxa de conversão por página (cliques / total)
  const maxDay = Math.max(...byDay.map(d => d.total), 1)

  const tabs = [
    { id:'overview',  label:'Visão Geral', icon: Activity },
    { id:'produtos',  label:'Produtos',    icon: TrendingUp },
    { id:'feed',      label:'Feed ao vivo',icon: ShoppingBag },
  ]

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <BarChart2 size={20} className="text-violet-500"/>
          </div>
          <div>
            <h2 className="page-title">Analytics do Site</h2>
            <p className="page-subtitle">{total.toLocaleString('pt-BR')} cliques registrados</p>
          </div>
        </div>
        <button onClick={loadClicks} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Atualizar
        </button>
      </div>

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        {/* Período */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setPeriod(p.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${period===p.days ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {period === -99 && (
          <div className="flex items-center gap-2">
            <input type="date" className="select text-xs py-1.5" value={customFrom}
              onChange={e => setCustomFrom(e.target.value)} placeholder="De"/>
            <span className="text-slate-400 text-xs">até</span>
            <input type="date" className="select text-xs py-1.5" value={customTo}
              onChange={e => setCustomTo(e.target.value)} placeholder="Até"/>
          </div>
        )}
        <select className="select text-sm w-auto" value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="">Todas as plataformas</option>
          {Object.entries(PLATFORM_CFG).map(([k,v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
        <select className="select text-sm w-auto" value={page} onChange={e => setPage(e.target.value)}>
          <option value="">Todas as páginas</option>
          {Object.entries(PAGE_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(platform || page) && (
          <button onClick={() => { setPlatform(''); setPage('') }}
            className="text-xs text-rose-500 font-semibold flex items-center gap-1">
            <X size={11}/> Limpar
          </button>
        )}
      </div>

      {/* ── KPIs ────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4">
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center text-2xl">👆</div>
          <div>
            <p className="text-xs text-slate-400 font-semibold">Total</p>
            <p className="text-3xl font-black text-slate-800">{total.toLocaleString('pt-BR')}</p>
          </div>
        </div>
        {Object.entries(PLATFORM_CFG).map(([k, v]) => (
          <div key={k} className="card p-5 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ background: v.color + '18' }}>{v.emoji}</div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">{v.label}</p>
              <p className="text-3xl font-black text-slate-800">{byPlat[k]||0}</p>
              {total > 0 && <p className="text-[10px] text-slate-400">{Math.round((byPlat[k]||0)/total*100)}%</p>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Abas ────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all
                ${activeTab===t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon size={13}/> {t.label}
            </button>
          )
        })}
      </div>

      {/* ══ ABA: VISÃO GERAL ══════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">

          {/* Linha de evolução + Pizza */}
          <div className="grid grid-cols-[1fr_320px] gap-6">

            {/* Gráfico de área — evolução diária */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="font-bold text-slate-700 text-sm">Evolução de cliques</p>
                  <p className="text-xs text-slate-400 mt-0.5">Cliques por dia por plataforma</p>
                </div>
                {peakHour.total > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Pico do período</p>
                    <p className="text-sm font-black text-violet-600">{byDay.reduce((a,b)=>b.total>a.total?b:a,byDay[0]||{date:'-'}).date}</p>
                  </div>
                )}
              </div>
              {byDay.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-300">
                  <p className="text-sm">Sem dados no período</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={byDay} margin={{ top:5, right:5, bottom:5, left:-20 }}>
                    <defs>
                      {Object.entries(PLATFORM_CFG).map(([k,v]) => (
                        <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={v.color} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={v.color} stopOpacity={0}/>
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="date" tick={{ fontSize:10, fill:'#94a3b8' }} tickLine={false} axisLine={false}/>
                    <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} tickLine={false} axisLine={false}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    {Object.entries(PLATFORM_CFG).map(([k, v]) => (
                      <Area key={k} type="monotone" dataKey={k} name={v.label}
                        stroke={v.color} strokeWidth={2}
                        fill={`url(#grad-${k})`} stackId="1"/>
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Pizza por plataforma */}
            <div className="card p-5">
              <p className="font-bold text-slate-700 text-sm mb-1">Por plataforma</p>
              <p className="text-xs text-slate-400 mb-4">Distribuição no período</p>
              {platPie.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-slate-300">
                  <p className="text-sm">Sem dados</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={platPie} cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                        paddingAngle={3} dataKey="value">
                        {platPie.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="none"/>
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]}
                        contentStyle={{ background:'#1e293b', border:'1px solid #334155', borderRadius:12, fontSize:12 }}
                        labelStyle={{ color:'#94a3b8' }} itemStyle={{ color:'#fff' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2 mt-3">
                    {platPie.map(p => (
                      <div key={p.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }}/>
                          <span className="text-xs font-semibold text-slate-600">{p.emoji} {p.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-800">{p.value}</span>
                          <span className="text-[10px] text-slate-400">{Math.round(p.value/total*100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mapa de calor por hora + Barras por página */}
          <div className="grid grid-cols-[1fr_280px] gap-6">

            {/* Cliques por hora do dia */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-5">
                <Clock size={15} className="text-violet-500"/>
                <div>
                  <p className="font-bold text-slate-700 text-sm">Distribuição por hora</p>
                  <p className="text-xs text-slate-400">Quando os visitantes clicam mais</p>
                </div>
                {peakHour.total > 0 && (
                  <div className="ml-auto text-right">
                    <p className="text-[10px] text-slate-400">Hora de pico</p>
                    <p className="text-base font-black text-violet-600">{peakHour.hour}</p>
                  </div>
                )}
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={byHour} margin={{ top:0, right:0, bottom:0, left:-25 }} barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                  <XAxis dataKey="hour" tick={{ fontSize:9, fill:'#94a3b8' }} tickLine={false} axisLine={false}
                    interval={2}/>
                  <YAxis tick={{ fontSize:9, fill:'#94a3b8' }} tickLine={false} axisLine={false}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Bar dataKey="total" name="Cliques" radius={[4,4,0,0]}
                    fill="#6366f1" fillOpacity={0.85}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Por página */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calendar size={15} className="text-violet-500"/>
                <p className="font-bold text-slate-700 text-sm">Por página</p>
              </div>
              {byPageData.length === 0 ? (
                <p className="text-sm text-slate-300 text-center py-8">Sem dados</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {byPageData.map(p => (
                    <div key={p.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-600">{p.name}</span>
                        <span className="text-xs font-black text-slate-800">{p.value}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width:`${Math.round(p.value/total*100)}%`, background: p.color }}/>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{Math.round(p.value/total*100)}% do total</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Gráfico de barras empilhadas + total por dia últimos 7 */}
          {byDay.length > 0 && (
            <div className="grid grid-cols-[1fr_280px] gap-6">
              {/* Barras empilhadas */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-5">
                  <BarChart2 size={15} className="text-violet-500"/>
                  <div>
                    <p className="font-bold text-slate-700 text-sm">Cliques por plataforma ao longo do tempo</p>
                    <p className="text-xs text-slate-400">Barras empilhadas por canal</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={byDay} margin={{ top:0, right:5, bottom:0, left:-20 }} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                    <XAxis dataKey="date" tick={{ fontSize:10, fill:'#94a3b8' }} tickLine={false} axisLine={false}/>
                    <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} tickLine={false} axisLine={false}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Legend wrapperStyle={{ fontSize:11, paddingTop:12 }}/>
                    {Object.entries(PLATFORM_CFG).map(([k,v]) => (
                      <Bar key={k} dataKey={k} name={v.label} stackId="a"
                        fill={v.color} radius={k==='clo'?[4,4,0,0]:[0,0,0,0]}/>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Total por dia — últimos 7 dias */}
              {(() => {
                const last7 = []
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
                  const dateStr = fmtDate(d)
                  const found = byDay.find(x => x.date === dateStr)
                  last7.push({ date: dateStr, total: found?.total || 0 })
                }
                const maxT = Math.max(...last7.map(d => d.total), 1)
                return (
                  <div className="card p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Calendar size={15} className="text-violet-500"/>
                      <div>
                        <p className="font-bold text-slate-700 text-sm">Total por dia</p>
                        <p className="text-xs text-slate-400">Últimos 7 dias</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {last7.map(d => (
                        <div key={d.date} className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-slate-500 w-10 shrink-0">{d.date}</span>
                          <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-violet-400 transition-all flex items-center justify-end pr-1.5"
                              style={{ width: `${Math.round(d.total/maxT*100)}%`, minWidth: d.total > 0 ? '28px' : '0' }}>
                              {d.total > 0 && <span className="text-[9px] font-black text-white">{d.total}</span>}
                            </div>
                          </div>
                          {d.total === 0 && <span className="text-[10px] text-slate-300">0</span>}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Total 7 dias</span>
                      <span className="text-sm font-black text-violet-600">{last7.reduce((a,d)=>a+d.total,0)}</span>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ══ ABA: PRODUTOS ═════════════════════════════════════ */}
      {activeTab === 'produtos' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <TrendingUp size={15} className="text-violet-500"/>
            <span className="font-bold text-slate-700 text-sm">Top produtos por interesse</span>
            <span className="text-xs text-slate-400">{byProduct.length} produtos</span>
            <div className="ml-auto flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <Search size={12} className="text-slate-400 shrink-0"/>
              <input className="bg-transparent outline-none text-xs text-slate-700 w-40 placeholder:text-slate-400"
                placeholder="Buscar produto..." value={searchProd} onChange={e => setSearchProd(e.target.value)}/>
              {searchProd && <button onClick={() => setSearchProd('')} className="text-slate-400 hover:text-slate-600"><X size={11}/></button>}
            </div>
          </div>

          {/* Gráfico de barras horizontais top 10 */}
          {byProduct.length > 0 && (
            <div className="p-5 border-b border-slate-50">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Top 10 produtos</p>
              <ResponsiveContainer width="100%" height={Math.min(byProduct.slice(0,10).length * 40, 400)}>
                <BarChart data={byProduct.slice(0,10)} layout="vertical"
                  margin={{ top:0, right:40, bottom:0, left:0 }} barSize={12}>
                  <XAxis type="number" tick={{ fontSize:10, fill:'#94a3b8' }} tickLine={false} axisLine={false}/>
                  <YAxis type="category" dataKey="name" width={180}
                    tick={{ fontSize:10, fill:'#64748b', fontWeight:600 }} tickLine={false} axisLine={false}
                    tickFormatter={v => v.length > 24 ? v.slice(0,24)+'…' : v}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Bar dataKey="total" name="Total" radius={[0,6,6,0]}
                    fill="#6366f1" fillOpacity={0.85}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabela detalhada */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {byProduct
              .filter(p => !searchProd || p.name.toLowerCase().includes(searchProd.toLowerCase()))
              .map((prod, i) => (
                <div key={prod.name} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50">
                  <span className="text-sm font-black text-slate-300 w-6 text-center shrink-0">{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{prod.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {Object.entries(PLATFORM_CFG).map(([k,v]) => prod[k] > 0 && (
                        <span key={k} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: v.color+'18', color: v.color }}>
                          {v.emoji} {prod[k]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-slate-800">{prod.total}</p>
                    <p className="text-[10px] text-slate-400">cliques</p>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ══ ABA: FEED AO VIVO ════════════════════════════════ */}
      {activeTab === 'feed' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <ShoppingBag size={15} className="text-violet-500"/>
            <span className="font-bold text-slate-700 text-sm">Cliques recentes</span>
            <span className="text-xs text-slate-400">{filtered.length} registros</span>
            <div className="ml-auto flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <Search size={12} className="text-slate-400 shrink-0"/>
              <input className="bg-transparent outline-none text-xs text-slate-700 w-40 placeholder:text-slate-400"
                placeholder="Buscar produto..." value={searchFeed} onChange={e => setSearchFeed(e.target.value)}/>
              {searchFeed && <button onClick={() => setSearchFeed('')} className="text-slate-400 hover:text-slate-600"><X size={11}/></button>}
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-50">
            {[...filtered]
              .reverse()
              .filter(c => !searchFeed || c.product_name.toLowerCase().includes(searchFeed.toLowerCase()))
              .map(c => {
                const plat = PLATFORM_CFG[c.page==='clo'?'clo':c.platform] || PLATFORM_CFG.whatsapp
                const pageLabel = { home:'Home', plp:'Listagem', pdp:'Produto', clo:'Clô' }[c.page] || c.page
                const dt = new Date(c.clicked_at)
                return (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0"
                      style={{ background: plat.color + '18' }}>
                      {plat.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{c.product_name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        <span style={{ color: plat.color, fontWeight:700 }}>{plat.label}</span>
                        {' · '}{pageLabel}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-slate-600">
                        {dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                      </p>
                    </div>
                  </div>
                )
              })
            }
          </div>
        </div>
      )}
    </div>
  )
}