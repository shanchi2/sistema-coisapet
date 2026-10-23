import { useCallback, useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line } from 'recharts'
import { TrendingUp, TrendingDown, Loader2, Download, Pencil, Plus, AlertTriangle, X, Check, Trophy, CalendarRange } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { sessionToken } from '../../lib/sessionToken'

// Faturamento histórico (23/10, pedido do Raphael). Declarações do contador
// mês a mês por CNPJ: CLARA ALVES ALVARENGA = Shopee, GABRIEL SANCHES
// SPAGNUOLO LTDA = Mercado Livre. Base pro estudo de crescimento (ano a ano,
// meses que mais vendem, sazonalidade). Só Diretoria — os dados só saem pelas
// funções revenue_overview / revenue_upsert, que conferem o token da sessão
// (fase128). Meses sem declaração podem mostrar as vendas brutas da API
// (marketplace_finance) como referência, separadas e marcadas.

const CNPJ = {
  shopee: { cnpj: '45.945.141/0001-15', name: 'Clara Alves Alvarenga', label: 'Shopee', color: '#EE4D2D' },
  ml:     { cnpj: '48.110.567/0001-47', name: 'Gabriel Sanches Spagnuolo Ltda', label: 'Mercado Livre', color: '#F5B800' },
}
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const YEAR_COLORS = ['#94a3b8', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9']
const brl = v => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brlK = v => v == null ? '' : v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : brl(v)
const pct = v => v == null || !isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const mLabel = ym => `${MONTHS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`

function Kpi({ label, value, detail, tone = 'text-slate-800' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="text-[11px] font-bold text-slate-400 uppercase">{label}</p>
      <p className={`text-xl font-black mt-0.5 ${tone}`}>{value}</p>
      {detail && <p className="text-[11px] text-slate-500 mt-0.5">{detail}</p>}
    </div>
  )
}
function Box({ title, icon: Icon, right, children, note }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">{Icon && <Icon size={15} className="text-slate-400" />}{title}</p>
        {right}
      </div>
      {children}
      {note && <p className="text-[11px] text-slate-400 mt-2">{note}</p>}
    </section>
  )
}
const Delta = ({ v }) => v == null || !isFinite(v) ? <span className="text-slate-300">—</span>
  : <span className={`inline-flex items-center gap-0.5 font-semibold ${v >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{v >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{pct(v)}</span>

// Tooltip das barras empilhadas: cada parte + o total do mês/ano
function StackTooltip({ active, payload, label }) {
  const items = (payload || []).filter(p => p.value != null && p.value !== 0)
  if (!active || !items.length) return null
  const total = items.reduce((a, p) => a + Number(p.value), 0)
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {items.map(p => (
        <p key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-600"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />{p.name}</span>
          <span className="font-semibold text-slate-700">{brl(Number(p.value))}</span>
        </p>
      ))}
      {items.length > 1 && (
        <p className="flex items-center justify-between gap-4 border-t border-slate-100 mt-1 pt-1">
          <span className="font-bold text-slate-700">Total</span>
          <span className="font-black text-slate-800">{brl(total)}</span>
        </p>
      )}
    </div>
  )
}

export function RevenueHistoryPage() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [withApi, setWithApi] = useState(true)
  const [edit, setEdit] = useState(null) // { platform, month, amount, note }

  const load = useCallback(async () => {
    const { data: d, error } = await supabase.rpc('revenue_overview', { p_token: sessionToken() })
    if (error) setErr(error.message); else { setData(d); setErr(null) }
  }, [])
  useEffect(() => { load() }, [load])

  // ── Meses: declaração do contador; sem declaração → API (se ligado) ──
  const months = useMemo(() => {
    if (!data) return []
    const map = {}
    const slot = ym => (map[ym] ||= { ym, shopee: null, ml: null, notes: [], api: {} })
    for (const r of data.rows || []) {
      const s = slot(r.month.slice(0, 7))
      s[r.platform] = Number(r.amount)
      if (r.note) s.notes.push(`${CNPJ[r.platform]?.label}: ${r.note}`)
    }
    // Mês em que o sistema começou a registrar no meio do mês → valor parcial (o servidor marca `partial`)
    for (const a of data.api || []) {
      const s = slot(a.month.slice(0, 7))
      s.api[a.platform] = Number(a.gross)
      if (a.partial) s.notes.push(`${CNPJ[a.platform]?.label}: API só tem este mês a partir do dia ${a.from_day} (começou a registrar no meio do mês)`)
    }
    return Object.values(map).sort((a, b) => a.ym.localeCompare(b.ym)).map(m => {
      const shopeeApi = m.shopee == null && withApi ? m.api.shopee ?? null : null
      const mlApi = m.ml == null && withApi ? m.api.ml ?? null : null
      const shopee = m.shopee ?? shopeeApi, ml = m.ml ?? mlApi
      return {
        ...m, label: mLabel(m.ym), year: m.ym.slice(0, 4),
        shopeeDecl: m.shopee, mlDecl: m.ml, shopeeApi, mlApi,
        total: (shopee || 0) + (ml || 0), hasAny: shopee != null || ml != null, fromApi: shopeeApi != null || mlApi != null,
      }
    }).filter(m => m.hasAny)
  }, [data, withApi])

  const byMonth = Object.fromEntries(months.map(m => [m.ym, m]))
  const prevYm = ym => { const d = new Date(ym + '-15'); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) }
  const lastYearYm = ym => `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`

  // ── Por ano ──
  const years = useMemo(() => {
    const g = {}
    for (const m of months) {
      const y = (g[m.year] ||= { year: m.year, shopee: 0, ml: 0, total: 0, n: 0, months: [] })
      y.shopee += (m.shopeeDecl ?? m.shopeeApi ?? 0); y.ml += (m.mlDecl ?? m.mlApi ?? 0); y.total += m.total; y.n++; y.months.push(m)
    }
    const list = Object.values(g).sort((a, b) => a.year.localeCompare(b.year))
    list.forEach((y, i) => {
      const prev = list[i - 1]
      // crescimento comparando só os MESMOS meses dos dois anos (ano incompleto não distorce)
      if (prev) {
        const same = y.months.filter(m => byMonth[lastYearYm(m.ym)])
        const now = same.reduce((s, m) => s + m.total, 0), before = same.reduce((s, m) => s + byMonth[lastYearYm(m.ym)].total, 0)
        y.growth = before ? (now - before) / before : null
        y.growthMonths = same.length
      }
      y.best = [...y.months].sort((a, b) => b.total - a.total).slice(0, 3)
      y.avg = y.total / y.n
    })
    return list
  }, [months]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sazonalidade: Jan..Dez, uma linha por ano ──
  const seasonal = MONTHS.map((l, i) => {
    const row = { mes: l }
    for (const y of years) { const m = byMonth[`${y.year}-${String(i + 1).padStart(2, '0')}`]; if (m) row[y.year] = Math.round(m.total) }
    return row
  })
  // Mês do ano que mais vende (média entre os anos que têm aquele mês)
  // (só declarações do contador — mês da API é referência e pode estar incompleto)
  const monthRank = MONTHS.map((l, i) => {
    const vals = years.map(y => byMonth[`${y.year}-${String(i + 1).padStart(2, '0')}`]).filter(m => m && !m.fromApi).map(m => m.total)
    return { mes: l, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length }
  }).filter(x => x.avg != null).sort((a, b) => b.avg - a.avg)

  const declMonths = months.filter(m => !m.fromApi || m.shopeeDecl != null || m.mlDecl != null)
  const last12 = declMonths.slice(-12)
  const total12 = last12.reduce((s, m) => s + m.total, 0)
  const prev12 = last12.map(m => byMonth[lastYearYm(m.ym)]?.total).filter(v => v != null)
  const growth12 = prev12.length === 12 ? (total12 - prev12.reduce((a, b) => a + b, 0)) / prev12.reduce((a, b) => a + b, 0) : null
  // KPIs só com declaração do contador (API é referência, não faturamento fiscal)
  const declOnly = months.filter(m => !m.fromApi)
  const best = declOnly.length ? declOnly.reduce((a, b) => (b.total > a.total ? b : a)) : null
  const grand = declOnly.reduce((s, m) => s + m.total, 0)

  async function saveEdit() {
    const amount = edit.amount === '' ? null : Number(String(edit.amount).replace(/\./g, '').replace(',', '.'))
    if (amount != null && !isFinite(amount)) { toast.error('Valor inválido'); return }
    const { error } = await supabase.rpc('revenue_upsert', { p_token: sessionToken(), p_cnpj: CNPJ[edit.platform].cnpj, p_month: `${edit.month}-01`, p_amount: amount, p_note: edit.note || null })
    if (error) { toast.error(error.message); return }
    toast.success(amount == null ? 'Mês removido' : 'Salvo'); setEdit(null); load()
  }

  function exportCsv() {
    const lines = [['Mês', 'Shopee (Clara)', 'Mercado Livre (Gabriel)', 'Total', 'Origem', 'Observação']]
    for (const m of months) lines.push([m.ym, m.shopeeDecl ?? m.shopeeApi ?? '', m.mlDecl ?? m.mlApi ?? '', m.total.toFixed(2), m.fromApi ? 'API (vendas brutas)' : 'Contador', m.notes.join(' | ')])
    const csv = lines.map(r => r.map(v => `"${String(v).replace('.', ',').replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'faturamento-coisapet.csv'; a.click()
  }

  if (err) return <div className="p-6"><div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">{err}</div></div>
  if (!data) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-slate-400" /></div>

  const chartMonths = months.map(m => ({ label: m.label, Shopee: m.shopeeDecl, 'Mercado Livre': m.mlDecl, 'Shopee (API)': m.shopeeApi, 'ML (API)': m.mlApi }))

  return (
    <div className="p-4 sm:p-6 max-w-[1300px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Faturamento histórico</h1>
          <p className="text-sm text-slate-500">Declarações do contador por CNPJ · <b style={{ color: CNPJ.shopee.color }}>Shopee</b> = Clara Alves Alvarenga · <b className="text-amber-600">Mercado Livre</b> = Gabriel Sanches Spagnuolo Ltda</p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={withApi} onChange={e => setWithApi(e.target.checked)} className="accent-pink-500" />
            Completar com vendas da API
          </label>
          <button onClick={() => setEdit({ platform: 'shopee', month: '', amount: '', note: '' })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold"><Plus size={13} />Lançar mês</button>
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600"><Download size={13} />CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Últimos 12 meses declarados" value={brl(total12)} detail={last12.length ? `${last12[0].label} a ${last12[last12.length - 1].label}` : null} />
        <Kpi label="Crescimento (12 meses × 12 anteriores)" value={pct(growth12)} tone={growth12 == null ? 'text-slate-400' : growth12 >= 0 ? 'text-emerald-600' : 'text-rose-500'} detail={growth12 == null ? 'precisa de 24 meses seguidos' : 'mesmos meses do ano anterior'} />
        <Kpi label="Melhor mês da história" value={best ? brl(best.total) : '—'} detail={best ? `${best.label}${best.fromApi ? ' (API)' : ''}` : null} />
        <Kpi label="Total declarado no histórico" value={brl(grand)} detail={`${declOnly.length} meses com declaração`} />
      </div>

      <Box title="Mês a mês" icon={CalendarRange} note={withApi ? 'Barras claras = meses sem declaração do contador, calculados direto nas plataformas (Shopee: valor dos produtos dos pedidos não cancelados; ML: pagamentos aprovados). São vendas, não faturamento fiscal: servem de referência até chegar a declaração.' : 'Só declarações do contador.'}>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={chartMonths} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={45} />
              <YAxis tickFormatter={v => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={40} />
              <Tooltip content={<StackTooltip />} cursor={{ fill: '#f1f5f9' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Shopee" stackId="a" fill={CNPJ.shopee.color} />
              <Bar dataKey="Mercado Livre" stackId="a" fill={CNPJ.ml.color} />
              {withApi && <Bar dataKey="Shopee (API)" stackId="a" fill="#f8b4a6" />}
              {withApi && <Bar dataKey="ML (API)" stackId="a" fill="#fde68a" />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Box>

      <div className="grid lg:grid-cols-2 gap-4">
        <Box title="Por ano" icon={TrendingUp} note="Crescimento compara só os meses que existem nos dois anos (ano incompleto não distorce).">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={years.map(y => ({ ano: `${y.year}${y.n < 12 ? ` (${y.n}m)` : ''}`, Shopee: Math.round(y.shopee), 'Mercado Livre': Math.round(y.ml) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={40} />
                <Tooltip content={<StackTooltip />} cursor={{ fill: '#f1f5f9' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Shopee" stackId="a" fill={CNPJ.shopee.color} />
                <Bar dataKey="Mercado Livre" stackId="a" fill={CNPJ.ml.color} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-400 text-left"><th className="py-1">Ano</th><th className="text-right">Meses</th><th className="text-right">Shopee</th><th className="text-right">ML</th><th className="text-right">Total</th><th className="text-right">Média/mês</th><th className="text-right">Cresc.</th></tr></thead>
              <tbody>
                {years.map(y => (
                  <tr key={y.year} className="border-t border-slate-100">
                    <td className="py-1.5 font-bold text-slate-700">{y.year}</td>
                    <td className="text-right text-slate-500">{y.n}</td>
                    <td className="text-right">{brlK(y.shopee)}</td>
                    <td className="text-right">{brlK(y.ml)}</td>
                    <td className="text-right font-semibold">{brl(y.total)}</td>
                    <td className="text-right text-slate-500">{brlK(y.avg)}</td>
                    <td className="text-right" title={y.growthMonths ? `comparando ${y.growthMonths} meses iguais` : ''}><Delta v={y.growth} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>

        <Box title="Sazonalidade — o mesmo mês em cada ano" icon={CalendarRange} note="Cada linha é um ano. Mostra em que época do ano a CoisaPet vende mais.">
          <div className="h-60">
            <ResponsiveContainer>
              <LineChart data={seasonal}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={40} />
                <Tooltip formatter={v => brl(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {years.map((y, i) => <Line key={y.year} type="monotone" dataKey={y.year} stroke={YEAR_COLORS[i % YEAR_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {monthRank.length > 0 && (
            <p className="text-xs text-slate-600 mt-3">
              <b>Meses mais fortes</b> (média entre os anos): {monthRank.slice(0, 3).map(r => `${r.mes} (${brlK(r.avg)})`).join(' · ')}
              {' · '}<b>mais fracos:</b> {monthRank.slice(-2).reverse().map(r => `${r.mes} (${brlK(r.avg)})`).join(' · ')}
            </p>
          )}
        </Box>
      </div>

      <Box title="Melhores meses de cada ano" icon={Trophy}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {years.map(y => (
            <div key={y.year} className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm font-black text-slate-700 mb-1.5">{y.year}</p>
              {y.best.map((m, i) => (
                <div key={m.ym} className="flex justify-between text-xs py-0.5">
                  <span className="text-slate-600">{['🥇', '🥈', '🥉'][i]} {MONTHS[Number(m.ym.slice(5, 7)) - 1]}{m.fromApi ? ' (API)' : ''}</span>
                  <span className="font-semibold text-slate-700">{brl(m.total)}</span>
                </div>
              ))}
              <p className="text-[11px] text-slate-400 mt-1">ML {Math.round((y.ml / y.total) * 100)}% · Shopee {Math.round((y.shopee / y.total) * 100)}%</p>
            </div>
          ))}
        </div>
      </Box>

      <Box title="Todos os meses" icon={CalendarRange}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-left border-b border-slate-100">
                <th className="py-1.5">Mês</th><th className="text-right">Shopee</th><th className="text-right">Mercado Livre</th><th className="text-right">Total</th>
                <th className="text-right">vs mês anterior</th><th className="text-right">vs mesmo mês ano passado</th><th className="text-center">Obs.</th><th />
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map(m => {
                const p = byMonth[prevYm(m.ym)], ly = byMonth[lastYearYm(m.ym)]
                return (
                  <tr key={m.ym} className={`border-b border-slate-50 ${m.fromApi ? 'bg-amber-50/40' : ''}`}>
                    <td className="py-1.5 font-semibold text-slate-700">{m.label}{m.fromApi && <span className="ml-1 text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1">API</span>}</td>
                    <td className="text-right">{brl(m.shopeeDecl ?? m.shopeeApi)}</td>
                    <td className="text-right">{brl(m.mlDecl ?? m.mlApi)}</td>
                    <td className="text-right font-bold text-slate-800">{brl(m.total)}</td>
                    <td className="text-right"><Delta v={p ? (m.total - p.total) / p.total : null} /></td>
                    <td className="text-right"><Delta v={ly ? (m.total - ly.total) / ly.total : null} /></td>
                    <td className="text-center">{m.notes.length > 0 && <span title={m.notes.join('\n')}><AlertTriangle size={13} className="inline text-amber-500" /></span>}</td>
                    <td className="text-right">
                      <button onClick={() => setEdit({ platform: 'shopee', month: m.ym, amount: m.shopeeDecl != null ? String(m.shopeeDecl).replace('.', ',') : '', note: '' })} title="Editar Shopee" className="p-1 text-slate-300 hover:text-slate-600"><Pencil size={12} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Box>

      {edit && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="font-bold text-slate-800">Lançar / corrigir mês</p><button onClick={() => setEdit(null)} className="text-slate-400"><X size={16} /></button></div>
            <label className="block text-xs font-semibold text-slate-600">CNPJ
              <select value={edit.platform} onChange={e => { const pl = e.target.value; setEdit(x => ({ ...x, platform: pl, amount: x.month && byMonth[x.month]?.[`${pl}Decl`] != null ? String(byMonth[x.month][`${pl}Decl`]).replace('.', ',') : '' })) }} className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-sm">
                {Object.entries(CNPJ).map(([k, c]) => <option key={k} value={k}>{c.label} — {c.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">Mês
              <input type="month" value={edit.month} onChange={e => setEdit(x => ({ ...x, month: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">Valor (R$) <span className="font-normal text-slate-400">— vazio apaga o mês</span>
              <input value={edit.amount} onChange={e => setEdit(x => ({ ...x, amount: e.target.value }))} placeholder="Ex: 45.090,10" inputMode="decimal" className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">Observação
              <input value={edit.note} onChange={e => setEdit(x => ({ ...x, note: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-sm" />
            </label>
            <button onClick={saveEdit} disabled={!edit.month} className="w-full btn-primary flex items-center justify-center gap-1.5 disabled:opacity-40"><Check size={14} />Salvar</button>
          </div>
        </div>
      )}
    </div>
  )
}
