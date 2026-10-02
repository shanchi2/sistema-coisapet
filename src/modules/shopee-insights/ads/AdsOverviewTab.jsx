import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
import {
  DollarSign, ShoppingBag, Target, Percent, MousePointerClick, Eye, Receipt, PieChart,
  Wallet, AlertTriangle, CheckCircle2, Info, Loader2, Clock, ChevronRight, Zap, Activity,
} from 'lucide-react'
import { useShopeeAds } from '../hooks/useShopeeAds'
import {
  derive, pctChange, fmtMoney, fmtNum, fmtPct, fmtRoas, fmtDayShort, todayISO, addDays,
  KpiCard, ChartTooltip, Legend, HELP, COLOR_SPEND, COLOR_SALES, campaignStatusCfg,
} from './adsUtils'
import { InfoTooltip } from '../../ml-insights/InfoTooltip'

// Alertas montados só com o que os números mostram de verdade — nada de
// "dica genérica". Cada um diz o porquê e onde agir.
function buildAlerts({ balance, totals, campaigns, settings, avgDailySpend }) {
  const out = []
  const bal = balance?.total_balance
  if (bal != null) {
    const runway = avgDailySpend > 0 ? bal / avgDailySpend : null
    if (bal <= 0) {
      out.push({ level: balance.auto_top_up ? 'info' : 'critical', title: 'Saldo de Ads zerado',
        text: balance.auto_top_up
          ? 'A recarga automática está ligada — a Shopee deve cobrar sozinha quando precisar.'
          : 'Recarga automática DESLIGADA — sem saldo os anúncios param de rodar. Recarregue no Seller Center e lance a recarga na aba Créditos.',
        tab: 'creditos' })
    } else if (settings?.low_balance_threshold != null && bal < Number(settings.low_balance_threshold)) {
      out.push({ level: 'warning', title: `Saldo abaixo do limite (${fmtMoney(settings.low_balance_threshold)})`,
        text: runway != null ? `No ritmo dos últimos 7 dias o saldo dura ~${fmtNum(runway, 1)} dia(s).` : 'Recarregue antes de os anúncios pararem.', tab: 'creditos' })
    } else if (runway != null && runway < 3 && !balance.auto_top_up) {
      out.push({ level: 'warning', title: `Saldo dura só ~${fmtNum(runway, 1)} dia(s)`, text: 'Pelo gasto médio dos últimos 7 dias.', tab: 'creditos' })
    }
  }
  const noSales = campaigns.filter(c => c.totals.expense >= 10 && c.totals.broad_gmv === 0)
  if (noSales.length) {
    const lost = noSales.reduce((s, c) => s + c.totals.expense, 0)
    out.push({ level: 'warning', title: `${noSales.length} campanha(s) gastando sem vender`,
      text: `${fmtMoney(lost)} gastos no período sem nenhuma venda atribuída: ${noSales.slice(0, 3).map(c => c.name).join(' · ')}${noSales.length > 3 ? '…' : ''}`, tab: 'campanhas' })
  }
  const target = settings?.target_roas != null ? Number(settings.target_roas) : null
  if (target) {
    const below = campaigns.filter(c => c.totals.expense >= 10 && c.totals.broad_gmv > 0 && c.totals.broad_gmv / c.totals.expense < target)
    if (below.length) out.push({ level: 'info', title: `${below.length} campanha(s) com ROAS abaixo da meta (${fmtRoas(target)})`,
      text: 'Vale revisar orçamento ou ROAS alvo — veja a coluna ROAS na aba Campanhas.', tab: 'campanhas' })
  }
  const capped = campaigns.filter(c => c.status === 'ongoing' && c.budget > 0 && c.daily.length && c.daily.slice(-3).filter(d => d.expense >= c.budget * 0.95).length >= 2)
  if (capped.length) {
    out.push({ level: 'good', title: `${capped.length} campanha(s) batendo o orçamento diário`,
      text: `Gastaram o orçamento inteiro em 2 dos últimos 3 dias — se o ROAS está bom, aumentar o orçamento pode trazer mais vendas: ${capped.slice(0, 3).map(c => c.name).join(' · ')}`, tab: 'campanhas' })
  }
  const r = totals?.broad_gmv && totals.expense ? totals.broad_gmv / totals.expense : null
  if (r != null && target && r >= target * 1.5) {
    out.push({ level: 'good', title: `ROAS geral excelente (${fmtRoas(r)})`, text: `Bem acima da meta de ${fmtRoas(target)} — há espaço pra investir mais.` })
  }
  return out
}

