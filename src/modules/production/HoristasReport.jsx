import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Loader2, Package, Clock, Gauge, CalendarDays, TrendingUp, TrendingDown,
  X, User, Download, Trophy, Minus,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dateBR'

// Relatório de produção dos horistas (30/09) — semanal / mensal /
// personalizado, por funcionário e no total. Cruza os lançamentos
// (production_entries) com o ponto (time_records) pra ter HORAS e PEÇAS
// POR HORA: o campo hours_worked quase nunca vem preenchido, então as
// horas saem das batidas (entrada/volta → saída), dia a dia.

// ── Datas como 'YYYY-MM-DD' (sem fuso: aritmética em UTC) ──────────────
const toD = s => new Date(`${s}T12:00:00Z`)
const iso = d => d.toISOString().slice(0, 10)
const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const weekStart = s => { const d = toD(s); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return iso(d) } // segunda
const monthStart = s => `${s.slice(0, 7)}-01`
const monthEnd = s => { const d = toD(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d) }
const daysBetween = (a, b) => Math.round((toD(b) - toD(a)) / 86400000) + 1
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const fmtShort = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const fmtLong = s => `${DOW[toD(s).getUTCDay()]}, ${fmtShort(s)}`
const fmtNum = (n, d = 0) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtHours = h => { if (!h) return '—'; const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return `${hh}h${mm ? String(mm).padStart(2, '0') : ''}` }

// Cores fixas por funcionário (ordem alfabética) — nunca por ranking
const EMP_COLORS = ['#8b5cf6', '#f59e0b', '#0ea5e9', '#10b981', '#f43f5e', '#64748b']

// Horas por (funcionário, dia) a partir das batidas
const START = new Set(['entrada', 'volta_almoco'])
const END = new Set(['saida_almoco', 'saida'])
function hoursFromPunches(punches) {
  const byKey = {}
  for (const p of punches) (byKey[`${p.employee_id}|${p.date}`] ||= []).push(p)
  const out = {}
  for (const [key, list] of Object.entries(byKey)) {
    list.sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
    let total = 0, open = null
    for (const p of list) {
      if (START.has(p.punch_type)) open = p
      else if (END.has(p.punch_type) && open) {
        const h = (new Date(p.recorded_at) - new Date(open.recorded_at)) / 3600000
        if (h > 0 && h < 16) total += h
        open = null
      }
    }
    // Se o próprio registro tem horas preenchidas e o cálculo não achou par, usa ele
    if (!total) total = list.reduce((s, p) => s + (Number(p.hours_worked) || 0), 0)
    out[key] = total
  }
  return out
}

function rangeOf(mode, anchor, custom) {
  if (mode === 'semana') { const a = weekStart(anchor); return { from: a, to: addDays(a, 6) } }
  if (mode === 'mes') return { from: monthStart(anchor), to: monthEnd(anchor) }
  return { from: custom.from, to: custom.to }
}
function previousRange({ from, to }, mode) {
  if (mode === 'mes') { const prev = addDays(from, -1); return { from: monthStart(prev), to: monthEnd(prev) } }
  const n = daysBetween(from, to)
  return { from: addDays(from, -n), to: addDays(from, -1) }
}
function rangeLabel(mode, { from, to }) {
  if (mode === 'mes') { const d = toD(from); return `${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}` }
  return `${fmtShort(from)} a ${fmtShort(to)}/${to.slice(0, 4)}`
}

