import { useEffect, useMemo, useState } from 'react'
import { Timer, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dateBR'

// "Hoje até agora" (07/10): o dia de hoje até a hora atual comparado com
// ontem e com o mesmo dia da semana passada ATÉ O MESMO HORÁRIO — pra
// saber no meio do dia se está vendendo mais ou menos que o normal.
// Mesma régua da página: Σ qtd × preço dos itens, sem cancelados.

const TZ = 'America/Sao_Paulo'
const P = { ml: { short: 'ML', color: '#2D3277' }, shopee: { short: 'Shopee', color: '#EE4D2D' } }
const PLATFORMS = ['ml', 'shopee']
const toD = s => new Date(`${s}T12:00:00Z`)
const addDays = (s, k) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10) }
const brDate = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts))
const brMinutes = ts => { const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts)).split(':').map(Number); return h * 60 + m }
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const isCancelled = o => (o.status_ml || '').toLowerCase().startsWith('cancel') || ['CANCELLED', 'IN_CANCEL'].includes(o.marketplace_status)
const value = o => (o.items || []).reduce((t, i) => t + (Number(i.qty) || 0) * (Number(i.preco_unit) || 0), 0)

function Delta({ now, prev }) {
  if (!prev) return <span className="text-[11px] text-slate-300">—</span>
  const v = ((now - prev) / prev) * 100
  const Icon = Math.abs(v) < 1 ? Minus : v > 0 ? TrendingUp : TrendingDown
  const tone = Math.abs(v) < 1 ? 'text-slate-400' : v > 0 ? 'text-emerald-600' : 'text-rose-600'
  return <span className={`text-[11px] font-semibold inline-flex items-center gap-0.5 ${tone}`}><Icon size={11} />{v > 0 ? '+' : ''}{Math.round(v)}%</span>
}

