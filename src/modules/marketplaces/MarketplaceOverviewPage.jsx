import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LayoutDashboard, Loader2, TrendingUp, TrendingDown, Minus, DollarSign, ShoppingBag, Package, Receipt, XCircle,
  ShieldAlert, RotateCcw, Boxes, ArrowRight, Info, Trophy,
} from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dateBR'
import { PLAT, PLATFORMS, usePlatformFilter, PlatformFilter, Segmented, brl, fmtN, isCancelled, fetchAll } from './shared'

// Visão Geral unificada ML + Shopee (Fase 1 da unificação, 09/10).
// Mesma régua da tela ML × Shopee da Diretoria: tudo calculado a partir dos
// pedidos do nosso banco (Σ qtd × preço dos itens, sem cancelados) — assim
// "ML + Shopee" soma coisas iguais. Filtro de plataforma no topo.

const TZ = 'America/Sao_Paulo'
const toD = s => new Date(`${s}T12:00:00Z`)
const iso = d => d.toISOString().slice(0, 10)
const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const daysBetween = (a, b) => Math.round((toD(b) - toD(a)) / 86400000) + 1
const monthStart = s => `${s.slice(0, 7)}-01`
const brDate = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts))
const fmtShort = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const PERIODS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['mes', 'Este mês'], ['mes_ant', 'Mês passado']]
function rangeOf(key) {
  const today = todayISO()
  if (key === 'mes') return { from: monthStart(today), to: today }
  if (key === 'mes_ant') { const prevEnd = addDays(monthStart(today), -1); return { from: monthStart(prevEnd), to: prevEnd } }
  return { from: addDays(today, -(Number(key) - 1)), to: today }
}
function previousOf(r, key) {
  const n = daysBetween(r.from, r.to)
  if (key === 'mes' || key === 'mes_ant') { const prevFrom = monthStart(addDays(r.from, -1)); return { from: prevFrom, to: addDays(prevFrom, n - 1) } }
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) }
}

function fetchOrders({ from, to }) {
  return fetchAll(() => supabase.from('orders')
    .select('id, source, data_venda, status_ml, marketplace_status, is_full, items:order_items(qty, preco_unit, titulo, sku, product_id, product:products(name))')
    .in('source', PLATFORMS).gte('data_venda', `${from}T00:00:00-03:00`).lt('data_venda', `${addDays(to, 1)}T00:00:00-03:00`)
    .order('data_venda'))
}

const value = o => (o.items || []).reduce((t, i) => t + (Number(i.qty) || 0) * (Number(i.preco_unit) || 0), 0)
const unitsOf = o => (o.items || []).reduce((t, i) => t + (Number(i.qty) || 0), 0)

function summarize(orders, plats) {
  const s = { revenue: 0, orders: 0, units: 0, cancelled: 0, all: 0, by: { ml: { revenue: 0, orders: 0, units: 0, cancelled: 0, all: 0 }, shopee: { revenue: 0, orders: 0, units: 0, cancelled: 0, all: 0 } } }
  for (const o of orders) {
    if (!plats.includes(o.source)) continue
    const b = s.by[o.source]
    s.all++; b.all++
    if (isCancelled(o)) { s.cancelled++; b.cancelled++; continue }
    const v = value(o), u = unitsOf(o)
    s.revenue += v; s.orders++; s.units += u
    b.revenue += v; b.orders++; b.units += u
  }
  s.ticket = s.orders ? s.revenue / s.orders : 0
  s.cancelRate = s.all ? (s.cancelled / s.all) * 100 : 0
  for (const p of PLATFORMS) { const b = s.by[p]; b.ticket = b.orders ? b.revenue / b.orders : 0; b.cancelRate = b.all ? (b.cancelled / b.all) * 100 : 0 }
  return s
}

function Delta({ now, prev, invert }) {
  if (!prev) return <span className="text-[11px] text-slate-300">sem comparação</span>
  const v = ((now - prev) / prev) * 100
  const good = invert ? v < 0 : v > 0
  const Icon = Math.abs(v) < 1 ? Minus : v > 0 ? TrendingUp : TrendingDown
  const tone = Math.abs(v) < 1 ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-rose-600'
  return <span className={`text-[11px] font-semibold inline-flex items-center gap-0.5 ${tone}`} title="comparado com o período anterior do mesmo tamanho"><Icon size={11} />{v > 0 ? '+' : ''}{Math.round(v)}%</span>
}

