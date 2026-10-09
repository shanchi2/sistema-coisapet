import { useEffect, useMemo, useState } from 'react'
import { Package, Search, X, Loader2, TrendingUp, TrendingDown, PauseCircle, CalendarDays, Layers, Download, ArrowUpDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dateBR'
import { Panel, StatTile, Delta, fmtInt } from '../dashboard/widgets'

// Pedidos → aba Produtos (09/10). Controle por PRODUTO: quantas unidades
// saíram por dia (últimos 7), em 30 dias e mês a mês, divididas por
// plataforma (ML envio próprio, ML Full, Shopee, manual). Só quantidade —
// nenhum valor em R$ (a aba é vista por quem tem acesso a Pedidos).
// Variações somam no produto-pai (parent_product_id); dá pra abrir.
// Cancelados ficam de fora (mesma regra da tela ML × Shopee).

const TZ = 'America/Sao_Paulo'
const ML_COMPLETE_FROM = '2026-08-17'
const PLAT = {
  ml:      { label: 'ML envio próprio', short: 'ML', color: '#2D3277' },
  ml_full: { label: 'ML Full', short: 'Full', color: '#7c83d6' },
  shopee:  { label: 'Shopee', short: 'Shopee', color: '#EE4D2D' },
  manual:  { label: 'Manual', short: 'Manual', color: '#94a3b8' },
}
const PKEYS = Object.keys(PLAT)
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const LOAD_DAYS = 185

const toD = s => new Date(`${s}T12:00:00Z`)
const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const brDate = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts))
const fmtShort = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const monthLabel = m => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`
const isCancelled = o => (o.status_ml || '').toLowerCase().startsWith('cancel') || ['CANCELLED', 'IN_CANCEL'].includes(o.marketplace_status)
const platOf = o => (o.source === 'ml' ? (o.is_full ? 'ml_full' : 'ml') : o.source === 'shopee' ? 'shopee' : 'manual')

async function loadData(from) {
  const orders = []
  for (let page = 0; page < 40; page++) {
    const { data, error } = await supabase.from('orders')
      .select('source, data_venda, is_full, status_ml, marketplace_status, items:order_items(qty, product_id, titulo, sku, variacao)')
      .gte('data_venda', `${from}T00:00:00-03:00`).order('data_venda').range(page * 1000, page * 1000 + 999)
    if (error) throw error
    orders.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const { data: prods, error } = await supabase.from('products').select('id, name, sku, parent_product_id, photo_url, image_url, is_kit')
  if (error) throw error
  return { orders, products: prods || [] }
}

function Spark({ values, color = '#8b5cf6' }) {
  const max = Math.max(1, ...values)
  return (
    <div className="flex items-end h-6 gap-[2px]">
      {values.map((v, i) => <div key={i} className="flex-1 rounded-t-[1px]" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0, background: color }} />)}
    </div>
  )
}

export function OrdersProductsTab() {
  const today = todayISO()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [plat, setPlat] = useState('')
  const [group, setGroup] = useState('parent') // parent | variation
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'd30', dir: -1 })
  const [open, setOpen] = useState(null)

  useEffect(() => {
    loadData(addDays(today, -LOAD_DAYS)).then(setData).catch(e => setError(e.message))
  }, [today])

  const days7 = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)), [today])
  const months = useMemo(() => {
    const out = []; const d = toD(`${today.slice(0, 7)}-01`)
    for (let i = 0; i < 6; i++) { out.unshift(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() - 1) }
    return out
  }, [today])

  const M = useMemo(() => {
    if (!data) return null
    const pById = Object.fromEntries(data.products.map(p => [p.id, p]))
    const keyOf = it => {
      const p = it.product_id && pById[it.product_id]
      if (!p) return { key: `t:${it.sku || it.titulo}`, name: it.titulo || it.sku || '—', variation: it.variacao || null, photo: null }
      const parent = group === 'parent' && p.parent_product_id ? pById[p.parent_product_id] || p : p
      const vName = parent.id !== p.id ? (p.name.startsWith(parent.name) ? p.name.slice(parent.name.length).replace(/^[\s—–\-:|,]+/, '') || p.name : p.name) : null
      return { key: parent.id, name: parent.name, variation: group === 'parent' && vName ? vName : (it.variacao || null), photo: parent.photo_url || parent.image_url || p.photo_url || p.image_url, sku: parent.sku }
    }
    const d7 = addDays(today, -6), d30 = addDays(today, -29), p7 = addDays(today, -13), d14 = addDays(today, -13), p30 = addDays(today, -59)
    const rows = {}
    let tot7 = 0, tot7p = 0, tot30 = 0, tot30p = 0
    const daily90 = {}
    for (const o of data.orders) {
      if (isCancelled(o)) continue
      const pl = platOf(o)
      if (plat && pl !== plat) continue
      const day = brDate(o.data_venda), mon = day.slice(0, 7)
      for (const it of o.items || []) {
        const q = Number(it.qty) || 0
        if (!q) continue
        const k = keyOf(it)
        const r = (rows[k.key] ||= { key: k.key, name: k.name, photo: k.photo, sku: k.sku, days: {}, months: {}, plat30: {}, d7: 0, p7: 0, d30: 0, p30: 0, d14: 0, vars: {}, dow: Array(7).fill(0), lastDay: null })
        r.days[day] = (r.days[day] || 0) + q
        r.months[mon] = (r.months[mon] || 0) + q
        if (!r.lastDay || day > r.lastDay) r.lastDay = day
        if (day >= d7) { r.d7 += q; tot7 += q } else if (day >= p7) { r.p7 += q; tot7p += q }
        if (day >= d14) r.d14 += q
        if (day >= d30) {
          r.d30 += q; tot30 += q
          r.plat30[pl] = (r.plat30[pl] || 0) + q
          r.dow[toD(day).getUTCDay()] += q
          if (k.variation) r.vars[k.variation] = (r.vars[k.variation] || 0) + q
        } else if (day >= p30) { r.p30 += q; tot30p += q }
        if (day >= addDays(today, -89)) daily90[day] = (daily90[day] || 0) + q
      }
    }
    const list = Object.values(rows).map(r => ({
      ...r,
      avg: r.d30 / 30,
      forecast7: Math.round((r.d14 / 14) * 7),
      trend: r.d7 - r.p7,
    }))
    const rising = list.filter(r => r.d7 >= 3 && r.trend > 0).sort((a, b) => b.trend - a.trend).slice(0, 5)
    const falling = list.filter(r => r.p7 >= 3 && r.trend < 0).sort((a, b) => a.trend - b.trend).slice(0, 5)
    const stopped = list.filter(r => r.d14 === 0 && r.p30 + r.d30 >= 3).sort((a, b) => (b.p30 + b.d30) - (a.p30 + a.d30)).slice(0, 5)
    return { list, tot7, tot7p, tot30, tot30p, active30: list.filter(r => r.d30 > 0).length, rising, falling, stopped }
  }, [data, plat, group, today])

  const rows = useMemo(() => {
    if (!M) return []
    const q = search.trim().toLowerCase()
    const val = (r, k) => k === 'name' ? r.name : k.startsWith('day:') ? (r.days[k.slice(4)] || 0) : k.startsWith('mon:') ? (r.months[k.slice(4)] || 0) : r[k]
    return M.list.filter(r => !q || r.name.toLowerCase().includes(q) || (r.sku || '').toLowerCase().includes(q))
      .filter(r => r.d30 + r.p30 > 0 || q)
      .sort((a, b) => { const x = val(a, sort.key), y = val(b, sort.key); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir })
  }, [M, search, sort])

  function exportCsv() {
    const head = ['Produto', 'SKU', ...days7.map(fmtShort), '7 dias', '7 dias antes', '30 dias', ...months.map(monthLabel), 'Média/dia (30d)', 'Previsão 7 dias', ...PKEYS.map(k => `30d ${PLAT[k].short}`)]
    const lines = rows.map(r => [r.name, r.sku || '', ...days7.map(d => r.days[d] || 0), r.d7, r.p7, r.d30, ...months.map(m => r.months[m] || 0), r.avg.toFixed(1).replace('.', ','), r.forecast7, ...PKEYS.map(k => r.plat30[k] || 0)])
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `produtos-pedidos-${today}.csv`; a.click()
  }

  if (error) return <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{error}</div>
  if (!M) return <div className="card py-24 text-center"><Loader2 size={24} className="mx-auto animate-spin text-slate-300" /><p className="text-xs text-slate-400 mt-2">Somando os pedidos dos últimos 6 meses…</p></div>

  const Th = ({ k, children, className = '' }) => (
    <th className={`px-2 py-2 font-semibold cursor-pointer select-none hover:text-slate-600 ${className}`} onClick={() => setSort(s => ({ key: k, dir: s.key === k ? -s.dir : -1 }))}>
      <span className="inline-flex items-center gap-0.5">{children}{sort.key === k && <ArrowUpDown size={9} />}</span>
    </th>
  )
  const maxDay = Math.max(1, ...rows.flatMap(r => days7.map(d => r.days[d] || 0)))
  const openRow = open && M.list.find(r => r.key === open)

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-slate-100 rounded-xl p-1">
          {[['', 'Todas'], ...PKEYS.map(k => [k, PLAT[k].label])].map(([k, l]) => (
            <button key={k} onClick={() => setPlat(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${plat === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1">
          {[['parent', 'Produto (soma variações)'], ['variation', 'Cada variação']].map(([k, l]) => (
            <button key={k} onClick={() => setGroup(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${group === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
            <Search size={13} className="text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto ou SKU..." className="bg-transparent outline-none text-sm w-52 placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch('')} className="text-slate-400"><X size={12} /></button>}
          </div>
          <button onClick={exportCsv} className="btn-secondary py-1.5 text-sm"><Download size={14} /> Excel</button>
        </div>
      </div>

      {/* Números */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={Package} tone="violet" label="Unidades — últimos 7 dias" value={fmtInt(M.tot7)} detail={<Delta current={M.tot7} previous={M.tot7p} suffix="vs 7 dias antes" />} />
        <StatTile icon={CalendarDays} tone="sky" label="Unidades — últimos 30 dias" value={fmtInt(M.tot30)} detail={<Delta current={M.tot30} previous={M.tot30p} suffix="vs 30 dias antes" />} />
        <StatTile icon={Layers} tone="neutral" label="Produtos vendidos (30 dias)" value={fmtInt(M.active30)} detail={`média de ${fmtInt(Math.round(M.tot30 / 30))} un./dia`} />
        <StatTile icon={TrendingUp} tone="good" label="Campeão de 30 dias" value={fmtInt(M.list.slice().sort((a, b) => b.d30 - a.d30)[0]?.d30 || 0)}
          detail={<span className="truncate block">{M.list.slice().sort((a, b) => b.d30 - a.d30)[0]?.name || '—'}</span>} />
      </div>

      {/* Destaques */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {[
          { title: 'Em alta', sub: 'últimos 7 dias × 7 dias antes', icon: TrendingUp, tone: 'text-emerald-600 bg-emerald-50', list: M.rising, fmt: r => `${r.p7} → ${r.d7}` },
          { title: 'Em queda', sub: 'últimos 7 dias × 7 dias antes', icon: TrendingDown, tone: 'text-rose-600 bg-rose-50', list: M.falling, fmt: r => `${r.p7} → ${r.d7}` },
          { title: 'Pararam de vender', sub: 'vendiam e não saem há 14+ dias', icon: PauseCircle, tone: 'text-amber-600 bg-amber-50', list: M.stopped, fmt: r => `última: ${r.lastDay ? fmtShort(r.lastDay) : '—'}` },
        ].map(b => (
          <div key={b.title} className="card !p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${b.tone}`}><b.icon size={14} /></span>
              <div><p className="text-[13px] font-bold text-slate-700 leading-tight">{b.title}</p><p className="text-[10px] text-slate-400">{b.sub}</p></div>
            </div>
            {b.list.length ? (
              <ul className="flex flex-col gap-1.5">
                {b.list.map(r => (
                  <li key={r.key}>
                    <button onClick={() => setOpen(r.key)} className="w-full flex items-center justify-between gap-2 text-left hover:bg-slate-50 rounded-md px-1 -mx-1">
                      <span className="text-xs text-slate-600 truncate">{r.name}</span>
                      <span className="text-xs font-bold text-slate-800 tabular-nums shrink-0">{b.fmt(r)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-400">Nada por aqui.</p>}
          </div>
        ))}
      </div>

      {months[0] < ML_COMPLETE_FROM.slice(0, 7) && (plat === '' || plat.startsWith('ml')) && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Mercado Livre só tem histórico completo no sistema a partir de 17/08/2026 — os meses anteriores mostram só a Shopee (e importações parciais do ML).</p>
      )}

      {/* Tabela */}
      <Panel title={`${fmtInt(rows.length)} produtos`} subtitle="Unidades vendidas (sem cancelados) · clique no nome pra ver o detalhe · clique no título da coluna pra ordenar"
        right={<div className="flex flex-wrap gap-3 text-[11px] text-slate-500">{PKEYS.map(k => <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PLAT[k].color }} />{PLAT[k].short}</span>)}</div>}>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-[13px] min-w-[1180px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-right border-b border-slate-100">
                <Th k="name" className="text-left pl-5">Produto</Th>
                {days7.map(d => <Th key={d} k={`day:${d}`} className="w-11">{d === today ? 'Hoje' : `${DOW[toD(d).getUTCDay()]} ${d.slice(8, 10)}`}</Th>)}
                <Th k="d7" className="bg-violet-50/60 w-14">7 dias</Th>
                <Th k="trend" className="w-14">Var.</Th>
                <Th k="d30" className="bg-sky-50/60 w-14">30 dias</Th>
                <th className="px-2 py-2 font-semibold text-left w-32">Plataformas (30d)</th>
                {months.map(m => <Th key={m} k={`mon:${m}`} className="w-12">{monthLabel(m)}</Th>)}
                <Th k="avg" className="w-14">Média/dia</Th>
                <Th k="forecast7" className="w-16 pr-5">Prev. 7d</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map(r => {
                const pt = PKEYS.reduce((t, k) => t + (r.plat30[k] || 0), 0)
                return (
                  <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50/60 text-right tabular-nums">
                    <td className="pl-5 pr-2 py-2 text-left">
                      <button onClick={() => setOpen(r.key)} className="flex items-center gap-2.5 text-left max-w-[300px]">
                        {r.photo ? <img src={r.photo} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 bg-slate-100" loading="lazy" /> : <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={14} className="text-slate-300" /></span>}
                        <span className="min-w-0"><span className="block font-medium text-slate-700 truncate hover:text-violet-600">{r.name}</span>{r.sku && <span className="block text-[10px] text-slate-400 font-mono truncate">{r.sku}</span>}</span>
                      </button>
                    </td>
                    {days7.map(d => { const v = r.days[d] || 0; return <td key={d} className="px-2"><span className={`inline-block min-w-[26px] rounded-md px-1 py-0.5 ${v ? 'text-slate-800 font-semibold' : 'text-slate-300'}`} style={v ? { background: `rgba(139,92,246,${0.08 + 0.32 * (v / maxDay)})` } : undefined}>{v || '·'}</span></td> })}
                    <td className="px-2 font-bold text-slate-800 bg-violet-50/40">{r.d7}</td>
                    <td className="px-2 text-[11px]">{r.trend === 0 ? <span className="text-slate-300">=</span> : <span className={r.trend > 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>{r.trend > 0 ? '+' : ''}{r.trend}</span>}</td>
                    <td className="px-2 font-bold text-slate-800 bg-sky-50/40">{r.d30}</td>
                    <td className="px-2 text-left">
                      {pt > 0 && (
                        <div className="h-2.5 rounded-full overflow-hidden flex bg-slate-100 w-28" style={{ gap: 1 }} title={PKEYS.filter(k => r.plat30[k]).map(k => `${PLAT[k].short}: ${r.plat30[k]}`).join(' · ')}>
                          {PKEYS.map(k => r.plat30[k] ? <div key={k} style={{ width: `${(r.plat30[k] / pt) * 100}%`, background: PLAT[k].color }} /> : null)}
                        </div>
                      )}
                    </td>
                    {months.map(m => <td key={m} className="px-2 text-slate-600">{r.months[m] || <span className="text-slate-300">·</span>}</td>)}
                    <td className="px-2 text-slate-600">{r.avg ? r.avg.toFixed(1).replace('.', ',') : '·'}</td>
                    <td className="px-2 pr-5 font-semibold text-slate-700">{r.forecast7 || '·'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!rows.length && <p className="text-sm text-slate-400 text-center py-10">Nenhum produto.</p>}
        </div>
        <p className="text-[10px] text-slate-400 mt-3">Prev. 7d = média dos últimos 14 dias × 7 (pra ter ideia de quanto vai sair na próxima semana, ajuda a planejar a produção). Mês atual é parcial.</p>
      </Panel>

      {openRow && <ProductDrawer r={openRow} today={today} months={months} onClose={() => setOpen(null)} group={group} />}
    </div>
  )
}

function ProductDrawer({ r, today, months, onClose, group }) {
  const days30 = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29))
  const max30 = Math.max(1, ...days30.map(d => r.days[d] || 0))
  const maxM = Math.max(1, ...months.map(m => r.months[m] || 0))
  const pt = PKEYS.reduce((t, k) => t + (r.plat30[k] || 0), 0)
  const vars = Object.entries(r.vars).sort((a, b) => b[1] - a[1])
  const maxDow = Math.max(1, ...r.dow)
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-slate-50 overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-start gap-3">
          {r.photo && <img src={r.photo} alt="" className="w-12 h-12 rounded-xl object-cover bg-slate-100" />}
          <div className="min-w-0 flex-1">
            <p className="text-lg font-black text-slate-800 leading-tight">{r.name}</p>
            <p className="text-xs text-slate-400">{r.sku ? `${r.sku} · ` : ''}última venda {r.lastDay ? fmtShort(r.lastDay) : '—'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-2">
            {[['7 dias', r.d7], ['30 dias', r.d30], ['Média/dia', r.avg.toFixed(1).replace('.', ',')], ['Previsão 7d', r.forecast7]].map(([l, v]) => (
              <div key={l} className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-[10px] uppercase font-semibold text-slate-400">{l}</p><p className="text-xl font-black text-slate-800">{v}</p></div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-slate-700 mb-3">Últimos 30 dias</p>
            <div className="flex items-end h-28 gap-[3px]">
              {days30.map(d => { const v = r.days[d] || 0; return <div key={d} className="flex-1 rounded-t-[2px] bg-violet-500" style={{ height: `${(v / max30) * 100}%`, minHeight: v ? 2 : 0 }} title={`${DOW[toD(d).getUTCDay()]} ${fmtShort(d)}: ${v} un.`} /> })}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>{fmtShort(days30[0])}</span><span>hoje</span></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-sm font-bold text-slate-700 mb-3">Por plataforma (30d)</p>
              {PKEYS.filter(k => r.plat30[k]).map(k => (
                <div key={k} className="mb-2">
                  <div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{PLAT[k].label}</span><b className="text-slate-800">{r.plat30[k]} <span className="font-normal text-slate-400">{Math.round((r.plat30[k] / pt) * 100)}%</span></b></div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.plat30[k] / pt) * 100}%`, background: PLAT[k].color }} /></div>
                </div>
              ))}
              {!pt && <p className="text-xs text-slate-400">Sem vendas em 30 dias.</p>}
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-sm font-bold text-slate-700 mb-3">Dia da semana (30d)</p>
              <div className="flex items-end h-20 gap-1.5">
                {r.dow.map((v, i) => <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end"><div className="w-full rounded-t-[2px] bg-sky-500" style={{ height: `${(v / maxDow) * 100}%`, minHeight: v ? 2 : 0 }} /><span className="text-[9px] text-slate-400">{DOW[i]}</span></div>)}
              </div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-slate-700 mb-3">Mês a mês</p>
            <div className="flex items-end h-24 gap-3">
              {months.map(m => { const v = r.months[m] || 0; return <div key={m} className="flex-1 flex flex-col items-center gap-1 h-full justify-end"><span className="text-[10px] font-bold text-slate-600">{v || ''}</span><div className="w-full max-w-[36px] rounded-t-[3px] bg-violet-400" style={{ height: `${(v / maxM) * 80}%`, minHeight: v ? 2 : 0 }} /><span className="text-[10px] text-slate-400">{monthLabel(m)}</span></div> })}
            </div>
          </div>
          {group === 'parent' && vars.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-sm font-bold text-slate-700 mb-3">Variações (30d)</p>
              <div className="flex flex-col gap-2">
                {vars.map(([v, q]) => (
                  <div key={v}>
                    <div className="flex justify-between text-xs mb-1"><span className="text-slate-600 truncate">{v}</span><b className="text-slate-800">{q}</b></div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-violet-400" style={{ width: `${(q / vars[0][1]) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