// Agrega lançamentos + horas de um período
function aggregate(entries, hours, from, to) {
  const inRange = entries.filter(e => e.date >= from && e.date <= to)
  const emps = {}
  for (const e of inRange) {
    const x = (emps[e.employee_id] ||= { id: e.employee_id, name: e.employee_name, pieces: 0, days: new Set(), products: {}, byDay: {} })
    x.pieces += e.quantity
    x.days.add(e.date)
    x.products[e.product_name] = (x.products[e.product_name] || 0) + e.quantity
    x.byDay[e.date] = (x.byDay[e.date] || 0) + e.quantity
  }
  for (const x of Object.values(emps)) {
    x.hours = [...x.days].reduce((s, d) => s + (hours[`${x.id}|${d}`] || 0), 0)
    x.daysCount = x.days.size
    // Peças/hora só com os dias que TÊM ponto — dia sem batida entraria com
    // peças e zero hora e distorceria a taxa (achado 30/09: 4 dias assim)
    const withPunch = [...x.days].filter(d => hours[`${x.id}|${d}`])
    x.noPunchDays = x.daysCount - withPunch.length
    x.piecesWithHours = withPunch.reduce((s, d) => s + (x.byDay[d] || 0), 0)
    x.rate = x.hours ? x.piecesWithHours / x.hours : null
    x.avgDay = x.daysCount ? x.pieces / x.daysCount : 0
    const best = Object.entries(x.byDay).sort((a, b) => b[1] - a[1])[0]
    x.bestDay = best ? { date: best[0], pieces: best[1] } : null
    x.topProducts = Object.entries(x.products).sort((a, b) => b[1] - a[1])
  }
  const list = Object.values(emps).sort((a, b) => a.name.localeCompare(b.name))
  const pieces = list.reduce((s, x) => s + x.pieces, 0)
  const hoursTotal = list.reduce((s, x) => s + x.hours, 0)
  const piecesWithHours = list.reduce((s, x) => s + x.piecesWithHours, 0)
  const noPunchDays = list.reduce((s, x) => s + x.noPunchDays, 0)
  const days = new Set(inRange.map(e => e.date))
  const products = {}
  for (const e of inRange) {
    const p = (products[e.product_name] ||= { name: e.product_name, total: 0, byEmp: {} })
    p.total += e.quantity
    p.byEmp[e.employee_id] = (p.byEmp[e.employee_id] || 0) + e.quantity
  }
  return {
    list, pieces, hours: hoursTotal, rate: hoursTotal ? piecesWithHours / hoursTotal : null, days: days.size, noPunchDays,
    avgDay: days.size ? pieces / days.size : 0, entries: inRange,
    products: Object.values(products).sort((a, b) => b.total - a.total),
  }
}

function Delta({ now, prev, unit = '' }) {
  if (prev == null || !prev || now == null) return <span className="text-[11px] text-slate-400">sem comparação</span>
  const pct = ((now - prev) / prev) * 100
  const Icon = Math.abs(pct) < 1 ? Minus : pct > 0 ? TrendingUp : TrendingDown
  const tone = Math.abs(pct) < 1 ? 'text-slate-400' : pct > 0 ? 'text-emerald-600' : 'text-rose-600'
  return <span className={`text-[11px] font-semibold flex items-center gap-0.5 ${tone}`}><Icon size={11} /> {pct > 0 ? '+' : ''}{fmtNum(pct, 0)}% vs anterior{unit}</span>
}

function Kpi({ icon: Icon, label, value, sub, color, bg }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bg }}><Icon size={15} style={{ color }} /></span>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-black text-slate-800">{value}</p>
      <div className="mt-0.5">{sub}</div>
    </div>
  )
}

