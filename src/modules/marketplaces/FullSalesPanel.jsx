import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Loader2, Zap, Package, Percent, DollarSign, TrendingUp, TrendingDown, Minus, Info, Trophy } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { StatTile } from '../dashboard/widgets'
import { Segmented, norm, brl, fmtN, isCancelled, fetchAll } from './shared'

// Vendas do Full do ML (14/10) — aba "Vendas" da tela de Estoque Full.
// Pedidos do ML com is_full (a importação já marca), comparando com o
// período anterior e com o envio próprio. O ranking cruza com o estoque que
// ainda está no Full (prop `fullItems`, o mesmo que a aba Estoque carrega)
// pelo título do anúncio ou pelo SKU. R$ só pra diretoria.

const FULL = '#00A650'      // verde do selo FULL do Mercado Livre
const PROPRIO = '#CBD5E1'
const TZ = 'America/Sao_Paulo'
const dayKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const secure = u => u ? u.replace(/^http:\/\//, 'https://') : null

function Delta({ cur, prev }) {
  if (!prev) return <span className="text-slate-400">sem base de comparação</span>
  const pct = ((cur - prev) / prev) * 100
  const Icon = pct > 0.5 ? TrendingUp : pct < -0.5 ? TrendingDown : Minus
  return <span className={`inline-flex items-center gap-1 font-semibold ${pct > 0.5 ? 'text-emerald-600' : pct < -0.5 ? 'text-rose-600' : 'text-slate-500'}`}><Icon size={12} />{pct > 0 ? '+' : ''}{pct.toFixed(0)}% vs período anterior</span>
}

export function FullSalesPanel({ fullItems }) {
  const { user } = useAuth()
  const showValues = user?.role === 'admin'
  const [days, setDays] = useState('30')
  const [orders, setOrders] = useState(null)
  const [stock, setStock] = useState([])

  useEffect(() => {
    setOrders(null)
    const since = new Date(Date.now() - Number(days) * 2 * 86400e3).toISOString()
    fetchAll(() => supabase.from('orders').select('id, data_venda, is_full, status_ml, marketplace_status, items:order_items(qty, preco_unit, titulo, sku)').eq('source', 'ml').gte('data_venda', since).order('data_venda'))
      .then(setOrders).catch(() => setOrders([]))
  }, [days])
  useEffect(() => {
    fetchAll(() => supabase.from('marketplace_stock').select('item_id, title, sku, thumbnail').eq('platform', 'ml')).then(setStock).catch(() => {})
  }, [])

  const d = useMemo(() => {
    if (!orders) return null
    const n = Number(days), now = Date.now(), cut = now - n * 86400e3
    const valid = orders.filter(o => !isCancelled(o))
    const cur = valid.filter(o => new Date(o.data_venda).getTime() >= cut)
    const prev = valid.filter(o => new Date(o.data_venda).getTime() < cut)
    const units = list => list.reduce((t, o) => t + (o.items || []).reduce((s, i) => s + (i.qty || 0), 0), 0)
    const value = list => list.reduce((t, o) => t + (o.items || []).reduce((s, i) => s + (i.qty || 0) * (Number(i.preco_unit) || 0), 0), 0)
    const fCur = cur.filter(o => o.is_full), fPrev = prev.filter(o => o.is_full)

    // Por dia (todos os dias do período, mesmo sem venda)
    const byDay = {}
    for (let t = cut; t <= now; t += 86400e3) { const k = dayKey(new Date(t)); byDay[k] = { k, label: k.slice(8, 10) + '/' + k.slice(5, 7), full: 0, proprio: 0 } }
    cur.forEach(o => { const k = dayKey(new Date(o.data_venda)); if (byDay[k]) byDay[k][o.is_full ? 'full' : 'proprio']++ })

    // Dia da semana (só Full)
    const wd = WD.map(l => ({ l, full: 0 }))
    fCur.forEach(o => { wd[new Date(new Date(o.data_venda).toLocaleString('en-US', { timeZone: TZ })).getDay()].full++ })

    // Ranking de produtos no Full
    const thumbByTitle = {}, skuItem = {}
    stock.forEach(s => { thumbByTitle[norm(s.title)] ||= secure(s.thumbnail); if (s.sku) skuItem[s.sku.trim().toUpperCase()] ||= s.item_id })
    const fullByItem = Object.fromEntries((fullItems || []).map(f => [f.item_id, f]))
    const fullByTitle = Object.fromEntries((fullItems || []).map(f => [norm(f.title), f]))
    const rank = {}
    fCur.forEach(o => (o.items || []).forEach(i => {
      const k = norm(i.titulo)
      rank[k] ||= { title: i.titulo, units: 0, orders: 0, value: 0, sku: i.sku }
      rank[k].units += i.qty || 0; rank[k].orders++; rank[k].value += (i.qty || 0) * (Number(i.preco_unit) || 0)
    }))
    const ranking = Object.entries(rank).map(([k, r]) => {
      const f = fullByTitle[k] || (r.sku && fullByItem[skuItem[r.sku.trim().toUpperCase()]])
      const perDay = r.units / n
      return { ...r, thumb: thumbByTitle[k] || secure(f?.thumbnail), left: f ? f.available_quantity : null, days: f && perDay > 0 ? f.available_quantity / perDay : null }
    }).sort((a, b) => b.units - a.units)

    return {
      fOrders: fCur.length, fOrdersPrev: fPrev.length, fUnits: units(fCur), fUnitsPrev: units(fPrev),
      share: cur.length ? (fCur.length / cur.length) * 100 : 0, sharePrev: prev.length ? (fPrev.length / prev.length) * 100 : 0,
      fValue: value(fCur), fValuePrev: value(fPrev), products: ranking.length,
      daily: Object.values(byDay), wd, ranking,
    }
  }, [orders, stock, fullItems, days])

  const maxUnits = d?.ranking[0]?.units || 1

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500 flex items-center gap-2"><span className="inline-flex items-center gap-1 text-[11px] font-black text-white px-1.5 py-0.5 rounded" style={{ background: FULL }}><Zap size={11} className="fill-white" />FULL</span>o que saiu do centro de distribuição do Mercado Livre</p>
        <Segmented value={days} onChange={setDays} options={[['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']]} />
      </div>

      {!d ? <div className="card py-20 text-center"><Loader2 size={22} className="mx-auto animate-spin text-slate-300" /></div> : (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile icon={Zap} tone="good" label="Pedidos pelo Full" value={fmtN(d.fOrders)} detail={<Delta cur={d.fOrders} prev={d.fOrdersPrev} />} />
          <StatTile icon={Package} tone="good" label="Unidades vendidas" value={fmtN(d.fUnits)} detail={<Delta cur={d.fUnits} prev={d.fUnitsPrev} />} />
          <StatTile icon={Percent} label="Do ML que foi pelo Full" value={`${d.share.toFixed(0)}%`} detail={d.sharePrev ? `era ${d.sharePrev.toFixed(0)}% no período anterior` : 'dos pedidos do ML'} />
          {showValues
            ? <StatTile icon={DollarSign} label="Faturamento Full" value={brl(d.fValue)} detail={<Delta cur={d.fValue} prev={d.fValuePrev} />} />
            : <StatTile icon={Trophy} label="Produtos diferentes" value={fmtN(d.products)} detail="venderam pelo Full no período" />}
        </div>

        <div className="grid xl:grid-cols-[1fr_320px] gap-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-slate-800 text-[15px]">Pedidos por dia</p>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FULL }} />Full</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PROPRIO }} />Envio próprio</span>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.daily} margin={{ top: 5, right: 5, bottom: 0, left: -18 }} barCategoryGap="18%">
                  <CartesianGrid vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} formatter={(v, k) => [v, k === 'full' ? 'Full' : 'Envio próprio']} />
                  <Bar dataKey="full" stackId="a" fill={FULL} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="proprio" stackId="a" fill={PROPRIO} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <p className="font-bold text-slate-800 text-[15px] mb-3">Dia da semana no Full</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.wd} margin={{ top: 0, right: 0, bottom: 0, left: -24 }} barSize={20}>
                  <XAxis dataKey="l" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} formatter={v => [v, 'pedidos']} />
                  <Bar dataKey="full" fill={FULL} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card !p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <p className="font-bold text-slate-800 text-[15px] flex items-center gap-2"><Trophy size={15} className="text-amber-500" />Mais vendidos no Full</p>
            <p className="text-[11px] text-slate-400">barra = unidades vendidas · à direita, o que ainda tem no Full</p>
          </div>
          {!d.ranking.length ? <p className="text-sm text-slate-400 text-center py-12">Nenhuma venda pelo Full nesse período.</p>
            : d.ranking.slice(0, 15).map((r, i) => {
              const crit = r.left != null && (r.left <= 0 || (r.days != null && r.days <= 7))
              return (
                <div key={r.title} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50 last:border-0">
                  <span className={`w-6 text-center text-xs font-black ${i < 3 ? 'text-amber-500' : 'text-slate-300'}`}>{i + 1}</span>
                  {r.thumb ? <img src={r.thumb} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-slate-800 leading-snug truncate" title={r.title}>{r.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden max-w-md"><div className="h-full rounded-full" style={{ width: `${(r.units / maxUnits) * 100}%`, background: FULL }} /></div>
                      <span className="text-[12px] font-black text-slate-800 tabular-nums w-16">{fmtN(r.units)} un.</span>
                      <span className="text-[11px] text-slate-400 hidden sm:inline">{r.orders} pedido{r.orders === 1 ? '' : 's'}{showValues ? ` · ${brl(r.value)}` : ''}</span>
                    </div>
                  </div>
                  <div className="w-32 text-right shrink-0">
                    {r.left == null ? <span className="text-[11px] text-slate-300">fora do Full hoje</span>
                      : <><p className={`text-[13px] font-bold tabular-nums ${crit ? 'text-rose-600' : 'text-slate-700'}`}>{fmtN(r.left)} no Full</p>
                        {r.days != null && <p className={`text-[10px] ${crit ? 'text-rose-500 font-semibold' : 'text-slate-400'}`}>{r.left <= 0 ? 'zerado' : `~${Math.round(r.days)} dias`}</p>}</>}
                  </div>
                </div>
              )
            })}
        </div>

        <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
          <span>Pedidos do ML marcados como Full na importação; cancelados não contam. "~X dias" = estoque atual no Full ÷ média de vendas por dia no período escolhido.</span>
        </p>
      </>)}
    </div>
  )
}
