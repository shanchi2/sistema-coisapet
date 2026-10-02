import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { FileBarChart, Download, Loader2, History, CalendarDays } from 'lucide-react'
import { useShopeeAds } from '../hooks/useShopeeAds'
import { InfoTooltip } from '../../ml-insights/InfoTooltip'
import {
  derive, fmtMoney, fmtNum, fmtPct, fmtRoas, fmtDateTime, todayISO,
  ChartTooltip, Legend, HELP, COLOR_SPEND, COLOR_SALES, exportXlsx,
} from './adsUtils'

const RANGES = [
  { key: 3, label: '3 meses' },
  { key: 6, label: '6 meses' },
  { key: 12, label: '12 meses' },
]
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const ACTION_LABEL = {
  pause: 'Pausou', resume: 'Retomou', stop: 'Encerrou', start: 'Iniciou',
  change_budget: 'Mudou orçamento', change_roas_target: 'Mudou ROAS alvo', change_duration: 'Mudou período', edit_keywords: 'Editou palavras-chave',
}

const emptyTotals = () => ({ impression: 0, clicks: 0, expense: 0, broad_gmv: 0, direct_gmv: 0, broad_order: 0, direct_order: 0, broad_item_sold: 0, direct_item_sold: 0 })
function addTo(t, r) { Object.keys(t).forEach(k => { t[k] += r[k] || 0 }); return t }