export function TodaySoFar() {
  const [orders, setOrders] = useState(null)
  const [now, setNow] = useState(Date.now())
  const today = todayISO()
  const days = { hoje: today, ontem: addDays(today, -1), semana: addDays(today, -7) }

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data } = await supabase.from('orders')
        .select('source, data_venda, status_ml, marketplace_status, items:order_items(qty, preco_unit)')
        .in('source', PLATFORMS).gte('data_venda', `${days.semana}T00:00:00-03:00`).limit(5000)
      if (alive) { setOrders(data || []); setNow(Date.now()) }
    }
    load()
    const t = setInterval(load, 5 * 60 * 1000) // atualiza sozinho a cada 5 min
    return () => { alive = false; clearInterval(t) }
  }, [today]) // eslint-disable-line react-hooks/exhaustive-deps

  const nowMin = brMinutes(now)
  const S = useMemo(() => {
    const zero = () => ({ ml: { rev: 0, ord: 0 }, shopee: { rev: 0, ord: 0 } })
    const out = { hoje: zero(), ontem: zero(), semana: zero(), ontemDia: zero() }
    // Receita acumulada por hora (0..23) pros 3 dias — total das duas plataformas
    const curve = { hoje: Array(24).fill(0), ontem: Array(24).fill(0), semana: Array(24).fill(0) }
    for (const o of orders || []) {
      if (isCancelled(o) || !P[o.source]) continue
      const d = brDate(o.data_venda), m = brMinutes(o.data_venda), v = value(o)
      const key = Object.keys(days).find(k => days[k] === d)
      if (!key) continue
      curve[key][Math.floor(m / 60)] += v
      if (key === 'ontem') { out.ontemDia[o.source].rev += v; out.ontemDia[o.source].ord++ }
      if (m <= nowMin) { out[key][o.source].rev += v; out[key][o.source].ord++ }
    }
    for (const k of Object.keys(curve)) for (let h = 1; h < 24; h++) curve[k][h] += curve[k][h - 1]
    const tot = x => ({ rev: x.ml.rev + x.shopee.rev, ord: x.ml.ord + x.shopee.ord })
    return { ...out, tot: { hoje: tot(out.hoje), ontem: tot(out.ontem), semana: tot(out.semana), ontemDia: tot(out.ontemDia) }, curve }
  }, [orders, nowMin]) // eslint-disable-line react-hooks/exhaustive-deps

  const hhmm = `${String(Math.floor(nowMin / 60)).padStart(2, '0')}:${String(nowMin % 60).padStart(2, '0')}`
  const wd = toD(days.semana).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' })

  // Linha acumulada: hoje (até agora) × ontem × semana passada
  const W = 560, H = 120, curH = Math.floor(nowMin / 60)
  const max = Math.max(1, ...['hoje', 'ontem', 'semana'].map(k => S.curve[k][23]))
  const path = (arr, upTo = 23) => arr.slice(0, upTo + 1).map((v, h) => `${h ? 'L' : 'M'}${(h / 23) * W},${H - (v / max) * H}`).join(' ')

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Timer size={14} className="text-slate-400" /> Hoje até agora <span className="font-normal text-slate-400">— até as {hhmm}, comparado com o mesmo horário</span></p>
        {!orders && <Loader2 size={14} className="animate-spin text-slate-300" />}
      </div>
      {orders && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-5 items-center">
          <div className="grid grid-cols-3 gap-3">
            {[['Total', null], ['Mercado Livre', 'ml'], ['Shopee', 'shopee']].map(([label, p]) => {
              const g = k => p ? S[k][p] : S.tot[k]
              return (
                <div key={label} className="rounded-xl border border-slate-100 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color: p ? P[p].color : '#64748b' }}>
                    {p && <span className="w-2 h-2 rounded-sm" style={{ background: P[p].color }} />}{label}
                  </p>
                  <p className="text-xl font-black text-slate-800 mt-1">{brl(g('hoje').rev)}</p>
                  <p className="text-[11px] text-slate-400">{g('hoje').ord} pedido{g('hoje').ord === 1 ? '' : 's'}</p>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between gap-1"><span className="text-slate-500">Ontem até {hhmm}</span><span className="text-slate-600 font-semibold">{brl(g('ontem').rev)}</span></div>
                    <div className="text-right -mt-0.5"><Delta now={g('hoje').rev} prev={g('ontem').rev} /></div>
                    <div className="flex items-center justify-between gap-1"><span className="text-slate-500">{(w => w.charAt(0).toUpperCase() + w.slice(1))(wd.split('-')[0])} passada</span><span className="text-slate-600 font-semibold">{brl(g('semana').rev)}</span></div>
                    <div className="text-right -mt-0.5"><Delta now={g('hoje').rev} prev={g('semana').rev} /></div>
                  </div>
                </div>
              )
            })}
          </div>
          <div>
            <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-auto" role="img" aria-label="Faturamento acumulado por hora">
              {[0.5, 1].map(f => <line key={f} x1="0" x2={W} y1={H - f * H} y2={H - f * H} stroke="#f1f5f9" />)}
              <path d={path(S.curve.semana)} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" />
              <path d={path(S.curve.ontem)} fill="none" stroke="#94a3b8" strokeWidth="2" />
              <path d={path(S.curve.hoje, curH)} fill="none" stroke="#0f172a" strokeWidth="2.5" />
              <circle cx={(curH / 23) * W} cy={H - (S.curve.hoje[curH] / max) * H} r="3.5" fill="#0f172a" />
              {[0, 6, 12, 18, 23].map(h => <text key={h} x={(h / 23) * W} y={H + 14} fontSize="10" fill="#94a3b8" textAnchor={h === 0 ? 'start' : h === 23 ? 'end' : 'middle'}>{h}h</text>)}
            </svg>
            <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-1">
              <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-slate-900" />Hoje</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-slate-400" />Ontem ({brl(S.tot.ontemDia.rev)} no dia)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-slate-300" />Semana passada</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
