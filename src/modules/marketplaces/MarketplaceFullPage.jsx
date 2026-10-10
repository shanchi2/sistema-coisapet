import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Warehouse, Loader2, RefreshCw, Search, X, Truck, Info, ArrowUpDown, AlertTriangle, PackageX, Clock, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useMlInsights } from '../ml-insights/hooks/useMlInsights'
import { useShopeeInsights } from '../shopee-insights/hooks/useShopeeInsights'
import { StatTile } from '../dashboard/widgets'
import { PLAT, PlatBadge, Segmented, norm, fmtN, isCancelled, fetchAll } from './shared'

// Estoque nos armazéns dos marketplaces (Fase 1 da unificação, 10/10).
// Hoje só o Full do ML tem produto — o Full da Shopee (SBS) não está ativo
// na loja (a API devolve lista vazia); se um dia ativar, os itens aparecem
// aqui também. O que esta tela soma em relação a /ml/full:
//   • quanto TEMPO o estoque do Full ainda dura (vendas Full dos últimos
//     30 dias → média/dia → dias de cobertura), não só a quantidade
//   • o que está a caminho (envios em aberto) já entra na conta
//   • quanto do mesmo SKU está anunciado na Shopee (estoque próprio)
// Sem R$ — só quantidades.

const DAYS_CRIT = 7, DAYS_WARN = 15
const LEVEL = {
  zero:  { label: 'Zerado no Full', tone: 'text-rose-700 bg-rose-50 border-rose-200', bar: '#F43F5E', rank: 0 },
  crit:  { label: `Acaba em até ${DAYS_CRIT} dias`, tone: 'text-rose-700 bg-rose-50 border-rose-200', bar: '#FB7185', rank: 1 },
  warn:  { label: `Acaba em até ${DAYS_WARN} dias`, tone: 'text-amber-700 bg-amber-50 border-amber-200', bar: '#F59E0B', rank: 2 },
  ok:    { label: 'Tranquilo', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', bar: '#10B981', rank: 3 },
  idle:  { label: 'Sem venda em 30d', tone: 'text-slate-500 bg-slate-50 border-slate-200', bar: '#CBD5E1', rank: 4 },
}
const secure = u => u ? u.replace(/^http:\/\//, 'https://') : null
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : null

export function MarketplaceFullPage() {
  const ml = useMlInsights()
  const sh = useShopeeInsights()
  const [mlFull, setMlFull] = useState(null)
  const [shFull, setShFull] = useState(null)
  const [err, setErr] = useState(null)
  const [stock, setStock] = useState([])
  const [sales, setSales] = useState(null)
  const [level, setLevel] = useState('alert')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('days')
  const [open, setOpen] = useState({})
  const [at, setAt] = useState(null)

  function load() {
    setMlFull(null); setErr(null)
    ml.fetchFulfillmentStock().then(r => { setMlFull(r); setAt(new Date()) }).catch(e => { setErr(e.message); setMlFull([]) })
    sh.fetchSbsFulfillmentStock().then(r => setShFull(r || [])).catch(() => setShFull([]))
  }
  useEffect(() => {
    load()
    fetchAll(() => supabase.from('marketplace_stock').select('platform, item_id, variation_id, sku, stock, is_full, title')).then(setStock).catch(() => {})
    const since = new Date(Date.now() - 30 * 86400e3).toISOString()
    fetchAll(() => supabase.from('orders').select('source, is_full, status_ml, marketplace_status, items:order_items(qty, titulo, sku)').eq('source', 'ml').eq('is_full', true).gte('data_venda', since).order('data_venda'))
      .then(setSales).catch(() => setSales([]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!mlFull) return []
    const up = s => String(s || '').trim().toUpperCase()
    // Vendas Full 30d por título e por SKU
    const byT = {}, byS = {}
    for (const o of sales || []) {
      if (isCancelled(o)) continue
      for (const it of o.items || []) {
        byT[norm(it.titulo)] = (byT[norm(it.titulo)] || 0) + (it.qty || 0)
        if (it.sku) byS[up(it.sku)] = (byS[up(it.sku)] || 0) + (it.qty || 0)
      }
    }
    const skusOf = {}, shopeeBySku = {}
    stock.forEach(s => {
      if (!s.sku) return
      if (s.platform === 'ml') (skusOf[s.item_id] ||= new Set()).add(up(s.sku))
      else (shopeeBySku[up(s.sku)] ||= []).push(s)
    })
    return mlFull.map(i => {
      const skus = [...(skusOf[i.item_id] || [])]
      const sold = byT[norm(i.title)] || skus.reduce((t, s) => t + (byS[s] || 0), 0)
      const incoming = [...(i.incoming || []), ...(i.variations || []).flatMap(v => v.incoming || [])]
      const inQty = incoming.reduce((t, x) => t + (x.qty || 0), 0)
      const perDay = sold / 30
      const days = perDay > 0 ? i.available_quantity / perDay : null
      const lvl = i.available_quantity <= 0 ? 'zero' : days == null ? 'idle' : days <= DAYS_CRIT ? 'crit' : days <= DAYS_WARN ? 'warn' : 'ok'
      const shRows = skus.flatMap(s => shopeeBySku[s] || [])
      const shStock = shRows.length ? [...new Map(shRows.map(r => [`${r.item_id}|${r.variation_id}`, r])).values()].reduce((t, r) => t + (r.stock || 0), 0) : null
      const zeroVars = (i.variations || []).filter(v => !v.unconfirmed && (v.available ?? 0) <= 0).length
      return { ...i, zeroVars, thumb: secure(i.thumbnail), sold, perDay, days, daysWithIncoming: perDay > 0 ? (i.available_quantity + inQty) / perDay : null, incoming, inQty, lvl, shStock, shItem: shRows[0]?.item_id }
    })
  }, [mlFull, sales, stock])

  const visible = useMemo(() => {
    const q = norm(search)
    const sorters = {
      days: (a, b) => LEVEL[a.lvl].rank - LEVEL[b.lvl].rank || (a.days ?? 1e9) - (b.days ?? 1e9),
      qty: (a, b) => a.available_quantity - b.available_quantity,
      sold: (a, b) => b.sold - a.sold,
    }
    return rows
      .filter(r => level === 'all' || (level === 'alert' ? ['zero', 'crit', 'warn'].includes(r.lvl) || r.zeroVars > 0 : r.lvl === level))
      .filter(r => !q || norm(r.title).includes(q) || r.item_id.toLowerCase().includes(q))
      .sort(sorters[sortBy])
  }, [rows, level, search, sortBy])

  const c = Object.fromEntries(Object.keys(LEVEL).map(k => [k, rows.filter(r => r.lvl === k).length]))
  const units = rows.reduce((t, r) => t + r.available_quantity, 0)
  const unitsIn = rows.reduce((t, r) => t + r.inQty, 0)
  const loading = mlFull === null

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFE600] to-[#EE4D2D] flex items-center justify-center shrink-0 shadow-sm"><Warehouse size={20} className="text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Estoque Full</h1>
            <p className="text-sm text-slate-500">Quanto tem nos armazéns dos marketplaces e por quantos dias ainda dá — pra mandar reposição a tempo</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 h-10 text-sm font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Atualizar
          </button>
          {at && <span className="text-[11px] text-slate-400 flex items-center gap-1"><Clock size={10} />ao vivo às {at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile icon={Warehouse} label="No Full do ML" value={loading ? '…' : fmtN(rows.length)} detail={`${fmtN(units)} unidades lá dentro`} />
        <StatTile icon={PackageX} label="Zerados no Full" value={loading ? '…' : fmtN(c.zero)} detail="anúncio Full parado" tone={c.zero ? "rose" : "neutral"} />
        <StatTile icon={AlertTriangle} label={`Acabam em até ${DAYS_WARN} dias`} value={loading ? '…' : fmtN(c.crit + c.warn)} detail={`${fmtN(c.crit)} em até ${DAYS_CRIT} dias`} tone={c.crit ? "warning" : "neutral"} />
        <StatTile icon={Truck} label="A caminho" value={loading ? '…' : fmtN(unitsIn)} detail="unidades em envios abertos" />
      </div>

      <div className="card !p-0">
        <div className="flex items-center gap-2 flex-wrap px-4 py-3">
          <Segmented value={level} onChange={setLevel} options={[['alert', `Precisa repor${rows.length ? ` (${rows.filter(r => ['zero', 'crit', 'warn'].includes(r.lvl) || r.zeroVars > 0).length})` : ''}`], ['ok', 'Tranquilo'], ['idle', 'Sem venda'], ['all', 'Todos']]} />
          <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 h-9 flex-1 min-w-[200px] max-w-sm bg-white focus-within:border-slate-400">
            <Search size={14} className="text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome ou código do anúncio…" className="bg-transparent outline-none text-sm w-full placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch('')} className="text-slate-400"><X size={13} /></button>}
          </div>
          <div className="flex items-center gap-2 h-9 border border-slate-200 rounded-xl pl-3 pr-1 bg-white ml-auto">
            <ArrowUpDown size={14} className="text-slate-400" />
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="bg-transparent outline-none text-sm font-semibold text-slate-700 h-full cursor-pointer">
              <option value="days">Acaba primeiro</option>
              <option value="qty">Menor quantidade</option>
              <option value="sold">Mais vendidos no Full</option>
            </select>
          </div>
        </div>
      </div>

      {err && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">Não deu pra consultar o Full do ML: {err}</p>}

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="pl-5 pr-2 py-2.5 font-semibold">Produto no Full</th>
                <th className="px-2 font-semibold text-right">No Full</th>
                <th className="px-2 font-semibold text-right">Vendeu 30d</th>
                <th className="px-2 font-semibold w-48">Dura</th>
                <th className="px-2 font-semibold">A caminho</th>
                <th className="px-2 pr-5 font-semibold text-right">Na Shopee</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="py-20 text-center"><Loader2 size={22} className="mx-auto animate-spin text-slate-300" /></td></tr>
                : !visible.length ? <tr><td colSpan={6} className="py-14 text-center text-sm text-slate-400">{level === 'alert' ? 'Nada precisando de reposição agora 🎉' : 'Nenhum produto com esses filtros.'}</td></tr>
                : visible.map(r => {
                  const L = LEVEL[r.lvl]
                  const pct = r.days == null ? 0 : Math.min(100, (r.days / 30) * 100)
                  const vars = r.variations || []
                  return (
                    <tr key={r.item_id} className="border-b border-slate-100 align-top">
                      <td className="pl-0 pr-2 py-2.5" style={{ boxShadow: `inset 4px 0 0 ${PLAT.ml.color}` }}>
                        <div className="flex items-start gap-3 pl-5">
                          {r.thumb ? <img src={r.thumb} alt="" className="w-11 h-11 rounded-lg object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-11 h-11 rounded-lg bg-slate-100 shrink-0" />}
                          <div className="min-w-0">
                            <Link to={`/ml/saude/${r.item_id}`} className="text-slate-800 font-medium leading-snug hover:underline underline-offset-2">{r.title}</Link>
                            <p className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                              <PlatBadge p="ml" /><span className="font-mono">{r.item_id}</span>
                              {r.zeroVars > 0 && r.lvl !== 'zero' && <span className="text-rose-600 font-bold">{r.zeroVars} variação(ões) zerada(s)</span>}
                              {r.not_available > 0 && <span className="text-amber-600 font-semibold" title={(r.not_available_detail || []).map(d => `${d.quantity} ${d.status}`).join(', ')}>{r.not_available} indisponíveis</span>}
                              {vars.length > 1 && <button onClick={() => setOpen(o => ({ ...o, [r.item_id]: !o[r.item_id] }))} className="inline-flex items-center gap-0.5 font-semibold text-slate-500 hover:text-slate-700">{vars.length} variações<ChevronDown size={10} className={open[r.item_id] ? 'rotate-180' : ''} /></button>}
                            </p>
                            {open[r.item_id] && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {vars.map((v, i) => <span key={i} className={`text-[11px] px-2 py-0.5 rounded-lg border ${(v.available ?? 0) <= 0 ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>{v.label}: <strong>{v.available ?? '—'}</strong></span>)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`px-2 py-2.5 text-right tabular-nums font-black text-base ${r.available_quantity <= 0 ? 'text-rose-600' : 'text-slate-800'}`}>{fmtN(r.available_quantity)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{r.sold ? <>{fmtN(r.sold)}<span className="block text-[10px] text-slate-400">{r.perDay.toFixed(1).replace('.', ',')}/dia</span></> : <span className="text-slate-300">0</span>}</td>
                      <td className="px-2 py-2.5">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${L.tone}`}>{r.lvl === 'zero' ? L.label : r.days == null ? L.label : `~${Math.round(r.days)} dias`}</span>
                        {r.days != null && r.lvl !== 'zero' && <div className="h-1.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: L.bar }} /></div>}
                        {r.inQty > 0 && r.daysWithIncoming != null && <p className="text-[10px] text-sky-700 mt-1">com o que está a caminho: ~{Math.round(r.daysWithIncoming)} dias</p>}
                      </td>
                      <td className="px-2 py-2.5">
                        {r.incoming.length ? r.incoming.map(x => (
                          <Link key={x.shipment_id} to={`/ml/full/envios?envio=${x.shipment_id}`} className="flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline">
                            <Truck size={11} />{x.qty} un.{x.appointment_date ? ` · ${fmtDate(x.appointment_date)}` : ''}
                          </Link>
                        )) : <span className="text-[11px] text-slate-300">—</span>}
                      </td>
                      <td className="px-2 pr-5 py-2.5 text-right">
                        {r.shStock == null ? <span className="text-[11px] text-slate-300">não anunciado</span>
                          : <Link to={`/shopee/item/${r.shItem}`} className={`text-[12px] font-bold tabular-nums hover:underline ${r.shStock <= 0 ? 'text-rose-600' : 'text-slate-700'}`} title="Estoque do mesmo SKU nos anúncios da Shopee (estoque próprio, sai daqui da CoisaPet)">{fmtN(r.shStock)} un.</Link>}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card !p-4 flex items-center gap-3" style={{ boxShadow: `inset 4px 0 0 ${PLAT.shopee.color}` }}>
        <PlatBadge p="shopee" />
        <p className="text-[13px] text-slate-600 flex-1">
          {shFull === null ? 'Consultando o Full da Shopee…'
            : shFull.length ? <><strong>{shFull.length}</strong> produto(s) no armazém da Shopee — veja em <Link to="/shopee/full" className="font-semibold underline">Estoque Full da Shopee</Link>.</>
            : <>O <strong>Full da Shopee</strong> (armazém da Shopee) não está ativo na loja — tudo que vende lá sai do estoque da CoisaPet. Se ativarem, os produtos aparecem aqui sozinhos.</>}
        </p>
      </div>

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
        <span>"Dura" = unidades no Full ÷ média de vendas Full por dia nos últimos 30 dias (pedidos cancelados não contam). Reposição do Full é sempre manual, pelo painel do ML — os envios abertos aparecem em "A caminho" e na Gestão de Envios Full. "Na Shopee" = estoque do mesmo SKU nos anúncios da Shopee.</span>
      </p>
    </div>
  )
}
