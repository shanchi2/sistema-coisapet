import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Boxes, RefreshCw, Loader2, Search, X, ExternalLink, Warehouse, Download, Info, EyeOff, Eye, ChevronLeft, ChevronRight, Plus, PauseCircle, TrendingUp, SlidersHorizontal, ArrowUpDown, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Panel, fmtInt } from '../dashboard/widgets'

// Estoque nos Marketplaces (09/10, fase102) — sem estoque / estoque baixo
// do ML e da Shopee num lugar só, por VARIAÇÃO. Dados da foto
// `marketplace_stock` (Edge Function `marketplace-stock`, de hora em hora)
// cruzados com o ritmo de venda dos últimos 30 dias (orders/order_items)
// pra estimar "acaba em X dias". Cruzamento: SKU quando existe; senão
// título + variação normalizada (muito anúncio do ML não tem SKU).
// Só quantidade — sem R$.
//
// 09/10 (v2, pedido do Raphael): ML em AMARELO e Shopee em LARANJA em toda a
// tela (faixa da linha, selo, resumo por plataforma); filtros em chips
// combináveis; lista "Produtos ocultos" (salva no navegador) que já vem
// escondendo a Casa Cama Toca de Gato; paginação.

const PLAT = {
  ml:     { label: 'Mercado Livre', short: 'ML', color: '#F5C400', soft: '#FFF9D6', ink: '#7A5F00', chip: 'bg-[#FFE600] text-[#2D3277]' },
  shopee: { label: 'Shopee', short: 'Shopee', color: '#EE4D2D', soft: '#FFEDE8', ink: '#B5321A', chip: 'bg-[#EE4D2D] text-white' },
}
const LEVELS = {
  zero:  { label: 'Sem estoque', hint: 'zerado agora', tone: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500', bar: '#f43f5e' },
  crit:  { label: 'Crítico', hint: '< 7 dias ou ≤ 2 un.', tone: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500', bar: '#f97316' },
  low:   { label: 'Baixo', hint: '7–15 dias ou ≤ 5 un.', tone: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400', bar: '#fbbf24' },
  ok:    { label: 'OK', hint: 'confortável', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', bar: '#10b981' },
}
const LV_KEYS = ['zero', 'crit', 'low', 'ok']
const ALERT = ['zero', 'crit', 'low']
const DEFAULT_HIDDEN = ['Casa Cama Toca De Gato Nicho Mdf Com Almofada E Pés Luxo']
const HIDDEN_KEY = 'coisapet_estoque_mkt_ocultos'
const PAGE_SIZES = [25, 50, 100]

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
// "COR: AMADEIRADO - SALA DUPLA" / "Amadeirado / Sala dupla" / "Completo,25g" → "amadeirado|sala dupla"
const normVar = v => norm(v).split(/[,/;|]|\s-\s/).map(p => p.replace(/^[^:]*:\s*/, '').trim()).filter(Boolean).sort().join('|')
function fmtAgo(iso) {
  if (!iso) return 'nunca'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `há ${Math.max(1, m)} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dias`
}
function readHidden() {
  try { const v = JSON.parse(localStorage.getItem(HIDDEN_KEY)); if (v && Array.isArray(v.list)) return v } catch { /* sem storage */ }
  return { list: DEFAULT_HIDDEN, on: true }
}

async function fetchAll(build) {
  const all = []
  for (let page = 0; page < 30; page++) {
    const { data, error } = await build().range(page * 1000, page * 1000 + 999)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

function PlatBadge({ p }) {
  return <span className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-black ${PLAT[p].chip}`}>{PLAT[p].short}</span>
}

// Chave liga/desliga com rótulo (painel de filtros)
function Switch({ on, onChange, icon: Icon, label, hint }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 text-left hover:bg-slate-50">
      <Icon size={15} className="text-slate-400 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
      <span className={`relative w-9 h-5 rounded-full shrink-0 transition ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

// Resumo por plataforma: barra empilhada + números clicáveis
function PlatformSummary({ p, counts, active, selected, onPick }) {
  const P = PLAT[p]
  const total = LV_KEYS.reduce((t, k) => t + counts[k], 0) || 1
  const alert = counts.zero + counts.crit + counts.low
  return (
    <div className={`rounded-2xl border-2 p-4 transition ${active ? 'shadow-sm' : 'opacity-50 hover:opacity-80'}`} style={{ borderColor: P.color, background: P.soft }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => onPick(p)} className="flex items-center gap-2 text-left">
          <span className="w-3 h-3 rounded" style={{ background: P.color }} />
          <span className="font-black text-slate-800">{P.label}</span>
        </button>
        <span className="text-xs font-semibold" style={{ color: P.ink }}>{fmtInt(alert)} precisam de atenção</span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-white/70 mb-3">
        {LV_KEYS.map(k => counts[k] > 0 && <div key={k} style={{ width: `${(counts[k] / total) * 100}%`, background: LEVELS[k].bar }} title={`${LEVELS[k].label}: ${counts[k]}`} />)}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {LV_KEYS.map(k => (
          <button key={k} onClick={() => onPick(p, k)}
            className={`rounded-xl bg-white px-2 py-2 text-left border transition hover:shadow-sm ${selected === k ? 'border-slate-800' : 'border-transparent'}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${LEVELS[k].dot}`} />{LEVELS[k].label}</p>
            <p className={`text-xl font-black tabular-nums ${k === 'zero' ? 'text-rose-600' : k === 'crit' ? 'text-orange-600' : k === 'low' ? 'text-amber-600' : 'text-emerald-600'}`}>{fmtInt(counts[k])}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

export function MarketplaceStockPage() {
  const [stock, setStock] = useState(null)
  const [sales, setSales] = useState([])
  const [sync, setSync] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [plat, setPlat] = useState('') // '' = as duas
  const [level, setLevel] = useState('alert') // alert | zero | crit | low | ok | all
  const [search, setSearch] = useState('')
  const [showFull, setShowFull] = useState(true)
  const [showPaused, setShowPaused] = useState(true)
  const [onlySelling, setOnlySelling] = useState(false)
  const [sortBy, setSortBy] = useState('urgency')
  const [hidden, setHidden] = useState(readHidden)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersRef = useRef(null)
  const [newHidden, setNewHidden] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden)) } catch { /* sem storage */ } }, [hidden])

  const load = useCallback(async () => {
    setError(null)
    try {
      const since = new Date(Date.now() - 30 * 86400000).toISOString()
      const [s, o, sy] = await Promise.all([
        fetchAll(() => supabase.from('marketplace_stock').select('*').order('id')),
        fetchAll(() => supabase.from('orders').select('source, status_ml, marketplace_status, items:order_items(qty, sku, titulo, variacao)').in('source', ['ml', 'shopee']).gte('data_venda', since).order('data_venda')),
        supabase.from('marketplace_stock_sync').select('*'),
      ])
      setStock(s); setSales(o); setSync(sy.data || [])
    } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  async function refresh() {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('marketplace-stock', { body: {} })
      if (error) throw error
      const errs = ['ml', 'shopee'].filter(p => data?.[p]?.error)
      if (errs.length) toast.error(`Erro ao ler ${errs.map(p => PLAT[p].short).join(' e ')}`)
      else toast.success('Estoque atualizado nas duas plataformas.')
      await load()
    } catch (e) { toast.error('Erro ao atualizar: ' + e.message) } finally { setBusy(false) }
  }

  // Vendas dos últimos 30 dias por plataforma: por SKU e por título+variação
  const vel = useMemo(() => {
    const bySku = {}, byTV = {}, byT = {}
    for (const o of sales) {
      const s = (o.status_ml || '').toLowerCase()
      if (s.startsWith('cancel') || ['CANCELLED', 'IN_CANCEL'].includes(o.marketplace_status)) continue
      for (const it of o.items || []) {
        const q = Number(it.qty) || 0
        if (it.sku) { const k = `${o.source}|${norm(it.sku)}`; bySku[k] = (bySku[k] || 0) + q }
        const kt = `${o.source}|${norm(it.titulo)}`
        byT[kt] = (byT[kt] || 0) + q
        const ktv = `${kt}|${normVar(it.variacao)}`
        byTV[ktv] = (byTV[ktv] || 0) + q
      }
    }
    return { bySku, byTV, byT }
  }, [sales])

  const rows = useMemo(() => {
    if (!stock) return []
    // Quantas variações cada anúncio tem (pra saber se dá pra usar o título sozinho)
    const varCount = {}
    stock.forEach(r => { varCount[`${r.platform}|${r.item_id}`] = (varCount[`${r.platform}|${r.item_id}`] || 0) + 1 })
    return stock.map(r => {
      const kt = `${r.platform}|${norm(r.title)}`
      let sold30 = null
      if (r.sku && vel.bySku[`${r.platform}|${norm(r.sku)}`] != null) sold30 = vel.bySku[`${r.platform}|${norm(r.sku)}`]
      else if (vel.byTV[`${kt}|${normVar(r.variation)}`] != null) sold30 = vel.byTV[`${kt}|${normVar(r.variation)}`]
      else if (varCount[`${r.platform}|${r.item_id}`] === 1 && vel.byT[kt] != null) sold30 = vel.byT[kt]
      const perDay = sold30 != null ? sold30 / 30 : null
      const days = perDay ? r.stock / perDay : null
      const st = r.stock ?? 0
      const lvl = st <= 0 ? 'zero' : (days != null && days < 7) || st <= 2 ? 'crit' : (days != null && days < 15) || st <= 5 ? 'low' : 'ok'
      return { ...r, sold30: sold30 ?? 0, matched: sold30 != null, perDay, days, level: lvl, ntitle: norm(r.title) }
    })
  }, [stock, vel])

  // Produtos ocultos: bate pelo título normalizado (contém o texto)
  const hiddenNorm = useMemo(() => hidden.list.map(norm).filter(Boolean), [hidden.list])
  const isHidden = useCallback(r => hiddenNorm.some(h => r.ntitle.includes(h)), [hiddenNorm])
  const hiddenCount = useMemo(() => rows.filter(isHidden).length, [rows, isHidden])

  // Base = tudo que passa pelos filtros "de fundo" (ocultos, Full, pausados,
  // vendendo, busca) — os números dos resumos e chips saem daqui
  const base = useMemo(() => {
    const q = norm(search)
    return rows
      .filter(r => !hidden.on || !isHidden(r))
      .filter(r => showFull || !r.is_full)
      .filter(r => showPaused || r.status === 'active')
      .filter(r => !onlySelling || r.sold30 > 0)
      .filter(r => !q || r.ntitle.includes(q) || norm(r.variation).includes(q) || norm(r.sku).includes(q) || norm(r.item_id).includes(q))
  }, [rows, hidden.on, isHidden, showFull, showPaused, onlySelling, search])

  const visible = useMemo(() => {
    const order = { zero: 0, crit: 1, low: 2, ok: 3 }
    const sorters = {
      urgency: (a, b) => order[a.level] - order[b.level] || b.sold30 - a.sold30 || (a.days ?? 9e9) - (b.days ?? 9e9),
      sold: (a, b) => b.sold30 - a.sold30 || order[a.level] - order[b.level],
      stock: (a, b) => (a.stock ?? 0) - (b.stock ?? 0) || b.sold30 - a.sold30,
      days: (a, b) => (a.level === 'zero' ? -1 : a.days ?? 9e9) - (b.level === 'zero' ? -1 : b.days ?? 9e9) || b.sold30 - a.sold30,
    }
    return base
      .filter(r => !plat || r.platform === plat)
      .filter(r => level === 'all' || (level === 'alert' ? ALERT.includes(r.level) : r.level === level))
      .sort(sorters[sortBy])
  }, [base, plat, level, sortBy])

  // Volta pra página 1 quando muda filtro
  useEffect(() => { setPage(0) }, [plat, level, search, showFull, showPaused, onlySelling, sortBy, hidden, pageSize])
  const pages = Math.max(1, Math.ceil(visible.length / pageSize))
  const cur = Math.min(page, pages - 1)
  const pageRows = visible.slice(cur * pageSize, cur * pageSize + pageSize)

  const counts = useMemo(() => {
    const c = { ml: { zero: 0, crit: 0, low: 0, ok: 0 }, shopee: { zero: 0, crit: 0, low: 0, ok: 0 } }
    base.forEach(r => { c[r.platform][r.level]++ })
    return c
  }, [base])
  const lvCount = k => (plat ? [plat] : ['ml', 'shopee']).reduce((t, p) => t + counts[p][k], 0)
  const lastSync = sync.reduce((m, s) => (!m || (s.synced_at && s.synced_at < m) ? s.synced_at : m), null)
  const syncErr = sync.filter(s => s.error)

  function pickPlatform(p, lv) {
    setPlat(p)
    setLevel(lv || 'alert')
  }
  function resetFilters() {
    setShowFull(true); setShowPaused(true); setOnlySelling(false)
    setHidden({ list: DEFAULT_HIDDEN, on: true })
  }
  // Fecha o painel de filtros clicando fora
  useEffect(() => {
    if (!filtersOpen) return
    const close = e => { if (filtersRef.current && !filtersRef.current.contains(e.target)) setFiltersOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [filtersOpen])
  // Filtros "escondidos" no painel que estão mudando a lista — viram etiquetas visíveis
  const activeFilters = [
    hidden.on && hidden.list.length > 0 && { key: 'hidden', icon: EyeOff, label: `${hidden.list.length} produto${hidden.list.length === 1 ? '' : 's'} oculto${hidden.list.length === 1 ? '' : 's'} (${fmtInt(hiddenCount)} variações)`, clear: () => setHidden(h => ({ ...h, on: false })) },
    !showFull && { key: 'full', icon: Warehouse, label: 'Sem ML Full', clear: () => setShowFull(true) },
    !showPaused && { key: 'paused', icon: PauseCircle, label: 'Sem pausados', clear: () => setShowPaused(true) },
    onlySelling && { key: 'selling', icon: TrendingUp, label: 'Só o que vendeu em 30d', clear: () => setOnlySelling(false) },
  ].filter(Boolean)
  function hideProduct(title) {
    const t = (title || '').trim()
    if (!t || hidden.list.some(h => norm(h) === norm(t))) return
    setHidden(h => ({ list: [...h.list, t], on: true }))
    toast.success('Produto ocultado — dá pra mostrar de novo em "Produtos ocultos".')
  }
  const unhide = t => setHidden(h => ({ ...h, list: h.list.filter(x => x !== t) }))

  function exportCsv() {
    const head = ['Plataforma', 'Anúncio', 'Variação', 'SKU', 'Estoque', 'Vendas 30d', 'Média/dia', 'Acaba em (dias)', 'Situação', 'Status', 'Full', 'Link']
    const lines = visible.map(r => [PLAT[r.platform].short, r.title, r.variation || '', r.sku || '', r.stock ?? '', r.sold30, r.perDay ? r.perDay.toFixed(1).replace('.', ',') : '', r.days != null ? Math.floor(r.days) : '', LEVELS[r.level].label, r.status, r.is_full ? 'sim' : '', r.permalink || ''])
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `estoque-marketplaces.csv`; a.click()
  }


  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFE600] to-[#EE4D2D] flex items-center justify-center shrink-0 shadow-sm"><Boxes size={20} className="text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Estoque nos Marketplaces</h1>
            <p className="text-sm text-slate-500">Anúncios sem estoque ou com estoque baixo no Mercado Livre e na Shopee, por variação · atualizado {fmtAgo(lastSync)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} disabled={!visible.length} className="btn-secondary py-1.5 text-sm disabled:opacity-40"><Download size={14} /> Excel</button>
          <button onClick={refresh} disabled={busy} className="btn-primary py-1.5 text-sm disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {busy ? 'Lendo as plataformas (~1 min)…' : 'Atualizar agora'}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{error}</div>}
      {syncErr.length > 0 && <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">Última leitura com erro: {syncErr.map(s => `${PLAT[s.platform]?.short}: ${s.error}`).join(' · ')}</div>}

      {!stock ? (
        <div className="card py-24 text-center"><Loader2 size={24} className="mx-auto animate-spin text-slate-300" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {['ml', 'shopee'].map(p => (
              <PlatformSummary key={p} p={p} counts={counts[p]} active={!plat || plat === p} selected={plat === p ? level : null} onPick={pickPlatform} />
            ))}
          </div>

          <div className="card !p-0 overflow-visible">
            <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Situação</span>
                <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
                  {[['alert', 'Precisam de atenção', null, lvCount('zero') + lvCount('crit') + lvCount('low')], ...LV_KEYS.map(k => [k, LEVELS[k].label, LEVELS[k].dot, lvCount(k)]), ['all', 'Todos', null, LV_KEYS.reduce((t, k) => t + lvCount(k), 0)]].map(([k, l, dot, n]) => (
                    <button key={k} onClick={() => setLevel(k)} title={LEVELS[k]?.hint}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${level === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}{l}
                      <span className={`tabular-nums text-[11px] ${level === k ? 'text-slate-400' : 'text-slate-400/80'}`}>{fmtInt(n)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Plataforma</span>
                <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
                  {[['', 'Todas'], ['ml', 'Mercado Livre'], ['shopee', 'Shopee']].map(([k, l]) => (
                    <button key={k} onClick={() => setPlat(k)}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${plat === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      {k && <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PLAT[k].color }} />}{l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap px-4 py-3">
              <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 h-9 flex-1 min-w-[240px] focus-within:border-slate-400 bg-white">
                <Search size={14} className="text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar anúncio, cor, SKU ou MLB..." className="bg-transparent outline-none text-sm w-full placeholder:text-slate-400" />
                {search && <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600" title="Limpar busca"><X size={13} /></button>}
              </div>

              <div className="relative" ref={filtersRef}>
                <button onClick={() => setFiltersOpen(o => !o)}
                  className={`h-9 px-3.5 rounded-xl border text-sm font-semibold flex items-center gap-2 transition ${filtersOpen ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>
                  <SlidersHorizontal size={14} /> Filtros
                  {activeFilters.length > 0 && <span className={`min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center ${filtersOpen ? 'bg-white text-slate-800' : 'bg-slate-800 text-white'}`}>{activeFilters.length}</span>}
                </button>
                {filtersOpen && (
                  <div className="absolute right-0 top-11 z-30 w-[380px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-xl">
                    <div className="p-4 flex flex-col gap-1">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Mostrar na lista</p>
                      <Switch on={showFull} onChange={setShowFull} icon={Warehouse} label="Anúncios ML Full" hint="estoque que está no armazém do ML" />
                      <Switch on={showPaused} onChange={setShowPaused} icon={PauseCircle} label="Anúncios pausados" hint="inclusive pausados por falta de estoque" />
                      <Switch on={onlySelling} onChange={setOnlySelling} icon={TrendingUp} label="Só o que vendeu nos últimos 30 dias" hint="esconde o que está parado" />
                    </div>
                    <div className="p-4 border-t border-slate-100 flex flex-col gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Produtos ocultos</p>
                      <Switch on={hidden.on} onChange={v => setHidden(h => ({ ...h, on: v }))} icon={EyeOff} label="Esconder os produtos desta lista" hint={`${fmtInt(hiddenCount)} variações · fica salvo neste computador`} />
                      <div className="flex flex-col gap-1.5">
                        {hidden.list.map(t => (
                          <div key={t} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg pl-3 pr-1 py-1">
                            <span className="text-xs text-slate-700 flex-1 truncate" title={t}>{t}</span>
                            <button onClick={() => unhide(t)} className="p-1 rounded-md text-slate-400 hover:bg-white hover:text-rose-500" title="Tirar da lista"><X size={13} /></button>
                          </div>
                        ))}
                        {!hidden.list.length && <p className="text-xs text-slate-400">Nenhum produto oculto.</p>}
                      </div>
                      <form onSubmit={e => { e.preventDefault(); hideProduct(newHidden); setNewHidden('') }} className="flex items-center gap-2">
                        <input value={newHidden} onChange={e => setNewHidden(e.target.value)} placeholder="Parte do título, ex.: Toca De Gato" className="input text-sm h-9 py-0 flex-1" />
                        <button className="btn-secondary h-9 py-0 text-xs disabled:opacity-40" disabled={!newHidden.trim()}><Plus size={13} /> Adicionar</button>
                      </form>
                    </div>
                    <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/60 rounded-b-2xl">
                      <button onClick={resetFilters} className="btn-secondary h-8 py-0 text-xs"><RotateCcw size={12} /> Restaurar padrão</button>
                      <button onClick={() => setFiltersOpen(false)} className="btn-primary h-8 py-0 text-xs">Pronto</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 h-9 border border-slate-200 rounded-xl pl-3 pr-1 bg-white">
                <ArrowUpDown size={14} className="text-slate-400" />
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="bg-transparent outline-none text-sm font-semibold text-slate-700 h-full pr-1 cursor-pointer">
                  <option value="urgency">Mais urgente primeiro</option>
                  <option value="days">Acaba antes</option>
                  <option value="sold">Mais vendidos</option>
                  <option value="stock">Menor estoque</option>
                </select>
              </div>
            </div>

            {activeFilters.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap px-4 pb-3 -mt-1">
                {activeFilters.map(f => (
                  <span key={f.key} className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full bg-violet-50 border border-violet-200 text-xs font-medium text-violet-800">
                    <f.icon size={12} />{f.label}
                    <button onClick={f.clear} className="p-0.5 rounded-full hover:bg-violet-100" title="Desligar este filtro"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <Panel title={`${fmtInt(visible.length)} variações`} subtitle="Faixa amarela = Mercado Livre · faixa laranja = Shopee">
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-[13px] min-w-[980px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                    <th className="pl-5 pr-2 py-2 font-semibold w-[55%]">Anúncio</th>
                    <th className="px-2 font-semibold">Variação</th>
                    <th className="px-2 font-semibold text-right">Estoque</th>
                    <th className="px-2 font-semibold text-right">Vendeu 30d</th>
                    <th className="px-2 font-semibold text-right">Acaba em</th>
                    <th className="px-2 font-semibold">Situação</th>
                    <th className="px-2 pr-5 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(r => {
                    const P = PLAT[r.platform]
                    const alert = r.level !== 'ok'
                    return (
                      <tr key={r.id} className="border-b border-slate-100 group" style={{ background: alert ? P.soft : undefined }}>
                        <td className="pl-0 pr-2 py-2" style={{ boxShadow: `inset 5px 0 0 ${P.color}` }}>
                          <div className="flex items-center gap-2.5 pl-5">
                            {r.thumbnail ? <img src={r.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0 ring-2" style={{ '--tw-ring-color': P.color }} loading="lazy" /> : <span className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-slate-700 font-medium leading-snug">{r.title}</p>
                              <p className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                                <PlatBadge p={r.platform} />
                                {r.is_full && <span className="inline-flex items-center gap-0.5 font-bold text-[#2D3277]"><Warehouse size={9} />Full</span>}
                                {r.status !== 'active' && <span className="font-bold text-slate-500">{r.sub_status === 'out_of_stock' ? 'pausado por falta de estoque' : 'pausado'}</span>}
                                {r.sku && <span className="font-mono">{r.sku}</span>}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 text-slate-600">{r.variation || <span className="text-slate-300">—</span>}</td>
                        <td className={`px-2 text-right font-black tabular-nums text-base ${r.level === 'zero' ? 'text-rose-600' : r.level === 'crit' ? 'text-orange-600' : r.level === 'low' ? 'text-amber-600' : 'text-slate-800'}`}>{r.stock ?? '—'}</td>
                        <td className="px-2 text-right tabular-nums text-slate-600">{r.matched ? r.sold30 : <span className="text-slate-300" title="Não achei vendas desse anúncio pelo SKU nem pelo título">?</span>}</td>
                        <td className="px-2 text-right tabular-nums text-slate-700">{r.level === 'zero' ? <span className="text-rose-600 font-semibold">acabou</span> : r.days != null ? (r.days < 1 ? '< 1 dia' : `${Math.floor(r.days)} dias`) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-2"><span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${LEVELS[r.level].tone}`}><span className={`w-1.5 h-1.5 rounded-full ${LEVELS[r.level].dot}`} />{LEVELS[r.level].label}</span></td>
                        <td className="px-2 pr-5 text-right whitespace-nowrap">
                          <button onClick={() => hideProduct(r.title)} className="text-slate-300 hover:text-violet-600 opacity-0 group-hover:opacity-100 transition mr-2" title="Ocultar este produto"><EyeOff size={14} /></button>
                          {r.permalink && <a href={r.permalink} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-sky-500 inline-block" title="Abrir anúncio"><ExternalLink size={14} /></a>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!visible.length && <p className="text-sm text-slate-400 text-center py-10">Nada aqui com esses filtros.</p>}
            </div>

            {visible.length > 0 && (
              <div className="flex items-center justify-between gap-3 flex-wrap mt-3 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span>{fmtInt(cur * pageSize + 1)}–{fmtInt(Math.min(visible.length, (cur + 1) * pageSize))} de {fmtInt(visible.length)}</span>
                  <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="input py-1 text-xs w-auto">
                    {PAGE_SIZES.map(n => <option key={n} value={n}>{n} por página</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(cur - 1)} disabled={cur === 0} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 hover:border-slate-400"><ChevronLeft size={14} /></button>
                  {pageList(cur, pages).map((n, i) => n === '…'
                    ? <span key={`e${i}`} className="px-1.5 text-slate-300">…</span>
                    : <button key={n} onClick={() => setPage(n)} className={`min-w-[30px] h-[30px] rounded-lg text-xs font-semibold border ${n === cur ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 hover:border-slate-400'}`}>{n + 1}</button>)}
                  <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 hover:border-slate-400"><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />"Acaba em" = estoque ÷ média de vendas dos últimos 30 dias daquela variação. "?" = não achei as vendas do anúncio (sem SKU e título diferente do pedido) — nesse caso a situação usa só a quantidade. ML Full: o estoque é o que está no armazém do ML.</p>
          </Panel>
        </>
      )}
    </div>
  )
}

// 1 … 4 5 [6] 7 8 … 20
function pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i)
  const out = [0]
  const from = Math.max(1, cur - 2), to = Math.min(total - 2, cur + 2)
  if (from > 1) out.push('…')
  for (let i = from; i <= to; i++) out.push(i)
  if (to < total - 2) out.push('…')
  out.push(total - 1)
  return out
}
