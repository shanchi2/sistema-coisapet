import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Store, Loader2, Search, X, ExternalLink, Play, Pause, ChevronLeft, ChevronRight, ArrowUpDown, Info,
  Warehouse, Link2, Sparkles, RefreshCw, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useMlInsights } from '../ml-insights/hooks/useMlInsights'
import { useShopeeInsights } from '../shopee-insights/hooks/useShopeeInsights'
import { ConfirmWriteModal } from '../ml-insights/ConfirmWriteModal'
import { PLAT, PLATFORMS, usePlatformFilter, PlatformFilter, PlatBadge, Segmented, norm, brl2, fmtN, isCancelled, fetchAll } from './shared'

// Anúncios unificados ML + Shopee (Fase 1 da unificação, 09/10).
// Lista ao vivo das duas plataformas (mesmas actions das telas de cada uma)
// + cruzamento com os pedidos dos últimos 30 dias:
//   anúncio → vendas (pelo título; sem venda pelo título, tenta pelo SKU
//   da foto `marketplace_stock`) → produto do sistema (product_id) → o
//   mesmo produto na outra plataforma. Daí sai "vendeu X em 30d",
//   "também na Shopee por R$ Y" e "só está numa plataforma".

const PAGE_SIZES = [25, 50, 100]
const detailUrl = l => l.platform === 'ml' ? `/ml/saude/${l.item_id}` : `/shopee/item/${l.item_id}`