const ALERT_STYLE = {
  critical: { box: 'bg-rose-50 border-rose-200', icon: AlertTriangle, ic: 'text-rose-600', t: 'text-rose-800' },
  warning:  { box: 'bg-amber-50 border-amber-200', icon: AlertTriangle, ic: 'text-amber-600', t: 'text-amber-800' },
  info:     { box: 'bg-sky-50 border-sky-200', icon: Info, ic: 'text-sky-600', t: 'text-sky-800' },
  good:     { box: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2, ic: 'text-emerald-600', t: 'text-emerald-800' },
}

function FunnelStep({ label, value, rate, rateLabel, width, color }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="text-slate-800 font-bold">{fmtNum(value)}</span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(width, 1.5), 100)}%`, background: color }}/>
      </div>
      {rateLabel && <p className="text-[11px] text-slate-400">{rateLabel}: <span className="font-semibold text-slate-600">{fmtPct(rate, 2)}</span></p>}
    </div>
  )
}

function HourlyCard() {
  const { fetchShopHourly } = useShopeeAds()
  const [day, setDay] = useState('today')
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const date = day === 'today' ? todayISO() : addDays(todayISO(), -1)

  useEffect(() => {
    setLoading(true)
    fetchShopHourly(date).then(setRows).catch(() => setRows([])).finally(() => setLoading(false))
  }, [date, fetchShopHourly])

  const data = useMemo(() => Array.from({ length: 24 }, (_, h) => {
    const r = (rows || []).find(x => Number(x.hour) === h)
    return { hour: `${String(h).padStart(2, '0')}h`, expense: r?.expense || 0, gmv: r?.broad_gmv || 0, orders: r?.broad_order || 0 }
  }), [rows])
  const best = [...data].sort((a, b) => b.gmv - a.gmv)[0]

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-1.5">
          <Clock size={15} className="text-slate-400"/>
          <p className="text-sm font-semibold text-slate-700">Gasto × vendas por hora</p>
          <InfoTooltip source="nosso" text="Mostra em que horários os anúncios gastam e vendem. Útil pra entender os picos do dia."/>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {[['today', 'Hoje'], ['yesterday', 'Ontem']].map(([k, l]) => (
            <button key={k} onClick={() => setDay(k)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md ${day === k ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
      </div>
      <Legend items={[{ label: 'Gasto', color: COLOR_SPEND }, { label: 'Vendas por Ads', color: COLOR_SALES }]}/>
      <div className="h-56 mt-2">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-300"><Loader2 className="animate-spin"/></div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9"/>
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={2}/>
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={48} tickFormatter={v => `R$${fmtNum(v)}`}/>
              <Tooltip content={<ChartTooltip/>} cursor={{ fill: '#F8FAFC' }}/>
              <Bar dataKey="expense" name="Gasto" fill={COLOR_SPEND} radius={[4, 4, 0, 0]} maxBarSize={10}/>
              <Bar dataKey="gmv" name="Vendas por Ads" fill={COLOR_SALES} radius={[4, 4, 0, 0]} maxBarSize={10}/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {!loading && best?.gmv > 0 && (
        <p className="text-xs text-slate-500 mt-2">Melhor hora: <span className="font-semibold text-slate-700">{best.hour}</span> — {fmtMoney(best.gmv)} em vendas ({fmtNum(best.orders)} pedido{best.orders === 1 ? '' : 's'}).</p>
      )}
    </div>
  )
}

export function AdsOverviewTab({ dash, camp, revenue, settings, range, onOpenTab }) {
  const cur = derive(dash.totals)
  const prev = derive(dash.prev_totals)
  const campaigns = camp?.campaigns || []
  const target = settings?.target_roas != null ? Number(settings.target_roas) : null

  // Gasto médio dos últimos 7 dias com dado (pra previsão do saldo)
  const last7 = dash.daily.slice(-7)
  const avgDailySpend = last7.length ? last7.reduce((s, d) => s + d.expense, 0) / last7.length : 0
  const runway = dash.balance?.total_balance != null && avgDailySpend > 0 ? dash.balance.total_balance / avgDailySpend : null
  const dailyBudget = campaigns.filter(c => c.status === 'ongoing').reduce((s, c) => s + (Number(c.budget) || 0), 0)

  const adsShare = revenue?.total > 0 ? cur.broad_gmv / revenue.total : null
  const alerts = buildAlerts({ balance: dash.balance, totals: dash.totals, campaigns, settings, avgDailySpend })

  const daily = dash.daily.map(d => ({
    ...d, label: fmtDayShort(d.date),
    roas: d.expense > 0 ? d.broad_gmv / d.expense : null,
  }))
  const singleDay = range.start === range.end

  const top = [...campaigns].filter(c => c.totals.expense > 0).sort((a, b) => b.totals.expense - a.totals.expense).slice(0, 6)

  return (
    <div className="space-y-5">
      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {alerts.map((a, i) => {
            const st = ALERT_STYLE[a.level]
            const Icon = st.icon
            return (
              <div key={i} className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${st.box}`}>
                <Icon size={17} className={`shrink-0 mt-0.5 ${st.ic}`}/>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${st.t}`}>{a.title}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{a.text}</p>
                </div>
                {a.tab && (
                  <button onClick={() => onOpenTab(a.tab)} className="text-xs font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center shrink-0">
                    Ver <ChevronRight size={13}/>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Saldo + orçamento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button onClick={() => onOpenTab('creditos')} className="text-left bg-white border border-slate-200 hover:border-orange-200 rounded-2xl p-4 transition-colors">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-6 h-6 rounded-md flex items-center justify-center bg-orange-50 text-orange-600"><Wallet size={13}/></span>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Saldo de Ads</p>
          </div>
          <p className={`text-xl font-bold ${dash.balance?.total_balance <= 0 ? 'text-rose-600' : 'text-slate-800'}`}>{fmtMoney(dash.balance?.total_balance)}</p>
          <p className="text-xs text-slate-400 mt-1">
            Recarga automática: <span className={`font-semibold ${dash.balance?.auto_top_up ? 'text-emerald-600' : 'text-slate-600'}`}>{dash.balance?.auto_top_up == null ? '—' : dash.balance.auto_top_up ? 'ligada' : 'desligada'}</span>
          </p>
        </button>
        <KpiCard icon={Activity} tone="violet" label="Gasto médio / dia (7d)" value={fmtMoney(avgDailySpend)} help={HELP.runway}
          sub={runway != null ? `saldo dura ~${fmtNum(runway, 1)} dia(s)` : null}/>
        <KpiCard icon={Zap} tone="amber" label="Orçamento diário ativo" value={fmtMoney(dailyBudget)} help={HELP.budget_daily}
          sub={`${campaigns.filter(c => c.status === 'ongoing').length} campanha(s) em andamento`}/>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon={DollarSign} tone="orange" label="Gasto" value={fmtMoney(cur.expense)} help={HELP.expense} change={pctChange(cur.expense, prev.expense)} invertChange/>
        <KpiCard icon={ShoppingBag} tone="sky" label="Vendas por Ads" value={fmtMoney(cur.broad_gmv)} help={HELP.gmv} change={pctChange(cur.broad_gmv, prev.broad_gmv)}
          sub={`diretas ${fmtMoney(cur.direct_gmv)}`}/>
        <KpiCard icon={Target} tone="emerald" label="ROAS" value={fmtRoas(cur.roas)} help={HELP.roas} change={pctChange(cur.roas, prev.roas)}
          sub={target ? `meta ${fmtRoas(target)}` : null}/>
        <KpiCard icon={Percent} tone="rose" label="ACOS" value={fmtPct(cur.acos)} help={HELP.acos} change={pctChange(cur.acos, prev.acos)} invertChange
          sub={settings?.max_acos != null ? `máx. ${fmtNum(settings.max_acos, 1)}%` : null}/>
        <KpiCard icon={Receipt} tone="violet" label="Pedidos" value={fmtNum(cur.broad_order)} help={HELP.orders} change={pctChange(cur.broad_order, prev.broad_order)}
          sub={`${fmtNum(cur.broad_item_sold)} itens`}/>
        <KpiCard icon={PieChart} tone="slate" label="% do faturamento" value={fmtPct(adsShare)} help={HELP.ads_share}
          sub={revenue ? `de ${fmtMoney(revenue.total)} na Shopee` : null}/>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon={Eye} label="Impressões" value={fmtNum(cur.impression)} help={HELP.impression} change={pctChange(cur.impression, prev.impression)}/>
        <KpiCard icon={MousePointerClick} label="Cliques" value={fmtNum(cur.clicks)} help={HELP.clicks} change={pctChange(cur.clicks, prev.clicks)}/>
        <KpiCard label="CTR" value={fmtPct(cur.ctr, 2)} help={HELP.ctr} change={pctChange(cur.ctr, prev.ctr)}/>
        <KpiCard label="CPC médio" value={fmtMoney(cur.cpc)} help={HELP.cpc} change={pctChange(cur.cpc, prev.cpc)} invertChange/>
        <KpiCard label="Conversão" value={fmtPct(cur.conv_rate, 2)} help={HELP.conv_rate} change={pctChange(cur.conv_rate, prev.conv_rate)}/>
        <KpiCard label="Custo por pedido" value={fmtMoney(cur.cost_per_order)} help={HELP.cost_per_order} change={pctChange(cur.cost_per_order, prev.cost_per_order)} invertChange
          sub={cur.ticket ? `ticket ${fmtMoney(cur.ticket)}` : null}/>
      </div>

      {/* Gráficos diários */}
      {!singleDay && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <p className="text-sm font-semibold text-slate-700">Gasto × vendas por Ads, por dia</p>
              <Legend items={[{ label: 'Gasto', color: COLOR_SPEND }, { label: 'Vendas por Ads', color: COLOR_SALES }]}/>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9"/>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} minTickGap={12}/>
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => `R$${fmtNum(v)}`}/>
                  <Tooltip content={<ChartTooltip/>} cursor={{ fill: '#F8FAFC' }}/>
                  <Bar dataKey="expense" name="Gasto" fill={COLOR_SPEND} radius={[4, 4, 0, 0]} maxBarSize={14}/>
                  <Bar dataKey="broad_gmv" name="Vendas por Ads" fill={COLOR_SALES} radius={[4, 4, 0, 0]} maxBarSize={14}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-1.5 mb-2">
              <p className="text-sm font-semibold text-slate-700">ROAS por dia</p>
              <InfoTooltip source="nosso" text={`${HELP.roas}${target ? ` A linha tracejada é a nossa meta (${fmtRoas(target)}), configurável na aba Créditos.` : ''}`}/>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9"/>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} minTickGap={12}/>
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${fmtNum(v)}x`}/>
                  <Tooltip content={<ChartTooltip valueFormatter={fmtRoas}/>}/>
                  {target && <ReferenceLine y={target} stroke="#94A3B8" strokeDasharray="4 4"/>}
                  <Line type="monotone" dataKey="roas" name="ROAS" stroke={COLOR_SALES} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Funil */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-700">Funil dos anúncios</p>
            <InfoTooltip source="nosso" text="Quantas pessoas viram, clicaram e compraram. Mostra em que etapa estamos perdendo mais gente."/>
          </div>
          <FunnelStep label="Impressões" value={cur.impression} width={100} color="#CBD5E1"/>
          <FunnelStep label="Cliques" value={cur.clicks} width={cur.impression ? (cur.clicks / cur.impression) * 100 * 10 : 0} rate={cur.ctr} rateLabel="CTR" color={COLOR_SPEND}/>
          <FunnelStep label="Pedidos" value={cur.broad_order} width={cur.impression ? (cur.broad_order / cur.impression) * 100 * 100 : 0} rate={cur.conv_rate} rateLabel="Conversão" color={COLOR_SALES}/>
          <p className="text-[11px] text-slate-400">Barras em escala ampliada (cliques ×10, pedidos ×100) pra ficarem visíveis.</p>
        </div>
        <div className="xl:col-span-2"><HourlyCard/></div>
      </div>

      {/* Top campanhas */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Campanhas que mais gastaram no período</p>
          <button onClick={() => onOpenTab('campanhas')} className="text-xs font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center">Todas <ChevronRight size={13}/></button>
        </div>
        {top.length === 0 ? (
          <p className="text-sm text-slate-400 px-5 py-6">Nenhuma campanha com gasto no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-400">
                <tr>
                  <th className="text-left font-semibold px-5 py-2">Campanha</th>
                  <th className="text-right font-semibold px-3 py-2">Gasto</th>
                  <th className="text-right font-semibold px-3 py-2">Vendas</th>
                  <th className="text-right font-semibold px-3 py-2">ROAS</th>
                  <th className="text-right font-semibold px-5 py-2">Pedidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {top.map(c => {
                  const d = derive(c.totals)
                  const st = campaignStatusCfg(c.status)
                  const thumb = camp?.items?.[String(c.item_ids?.[0])]?.thumbnail
                  return (
                    <tr key={c.campaign_id} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {thumb ? <img src={thumb} alt="" className="w-8 h-8 rounded-md object-cover border border-slate-100 shrink-0"/> : <div className="w-8 h-8 rounded-md bg-slate-100 shrink-0"/>}
                          <span className="truncate max-w-[380px] text-slate-700">{c.name}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${st.badge}`}>{st.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{fmtMoney(d.expense)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{fmtMoney(d.broad_gmv)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${target && d.roas != null && d.roas < target ? 'text-rose-600' : 'text-emerald-700'}`}>{fmtRoas(d.roas)}</td>
                      <td className="px-5 py-2.5 text-right text-slate-700">{fmtNum(d.broad_order)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