// Barras por dia, empilhadas por funcionário (legenda sempre presente).
// `showHours` (30/09, pedido do Raphael): liga uma SEGUNDA faixa de barras
// logo abaixo, com as horas do ponto de cada dia — mesmo eixo de dias,
// escala própria (nunca dois eixos no mesmo gráfico), mesmas cores por
// funcionário. O balão do dia mostra peças, horas e peças/hora de cada um.
function DailyChart({ from, to, entries, emps, colorOf, hours, showHours }) {
  const days = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  const byDay = {}
  for (const e of entries) {
    const x = (byDay[e.date] ||= {})
    x[e.employee_id] = (x[e.employee_id] || 0) + e.quantity
  }
  const hoursOf = (d, id) => hours?.[`${id}|${d}`] || 0
  const dayHours = d => emps.reduce((s, e) => s + hoursOf(d, e.id), 0)
  const max = Math.max(1, ...days.map(d => Object.values(byDay[d] || {}).reduce((s, v) => s + v, 0)))
  const maxH = Math.max(1, ...days.map(dayHours))
  const dense = days.length > 14

  function Tooltip({ d, parts, total }) {
    const h = dayHours(d)
    return (
      <div className="pointer-events-none absolute bottom-full mb-1 hidden group-hover:block z-20 bg-slate-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
        <p className="font-bold">{fmtLong(d)} — {total} peça(s){h ? ` · ${fmtHours(h)}` : ''}</p>
        {emps.filter(e => parts[e.id] || hoursOf(d, e.id)).map(e => {
          const ph = hoursOf(d, e.id)
          return (
            <p key={e.id}>
              <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: colorOf(e.id) }} />
              {e.name.split(' ')[0]}: {parts[e.id] || 0} peça(s)
              {ph ? ` · ${fmtHours(ph)} · ${fmtNum((parts[e.id] || 0) / ph, 1)}/h` : parts[e.id] ? ' · sem ponto' : ''}
            </p>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      {/* Peças */}
      <div className="flex items-end gap-[3px] h-44">
        {days.map(d => {
          const parts = byDay[d] || {}
          const total = Object.values(parts).reduce((s, v) => s + v, 0)
          const weekend = [0, 6].includes(toD(d).getUTCDay())
          return (
            <div key={d} className="flex-1 flex flex-col items-center justify-end h-full min-w-0 group relative">
              {total > 0 && <span className="text-[9px] font-bold text-slate-500 mb-0.5">{total}</span>}
              <div className="w-full flex flex-col-reverse rounded-t-[4px] overflow-hidden" style={{ height: `${(total / max) * 150}px`, gap: 2 }}>
                {emps.map(emp => parts[emp.id] ? <div key={emp.id} style={{ height: `${(parts[emp.id] / total) * 100}%`, background: colorOf(emp.id) }} /> : null)}
              </div>
              {!total && <div className={`w-full h-[3px] rounded ${weekend ? 'bg-slate-100' : 'bg-slate-200'}`} />}
              <Tooltip d={d} parts={parts} total={total} />
            </div>
          )
        })}
      </div>

      {/* Dias */}
      <div className="flex gap-[3px] mt-1">
        {days.map((d, i) => (
          <span key={d} className={`flex-1 text-center text-[9px] min-w-0 ${[0, 6].includes(toD(d).getUTCDay()) ? 'text-slate-300' : 'text-slate-400'}`}>
            {dense ? (i % 3 === 0 ? d.slice(8, 10) : '') : `${DOW[toD(d).getUTCDay()]} ${d.slice(8, 10)}`}
          </span>
        ))}
      </div>

      {/* Horas trabalhadas (faixa própria, pendurada pra baixo) */}
      {showHours && (
        <div className="mt-2 pt-2 border-t border-dashed border-slate-200">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Horas trabalhadas (ponto)</p>
          <div className="flex items-start gap-[3px] h-24">
            {days.map(d => {
              const parts = byDay[d] || {}
              const total = Object.values(parts).reduce((s, v) => s + v, 0)
              const h = dayHours(d)
              const noPunch = total > 0 && !h
              return (
                <div key={d} className="flex-1 flex flex-col items-center justify-start h-full min-w-0 group relative">
                  {h > 0 ? (
                    <>
                      <div className="w-full flex flex-col rounded-b-[4px] overflow-hidden opacity-60" style={{ height: `${(h / maxH) * 70}px`, gap: 2 }}>
                        {emps.map(emp => hoursOf(d, emp.id) ? <div key={emp.id} style={{ height: `${(hoursOf(d, emp.id) / h) * 100}%`, background: colorOf(emp.id) }} /> : null)}
                      </div>
                      <span className="text-[9px] font-bold text-slate-500 mt-0.5">{fmtHours(h)}</span>
                      {total > 0 && !dense && <span className="text-[8px] text-slate-400">{fmtNum(total / h, 1)}/h</span>}
                    </>
                  ) : noPunch ? (
                    <span className="text-[9px] font-bold text-amber-500 mt-1" title="Teve produção mas não tem batida de ponto">!</span>
                  ) : (
                    <div className="w-full h-[3px] rounded bg-slate-100" />
                  )}
                  <Tooltip d={d} parts={parts} total={total} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Últimas 8 semanas, no total (tendência)
function WeeksTrend({ entries, hours, anchor }) {
  const weeks = []
  let ws = weekStart(anchor)
  for (let i = 7; i >= 0; i--) weeks.push(addDays(ws, -7 * i))
  const data = weeks.map(w => { const a = aggregate(entries, hours, w, addDays(w, 6)); return { w, pieces: a.pieces, rate: a.rate } })
  const max = Math.max(1, ...data.map(d => d.pieces))
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map(d => (
        <div key={d.w} className="flex-1 flex flex-col items-center justify-end h-full" title={`Semana de ${fmtShort(d.w)}: ${d.pieces} peças${d.rate ? ` · ${fmtNum(d.rate, 1)}/h` : ''}`}>
          <span className="text-[10px] font-bold text-slate-600 mb-0.5">{d.pieces || ''}</span>
          <div className="w-full rounded-t-[4px] bg-violet-500" style={{ height: `${(d.pieces / max) * 96}px`, minHeight: d.pieces ? 3 : 0 }} />
          <span className="text-[9px] text-slate-400 mt-1">{fmtShort(d.w)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Painel lateral de um funcionário ──────────────────────────────────
function EmployeePanel({ emp, color, range, hours, onClose }) {
  const days = Object.keys(emp.byDay).sort().reverse()
  const maxP = emp.topProducts[0]?.[1] || 1
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-slate-50 overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-lg" style={{ background: color }}>{emp.name[0]}</span>
            <div>
              <p className="text-lg font-black text-slate-800">{emp.name}</p>
              <p className="text-xs text-slate-400">{fmtShort(range.from)} a {fmtShort(range.to)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[['Peças', fmtNum(emp.pieces)], ['Horas', fmtHours(emp.hours)], ['Peças/hora', emp.rate ? fmtNum(emp.rate, 1) : '—'], ['Dias', emp.daysCount]].map(([l, v]) => (
              <div key={l} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <p className="text-xl font-black text-slate-800">{v}</p>
                <p className="text-[10px] font-semibold text-slate-400 uppercase">{l}</p>
              </div>
            ))}
          </div>
          {emp.bestDay && (
            <p className="text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center gap-2">
              <Trophy size={15} className="text-amber-500" /> Melhor dia: <b>{fmtLong(emp.bestDay.date)}</b> com <b>{emp.bestDay.pieces}</b> peças · média {fmtNum(emp.avgDay, 1)}/dia
            </p>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-slate-700 mb-3">Produtos</p>
            <div className="flex flex-col gap-2">
              {emp.topProducts.map(([name, qty]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 flex-1 min-w-0 truncate" title={name}>{name}</span>
                  <div className="w-40 h-2 bg-slate-100 rounded-full overflow-hidden shrink-0"><div className="h-full rounded-full" style={{ width: `${(qty / maxP) * 100}%`, background: color }} /></div>
                  <span className="text-xs font-bold text-slate-700 w-10 text-right">{qty}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <p className="text-sm font-bold text-slate-700 px-4 pt-4 pb-2">Dia a dia</p>
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase text-slate-400 text-left"><th className="px-4 py-1.5 font-semibold">Dia</th><th className="px-2 font-semibold text-right">Peças</th><th className="px-2 font-semibold text-right">Horas</th><th className="px-4 font-semibold text-right">Peças/h</th></tr></thead>
              <tbody>
                {days.map(d => {
                  const h = hours[`${emp.id}|${d}`] || 0
                  return (
                    <tr key={d} className="border-t border-slate-50">
                      <td className="px-4 py-1.5 text-slate-600">{fmtLong(d)}</td>
                      <td className="px-2 text-right font-bold text-slate-800">{emp.byDay[d]}</td>
                      <td className="px-2 text-right text-slate-500">{fmtHours(h)}</td>
                      <td className="px-4 text-right text-slate-600">{h ? fmtNum(emp.byDay[d] / h, 1) : <span className="text-slate-300" title="Sem batida de ponto nesse dia">sem ponto</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Relatório ──────────────────────────────────────────────────────────
export function HoristasReport() {
  const today = todayISO()
  const [mode, setMode]     = useState('semana') // semana | mes | periodo
  const [anchor, setAnchor] = useState(today)
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today })
  const [empFilter, setEmpFilter] = useState('') // '' = todos
  const [entries, setEntries] = useState([])
  const [punches, setPunches] = useState([])
  const [loading, setLoading] = useState(true)
  const [panelEmp, setPanelEmp] = useState(null)
  const [showHours, setShowHours] = useState(() => { try { return localStorage.getItem('horistas_show_hours') === '1' } catch { return false } })
  function toggleHours() { setShowHours(v => { try { localStorage.setItem('horistas_show_hours', v ? '0' : '1') } catch { /* ok */ } return !v }) }

  const range = rangeOf(mode, anchor, custom)
  const prev = previousRange(range, mode)
  // Busca o período + o anterior + 8 semanas pra tendência, numa ida só
  const fetchFrom = [prev.from, addDays(weekStart(range.to), -7 * 7)].sort()[0]

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      supabase.from('production_entries').select('employee_id, employee_name, date, quantity, product_name').gte('date', fetchFrom).lte('date', range.to).limit(10000),
      supabase.from('time_records').select('employee_id, punch_type, recorded_at, date, hours_worked').gte('date', fetchFrom).lte('date', range.to).limit(20000),
    ]).then(([e, p]) => {
      if (!alive) return
      setEntries(e.data || []); setPunches(p.data || []); setLoading(false)
    })
    return () => { alive = false }
  }, [fetchFrom, range.to])

  const hours = useMemo(() => hoursFromPunches(punches), [punches])
  const allEmps = useMemo(() => {
    const m = new Map(); entries.forEach(e => m.set(e.employee_id, e.employee_name))
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [entries])
  const colorOf = id => EMP_COLORS[Math.max(0, allEmps.findIndex(e => e.id === id)) % EMP_COLORS.length]

  const scoped = useMemo(() => empFilter ? entries.filter(e => e.employee_id === empFilter) : entries, [entries, empFilter])
  const cur = useMemo(() => aggregate(scoped, hours, range.from, range.to), [scoped, hours, range.from, range.to])
  const before = useMemo(() => aggregate(scoped, hours, prev.from, prev.to), [scoped, hours, prev.from, prev.to])
  const chartEmps = allEmps.filter(e => !empFilter || e.id === empFilter)

  function shift(dir) {
    if (mode === 'semana') setAnchor(a => addDays(a, 7 * dir))
    else if (mode === 'mes') setAnchor(a => { const d = toD(monthStart(a)); d.setUTCMonth(d.getUTCMonth() + dir); return iso(d) })
  }
  const isCurrent = mode !== 'periodo' && range.from <= today && range.to >= today

  function exportCsv() {
    const rows = [['Data', 'Funcionário', 'Produto', 'Quantidade', 'Horas no dia (ponto)']]
    for (const e of [...cur.entries].sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([e.date, e.employee_name, e.product_name, e.quantity, fmtNum(hours[`${e.employee_id}|${e.date}`] || 0, 2)])
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `producao-horistas-${range.from}-a-${range.to}.csv`
    a.click()
  }

  const maxProd = cur.products[0]?.total || 1
  const panelData = panelEmp ? cur.list.find(x => x.id === panelEmp) : null

  return (
    <div className="space-y-5">
      {/* Período */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1">
            {[['semana', 'Semana'], ['mes', 'Mês'], ['periodo', 'Período']].map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} className={`px-3.5 py-1.5 text-sm font-semibold rounded-lg ${mode === k ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
          {mode === 'periodo' ? (
            <div className="flex items-center gap-1.5 text-sm">
              <input type="date" value={custom.from} max={custom.to} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="input py-1.5 text-sm w-auto" />
              <span className="text-slate-400">até</span>
              <input type="date" value={custom.to} min={custom.from} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="input py-1.5 text-sm w-auto" />
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
              <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={16} /></button>
              <span className="text-sm font-bold text-slate-700 px-2 min-w-[150px] text-center">{mode === 'semana' ? 'Semana ' : ''}{rangeLabel(mode, range)}</span>
              <button onClick={() => shift(1)} disabled={isCurrent} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30"><ChevronRight size={16} /></button>
              {!isCurrent && <button onClick={() => setAnchor(today)} className="text-xs font-semibold text-violet-600 px-2">hoje</button>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} className="select py-1.5 text-sm w-auto">
            <option value="">Todos os horistas</option>
            {allEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button onClick={exportCsv} disabled={!cur.entries.length} className="btn-secondary py-1.5 text-sm disabled:opacity-40"><Download size={14} /> CSV</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200"><Loader2 size={26} className="mx-auto animate-spin text-slate-300" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={Package} label="Peças produzidas" value={fmtNum(cur.pieces)} color="#7c3aed" bg="#f5f3ff" sub={<Delta now={cur.pieces} prev={before.pieces} />} />
            <Kpi icon={Clock} label="Horas trabalhadas" value={fmtHours(cur.hours)} color="#0284c7" bg="#f0f9ff" sub={<span className={`text-[11px] ${cur.noPunchDays ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>{cur.noPunchDays ? `${cur.noPunchDays} dia(s) com produção sem ponto` : 'pelas batidas de ponto'}</span>} />
            <Kpi icon={Gauge} label="Peças por hora" value={cur.rate ? fmtNum(cur.rate, 1) : '—'} color="#d97706" bg="#fffbeb" sub={<Delta now={cur.rate} prev={before.rate} />} />
            <Kpi icon={CalendarDays} label="Dias com produção" value={cur.days} color="#059669" bg="#ecfdf5" sub={<span className="text-[11px] text-slate-400">média {fmtNum(cur.avgDay, 1)} peças/dia</span>} />
            <Kpi icon={User} label="Horistas no período" value={cur.list.length} color="#64748b" bg="#f1f5f9" sub={<span className="text-[11px] text-slate-400">{cur.list.map(x => x.name.split(' ')[0]).join(', ') || '—'}</span>} />
          </div>

          {!cur.entries.length ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <Package size={32} strokeWidth={1} className="mx-auto mb-2 text-slate-200" />
              <p className="text-slate-400 text-sm">Nenhum lançamento nesse período.</p>
            </div>
          ) : (
            <>
              {/* Por dia */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold text-slate-700">Produção por dia</p>
                    <button type="button" onClick={toggleHours}
                      className={`flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-full border transition ${showHours ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      <span className={`relative w-7 h-4 rounded-full transition ${showHours ? 'bg-sky-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${showHours ? 'left-[14px]' : 'left-0.5'}`} /></span>
                      <Clock size={12} /> Horas trabalhadas
                    </button>
                  </div>
                  {chartEmps.length > 1 && (
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {chartEmps.map(e => <span key={e.id} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(e.id) }} />{e.name.split(' ')[0]}</span>)}
                    </div>
                  )}
                </div>
                <DailyChart from={range.from} to={range.to} entries={cur.entries} emps={chartEmps} colorOf={colorOf} hours={hours} showHours={showHours} />
              </div>

              {/* Por funcionário */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <p className="text-sm font-bold text-slate-700 px-5 pt-4 pb-2">Por funcionário <span className="font-normal text-slate-400">— clique pra ver o detalhe</span></p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                        <th className="px-5 py-2 font-semibold">Funcionário</th>
                        <th className="px-3 font-semibold text-right">Peças</th>
                        <th className="px-3 font-semibold">Participação</th>
                        <th className="px-3 font-semibold text-right">Horas</th>
                        <th className="px-3 font-semibold text-right">Peças/h</th>
                        <th className="px-3 font-semibold text-right">Dias</th>
                        <th className="px-3 font-semibold text-right">Média/dia</th>
                        <th className="px-5 font-semibold">Mais produzido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cur.list.map(x => {
                        const prevX = before.list.find(p => p.id === x.id)
                        return (
                          <tr key={x.id} onClick={() => setPanelEmp(x.id)} className="border-b border-slate-50 hover:bg-violet-50/40 cursor-pointer">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0" style={{ background: colorOf(x.id) }}>{x.name[0]}</span>
                                <span className="font-semibold text-slate-700">{x.name}</span>
                              </div>
                            </td>
                            <td className="px-3 text-right">
                              <p className="font-black text-slate-800">{fmtNum(x.pieces)}</p>
                              {prevX && <Delta now={x.pieces} prev={prevX.pieces} />}
                            </td>
                            <td className="px-3">
                              <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(x.pieces / (cur.pieces || 1)) * 100}%`, background: colorOf(x.id) }} /></div>
                              <p className="text-[10px] text-slate-400 mt-0.5">{fmtNum((x.pieces / (cur.pieces || 1)) * 100)}%</p>
                            </td>
                            <td className="px-3 text-right text-slate-600">{fmtHours(x.hours)}{x.noPunchDays > 0 && <p className="text-[10px] text-amber-600 font-semibold" title="Dias com produção lançada mas sem batida de ponto — ficam fora do peças/hora">{x.noPunchDays} dia(s) sem ponto</p>}</td>
                            <td className="px-3 text-right font-semibold text-slate-700">{x.rate ? fmtNum(x.rate, 1) : '—'}</td>
                            <td className="px-3 text-right text-slate-600">{x.daysCount}</td>
                            <td className="px-3 text-right text-slate-600">{fmtNum(x.avgDay, 1)}</td>
                            <td className="px-5 text-xs text-slate-500 max-w-[220px] truncate" title={x.topProducts[0]?.[0]}>{x.topProducts[0] ? `${x.topProducts[0][1]}× ${x.topProducts[0][0]}` : '—'}</td>
                          </tr>
                        )
                      })}
                      {cur.list.length > 1 && (
                        <tr className="bg-slate-50 font-bold">
                          <td className="px-5 py-3 text-slate-700">Total</td>
                          <td className="px-3 text-right text-slate-800">{fmtNum(cur.pieces)}</td>
                          <td className="px-3" />
                          <td className="px-3 text-right text-slate-700">{fmtHours(cur.hours)}</td>
                          <td className="px-3 text-right text-slate-800">{cur.rate ? fmtNum(cur.rate, 1) : '—'}</td>
                          <td className="px-3 text-right text-slate-700">{cur.days}</td>
                          <td className="px-3 text-right text-slate-700">{fmtNum(cur.avgDay, 1)}</td>
                          <td className="px-5" />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
                {/* Por produto */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-sm font-bold text-slate-700 mb-3">Por produto <span className="font-normal text-slate-400">({cur.products.length})</span></p>
                  <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {cur.products.map(p => (
                      <div key={p.name} title={chartEmps.filter(e => p.byEmp[e.id]).map(e => `${e.name.split(' ')[0]}: ${p.byEmp[e.id]}`).join(' · ')}>
                        <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
                          <span className="text-slate-700 truncate">{p.name}</span>
                          <span className="font-bold text-slate-800 shrink-0">{p.total}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex" style={{ width: `${Math.max(4, (p.total / maxProd) * 100)}%`, gap: 2 }}>
                          {chartEmps.map(e => p.byEmp[e.id] ? <div key={e.id} style={{ width: `${(p.byEmp[e.id] / p.total) * 100}%`, background: colorOf(e.id) }} /> : null)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tendência */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-sm font-bold text-slate-700 mb-1">Últimas 8 semanas</p>
                  <p className="text-[11px] text-slate-400 mb-4">Peças por semana{empFilter ? ` — ${allEmps.find(e => e.id === empFilter)?.name.split(' ')[0]}` : ' — todos'} (passe o mouse pra ver peças/hora)</p>
                  <WeeksTrend entries={scoped} hours={hours} anchor={range.to} />
                </div>
              </div>

              {cur.hours === 0 && (
                <p className="text-xs text-slate-400 text-center">Sem batidas de ponto nesse período — horas e peças/hora ficam em branco.</p>
              )}
            </>
          )}
        </>
      )}

      {panelData && <EmployeePanel emp={panelData} color={colorOf(panelData.id)} range={range} hours={hours} onClose={() => setPanelEmp(null)} />}
    </div>
  )
}