export function MarketplaceListingsPage() {
  const ml = useMlInsights()
  const sh = useShopeeInsights()
  const [plat, setPlat] = usePlatformFilter()
  const [lists, setLists] = useState({ ml: null, shopee: null })
  const [errs, setErrs] = useState({})
  const [sales, setSales] = useState(null)
  const [stock, setStock] = useState([])
  const [status, setStatus] = useState('active')
  const [cross, setCross] = useState('all')       // all | both | only
  const [selling, setSelling] = useState('all')   // all | yes | no
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('sold')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [pending, setPending] = useState(null)
  const [toggling, setToggling] = useState(false)

  function loadListings() {
    setLists({ ml: null, shopee: null }); setErrs({})
    ml.fetchActiveListings().then(r => setLists(l => ({ ...l, ml: r }))).catch(e => { setErrs(x => ({ ...x, ml: e.message })); setLists(l => ({ ...l, ml: [] })) })
    sh.fetchActiveListings().then(r => setLists(l => ({ ...l, shopee: r }))).catch(e => { setErrs(x => ({ ...x, shopee: e.message })); setLists(l => ({ ...l, shopee: [] })) })
  }
  useEffect(() => {
    loadListings()
    const since = new Date(Date.now() - 30 * 86400e3).toISOString()
    fetchAll(() => supabase.from('orders').select('source, status_ml, marketplace_status, items:order_items(qty, titulo, sku, product_id)').in('source', PLATFORMS).gte('data_venda', since).order('data_venda'))
      .then(setSales).catch(() => setSales([]))
    fetchAll(() => supabase.from('marketplace_stock').select('platform, item_id, sku, is_full, stock')).then(setStock).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Vendas 30d indexadas por título e por SKU (por plataforma)
  const idx = useMemo(() => {
    const byT = {}, byS = {}
    for (const o of sales || []) {
      if (isCancelled(o)) continue
      for (const i of o.items || []) {
        const q = Number(i.qty) || 0
        const kt = `${o.source}|${norm(i.titulo)}`
        byT[kt] ||= { qty: 0, pids: new Set() }; byT[kt].qty += q; if (i.product_id) byT[kt].pids.add(i.product_id)
        if (i.sku) { const ks = `${o.source}|${norm(i.sku)}`; byS[ks] ||= { qty: 0, pids: new Set() }; byS[ks].qty += q; if (i.product_id) byS[ks].pids.add(i.product_id) }
      }
    }
    return { byT, byS }
  }, [sales])

  const stockInfo = useMemo(() => {
    const m = {}
    for (const r of stock) {
      const k = `${r.platform}|${r.item_id}`
      m[k] ||= { skus: new Set(), full: false, vars: 0, zero: 0 }
      if (r.sku) m[k].skus.add(norm(r.sku))
      if (r.is_full) m[k].full = true
      m[k].vars++; if ((r.stock ?? 0) <= 0) m[k].zero++
    }
    return m
  }, [stock])

  // Junta as duas listas + vendas + produto
  const rows = useMemo(() => {
    const all = []
    for (const p of PLATFORMS) for (const l of lists[p] || []) {
      const si = stockInfo[`${p}|${l.item_id}`]
      let hit = idx.byT[`${p}|${norm(l.title)}`]
      if (!hit && si?.skus.size) {
        const agg = { qty: 0, pids: new Set() }
        si.skus.forEach(s => { const h = idx.byS[`${p}|${s}`]; if (h) { agg.qty += h.qty; h.pids.forEach(x => agg.pids.add(x)) } })
        if (agg.qty) hit = agg
      }
      all.push({ ...l, platform: p, key: `${p}|${l.item_id}`, sold30: hit?.qty || 0, pids: [...(hit?.pids || [])], full: !!si?.full, zeroVars: si?.zero || 0, vars: si?.vars || 0 })
    }
    // Mesmo produto na outra plataforma
    const byPid = {}
    all.forEach(r => r.pids.forEach(pid => { (byPid[pid] ||= []).push(r) }))
    for (const r of all) {
      const other = new Map()
      r.pids.forEach(pid => (byPid[pid] || []).forEach(o => { if (o.platform !== r.platform) other.set(o.key, o) }))
      r.twins = [...other.values()]
    }
    return all
  }, [lists, idx, stockInfo])

  const base = useMemo(() => {
    const q = norm(search)
    return rows
      .filter(r => status === 'all' || r.status === status)
      .filter(r => !q || norm(r.title).includes(q) || String(r.item_id).includes(q))
  }, [rows, status, search])

  const visible = useMemo(() => {
    const sorters = {
      sold: (a, b) => b.sold30 - a.sold30 || (a.title || '').localeCompare(b.title || ''),
      title: (a, b) => (a.title || '').localeCompare(b.title || ''),
      price: (a, b) => (b.price || 0) - (a.price || 0),
      stock: (a, b) => (a.available_quantity ?? 0) - (b.available_quantity ?? 0),
    }
    return base
      .filter(r => !plat || r.platform === plat)
      .filter(r => cross === 'all' || (cross === 'both' ? r.twins.length > 0 : r.pids.length > 0 && r.twins.length === 0))
      .filter(r => selling === 'all' || (selling === 'yes' ? r.sold30 > 0 : r.sold30 === 0))
      .sort(sorters[sortBy])
  }, [base, plat, cross, selling, sortBy])

  useEffect(() => { setPage(0) }, [plat, status, cross, selling, search, sortBy, pageSize])
  const pages = Math.max(1, Math.ceil(visible.length / pageSize))
  const cur = Math.min(page, pages - 1)
  const pageRows = visible.slice(cur * pageSize, cur * pageSize + pageSize)
  const counts = { ml: base.filter(r => r.platform === 'ml').length, shopee: base.filter(r => r.platform === 'shopee').length }
  const loadingAny = lists.ml === null || lists.shopee === null

  async function confirmToggle() {
    const r = pending
    setToggling(true)
    try {
      if (r.platform === 'ml') await ml.updateItemFields(r.item_id, { status: r.next })
      else await sh.updateItemStatus(r.item_id, r.next === 'paused')
      toast.success(r.next === 'active' ? 'Anúncio reativado!' : 'Anúncio pausado!')
      setLists(l => ({ ...l, [r.platform]: l[r.platform].map(x => x.item_id === r.item_id ? { ...x, status: r.next } : x) }))
    } catch (e) { toast.error('Erro ao atualizar: ' + e.message) } finally { setToggling(false); setPending(null) }
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFE600] to-[#EE4D2D] flex items-center justify-center shrink-0 shadow-sm"><Store size={20} className="text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Anúncios</h1>
            <p className="text-sm text-slate-500">Mercado Livre e Shopee numa lista só · vendas dos últimos 30 dias e o mesmo produto na outra plataforma</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadListings} disabled={loadingAny} className="btn-secondary py-1.5 text-sm disabled:opacity-50">{loadingAny ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar</button>
          <Link to="/ml/anuncios/novo" className="btn-primary py-1.5 text-sm">+ Novo anúncio no ML</Link>
        </div>
      </div>

      {Object.entries(errs).map(([p, e]) => <div key={p} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2"><AlertTriangle size={13} />Não consegui ler os anúncios {p === 'ml' ? 'do ML' : 'da Shopee'}: {e}</div>)}

      <div className="card !p-0">
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-slate-100">
          <PlatformFilter value={plat} onChange={setPlat} counts={counts} />
          <Segmented value={status} onChange={setStatus} options={[['active', 'Ativos'], ['paused', 'Pausados'], ['all', 'Todos']]} />
        </div>
        <div className="flex items-center gap-2 flex-wrap px-4 py-3">
          <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 h-9 flex-1 min-w-[220px] bg-white focus-within:border-slate-400">
            <Search size={14} className="text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por título ou código do anúncio..." className="bg-transparent outline-none text-sm w-full placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>}
          </div>
          <Segmented value={cross} onChange={setCross} options={[['all', 'Todos'], ['both', 'Nas duas'], ['only', 'Só numa']]} />
          <Segmented value={selling} onChange={setSelling} options={[['all', 'Com e sem venda'], ['yes', 'Vendendo'], ['no', 'Sem venda 30d']]} />
          <div className="flex items-center gap-2 h-9 border border-slate-200 rounded-xl pl-3 pr-1 bg-white">
            <ArrowUpDown size={14} className="text-slate-400" />
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="bg-transparent outline-none text-sm font-semibold text-slate-700 h-full cursor-pointer">
              <option value="sold">Mais vendidos</option>
              <option value="title">A–Z</option>
              <option value="price">Maior preço</option>
              <option value="stock">Menor estoque</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[980px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                <th className="pl-5 pr-2 py-2.5 font-semibold w-[44%]">Anúncio</th>
                <th className="px-2 font-semibold text-right">Preço</th>
                <th className="px-2 font-semibold text-right">Estoque</th>
                <th className="px-2 font-semibold text-right">Vendeu 30d</th>
                <th className="px-2 font-semibold">Na outra plataforma</th>
                <th className="px-2 pr-5" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map(r => {
                const P = PLAT[r.platform]
                const other = r.platform === 'ml' ? 'shopee' : 'ml'
                return (
                  <tr key={r.key} className="border-b border-slate-100 hover:bg-slate-50/60 group">
                    <td className="pl-0 pr-2 py-2" style={{ boxShadow: `inset 4px 0 0 ${P.color}` }}>
                      <Link to={detailUrl(r)} className="flex items-center gap-3 pl-5">
                        {r.thumbnail ? <img src={r.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-11 h-11 rounded-lg bg-slate-100 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-slate-800 font-medium leading-snug group-hover:underline underline-offset-2">{r.title}</p>
                          <p className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                            <PlatBadge p={r.platform} />
                            {r.status !== 'active' && <span className="font-bold text-slate-500">pausado</span>}
                            {r.full && <span className="inline-flex items-center gap-0.5 font-bold text-[#2D3277]"><Warehouse size={9} />Full</span>}
                            {r.zeroVars > 0 && <span className="font-bold text-rose-600">{r.zeroVars === r.vars ? 'sem estoque' : `${r.zeroVars} de ${r.vars} variações zeradas`}</span>}
                            <span className="font-mono">{r.item_id}</span>
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-2 text-right tabular-nums text-slate-700">{brl2(r.price)}</td>
                    <td className={`px-2 text-right tabular-nums font-semibold ${(r.available_quantity ?? 0) <= 0 ? 'text-rose-600' : 'text-slate-700'}`}>{fmtN(r.available_quantity)}</td>
                    <td className="px-2 text-right tabular-nums">{r.sold30 ? <span className="font-black text-slate-800">{fmtN(r.sold30)}</span> : <span className="text-slate-300">0</span>}</td>
                    <td className="px-2">
                      {r.twins.length ? (
                        <div className="flex flex-col gap-0.5">
                          {r.twins.slice(0, 2).map(t => {
                            const diff = r.price && t.price ? ((t.price - r.price) / r.price) * 100 : null
                            return (
                              <Link key={t.key} to={detailUrl(t)} className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:underline" title={t.title}>
                                <PlatBadge p={t.platform} /><span className="tabular-nums font-semibold">{brl2(t.price)}</span>
                                {diff != null && Math.abs(diff) >= 1 && <span className={`text-[10px] font-bold ${diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{diff > 0 ? '+' : ''}{Math.round(diff)}%</span>}
                                <span className="text-slate-400">· {t.sold30} vend.</span>
                              </Link>
                            )
                          })}
                          {r.twins.length > 2 && <span className="text-[10px] text-slate-400">+{r.twins.length - 2} anúncio(s)</span>}
                        </div>
                      ) : r.pids.length ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200" title="O produto vende aqui e não foi achado na outra plataforma — oportunidade de anunciar lá">
                          <Sparkles size={11} />Não está {other === 'ml' ? 'no ML' : 'na Shopee'}
                        </span>
                      ) : <span className="text-[11px] text-slate-300" title="Sem venda nos últimos 30 dias — não dá pra saber qual produto do sistema é">—</span>}
                    </td>
                    <td className="px-2 pr-5 text-right whitespace-nowrap">
                      <button onClick={() => setPending({ ...r, next: r.status === 'active' ? 'paused' : 'active' })}
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border mr-1.5 ${r.status === 'active' ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100' : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'}`}>
                        {r.status === 'active' ? <><Pause size={12} />Pausar</> : <><Play size={12} />Reativar</>}
                      </button>
                      {r.permalink && <a href={r.permalink} target="_blank" rel="noreferrer" className="inline-block text-slate-300 hover:text-sky-500 align-middle" title={`Abrir ${r.platform === 'ml' ? 'no ML' : 'na Shopee'}`}><ExternalLink size={14} /></a>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {loadingAny && !rows.length && <div className="py-20 text-center"><Loader2 size={22} className="mx-auto animate-spin text-slate-300" /><p className="text-xs text-slate-400 mt-2">Lendo os anúncios do ML e da Shopee…</p></div>}
          {!loadingAny && !visible.length && <p className="text-sm text-slate-400 text-center py-14">Nenhum anúncio com esses filtros.</p>}
        </div>

        {visible.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span>{fmtN(cur * pageSize + 1)}–{fmtN(Math.min(visible.length, (cur + 1) * pageSize))} de {fmtN(visible.length)}</span>
              {loadingAny && <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 size={11} className="animate-spin" />carregando {lists.ml === null ? 'ML' : 'Shopee'}…</span>}
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="input py-1 text-xs w-auto">
                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} por página</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(cur - 1)} disabled={cur === 0} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 hover:border-slate-400"><ChevronLeft size={14} /></button>
              <span className="px-2 tabular-nums">página {cur + 1} de {pages}</span>
              <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 hover:border-slate-400"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
        <span><Link2 size={10} className="inline" /> "Na outra plataforma" usa os pedidos dos últimos 30 dias: o anúncio é ligado ao produto do sistema pelas vendas dele, e o produto aponta o anúncio da outra plataforma (a % é a diferença de preço). "Não está na Shopee/no ML" = o produto vende aqui e não apareceu do outro lado — oportunidade. Sem venda em 30 dias não dá pra ligar ("—"). Clique no anúncio pra abrir o detalhe (preço, estoque, ficha, fotos).</span>
      </p>

      <ConfirmWriteModal open={!!pending} platform={pending?.platform === 'ml' ? 'Mercado Livre' : 'Shopee'}
        title={pending?.next === 'active' ? 'Reativar anúncio' : 'Pausar anúncio'}
        confirmLabel={pending?.next === 'active' ? 'Sim, reativar' : 'Sim, pausar'}
        description={pending?.next === 'active'
          ? `Vai voltar a aparecer nas buscas e aceitar venda ${pending?.platform === 'ml' ? 'no Mercado Livre' : 'na Shopee'} agora mesmo.`
          : `Vai sair das buscas e parar de vender ${pending?.platform === 'ml' ? 'no Mercado Livre' : 'na Shopee'} agora mesmo (o anúncio continua existindo, só fica pausado).`}
        confirming={toggling} onConfirm={confirmToggle} onCancel={() => setPending(null)}
        detail={pending && <p className="text-sm text-slate-700 flex items-center gap-2"><PlatBadge p={pending.platform} />{pending.title}</p>} />
    </div>
  )
}