function Kpi({ icon: Icon, label, field, fmt, cur, prev, plat, invert }) {
  const both = !plat
  const ml = cur.by.ml[field], sh = cur.by.shopee[field]
  const share = ml + sh > 0 ? (ml / (ml + sh)) * 100 : 0
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5"><Icon size={13} />{label}</p>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xl font-black text-slate-800 tabular-nums">{fmt(cur[field])}</p>
        <Delta now={cur[field]} prev={prev?.[field]} invert={invert} />
      </div>
      {both && (
        <>
          {field !== 'ticket' && field !== 'cancelRate' && ml + sh > 0 && (
            <div className="h-1.5 rounded-full overflow-hidden flex bg-slate-100" title={`ML ${Math.round(share)}% · Shopee ${Math.round(100 - share)}%`}>
              <div style={{ width: `${share}%`, background: PLAT.ml.bar }} /><div style={{ width: `${100 - share}%`, background: PLAT.shopee.bar }} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {PLATFORMS.map(p => (
              <p key={p} className="flex items-center gap-1 text-slate-500"><span className="w-2 h-2 rounded-sm" style={{ background: PLAT[p].color }} />{PLAT[p].short} <span className="font-bold text-slate-700 tabular-nums">{fmt(cur.by[p][field])}</span></p>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ChartTip({ active, payload, label, money = true }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((t, p) => t + (p.value || 0), 0)
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="text-slate-500 mb-1">{label}</p>
      {payload.map(p => <p key={p.dataKey} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: p.fill }} />{PLAT[p.dataKey]?.short}: <span className="font-semibold">{money ? brl(p.value) : fmtN(p.value)}</span></p>)}
      {payload.length > 1 && <p className="font-bold text-slate-800 mt-1">Total {money ? brl(total) : fmtN(total)}</p>}
    </div>
  )
}

export function MarketplaceOverviewPage() {
  const [plat, setPlat] = usePlatformFilter()
  const [period, setPeriod] = useState('30')
  const [metric, setMetric] = useState('revenue')
  const [data, setData] = useState(null)
  const [attention, setAttention] = useState(null)
  const [error, setError] = useState(null)
  const plats = plat ? [plat] : PLATFORMS

  useEffect(() => {
    let alive = true
    setData(null); setError(null)
    const r = rangeOf(period), pr = previousOf(r, period)
    Promise.all([fetchOrders(r), fetchOrders(pr)])
      .then(([cur, prev]) => alive && setData({ cur, prev, range: r }))
      .catch(e => alive && setError(e.message))
    return () => { alive = false }
  }, [period])

  // O que precisa de atenção agora (contagens, sem R$)
  useEffect(() => {
    Promise.all([
      supabase.from('ml_claims').select('id', { count: 'exact', head: true }).eq('status', 'opened'),
      supabase.from('shopee_returns').select('return_sn', { count: 'exact', head: true }).not('status', 'in', '(ACCEPTED,CANCELLED,CLOSED,REFUND_PAID)').gte('create_time', new Date(Date.now() - 90 * 86400e3).toISOString()),
      fetchAll(() => supabase.from('marketplace_stock').select('platform, stock, status, sub_status')),
    ]).then(([cl, rt, st]) => {
      const zero = { ml: 0, shopee: 0 }
      ;(st || []).forEach(r => { const byHand = r.status !== 'active' && !String(r.sub_status || '').includes('out_of_stock'); if (!byHand && (r.stock ?? 0) <= 0 && r.platform in zero) zero[r.platform]++ })
      setAttention({ claims: cl.count || 0, returns: rt.count || 0, zero })
    }).catch(() => setAttention(null))
  }, [])

  const S = useMemo(() => data && { cur: summarize(data.cur, plats), prev: summarize(data.prev, plats) }, [data, plat]) // eslint-disable-line react-hooks/exhaustive-deps

  const daily = useMemo(() => {
    if (!data) return []
    const n = daysBetween(data.range.from, data.range.to)
    const rows = Array.from({ length: n }, (_, i) => { const d = addDays(data.range.from, i); return { date: d, label: fmtShort(d), ml: 0, shopee: 0 } })
    const idx = Object.fromEntries(rows.map((r, i) => [r.date, i]))
    for (const o of data.cur) {
      if (!plats.includes(o.source) || isCancelled(o)) continue
      const i = idx[brDate(o.data_venda)]; if (i == null) continue
      rows[i][o.source] += metric === 'revenue' ? value(o) : metric === 'orders' ? 1 : unitsOf(o)
    }
    return rows
  }, [data, plat, metric]) // eslint-disable-line react-hooks/exhaustive-deps

  const weekday = useMemo(() => {
    const rows = DOW.map(l => ({ label: l, ml: 0, shopee: 0 }))
    for (const o of data?.cur || []) {
      if (!plats.includes(o.source) || isCancelled(o)) continue
      const d = toD(brDate(o.data_venda)).getUTCDay()
      rows[d][o.source] += metric === 'revenue' ? value(o) : metric === 'orders' ? 1 : unitsOf(o)
    }
    return rows
  }, [data, plat, metric]) // eslint-disable-line react-hooks/exhaustive-deps

  const top = useMemo(() => {
    const m = {}
    for (const o of data?.cur || []) {
      if (!plats.includes(o.source) || isCancelled(o)) continue
      for (const i of o.items || []) {
        const k = i.product_id || (i.sku ? `sku:${i.sku}` : `t:${i.titulo}`)
        m[k] ||= { name: i.product?.name || i.titulo || i.sku || '—', ml: 0, shopee: 0, revenue: 0 }
        m[k][o.source] += Number(i.qty) || 0
        m[k].revenue += (Number(i.qty) || 0) * (Number(i.preco_unit) || 0)
      }
    }
    return Object.values(m).sort((a, b) => (b.ml + b.shopee) - (a.ml + a.shopee)).slice(0, 10)
  }, [data, plat]) // eslint-disable-line react-hooks/exhaustive-deps

  const money = metric === 'revenue'
  const yFmt = v => money ? (v >= 1000 ? `${Math.round(v / 1000)}k` : v) : v

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFE600] to-[#EE4D2D] flex items-center justify-center shrink-0 shadow-sm"><LayoutDashboard size={20} className="text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Visão Geral dos Marketplaces</h1>
            <p className="text-sm text-slate-500">Mercado Livre e Shopee na mesma régua — escolha uma plataforma ou veja as duas juntas</p>
          </div>
        </div>
      </div>

      <div className="card !p-3 flex items-center gap-3 flex-wrap">
        <PlatformFilter value={plat} onChange={setPlat} />
        <div className="ml-auto"><Segmented value={period} onChange={setPeriod} options={PERIODS} /></div>
      </div>

      {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{error}</div>}

      {!S ? (
        <div className="card py-24 text-center"><Loader2 size={24} className="mx-auto animate-spin text-slate-300" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={DollarSign} label="Faturamento" field="revenue" fmt={brl} {...S} plat={plat} />
            <Kpi icon={ShoppingBag} label="Pedidos" field="orders" fmt={fmtN} {...S} plat={plat} />
            <Kpi icon={Package} label="Unidades" field="units" fmt={fmtN} {...S} plat={plat} />
            <Kpi icon={Receipt} label="Ticket médio" field="ticket" fmt={brl} {...S} plat={plat} />
            <Kpi icon={XCircle} label="Cancelamento" field="cancelRate" fmt={v => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`} {...S} plat={plat} invert />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            <div className="xl:col-span-2 flex flex-col gap-4">
              <div className="card">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <p className="font-bold text-slate-800 text-[15px]">Dia a dia</p>
                  <Segmented value={metric} onChange={setMetric} options={[['revenue', 'Faturamento'], ['orders', 'Pedidos'], ['units', 'Unidades']]} />
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={daily} margin={{ top: 5, right: 5, bottom: 0, left: -8 }} barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={yFmt} />
                    <Tooltip content={<ChartTip money={money} />} cursor={{ fill: '#f8fafc' }} />
                    {plats.map((p, i) => <Bar key={p} dataKey={p} stackId="a" fill={PLAT[p].bar} radius={i === plats.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <p className="font-bold text-slate-800 text-[15px] mb-3 flex items-center gap-2"><Trophy size={15} className="text-amber-500" />Produtos mais vendidos <span className="text-xs font-normal text-slate-400">unidades no período</span></p>
                {!top.length && <p className="text-sm text-slate-400">Sem vendas no período.</p>}
                <div className="flex flex-col gap-2.5">
                  {top.map((t, i) => {
                    const tot = t.ml + t.shopee
                    return (
                      <div key={t.name + i} className="flex items-center gap-3">
                        <span className="w-5 text-xs font-bold text-slate-300 tabular-nums">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-slate-700 truncate" title={t.name}>{t.name}</p>
                          <div className="h-1.5 rounded-full overflow-hidden flex bg-slate-100 mt-1" style={{ width: `${Math.max(8, (tot / (top[0].ml + top[0].shopee)) * 100)}%` }}>
                            {plats.map(p => t[p] > 0 && <div key={p} style={{ width: `${(t[p] / tot) * 100}%`, background: PLAT[p].bar }} />)}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-slate-800 tabular-nums">{fmtN(tot)} un.</p>
                          {!plat && <p className="text-[10px] text-slate-400 tabular-nums">ML {t.ml} · Shopee {t.shopee}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {attention && (
                <div className="card">
                  <p className="font-bold text-slate-800 text-[15px] mb-3">Precisa de atenção</p>
                  <div className="flex flex-col gap-2">
                    {(!plat || plat === 'ml') && (
                      <Link to="/ml/reclamacoes" className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:border-slate-300">
                        <ShieldAlert size={16} className={attention.claims ? 'text-rose-500' : 'text-slate-300'} />
                        <span className="flex-1 text-sm text-slate-700">Reclamações abertas <span className="text-[11px] text-slate-400">ML</span></span>
                        <span className="font-black tabular-nums">{attention.claims}</span><ArrowRight size={13} className="text-slate-300" />
                      </Link>
                    )}
                    {(!plat || plat === 'shopee') && (
                      <Link to="/shopee/retornos" className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:border-slate-300">
                        <RotateCcw size={16} className={attention.returns ? 'text-amber-500' : 'text-slate-300'} />
                        <span className="flex-1 text-sm text-slate-700">Devoluções em aberto <span className="text-[11px] text-slate-400">Shopee</span></span>
                        <span className="font-black tabular-nums">{attention.returns}</span><ArrowRight size={13} className="text-slate-300" />
                      </Link>
                    )}
                    <Link to={`/estoque-marketplaces${plat ? '' : ''}`} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:border-slate-300">
                      <Boxes size={16} className="text-rose-500" />
                      <span className="flex-1 text-sm text-slate-700">Variações sem estoque</span>
                      <span className="font-black tabular-nums">{plats.reduce((t, p) => t + attention.zero[p], 0)}</span><ArrowRight size={13} className="text-slate-300" />
                    </Link>
                  </div>
                </div>
              )}

              <div className="card">
                <p className="font-bold text-slate-800 text-[15px] mb-3">Por dia da semana</p>
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={weekday} margin={{ top: 0, right: 0, bottom: 0, left: -20 }} barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={yFmt} />
                    <Tooltip content={<ChartTip money={money} />} cursor={{ fill: '#f8fafc' }} />
                    {plats.map((p, i) => <Bar key={p} dataKey={p} stackId="a" fill={PLAT[p].bar} radius={i === plats.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <p className="font-bold text-slate-800 text-[15px] mb-2">Painéis de cada plataforma</p>
                <p className="text-xs text-slate-500 mb-3">O que é só de uma plataforma (reputação, Ads, promoções…) continua no painel dela por enquanto.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/ml" className="rounded-xl px-3 py-2 text-xs font-bold text-center" style={{ background: PLAT.ml.soft, color: PLAT.ml.ink }}>Painel do ML →</Link>
                  <Link to="/shopee" className="rounded-xl px-3 py-2 text-xs font-bold text-center" style={{ background: PLAT.shopee.soft, color: PLAT.shopee.ink }}>Painel da Shopee →</Link>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
            <span>Números calculados a partir dos pedidos do sistema (quantidade × preço dos itens, sem cancelados) — mesma régua nas duas plataformas e na tela ML × Shopee da Diretoria. A % ao lado compara com o período anterior do mesmo tamanho. Histórico completo do ML só a partir de 17/08.</span>
          </p>
        </>
      )}
    </div>
  )
}
