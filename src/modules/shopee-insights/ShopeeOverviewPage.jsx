import { useCallback, useEffect, useState } from 'react'
import {
  LayoutDashboard, RefreshCw, Loader2, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, XCircle, Users, Link2, Unlink, PackageCheck,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { useShopeeInsights } from './hooks/useShopeeInsights'

const SHOPEE_ORANGE = '#EE4D2D'

function fmtMoney(v) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtPct(v) {
  if (v == null) return null
  return `${Math.abs(v * 100).toFixed(0)}%`
}
function fmtDateTime(d) {
  if (!d) return null
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
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

export function ShopeeOverviewPage() {
  const { loading, error, fetchConnectionStatus, fetchOverview } = useShopeeInsights()
  const [period, setPeriod] = useState(30)
  const [data, setData]     = useState(null)
  const [status, setStatus] = useState(null)

  const load = useCallback(() => {
    fetchConnectionStatus().then(setStatus).catch(() => {})
    fetchOverview(period).then(setData).catch(() => {})
  }, [fetchConnectionStatus, fetchOverview, period])

  useEffect(() => { load() }, [load])

  const rev = data?.revenue

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: `linear-gradient(135deg, ${SHOPEE_ORANGE}, #D6431F)`, boxShadow: `0 2px 10px ${SHOPEE_ORANGE}40` }}>
              <LayoutDashboard size={22} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Visão Geral</h1>
              <p className="text-sm text-slate-500">Panorama da conta na Shopee</p>
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
              className="flex items-center gap-2 px-3 py-2 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors shadow-sm"
              style={{ background: SHOPEE_ORANGE }}>
              {loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {/* Conexão — informação que o painel do ML nem mostra aqui, útil
            enquanto ainda estamos em sandbox (deixa claro que os números
            abaixo são só da loja de teste, não da loja real). */}
        {status && (
          <div className="flex items-center gap-2 text-xs font-semibold rounded-xl px-4 py-3"
            style={status.connected
              ? { background: `${SHOPEE_ORANGE}14`, color: SHOPEE_ORANGE }
              : { background: '#FEF2F2', color: '#B91C1C' }}>
            {status.connected ? <Link2 size={14}/> : <Unlink size={14}/>}
            {status.connected
              ? <>Shopee conectada{status.is_sandbox ? ' — ambiente de teste (sandbox)' : ''}{status.shop_name ? `: ${status.shop_name}` : ''}{status.last_sync_at ? ` · última venda recebida ${fmtDateTime(status.last_sync_at)}` : ''}</>
              : 'Shopee não conectada — os números abaixo vão ficar zerados até conectar em Pedidos.'}
          </div>
        )}

        {loading && !data && (
          <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-400"/></div>
        )}

        {data && (
          <>
            {/* Receita — faixa de KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1.5"><span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `${SHOPEE_ORANGE}1A` }}><DollarSign size={13} style={{ color: SHOPEE_ORANGE }}/></span><p className="text-xs font-semibold text-slate-500 uppercase">Total</p></div>
                <p className="text-2xl font-bold text-slate-800">{fmtMoney(rev?.revenue)}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-slate-400">{rev?.order_count ?? 0} pedidos</span>
                  <ChangeBadge pct={rev?.revenue_change_pct}/>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1.5"><span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center"><PackageCheck size={13} className="text-slate-500"/></span><p className="text-xs font-semibold text-slate-500 uppercase">Itens vendidos</p></div>
                <p className="text-2xl font-bold text-slate-800">{rev?.units ?? 0}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1.5"><span className="w-6 h-6 rounded-md bg-rose-100 flex items-center justify-center"><XCircle size={13} className="text-rose-600"/></span><p className="text-xs font-semibold text-slate-500 uppercase">Cancelados</p></div>
                <p className="text-2xl font-bold text-rose-600">{rev?.cancelled_count ?? 0}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1.5"><span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center"><Users size={13} className="text-slate-500"/></span><p className="text-xs font-semibold text-slate-500 uppercase">Compradores</p></div>
                <p className="text-2xl font-bold text-slate-800">{rev?.distinct_buyers ?? 0}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
              <div className="xl:col-span-2 space-y-4">
                {rev?.daily?.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Evolução da receita</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={rev.daily} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                        <defs>
                          <linearGradient id="shopeeRevGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={SHOPEE_ORANGE} stopOpacity={0.3}/>
                            <stop offset="100%" stopColor={SHOPEE_ORANGE} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={d => d?.slice(5)}/>
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}/>
                        <Tooltip content={<CustomTooltip/>}/>
                        <Area type="monotone" dataKey="revenue" stroke={SHOPEE_ORANGE} strokeWidth={2} fill="url(#shopeeRevGrad)"/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Vendas por dia da semana</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={rev?.by_weekday || []} margin={{ top: 0, right: 0, bottom: 0, left: -20 }} barSize={20}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}/>
                        <Tooltip content={<CustomTooltip/>}/>
                        <Bar dataKey="revenue" fill={SHOPEE_ORANGE} radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Frequência de vendas</p>
                    <div className="grid grid-cols-10 gap-1.5">
                      {(rev?.calendar || []).map(d => (
                        <div key={d.date} title={d.date}
                          className="aspect-square rounded"
                          style={{ background: d.has_sale ? SHOPEE_ORANGE : '#F1F5F9' }}/>
                      ))}
                    </div>
                  </div>
                </div>

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
              </div>

              {/* Coluna lateral */}
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Sobre esses números</p>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Calculado direto dos pedidos já sincronizados no nosso banco (não bate na API da Shopee de novo a cada abertura) —
                    reflete o que chega em tempo real desde que a conexão foi ligada.
                  </p>
                </div>

                <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Em breve</p>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Saúde da loja e Ads da Shopee ainda não foram construídos aqui — os endpoints exatos precisam ser
                    confirmados contra a documentação oficial antes (mesmo cuidado que já tomamos com o resto da
                    integração), fica pra próxima fase.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