export function AdsReportsTab() {
  const ads = useShopeeAds()
  const [months, setMonths] = useState(6)
  const [daily, setDaily] = useState(null)
  const [revenue, setRevenue] = useState(null)
  const [log, setLog] = useState([])
  const [error, setError] = useState(null)

  const today = todayISO()
  const start = useMemo(() => {
    const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - (months - 1))
    return d.toISOString().slice(0, 10)
  }, [months, today])

  useEffect(() => {
    setDaily(null); setRevenue(null); setError(null)
    ads.fetchShopDaily(start, today).then(setDaily).catch(e => { setError(e.message); setDaily([]) })
    ads.fetchShopeeRevenueByDay(start, today).then(setRevenue).catch(() => setRevenue(null))
  }, [start, today, ads.fetchShopDaily, ads.fetchShopeeRevenueByDay])
  useEffect(() => { ads.fetchActionsLog(null, 300).then(setLog).catch(() => {}) }, [ads.fetchActionsLog])

  const monthly = useMemo(() => {
    if (!daily) return []
    const map = {}
    daily.forEach(d => {
      const k = d.date.slice(0, 7)
      map[k] = map[k] || { ym: k, t: emptyTotals(), revenue: 0, days: 0 }
      addTo(map[k].t, d)
      if (d.expense > 0) map[k].days++
    })
    if (revenue?.byDay) Object.entries(revenue.byDay).forEach(([day, v]) => { const k = day.slice(0, 7); if (map[k]) map[k].revenue += v })
    return Object.values(map).sort((a, b) => a.ym.localeCompare(b.ym)).map(m => ({
      ...m, ...derive(m.t), label: `${MONTHS[Number(m.ym.slice(5, 7)) - 1]}/${m.ym.slice(2, 4)}`,
      share: m.revenue > 0 ? m.t.broad_gmv / m.revenue : null,
    }))
  }, [daily, revenue])

  const weekday = useMemo(() => {
    const arr = WEEKDAYS.map(l => ({ label: l, t: emptyTotals(), n: 0 }))
    ;(daily || []).filter(d => d.expense > 0).forEach(d => {
      const wd = new Date(`${d.date}T12:00:00Z`).getUTCDay()
      addTo(arr[wd].t, d); arr[wd].n++
    })
    return arr.map(w => ({ label: w.label, ...derive(w.t), avg_expense: w.n ? w.t.expense / w.n : 0, avg_gmv: w.n ? w.t.broad_gmv / w.n : 0 }))
  }, [daily])

  const total = derive((daily || []).reduce((t, d) => addTo(t, d), emptyTotals()))
  const totalShare = revenue?.total > 0 ? total.broad_gmv / revenue.total : null
  const bestWd = [...weekday].filter(w => w.roas != null).sort((a, b) => b.roas - a.roas)[0]

  const doExport = () => exportXlsx(`shopee-ads-relatorio_${start}_${today}.xlsx`, {
    'Por mês': monthly.map(m => ({
      Mês: m.label, Gasto: +m.expense.toFixed(2), 'Vendas Ads': +m.broad_gmv.toFixed(2), 'Vendas diretas': +m.direct_gmv.toFixed(2),
      ROAS: m.roas != null ? +m.roas.toFixed(2) : null, 'ACOS %': m.acos != null ? +(m.acos * 100).toFixed(2) : null,
      Pedidos: m.broad_order, Itens: m.broad_item_sold, Cliques: m.clicks, Impressões: m.impression,
      'CTR %': m.ctr != null ? +(m.ctr * 100).toFixed(2) : null, CPC: m.cpc != null ? +m.cpc.toFixed(2) : null,
      'Conversão %': m.conv_rate != null ? +(m.conv_rate * 100).toFixed(2) : null,
      'Faturamento Shopee': +m.revenue.toFixed(2), '% vindo de Ads': m.share != null ? +(m.share * 100).toFixed(1) : null,
    })),
    'Por dia': (daily || []).map(d => ({
      Data: d.date, Gasto: d.expense, 'Vendas Ads': d.broad_gmv, 'Vendas diretas': d.direct_gmv, Pedidos: d.broad_order,
      Cliques: d.clicks, Impressões: d.impression, 'Faturamento Shopee': revenue?.byDay?.[d.date] != null ? +revenue.byDay[d.date].toFixed(2) : null,
    })),
    'Dia da semana': weekday.map(w => ({ Dia: w.label, Gasto: +w.expense.toFixed(2), 'Vendas Ads': +w.broad_gmv.toFixed(2), ROAS: w.roas != null ? +w.roas.toFixed(2) : null, 'Gasto médio/dia': +w.avg_expense.toFixed(2), 'Venda média/dia': +w.avg_gmv.toFixed(2) })),
    'Alterações': log.map(l => ({ Quando: fmtDateTime(l.created_at), Campanha: l.campaign_id, Ação: ACTION_LABEL[l.action] || l.action, Detalhe: JSON.stringify(l.detail || {}), Usuário: l.user_name })),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setMonths(r.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${months === r.key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'}`}>{r.label}</button>
          ))}
        </div>
        <button onClick={doExport} disabled={!daily}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg disabled:opacity-50">
          <Download size={14}/> Exportar relatório completo (Excel)
        </button>
      </div>

      {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</p>}

      {daily == null ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-2"><Loader2 className="animate-spin" size={18}/> Montando relatório ({months} meses = {Math.ceil(months * 30.5 / 30)} consultas à Shopee)…</div>
      ) : (
        <>
          {/* Resumo do período */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              ['Gasto total', fmtMoney(total.expense), HELP.expense],
              ['Vendas por Ads', fmtMoney(total.broad_gmv), HELP.gmv],
              ['ROAS', fmtRoas(total.roas), HELP.roas],
              ['ACOS', fmtPct(total.acos), HELP.acos],
              ['Pedidos', fmtNum(total.broad_order), HELP.orders],
              ['% do faturamento', fmtPct(totalShare), HELP.ads_share],
            ].map(([l, v, h]) => (
              <div key={l} className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-1"><p className="text-[11px] font-semibold text-slate-500 uppercase">{l}</p><InfoTooltip source="nosso" text={h}/></div>
                <p className="text-xl font-bold text-slate-800 mt-1">{v}</p>
              </div>
            ))}
          </div>

          {/* Mensal */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div className="flex items-center gap-1.5"><FileBarChart size={15} className="text-slate-400"/><p className="text-sm font-semibold text-slate-700">Mês a mês</p></div>
              <Legend items={[{ label: 'Gasto', color: COLOR_SPEND }, { label: 'Vendas por Ads', color: COLOR_SALES }]}/>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9"/>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={60} tickFormatter={v => `R$${fmtNum(v)}`}/>
                  <Tooltip content={<ChartTooltip/>} cursor={{ fill: '#F8FAFC' }}/>
                  <Bar dataKey="expense" name="Gasto" fill={COLOR_SPEND} radius={[4, 4, 0, 0]} maxBarSize={22}/>
                  <Bar dataKey="broad_gmv" name="Vendas por Ads" fill={COLOR_SALES} radius={[4, 4, 0, 0]} maxBarSize={22}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm min-w-[980px]">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-400">
                  <tr>
                    {['Mês', 'Gasto', 'Vendas Ads', 'ROAS', 'ACOS', 'Pedidos', 'Cliques', 'CTR', 'CPC', 'Conversão', 'Fatur. Shopee', '% Ads', 'Dias c/ Ads'].map((h, i) => (
                      <th key={h} className={`font-semibold px-3 py-2 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...monthly].reverse().map(m => (
                    <tr key={m.ym} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-700">{m.label}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(m.expense)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(m.broad_gmv)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtRoas(m.roas)}</td>
                      <td className="px-3 py-2 text-right">{fmtPct(m.acos)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(m.broad_order)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(m.clicks)}</td>
                      <td className="px-3 py-2 text-right">{fmtPct(m.ctr, 2)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(m.cpc)}</td>
                      <td className="px-3 py-2 text-right">{fmtPct(m.conv_rate, 2)}</td>
                      <td className="px-3 py-2 text-right">{revenue ? fmtMoney(m.revenue) : '—'}</td>
                      <td className="px-3 py-2 text-right">{fmtPct(m.share)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{m.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dia da semana */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div className="flex items-center gap-1.5">
                <CalendarDays size={15} className="text-slate-400"/>
                <p className="text-sm font-semibold text-slate-700">Média por dia da semana</p>
                <InfoTooltip source="nosso" text="Média dos dias que tiveram gasto com Ads no período — mostra em que dias os anúncios rendem mais."/>
              </div>
              <Legend items={[{ label: 'Gasto médio', color: COLOR_SPEND }, { label: 'Venda média', color: COLOR_SALES }]}/>
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekday} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9"/>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => `R$${fmtNum(v)}`}/>
                  <Tooltip content={<ChartTooltip/>} cursor={{ fill: '#F8FAFC' }}/>
                  <Bar dataKey="avg_expense" name="Gasto médio" fill={COLOR_SPEND} radius={[4, 4, 0, 0]} maxBarSize={22}/>
                  <Bar dataKey="avg_gmv" name="Venda média" fill={COLOR_SALES} radius={[4, 4, 0, 0]} maxBarSize={22}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {bestWd && <p className="text-xs text-slate-500 mt-2">Melhor retorno: <b className="text-slate-700">{bestWd.label}</b> ({fmtRoas(bestWd.roas)}).</p>}
          </div>
        </>
      )}

      {/* Log geral */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-1.5 px-5 py-3.5 border-b border-slate-100">
          <History size={15} className="text-slate-400"/><p className="text-sm font-semibold text-slate-700">Histórico de alterações feitas pelo sistema</p>
        </div>
        {log.length === 0 ? <p className="text-sm text-slate-400 px-5 py-6">Nenhuma alteração de campanha feita pelo sistema ainda.</p> : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-400 sticky top-0">
                <tr><th className="text-left font-semibold px-5 py-2">Quando</th><th className="text-left font-semibold px-3 py-2">Campanha</th><th className="text-left font-semibold px-3 py-2">Ação</th><th className="text-left font-semibold px-3 py-2">Detalhe</th><th className="text-left font-semibold px-5 py-2">Quem</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {log.map(l => (
                  <tr key={l.id}>
                    <td className="px-5 py-2 text-slate-500 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                    <td className="px-3 py-2 text-slate-600">#{l.campaign_id}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{ACTION_LABEL[l.action] || l.action}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">
                      {l.detail?.budget != null && <>orçamento {fmtMoney(l.detail.before?.budget)} → {fmtMoney(l.detail.budget)} </>}
                      {l.detail?.roas_target != null && <>ROAS {fmtRoas(l.detail.before?.roas_target)} → {fmtRoas(l.detail.roas_target)} </>}
                      {l.detail?.end_date && <>até {l.detail.end_date}</>}
                    </td>
                    <td className="px-5 py-2 text-slate-500">{l.user_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
