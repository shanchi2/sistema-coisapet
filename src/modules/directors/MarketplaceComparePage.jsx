import { useEffect, useMemo, useState } from 'react'
import {
  BarChart2, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, ShoppingBag, Receipt, Package,
  XCircle, Clock, CalendarDays, MapPin, X, Download, Warehouse, Trophy,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dateBR'

// Comparativo ML × Shopee (Diretoria, 30/09). Tudo calculado a partir dos
// pedidos do nosso banco (orders + order_items):
// - Valor = Σ quantidade × preço unitário dos itens (mesma régua nas duas).
//   Shopee antes de 19/09 não tinha preço — preenchido pela API (fase82).
// - Cancelado: ML = status "Cancelado/Cancelada…"; Shopee = status da API
//   (marketplace_status CANCELLED/IN_CANCEL) ou status interno "Cancelado".
// - ML só tem histórico completo desde ~17/08/2026 (antes: importações
//   parciais) — a tela avisa quando o período começa antes disso.
const ML_COMPLETE_FROM = '2026-08-17'
const P = {
  ml:     { label: 'Mercado Livre', short: 'ML',     color: '#2D3277', soft: '#eef0fb', text: 'text-[#2D3277]' },
  shopee: { label: 'Shopee',        short: 'Shopee', color: '#EE4D2D', soft: '#fff1ee', text: 'text-[#EE4D2D]' },
}
const PLATFORMS = ['ml', 'shopee']
const TZ = 'America/Sao_Paulo'

// ── Datas 'YYYY-MM-DD' (aritmética em UTC, sem fuso) ───────────────────
const toD = s => new Date(`${s}T12:00:00Z`)
const iso = d => d.toISOString().slice(0, 10)
const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const daysBetween = (a, b) => Math.round((toD(b) - toD(a)) / 86400000) + 1
const monthStart = s => `${s.slice(0, 7)}-01`
const monthEnd = s => { const d = toD(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d) }
const brDate = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts))
const brHour = ts => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ts)))
const fmtShort = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brl2 = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (v, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (a, b) => (b ? (a / b) * 100 : 0)

function isCancelled(o) {
  const s = (o.status_ml || '').toLowerCase()
  if (s.startsWith('cancel')) return true
  return ['CANCELLED', 'IN_CANCEL'].includes(o.marketplace_status)
}

const PERIODS = [
  ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['mes', 'Este mês'], ['mes_ant', 'Mês passado'], ['90', 'Últimos 90 dias'], ['custom', 'Período'],
]
function rangeOf(key, custom) {
  const today = todayISO()
  if (key === 'mes') return { from: monthStart(today), to: today }
  if (key === 'mes_ant') { const prev = addDays(monthStart(today), -1); return { from: monthStart(prev), to: monthEnd(prev) } }
  if (key === 'custom') return custom
  return { from: addDays(today, -(Number(key) - 1)), to: today }
}
function previousOf({ from, to }, key) {
  if (key === 'mes' || key === 'mes_ant') {
    const prevEnd = addDays(from, -1); const prevFrom = monthStart(prevEnd)
    // "Este mês" compara com o mesmo pedaço do mês passado
    const len = daysBetween(from, to)
    return { from: prevFrom, to: key === 'mes' ? addDays(prevFrom, len - 1) : monthEnd(prevEnd) }
  }
  const n = daysBetween(from, to)
  return { from: addDays(from, -n), to: addDays(from, -1) }
}

// Busca paginada (o Supabase devolve no máximo 1000 linhas por vez)
async function fetchOrders(from, to) {
  const all = []
  const fromTs = `${from}T00:00:00-03:00`, toTs = `${addDays(to, 1)}T00:00:00-03:00`
  for (let page = 0; page < 30; page++) {
    const { data, error } = await supabase.from('orders')
      .select('id, source, data_venda, status_ml, marketplace_status, estado_uf, is_full, items:order_items(qty, preco_unit, titulo, sku, product_id, product:products(name))')
      .in('source', PLATFORMS).gte('data_venda', fromTs).lt('data_venda', toTs)
      .order('data_venda').range(page * 1000, page * 1000 + 999)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

function summarize(orders) {
  const out = {}
  for (const p of PLATFORMS) out[p] = { all: 0, orders: 0, cancelled: 0, revenue: 0, units: 0, cancelledValue: 0, full: 0, fullRevenue: 0 }
  for (const o of orders) {
    const s = out[o.source]; if (!s) continue
    const value = (o.items || []).reduce((t, i) => t + (Number(i.qty) || 0) * (Number(i.preco_unit) || 0), 0)
    const units = (o.items || []).reduce((t, i) => t + (Number(i.qty) || 0), 0)
    s.all++
    if (isCancelled(o)) { s.cancelled++; s.cancelledValue += value; continue }
    s.orders++; s.revenue += value; s.units += units
    if (o.is_full) { s.full++; s.fullRevenue += value }
  }
  for (const p of PLATFORMS) { const s = out[p]; s.ticket = s.orders ? s.revenue / s.orders : 0; s.cancelRate = pct(s.cancelled, s.all) }
  const total = { orders: out.ml.orders + out.shopee.orders, revenue: out.ml.revenue + out.shopee.revenue, units: out.ml.units + out.shopee.units, cancelled: out.ml.cancelled + out.shopee.cancelled, all: out.ml.all + out.shopee.all }
  total.ticket = total.orders ? total.revenue / total.orders : 0
  total.cancelRate = pct(total.cancelled, total.all)
  return { ...out, total }
}

function productKey(i) { return i.product_id || (i.sku ? `sku:${i.sku}` : `t:${i.titulo}`) }
function productName(i) { return i.product?.name || i.titulo || i.sku || '—' }

// ── Peças visuais ──────────────────────────────────────────────────────
function Delta({ now, prev, invert }) {
  if (!prev) return <span className="text-[11px] text-slate-300">—</span>
  const v = ((now - prev) / prev) * 100
  const good = invert ? v < 0 : v > 0
  const Icon = Math.abs(v) < 1 ? Minus : v > 0 ? TrendingUp : TrendingDown
  const tone = Math.abs(v) < 1 ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-rose-600'
  return <span className={`text-[11px] font-semibold inline-flex items-center gap-0.5 ${tone}`}><Icon size={11} />{v > 0 ? '+' : ''}{num(v)}%</span>
}

// Card comparativo: ML | Shopee | Total, com a divisão numa barra
function CompareCard({ icon: Icon, label, fmt, cur, prev, field, invert, showShare = true }) {
  const ml = cur.ml[field], sh = cur.shopee[field], tot = cur.total[field]
  const share = pct(ml, ml + sh)
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mb-2"><Icon size={13} /> {label}</p>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xl font-black text-slate-800">{fmt(tot)}</p>
        <Delta now={tot} prev={prev.total[field]} invert={invert} />
      </div>
      {showShare && (ml + sh) > 0 && (
        <div className="h-2 rounded-full overflow-hidden flex mt-2.5 bg-slate-100" style={{ gap: 2 }} title={`ML ${num(share)}% · Shopee ${num(100 - share)}%`}>
          <div style={{ width: `${share}%`, background: P.ml.color }} />
          <div style={{ width: `${100 - share}%`, background: P.shopee.color }} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mt-2.5">
        {PLATFORMS.map(p => (
          <div key={p}>
            <p className="text-[10px] font-bold flex items-center gap-1" style={{ color: P[p].color }}><span className="w-2 h-2 rounded-sm" style={{ background: P[p].color }} />{P[p].short}</p>
            <p className="text-sm font-bold text-slate-700">{fmt(cur[p][field])}</p>
            <Delta now={cur[p][field]} prev={prev[p][field]} invert={invert} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      {PLATFORMS.map(p => <span key={p} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: P[p].color }} />{P[p].label}</span>)}
    </div>
  )
}

// Barras agrupadas por dia (ML e Shopee lado a lado) + tooltip
function DailyBars({ days, data, metric }) {
  const val = (d, p) => metric === 'revenue' ? data[d]?.[p]?.revenue || 0 : metric === 'orders' ? data[d]?.[p]?.orders || 0 : (data[d]?.[p]?.orders ? data[d][p].revenue / data[d][p].orders : 0)
  const fmt = v => metric === 'orders' ? num(v) : brl(v)
  const max = Math.max(1, ...days.flatMap(d => PLATFORMS.map(p => val(d, p))))
  const dense = days.length > 31
  return (
    <div>
      <div className="flex items-end h-52" style={{ gap: dense ? 1 : 4 }}>
        {days.map(d => (
          <div key={d} className="flex-1 flex items-end h-full min-w-0 group relative" style={{ gap: 2 }}>
            {PLATFORMS.map(p => (
              <div key={p} className="flex-1 rounded-t-[3px]" style={{ height: `${(val(d, p) / max) * 100}%`, background: P[p].color, minHeight: val(d, p) ? 2 : 0 }} />
            ))}
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 bg-slate-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
              <p className="font-bold mb-0.5">{DOW[toD(d).getUTCDay()]}, {fmtShort(d)}</p>
              {PLATFORMS.map(p => <p key={p}><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: P[p].color }} />{P[p].short}: {data[d]?.[p]?.orders || 0} pedido(s) · {brl(data[d]?.[p]?.revenue || 0)}</p>)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex mt-1" style={{ gap: dense ? 1 : 4 }}>
        {days.map((d, i) => (
          <span key={d} className="flex-1 text-center text-[9px] text-slate-400 min-w-0">
            {days.length <= 14 ? `${DOW[toD(d).getUTCDay()]} ${d.slice(8, 10)}` : i % Math.ceil(days.length / 15) === 0 ? fmtShort(d) : ''}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-1">Máx. no eixo: {fmt(max)}</p>
    </div>
  )
}

// Barras pequenas agrupadas (dia da semana / hora)
function SmallGrouped({ labels, values, fmt, height = 120 }) {
  const max = Math.max(1, ...values.flatMap(v => PLATFORMS.map(p => v[p])))
  return (
    <div>
      <div className="flex items-end" style={{ height, gap: 3 }}>
        {labels.map((l, i) => (
          <div key={l} className="flex-1 flex items-end h-full min-w-0 group relative" style={{ gap: 1 }}>
            {PLATFORMS.map(p => <div key={p} className="flex-1 rounded-t-[2px]" style={{ height: `${(values[i][p] / max) * 100}%`, background: P[p].color, minHeight: values[i][p] ? 2 : 0 }} />)}
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 bg-slate-800 text-white text-[11px] rounded-lg px-2 py-1 whitespace-nowrap">
              <p className="font-bold">{l}</p>
              {PLATFORMS.map(p => <p key={p}>{P[p].short}: {fmt(values[i][p])}</p>)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex mt-1" style={{ gap: 3 }}>
        {labels.map((l, i) => <span key={l} className="flex-1 text-center text-[9px] text-slate-400 min-w-0">{labels.length > 12 ? (i % 3 === 0 ? l : '') : l}</span>)}
      </div>
    </div>
  )
}

// ── Painel lateral: um produto nas duas plataformas ───────────────────
function ProductPanel({ prod, days, onClose }) {
  const maxUnits = Math.max(1, ...days.map(d => PLATFORMS.reduce((s, p) => s + (prod.byDay[d]?.[p] || 0), 0)))
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-slate-50 overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-black text-slate-800 leading-tight">{prod.name}</p>
            <p className="text-xs text-slate-400">{fmtShort(days[0])} a {fmtShort(days[days.length - 1])}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {PLATFORMS.map(p => {
              const s = prod[p]
              return (
                <div key={p} className="bg-white border rounded-2xl p-4" style={{ borderColor: P[p].color + '40' }}>
                  <p className="text-sm font-black mb-2" style={{ color: P[p].color }}>{P[p].label}</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-slate-400">Faturamento</span><b className="text-slate-800">{brl2(s.revenue)}</b></div>
                    <div className="flex justify-between"><span className="text-slate-400">Unidades</span><b className="text-slate-800">{num(s.units)}</b></div>
                    <div className="flex justify-between"><span className="text-slate-400">Pedidos</span><b className="text-slate-800">{num(s.orders)}</b></div>
                    <div className="flex justify-between"><span className="text-slate-400">Preço médio</span><b className="text-slate-800">{s.units ? brl2(s.revenue / s.units) : '—'}</b></div>
                  </div>
                </div>
              )
            })}
          </div>
          {prod.ml.units && prod.shopee.units ? (
            <p className="text-xs text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2">
              Preço médio {prod.ml.revenue / prod.ml.units > prod.shopee.revenue / prod.shopee.units ? 'maior no ML' : 'maior na Shopee'}: diferença de <b>{brl2(Math.abs(prod.ml.revenue / prod.ml.units - prod.shopee.revenue / prod.shopee.units))}</b> por unidade.
            </p>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">Vendido só {prod.ml.units ? 'no Mercado Livre' : 'na Shopee'} nesse período.</p>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3"><p className="text-sm font-bold text-slate-700">Unidades por dia</p><Legend /></div>
            <div className="flex items-end h-36" style={{ gap: 2 }}>
              {days.map(d => (
                <div key={d} className="flex-1 flex flex-col-reverse h-full min-w-0" title={`${fmtShort(d)} · ML ${prod.byDay[d]?.ml || 0} · Shopee ${prod.byDay[d]?.shopee || 0}`}>
                  {PLATFORMS.map(p => prod.byDay[d]?.[p] ? <div key={p} style={{ height: `${(prod.byDay[d][p] / maxUnits) * 100}%`, background: P[p].color }} /> : null)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────
export function MarketplaceComparePage() {
  const today = todayISO()
  const [periodKey, setPeriodKey] = useState('30')
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today })
  const [metric, setMetric] = useState('revenue')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openProd, setOpenProd] = useState(null)

  const range = rangeOf(periodKey, custom)
  const prevRange = previousOf(range, periodKey)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    fetchOrders(prevRange.from, range.to)
      .then(d => { if (alive) setOrders(d) })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [prevRange.from, range.to])

  const inRange = (o, r) => { const d = brDate(o.data_venda); return d >= r.from && d <= r.to }
  const cur = useMemo(() => orders.filter(o => inRange(o, range)), [orders, range.from, range.to])
  const prev = useMemo(() => orders.filter(o => inRange(o, prevRange)), [orders, prevRange.from, prevRange.to])
  const S = useMemo(() => summarize(cur), [cur])
  const SP = useMemo(() => summarize(prev), [prev])
  const valid = useMemo(() => cur.filter(o => !isCancelled(o)), [cur])

  const days = useMemo(() => { const out = []; for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d); return out }, [range.from, range.to])
  const byDay = useMemo(() => {
    const m = {}
    for (const o of valid) {
      const d = brDate(o.data_venda); const x = ((m[d] ||= {})[o.source] ||= { orders: 0, revenue: 0 })
      x.orders++; x.revenue += (o.items || []).reduce((t, i) => t + (Number(i.qty) || 0) * (Number(i.preco_unit) || 0), 0)
    }
    return m
  }, [valid])

  const weekday = useMemo(() => {
    const cnt = Array.from({ length: 7 }, () => ({ ml: 0, shopee: 0 }))
    const occ = Array(7).fill(0); days.forEach(d => occ[toD(d).getUTCDay()]++)
    valid.forEach(o => { cnt[toD(brDate(o.data_venda)).getUTCDay()][o.source]++ })
    return cnt.map((c, i) => ({ ml: occ[i] ? c.ml / occ[i] : 0, shopee: occ[i] ? c.shopee / occ[i] : 0 }))
  }, [valid, days])
  const hourly = useMemo(() => {
    const cnt = Array.from({ length: 24 }, () => ({ ml: 0, shopee: 0 }))
    valid.forEach(o => { cnt[brHour(o.data_venda)][o.source]++ })
    return cnt
  }, [valid])

  const products = useMemo(() => {
    const m = {}
    for (const o of valid) for (const i of o.items || []) {
      const k = productKey(i)
      const x = (m[k] ||= { key: k, name: productName(i), ml: { revenue: 0, units: 0, orders: 0 }, shopee: { revenue: 0, units: 0, orders: 0 }, byDay: {} })
      const v = (Number(i.qty) || 0) * (Number(i.preco_unit) || 0)
      x[o.source].revenue += v; x[o.source].units += Number(i.qty) || 0; x[o.source].orders++
      const d = brDate(o.data_venda); ((x.byDay[d] ||= {})[o.source] = (x.byDay[d]?.[o.source] || 0) + (Number(i.qty) || 0))
    }
    return Object.values(m).map(x => ({ ...x, total: x.ml.revenue + x.shopee.revenue })).sort((a, b) => b.total - a.total)
  }, [valid])

  const states = useMemo(() => {
    const m = {}
    valid.forEach(o => { const uf = (o.estado_uf || '—').toUpperCase().slice(0, 2); (m[uf] ||= { ml: 0, shopee: 0 })[o.source]++ })
    return Object.entries(m).map(([uf, v]) => ({ uf, ...v, total: v.ml + v.shopee })).sort((a, b) => b.total - a.total).slice(0, 12)
  }, [valid])

  const monthly = useMemo(() => {
    const m = {}
    for (const o of cur) {
      const k = brDate(o.data_venda).slice(0, 7)
      const x = (m[k] ||= { ml: { orders: 0, revenue: 0 }, shopee: { orders: 0, revenue: 0 } })
      if (isCancelled(o)) continue
      x[o.source].orders++
      x[o.source].revenue += (o.items || []).reduce((t, i) => t + (Number(i.qty) || 0) * (Number(i.preco_unit) || 0), 0)
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [cur])

  const mlIncomplete = range.from < ML_COMPLETE_FROM
  const maxStates = Math.max(1, ...states.map(s => s.total))
  const maxProd = Math.max(1, ...products.slice(0, 12).map(p => p.total))

  function exportCsv() {
    const rows = [['Data', 'Plataforma', 'Status', 'UF', 'Full', 'Produto', 'Qtd', 'Preço unit.', 'Total item']]
    for (const o of cur) for (const i of o.items || []) {
      rows.push([brDate(o.data_venda), P[o.source].label, isCancelled(o) ? 'Cancelado' : (o.marketplace_status || o.status_ml || ''), o.estado_uf || '', o.is_full ? 'sim' : '', productName(i), i.qty, num(i.preco_unit, 2), num((i.qty || 0) * (i.preco_unit || 0), 2)])
    }
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `ml-x-shopee-${range.from}-a-${range.to}.csv`
    a.click()
  }

  const leader = S.ml.revenue === S.shopee.revenue ? null : S.ml.revenue > S.shopee.revenue ? 'ml' : 'shopee'

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1400px] mx-auto space-y-5">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: `linear-gradient(135deg, ${P.ml.color}, ${P.shopee.color})` }}>
              <BarChart2 size={20} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Mercado Livre × Shopee</h1>
              <p className="text-sm text-slate-500">Comparativo de vendas, pedidos e valores — Diretoria</p>
            </div>
          </div>
          <button onClick={exportCsv} disabled={!cur.length} className="btn-secondary py-1.5 text-sm disabled:opacity-40"><Download size={14} /> CSV</button>
        </div>

        {/* Período */}
        <div className="flex items-center gap-2 flex-wrap">
          {PERIODS.map(([k, l]) => (
            <button key={k} onClick={() => setPeriodKey(k)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${periodKey === k ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>{l}</button>
          ))}
          {periodKey === 'custom' && (
            <span className="flex items-center gap-1.5 text-sm">
              <input type="date" value={custom.from} max={custom.to} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="input py-1 text-sm w-auto" />
              <span className="text-slate-400">até</span>
              <input type="date" value={custom.to} min={custom.from} max={today} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="input py-1 text-sm w-auto" />
            </span>
          )}
          <span className="text-xs text-slate-400">{fmtShort(range.from)} a {fmtShort(range.to)} · comparando com {fmtShort(prevRange.from)} a {fmtShort(prevRange.to)}</span>
        </div>

        {(mlIncomplete || prevRange.from < ML_COMPLETE_FROM) && (
          <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>O histórico do Mercado Livre no sistema só é completo a partir de <b>17/08/2026</b> (antes disso só entraram importações parciais). {mlIncomplete ? 'Números do ML nesse período estão incompletos.' : 'A comparação com o período anterior do ML está distorcida.'}</span>
          </div>
        )}
        {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{error}</div>}

        {loading ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-slate-200"><Loader2 size={26} className="mx-auto animate-spin text-slate-300" /></div>
        ) : (
          <>
            {/* Destaque */}
            {leader && (
              <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3 flex items-center gap-3 flex-wrap">
                <Trophy size={18} className="text-amber-500" />
                <p className="text-sm text-slate-600">
                  <b style={{ color: P[leader].color }}>{P[leader].label}</b> faturou mais no período: <b>{brl(S[leader].revenue)}</b> ({num(pct(S[leader].revenue, S.total.revenue))}% do total).
                  {' '}Em pedidos, quem lidera é <b style={{ color: P[S.ml.orders >= S.shopee.orders ? 'ml' : 'shopee'].color }}>{P[S.ml.orders >= S.shopee.orders ? 'ml' : 'shopee'].label}</b> ({num(Math.max(S.ml.orders, S.shopee.orders))} de {num(S.total.orders)}).
                  {' '}Ticket médio: ML {brl2(S.ml.ticket)} × Shopee {brl2(S.shopee.ticket)}.
                </p>
              </div>
            )}

            {/* Cards comparativos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              <CompareCard icon={Receipt} label="Faturamento" fmt={brl} cur={S} prev={SP} field="revenue" />
              <CompareCard icon={ShoppingBag} label="Pedidos" fmt={v => num(v)} cur={S} prev={SP} field="orders" />
              <CompareCard icon={BarChart2} label="Ticket médio" fmt={brl2} cur={S} prev={SP} field="ticket" showShare={false} />
              <CompareCard icon={Package} label="Unidades vendidas" fmt={v => num(v)} cur={S} prev={SP} field="units" />
              <CompareCard icon={XCircle} label="Cancelados" fmt={v => num(v)} cur={S} prev={SP} field="cancelled" invert />
            </div>

            {/* Por dia */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-700">Por dia</p>
                  <div className="flex bg-slate-100 rounded-lg p-0.5">
                    {[['revenue', 'Faturamento'], ['orders', 'Pedidos'], ['ticket', 'Ticket médio']].map(([k, l]) => (
                      <button key={k} onClick={() => setMetric(k)} className={`px-2.5 py-1 text-xs font-semibold rounded-md ${metric === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
                    ))}
                  </div>
                </div>
                <Legend />
              </div>
              <DailyBars days={days} data={byDay} metric={metric} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3"><p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><CalendarDays size={14} className="text-slate-400" /> Média de pedidos por dia da semana</p><Legend /></div>
                <SmallGrouped labels={DOW} values={weekday} fmt={v => num(v, 1)} />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3"><p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Clock size={14} className="text-slate-400" /> Pedidos por hora do dia</p><Legend /></div>
                <SmallGrouped labels={Array.from({ length: 24 }, (_, h) => `${h}h`)} values={hourly} fmt={v => num(v)} />
              </div>
            </div>

            {/* Produtos */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-wrap gap-2">
                <p className="text-sm font-bold text-slate-700">Produtos mais vendidos <span className="font-normal text-slate-400">— faturamento dividido por plataforma · clique pra comparar</span></p>
                <Legend />
              </div>
              <div className="divide-y divide-slate-50">
                {products.slice(0, 15).map((p, i) => (
                  <button key={p.key} onClick={() => setOpenProd(p)} className="w-full text-left px-5 py-2.5 hover:bg-slate-50 grid grid-cols-[24px_minmax(0,1.6fr)_minmax(0,2fr)_110px] gap-3 items-center">
                    <span className="text-xs font-bold text-slate-300">{i + 1}</span>
                    <span className="text-sm text-slate-700 truncate" title={p.name}>{p.name}</span>
                    <div className="h-3 rounded-full overflow-hidden flex bg-slate-100" style={{ width: `${Math.max(6, (p.total / maxProd) * 100)}%`, gap: 2 }}>
                      {PLATFORMS.map(pl => p[pl].revenue ? <div key={pl} style={{ width: `${(p[pl].revenue / p.total) * 100}%`, background: P[pl].color }} title={`${P[pl].short}: ${brl(p[pl].revenue)} · ${p[pl].units} un.`} /> : null)}
                    </div>
                    <span className="text-sm font-bold text-slate-800 text-right">{brl(p.total)}</span>
                  </button>
                ))}
                {!products.length && <p className="text-sm text-slate-400 text-center py-8">Sem vendas nesse período.</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
              {/* Estados */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3"><p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><MapPin size={14} className="text-slate-400" /> Pedidos por estado</p><Legend /></div>
                <div className="flex flex-col gap-2">
                  {states.map(s => (
                    <div key={s.uf} className="flex items-center gap-3" title={`ML ${s.ml} · Shopee ${s.shopee}`}>
                      <span className="text-xs font-bold text-slate-600 w-7">{s.uf}</span>
                      <div className="flex-1 h-4 flex rounded overflow-hidden" style={{ gap: 2 }}>
                        <div style={{ width: `${(s.ml / maxStates) * 100}%`, background: P.ml.color }} />
                        <div style={{ width: `${(s.shopee / maxStates) * 100}%`, background: P.shopee.color }} />
                      </div>
                      <span className="text-xs font-bold text-slate-700 w-10 text-right">{s.total}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ML Full + mês a mês */}
              <div className="flex flex-col gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-2"><Warehouse size={14} className="text-slate-400" /> Mercado Livre: Full × envio próprio</p>
                  <div className="h-3 rounded-full overflow-hidden flex bg-slate-100 mb-2" style={{ gap: 2 }}>
                    <div style={{ width: `${pct(S.ml.full, S.ml.orders)}%`, background: P.ml.color }} />
                    <div style={{ width: `${100 - pct(S.ml.full, S.ml.orders)}%`, background: '#a5acd9' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-[10px] font-bold text-slate-400 uppercase">Full</p><p className="font-bold text-slate-800">{num(S.ml.full)} pedidos · {num(pct(S.ml.full, S.ml.orders))}%</p><p className="text-xs text-slate-500">{brl(S.ml.fullRevenue)}</p></div>
                    <div><p className="text-[10px] font-bold text-slate-400 uppercase">Envio próprio</p><p className="font-bold text-slate-800">{num(S.ml.orders - S.ml.full)} pedidos</p><p className="text-xs text-slate-500">{brl(S.ml.revenue - S.ml.fullRevenue)}</p></div>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-sm font-bold text-slate-700 mb-2">Taxa de cancelamento</p>
                  {PLATFORMS.map(p => (
                    <div key={p} className="flex items-center gap-3 mb-1.5">
                      <span className="text-xs font-bold w-14" style={{ color: P[p].color }}>{P[p].short}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, S[p].cancelRate * 3)}%`, background: P[p].color }} /></div>
                      <span className="text-xs text-slate-600 w-40 text-right">{num(S[p].cancelRate, 1)}% · {S[p].cancelled} de {S[p].all} · {brl(S[p].cancelledValue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Mês a mês (quando o período cobre mais de um mês) */}
            {monthly.length > 1 && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <p className="text-sm font-bold text-slate-700 px-5 pt-4 pb-2">Mês a mês</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                    <th className="px-5 py-2 font-semibold">Mês</th>
                    <th className="px-3 font-semibold text-right" style={{ color: P.ml.color }}>ML pedidos</th><th className="px-3 font-semibold text-right" style={{ color: P.ml.color }}>ML faturamento</th>
                    <th className="px-3 font-semibold text-right" style={{ color: P.shopee.color }}>Shopee pedidos</th><th className="px-3 font-semibold text-right" style={{ color: P.shopee.color }}>Shopee faturamento</th>
                    <th className="px-5 font-semibold text-right">Total</th>
                  </tr></thead>
                  <tbody>
                    {monthly.map(([m, v]) => (
                      <tr key={m} className="border-b border-slate-50">
                        <td className="px-5 py-2 font-semibold text-slate-700">{MESES[Number(m.slice(5, 7)) - 1]}/{m.slice(2, 4)}</td>
                        <td className="px-3 text-right text-slate-600">{num(v.ml.orders)}</td><td className="px-3 text-right text-slate-700">{brl(v.ml.revenue)}</td>
                        <td className="px-3 text-right text-slate-600">{num(v.shopee.orders)}</td><td className="px-3 text-right text-slate-700">{brl(v.shopee.revenue)}</td>
                        <td className="px-5 text-right font-bold text-slate-800">{brl(v.ml.revenue + v.shopee.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-slate-400 text-center">
              Faturamento = soma de quantidade × preço unitário dos itens (sem frete e sem descontar tarifas das plataformas). Cancelados ficam fora do faturamento e dos pedidos.
            </p>
          </>
        )}
      </div>

      {openProd && <ProductPanel prod={openProd} days={days} onClose={() => setOpenProd(null)} />}
    </div>
  )
}
