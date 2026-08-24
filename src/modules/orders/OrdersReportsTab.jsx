import { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  RefreshCw, Search, X, TrendingUp, Activity,
  DollarSign, BarChart2,
} from 'lucide-react'
import { useOrdersReports } from './hooks/useOrdersReports'

// ── Config de plataforma — usada em TODOS os gráficos, inclusive manual ──
const PLATFORM_CFG = {
  ml:     { label: 'Mercado Livre', color: '#f59e0b', emoji: '🛒' },
  shopee: { label: 'Shopee',        color: '#EE4D2D', emoji: '🛍️' },
  manual: { label: 'Manual',        color: '#64748b', emoji: '✍️' },
}

const PERIODS = [
  { label: '7 dias',   days: 7   },
  { label: '30 dias',  days: 30  },
  { label: '90 dias',  days: 90  },
  { label: '12 meses', days: 365 },
]

function fmtPreco(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDateShort(iso) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// ── Tooltip customizado (mesmo padrão do Analytics do Site) ─────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-1">{typeof label === 'string' && label.includes('-') ? fmtDateShort(label) : label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs font-bold" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export function OrdersReportsTab() {
  const { report, loading, fetchReport } = useOrdersReports()
  const [rangeDays, setRangeDays]   = useState(30)
  const [activeTab, setActiveTab]   = useState('overview') // overview | produtos
  const [searchProd, setSearchProd] = useState('')

  useEffect(() => { fetchReport({ days: rangeDays }) }, [rangeDays, fetchReport])

  if (loading && !report) {
    return (
      <div className="card flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
      </div>
    )
  }
  if (!report) return null

  const platPie = Object.entries(PLATFORM_CFG).map(([k, v]) => ({
    key: k, name: v.label, value: report.platformMap[k]?.orders || 0, color: v.color, emoji: v.emoji,
  })).filter(p => p.value > 0)

  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: Activity },
    { id: 'produtos',  label: 'Produtos',    icon: TrendingUp },
  ]

  return (
    <div className="flex flex-col gap-6">

      {/* Filtros de período + atualizar */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setRangeDays(p.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                rangeDays === p.days ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={() => fetchReport({ days: rangeDays })} disabled={loading}
          className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* KPIs — Total + cada plataforma (manual incluída) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-2xl">📦</div>
          <div>
            <p className="text-xs text-slate-400 font-semibold">Total pedidos</p>
            <p className="text-3xl font-black text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>{report.totalOrders}</p>
          </div>
        </div>
        {Object.entries(PLATFORM_CFG).map(([k, v]) => (
          <div key={k} className="card p-5 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ background: v.color + '18' }}>{v.emoji}</div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">{v.label}</p>
              <p className="text-3xl font-black text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>
                {report.platformMap[k]?.orders || 0}
              </p>
              {report.totalOrders > 0 && (
                <p className="text-[10px] text-slate-400">
                  {Math.round(((report.platformMap[k]?.orders || 0) / report.totalOrders) * 100)}%
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Faturamento + ticket médio — linha secundária, com aviso de cobertura parcial */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <DollarSign size={22} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-semibold">Faturamento conhecido*</p>
            <p className="text-2xl font-black text-emerald-700" style={{ fontFamily: 'Nunito,sans-serif' }}>{fmtPreco(report.revenueKnown)}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
            <TrendingUp size={22} className="text-violet-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-semibold">Ticket médio*</p>
            <p className="text-2xl font-black text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>{fmtPreco(report.avgTicket)}</p>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 -mt-3">
        * Calculado só com itens que têm preço unitário salvo — hoje cobre majoritariamente o Mercado Livre,
        já que o relatório da Shopee não traz preço por item.
      </p>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon size={13} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ══ ABA: VISÃO GERAL ══════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">

          {/* Evolução (área empilhada) + Pizza */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="font-bold text-slate-700 text-sm">Evolução de pedidos</p>
                  <p className="text-xs text-slate-400 mt-0.5">Pedidos por dia, por plataforma</p>
                </div>
                {report.peakDay && (
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Dia de pico</p>
                    <p className="text-sm font-black text-violet-600">{fmtDateShort(report.peakDay.date)}</p>
                  </div>
                )}
              </div>
              {report.salesByDay.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-300">
                  <p className="text-sm">Sem pedidos no período</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={report.salesByDay} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <defs>
                      {Object.entries(PLATFORM_CFG).map(([k, v]) => (
                        <linearGradient key={k} id={`grad-orders-${k}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={v.color} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={v.color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tickFormatter={fmtDateShort} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    {Object.entries(PLATFORM_CFG).map(([k, v]) => (
                      <Area key={k} type="monotone" dataKey={k} name={v.label}
                        stroke={v.color} strokeWidth={2} fill={`url(#grad-orders-${k})`} stackId="1" />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Pizza por plataforma */}
            <div className="card p-5">
              <p className="font-bold text-slate-700 text-sm mb-1">Por plataforma</p>
              <p className="text-xs text-slate-400 mb-4">Distribuição de pedidos no período</p>
              {platPie.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-slate-300">
                  <p className="text-sm">Sem dados</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={platPie} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                        {platPie.map(p => <Cell key={p.key} fill={p.color} stroke="none" />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]}
                        contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
                        labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2 mt-3">
                    {platPie.map(p => (
                      <div key={p.key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                          <span className="text-xs font-semibold text-slate-600">{p.emoji} {p.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-800">{p.value}</span>
                          <span className="text-[10px] text-slate-400">{Math.round((p.value / report.totalOrders) * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Itens vendidos por plataforma — barras */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-5">
              <BarChart2 size={15} className="text-violet-500" />
              <div>
                <p className="font-bold text-slate-700 text-sm">Itens vendidos por plataforma</p>
                <p className="text-xs text-slate-400">Unidades no período selecionado</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {Object.entries(PLATFORM_CFG).map(([k, v]) => {
                const val = report.platformMap[k]?.items || 0
                const max = Math.max(...Object.values(report.platformMap).map(p => p.items), 1)
                return (
                  <div key={k}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-600">{v.emoji} {v.label}</span>
                      <span className="text-xs font-black text-slate-800">{val}</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((val / max) * 100)}%`, background: v.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ ABA: PRODUTOS ═════════════════════════════════════ */}
      {activeTab === 'produtos' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <TrendingUp size={15} className="text-violet-500" />
            <span className="font-bold text-slate-700 text-sm">Produtos mais vendidos</span>
            <span className="text-xs text-slate-400">{report.topProducts.length} produtos</span>
            <div className="ml-auto flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <Search size={12} className="text-slate-400 shrink-0" />
              <input className="bg-transparent outline-none text-xs text-slate-700 w-40 placeholder:text-slate-400"
                placeholder="Buscar produto..." value={searchProd} onChange={e => setSearchProd(e.target.value)} />
              {searchProd && <button onClick={() => setSearchProd('')} className="text-slate-400 hover:text-slate-600"><X size={11} /></button>}
            </div>
          </div>

          {/* Top 10 — barras horizontais */}
          {report.topProducts.length > 0 && (
            <div className="p-5 border-b border-slate-50">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Top 10 (por unidades)</p>
              <ResponsiveContainer width="100%" height={Math.min(report.topProducts.slice(0, 10).length * 40, 400)}>
                <BarChart data={report.topProducts.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barSize={12}>
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="titulo" width={180}
                    tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false}
                    tickFormatter={v => v.length > 24 ? v.slice(0, 24) + '…' : v} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="qty" name="Unidades" radius={[0, 6, 6, 0]} fill="#6366f1" fillOpacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Lista detalhada, com badges de plataforma */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {report.topProducts.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-10">Sem vendas no período selecionado.</p>
            )}
            {report.topProducts
              .filter(p => !searchProd || p.titulo.toLowerCase().includes(searchProd.toLowerCase()))
              .map((prod, i) => (
                <div key={prod.sku || prod.titulo} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50">
                  <span className="text-sm font-black text-slate-300 w-6 text-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate" title={prod.titulo}>{prod.titulo}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {Object.entries(PLATFORM_CFG).map(([k, v]) => prod[k] > 0 && (
                        <span key={k} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: v.color + '18', color: v.color }}>
                          {v.emoji} {prod[k]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-slate-800">{prod.qty}</p>
                    <p className="text-[10px] text-slate-400">unidades</p>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}
