import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LayoutDashboard, RefreshCw, Loader2, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, Sparkles, ThermometerSun, HeartPulse, Megaphone, ArrowRight,
  MessageSquareWarning, ChevronDown, XCircle, Users,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { useMlInsights } from './hooks/useMlInsights'
import { ReputationThermometer } from './ReputationThermometer'

function fmtMoney(v) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtPct(v) {
  if (v == null) return null
  return `${Math.abs(v * 100).toFixed(0)}%`
}

function ChangeBadge({ pct }) {
  if (pct == null) return null
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? <TrendingUp size={12}/> : <TrendingDown size={12}/>} {fmtPct(pct)}
    </span>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="text-slate-500">{label}</p>
      <p className="font-semibold text-slate-800">{fmtMoney(payload[0].value)}</p>
    </div>
  )
}

const PERIODS = [
  { key: 7,  label: '7D'  },
  { key: 30, label: '30D' },
  { key: 90, label: '90D' },
]

export function MlAccountDashboardPage() {
  const { loading, error, fetchAccountDashboard, fetchClaimsByProduct } = useMlInsights()
  const [period, setPeriod] = useState(30)
  const [data, setData] = useState(null)
  const [claims, setClaims] = useState(null) // null = nunca escaneado
  const [showRawClaims, setShowRawClaims] = useState(false)

  const load = useCallback(() => {
    fetchAccountDashboard(period).then(setData).catch(() => {})
  }, [fetchAccountDashboard, period])

  useEffect(() => { load() }, [load])

  async function loadClaims() {
    try {
      const res = await fetchClaimsByProduct()
      setClaims(res)
    } catch { /* erro já fica em `error` do hook */ }
  }

  const rev = data?.revenue
  const rep = data?.reputation?.seller_reputation
  const maxCalendarStreak = data?.revenue?.calendar

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200">
              <LayoutDashboard size={22} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Visão Geral</h1>
              <p className="text-sm text-slate-500">Panorama da conta no Mercado Livre</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${period === p.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors shadow-sm">
              {loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-400"/></div>
        )}

        {data && (
          <>
            {/* Narrativa — a "conversa" com o usuário, em destaque */}
            {data.narrative && (
              <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-white border border-emerald-100 rounded-2xl p-5 flex items-start gap-3.5">
                <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
                  <Sparkles size={15} className="text-white"/>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 leading-relaxed">{data.narrative}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    Números direto da API de Pedidos do Mercado Livre (não do nosso banco) — batem com o painel real deles.
                  </p>
                </div>
              </div>
            )}

            {/* Receita — faixa de KPIs ocupando a largura toda */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1.5"><span className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center"><DollarSign size={13} className="text-emerald-600"/></span><p className="text-xs font-semibold text-slate-500 uppercase">Total</p></div>
                <p className="text-2xl font-bold text-slate-800">{fmtMoney(rev?.revenue)}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-slate-400">{rev?.units ?? 0} vendas</span>
                  <ChangeBadge pct={rev?.revenue_change_pct}/>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1.5"><span className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center"><Sparkles size={13} className="text-emerald-600"/></span><p className="text-xs font-semibold text-slate-500 uppercase">Orgânico</p></div>
                <p className="text-2xl font-bold text-emerald-600">{fmtMoney(data.organic_revenue)}</p>
                <p className="text-xs text-slate-400 mt-1.5">
                  {rev?.revenue && data.organic_revenue != null ? `${((data.organic_revenue / rev.revenue) * 100).toFixed(0)}% da receita` : 'Precisa de Ads'}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1.5"><span className="w-6 h-6 rounded-md bg-sky-100 flex items-center justify-center"><Megaphone size={13} className="text-sky-600"/></span><p className="text-xs font-semibold text-slate-500 uppercase">Ads</p></div>
                <p className="text-2xl font-bold text-sky-600">{data.ads?.available ? fmtMoney(data.ads.ads_revenue) : '—'}</p>
                <p className="text-xs text-slate-400 mt-1.5 truncate">{data.ads?.available ? `Investido: ${fmtMoney(data.ads.cost)}` : (data.ads?.reason || data.ads?.error || 'Sem dado')}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1.5"><span className="w-6 h-6 rounded-md bg-rose-100 flex items-center justify-center"><XCircle size={13} className="text-rose-600"/></span><p className="text-xs font-semibold text-slate-500 uppercase">Canceladas</p></div>
                <p className="text-2xl font-bold text-rose-600">{rev?.cancelled_count ?? 0}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1.5"><span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center"><Users size={13} className="text-slate-500"/></span><p className="text-xs font-semibold text-slate-500 uppercase">Compradores</p></div>
                <p className="text-2xl font-bold text-slate-800">{rev?.distinct_buyers ?? 0}</p>
              </div>
            </div>

            {/* Grid principal: tendências (esquerda, mais larga) + reputação/saúde (direita) */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">

              {/* Coluna principal */}
              <div className="xl:col-span-2 space-y-4">
                {/* Evolução da receita */}
                {rev?.daily?.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Evolução da receita</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={rev.daily} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity={0.3}/>
                            <stop offset="100%" stopColor="#10B981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={d => d?.slice(5)}/>
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}/>
                        <Tooltip content={<CustomTooltip/>}/>
                        <Area type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} fill="url(#revGrad)"/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Padrão por dia da semana */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Vendas por dia da semana</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={rev?.by_weekday || []} margin={{ top: 0, right: 0, bottom: 0, left: -20 }} barSize={20}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}/>
                        <Tooltip content={<CustomTooltip/>}/>
                        <Bar dataKey="revenue" fill="#10B981" radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Frequência de vendas */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Frequência de vendas (30 dias)</p>
                    <div className="grid grid-cols-10 gap-1.5">
                      {(maxCalendarStreak || []).map(d => (
                        <div key={d.date} title={d.date}
                          className={`aspect-square rounded ${d.has_sale ? 'bg-emerald-400' : 'bg-slate-100'}`}/>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top produtos */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Melhores produtos do período</p>
                  {rev?.top_products?.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {rev.top_products.map(p => (
                        <div key={p.sku || p.titulo} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">{p.titulo}</p>
                            {p.sku && <p className="text-xs font-mono text-slate-400">{p.sku}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-slate-800">{fmtMoney(p.revenue)}</p>
                            <p className="text-xs text-slate-400">{p.qty} vendidos</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-slate-400">Sem vendas nesse período.</p>}
                </div>

                {/* Reclamações por produto */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Reclamações por produto</p>
                    <button onClick={loadClaims} disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                      {loading ? <Loader2 size={13} className="animate-spin"/> : <MessageSquareWarning size={13}/>}
                      Analisar Reclamações
                    </button>
                  </div>
                  {claims === null ? (
                    <p className="text-sm text-slate-400">Endpoint novo, ainda não testado ao vivo — clique pra buscar (pode precisar de ajuste se o formato não bater).</p>
                  ) : !claims.available ? (
                    <p className="text-sm text-rose-600">{claims.error || 'Não foi possível buscar reclamações.'}</p>
                  ) : claims.results.length === 0 ? (
                    <p className="text-sm text-emerald-600">Nenhuma reclamação em disputa encontrada 🎉</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {claims.results.map(c => (
                        <div key={c.sku} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
                          <p className="text-sm font-mono text-slate-700">{c.sku}</p>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {Object.entries(c.reasons).map(([reason, count]) => (
                              <span key={reason} className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">{reason}: {count}</span>
                            ))}
                            <span className="text-sm font-bold text-slate-800">{c.total} total</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {claims?.raw_sample && (
                    <>
                      <button onClick={() => setShowRawClaims(s => !s)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mt-3">
                        <ChevronDown size={12} className={showRawClaims ? 'rotate-180' : ''}/> ver dados brutos (amostra)
                      </button>
                      {showRawClaims && <pre className="text-[10px] bg-slate-900 text-slate-200 rounded-lg p-3 mt-2 overflow-x-auto">{JSON.stringify(claims.raw_sample, null, 2)}</pre>}
                    </>
                  )}
                </div>
              </div>

              {/* Coluna lateral: reputação + saúde */}
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3"><ThermometerSun size={14} className="text-slate-400"/><p className="text-xs font-semibold text-slate-500 uppercase">Reputação ML</p></div>
                  <ReputationThermometer levelId={rep?.level_id}/>
                  {rep?.metrics?.cancellations?.rate != null && (
                    <p className="text-xs text-slate-500 mt-2">Cancelamentos: {(rep.metrics.cancellations.rate * 100).toFixed(1)}%</p>
                  )}
                </div>

                <Link to="/ml/saude" className="block bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-5 transition-colors group">
                  <div className="flex items-center gap-2 mb-2"><HeartPulse size={14} className="text-slate-400"/><p className="text-xs font-semibold text-slate-500 uppercase">Saúde dos anúncios</p></div>
                  <p className="text-sm text-slate-500 mb-3 leading-relaxed">O diagnóstico completo, anúncio por anúncio, fica na tela dedicada — não repetimos aqui pra não sobrecarregar a API a cada abertura desse painel.</p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 group-hover:text-emerald-700">
                    Ver Saúde dos Anúncios <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform"/>
                  </span>
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
