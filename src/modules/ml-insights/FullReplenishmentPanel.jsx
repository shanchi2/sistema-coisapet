import { useEffect, useMemo, useState } from 'react'
import { Loader2, AlertTriangle, Search, X, Download, Info, TrendingUp, TrendingDown, Minus, Sparkles, Warehouse, Truck, CalendarClock, PackagePlus, EyeOff, Eye, ExternalLink, ClipboardList } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { createPrelist } from './FullPrelistsPanel'

// Central de reposição do Full (16/10, pedido do Raphael): estuda as vendas
// dos últimos 90 dias de cada variação (ML e Shopee) e diz
//   1. quais produtos são bons pro Full (vendem bem e de forma constante);
//   2. quanto mandar em média a cada envio (ciclo de 7/15/21/30 dias);
//   3. quanto mandar AGORA, descontando o que já está no Full e o que está
//      a caminho (envios em aberto).
// Só quantidades — sem R$. Mesmo cruzamento venda × anúncio da tela Estoque
// nos Marketplaces: SKU; senão título + variação; senão só título quando o
// anúncio tem uma variação só.

const PLAT = {
  ml:     { label: 'Mercado Livre', short: 'ML', active: 'bg-[#FFE600] text-[#2D3277] border-[#F5C400]', soft: 'bg-[#FFF9D6]' },
  shopee: { label: 'Shopee', short: 'Shopee', active: 'bg-[#EE4D2D] text-white border-[#EE4D2D]', soft: 'bg-[#FFEDE8]' },
}
const CYCLES = [7, 15, 21, 30]
const WEEKS = 13
const SETTINGS_KEY = 'coisapet_full_reposicao'
const DEFAULTS = { cycle: 15, safety: 7, minMonth: 8, leadShopee: 7, hidden: ['Casa Cama Toca De Gato'] }
const OPEN_STATUS = ['working', 'confirmed', 'received']

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const normVar = v => norm(v).split(/[,/;|]|\s-\s/).map(p => p.replace(/^[^:]*:\s*/, '').trim()).filter(Boolean).sort().join('|')
const fmtInt = n => Math.round(n || 0).toLocaleString('pt-BR')
const fmtDec = n => (n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

function readSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) } } catch { return DEFAULTS }
}

async function fetchAll(build) {
  const all = []
  for (let page = 0; page < 40; page++) {
    const { data, error } = await build().range(page * 1000, page * 1000 + 999)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

// Vendas de 90 dias em baldes: 3 meses (0–30, 31–60, 61–90 dias atrás) e
// 13 semanas (pra medir constância)
function emptyStat() { return { m: [0, 0, 0], w: Array(WEEKS).fill(0) } }
function addSale(map, key, ageDays, q) {
  const s = map[key] || (map[key] = emptyStat())
  const mi = Math.floor(ageDays / 30)
  if (mi < 3) s.m[mi] += q
  const wi = Math.floor(ageDays / 7)
  if (wi < WEEKS) s.w[WEEKS - 1 - wi] += q // índice 12 = semana atual
}

// Ritmo de venda: média ponderada (mês mais recente pesa mais)
function analyse(stat) {
  const [m0, m1, m2] = stat.m
  const perDay = (0.5 * m0 + 0.3 * m1 + 0.2 * m2) / 30
  const older = (m1 + m2) / 2
  const trend = older > 0 ? (m0 - older) / older : m0 > 0 ? 1 : 0
  const weeksSelling = stat.w.filter(x => x > 0).length
  const consistency = weeksSelling >= 10 ? 'constante' : weeksSelling >= 6 ? 'regular' : 'esporadico'
  return { m0, m1, m2, perDay, trend, weeksSelling, consistency, weeks: stat.w }
}

const CONSIST = {
  constante:  { label: 'Constante',  tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', hint: 'vendeu em 10+ das últimas 13 semanas' },
  regular:    { label: 'Regular',    tone: 'text-sky-700 bg-sky-50 border-sky-200', hint: 'vendeu em 6–9 das últimas 13 semanas' },
  esporadico: { label: 'Esporádico', tone: 'text-slate-500 bg-slate-50 border-slate-200', hint: 'vendeu em menos de 6 das últimas 13 semanas' },
}

function Spark({ weeks }) {
  const max = Math.max(1, ...weeks)
  return (
    <div className="flex items-end gap-[2px] h-6" title={`Vendas por semana (13 semanas): ${weeks.join(', ')}`}>
      {weeks.map((v, i) => (
        <div key={i} className={`w-[4px] rounded-sm ${v ? 'bg-emerald-500' : 'bg-slate-200'}`} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />
      ))}
    </div>
  )
}

function Trend({ t }) {
  if (Math.abs(t) < 0.15) return <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400"><Minus size={11} />estável</span>
  const up = t > 0
  const Icon = up ? TrendingUp : TrendingDown
  return <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}><Icon size={11} />{up ? '+' : ''}{Math.round(t * 100)}%</span>
}

function Stat({ icon: Icon, label, value, detail, tone = 'text-slate-800' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1"><Icon size={14} className="text-slate-400" /><p className="text-xs font-semibold text-slate-500 uppercase">{label}</p></div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      {detail && <p className="text-[11px] text-slate-400 mt-0.5">{detail}</p>}
    </div>
  )
}

export function FullReplenishmentPanel({ shipments, onPrelist }) {
  const { user } = useAuth()
  const [creating, setCreating] = useState(false)
  const [plat, setPlat] = useState('ml')
  const [cfg, setCfg] = useState(readSettings)
  const [view, setView] = useState('ideal') // ideal | full | candidates | all
  const [search, setSearch] = useState('')
  const [stock, setStock] = useState(null)
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState(null)
  const [hideOpen, setHideOpen] = useState(false)
  const [newHidden, setNewHidden] = useState('')

  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg)) } catch { /* sem storage */ } }, [cfg])
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))

  useEffect(() => {
    (async () => {
      try {
        const since = new Date(Date.now() - 91 * 86400000).toISOString()
        const [s, o] = await Promise.all([
          fetchAll(() => supabase.from('marketplace_stock').select('platform, item_id, variation_id, title, variation, sku, stock, status, is_full, thumbnail, permalink').order('id')),
          fetchAll(() => supabase.from('orders').select('source, data_venda, status_ml, marketplace_status, items:order_items(qty, sku, titulo, variacao)').in('source', ['ml', 'shopee']).gte('data_venda', since).order('id')),
        ])
        setStock(s); setOrders(o)
      } catch (e) { setError(e?.message ?? JSON.stringify(e)) }
    })()
  }, [])

  // Prazo real do ML: da coleta agendada até a conferência terminar (mediana
  // dos envios já finalizados). Shopee ainda sem histórico → valor ajustável.
  const leadML = useMemo(() => {
    const ds = (shipments || [])
      .filter(s => ['closed_ok', 'closed_with_changes'].includes(s.status) && s.appointment_date && s.last_updated_ml)
      .map(s => (new Date(s.last_updated_ml) - new Date(s.appointment_date)) / 86400000)
      .filter(d => d >= 0 && d < 60).sort((a, b) => a - b)
    if (!ds.length) return { days: 5, n: 0 }
    return { days: Math.max(1, Math.round(ds[Math.floor(ds.length / 2)])), n: ds.length }
  }, [shipments])
  const lead = plat === 'ml' ? leadML.days : Number(cfg.leadShopee) || 7

  // Unidades a caminho do Full (envios ML em aberto), por anúncio+variação
  const incoming = useMemo(() => {
    const byVar = {}, byItem = {}
    for (const s of shipments || []) {
      if (!OPEN_STATUS.includes(s.status)) continue
      for (const i of s.items || []) {
        const q = Number(i.declared_qty) || 0
        byVar[`${i.ml_code}|${normVar(i.variation)}`] = (byVar[`${i.ml_code}|${normVar(i.variation)}`] || 0) + q
        byItem[i.ml_code] = (byItem[i.ml_code] || 0) + q
      }
    }
    return { byVar, byItem }
  }, [shipments])

  const sales = useMemo(() => {
    if (!orders) return null
    const bySku = {}, byTV = {}, byT = {}
    const now = Date.now()
    for (const o of orders) {
      const st = (o.status_ml || '').toLowerCase()
      if (st.includes('cancelad') || ['CANCELLED', 'IN_CANCEL'].includes(o.marketplace_status)) continue
      const age = (now - new Date(o.data_venda).getTime()) / 86400000
      if (age < 0 || age >= 90) continue
      for (const it of o.items || []) {
        const q = Number(it.qty) || 0
        if (!q) continue
        if (it.sku) addSale(bySku, `${o.source}|${norm(it.sku)}`, age, q)
        const kt = `${o.source}|${norm(it.titulo)}`
        addSale(byT, kt, age, q)
        addSale(byTV, `${kt}|${normVar(it.variacao)}`, age, q)
      }
    }
    return { bySku, byTV, byT }
  }, [orders])

  const hiddenNorm = useMemo(() => (cfg.hidden || []).map(norm).filter(Boolean), [cfg.hidden])

  const rows = useMemo(() => {
    if (!stock || !sales) return []
    const varCount = {}
    stock.forEach(r => { varCount[`${r.platform}|${r.item_id}`] = (varCount[`${r.platform}|${r.item_id}`] || 0) + 1 })
    // SKUs que já têm anúncio no Full (pra não sugerir o mesmo produto de novo
    // pelo anúncio de envio próprio)
    const fullSkus = new Set(stock.filter(r => r.is_full && r.sku).map(r => `${r.platform}|${norm(r.sku)}`))
    const total = (r, cycle) => {
      const kt = `${r.platform}|${norm(r.title)}`
      const stat = (r.sku && sales.bySku[`${r.platform}|${norm(r.sku)}`])
        || sales.byTV[`${kt}|${normVar(r.variation)}`]
        || (varCount[`${r.platform}|${r.item_id}`] === 1 && sales.byT[kt])
        || null
      return stat
    }
    return stock
      .filter(r => r.platform === plat && r.variation !== '(variações não lidas)')
      .map(r => {
        const stat = total(r)
        const a = analyse(stat || emptyStat())
        const inFull = !!r.is_full
        const fullStock = inFull ? Math.max(0, r.stock || 0) : 0
        const coming = plat === 'ml' ? (incoming.byVar[`${r.item_id}|${normVar(r.variation)}`] ?? (varCount[`${r.platform}|${r.item_id}`] === 1 ? incoming.byItem[r.item_id] : 0) ?? 0) : 0
        const cycle = Number(cfg.cycle) || 15
        const safety = Number(cfg.safety) || 0
        const perShipment = Math.ceil(a.perDay * cycle)
        const target = a.perDay * (cycle + lead + safety)
        const sendNow = a.perDay > 0 ? Math.max(0, Math.ceil(target - fullStock - (coming || 0))) : 0
        const coverDays = inFull && a.perDay > 0 ? (fullStock + (coming || 0)) / a.perDay : null
        const monthly = a.perDay * 30
        const ideal = monthly >= (Number(cfg.minMonth) || 0) && a.consistency !== 'esporadico'
        const dupOfFull = !inFull && r.sku && fullSkus.has(`${r.platform}|${norm(r.sku)}`)
        const urgent = coverDays != null && coverDays < lead + safety
        return {
          ...r, ...a, matched: !!stat, inFull, fullStock, coming: coming || 0, perShipment, sendNow, coverDays, monthly,
          ideal, dupOfFull, urgent, hidden: hiddenNorm.some(h => norm(r.title).includes(h)),
        }
      })
  }, [stock, sales, plat, cfg.cycle, cfg.safety, cfg.minMonth, lead, incoming, hiddenNorm])

  const visibleBase = rows.filter(r => !r.hidden && !r.dupOfFull)
  const list = useMemo(() => {
    const q = norm(search)
    return visibleBase
      .filter(r => view === 'all' ? true : view === 'full' ? r.inFull : view === 'candidates' ? (!r.inFull && r.ideal) : (r.ideal || (r.inFull && r.perDay > 0)))
      .filter(r => !q || norm(r.title).includes(q) || norm(r.variation).includes(q) || norm(r.sku).includes(q) || norm(r.item_id).includes(q))
      .sort((a, b) => (b.urgent - a.urgent) || (b.sendNow - a.sendNow) || (b.perDay - a.perDay))
  }, [visibleBase, view, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const plan = list.filter(r => r.ideal || r.inFull)
  const totals = {
    ideal: visibleBase.filter(r => r.ideal).length,
    inFull: visibleBase.filter(r => r.inFull).length,
    candidates: visibleBase.filter(r => !r.inFull && r.ideal).length,
    perShipment: plan.reduce((t, r) => t + r.perShipment, 0),
    sendNow: plan.reduce((t, r) => t + r.sendNow, 0),
    sendNowItems: plan.filter(r => r.sendNow > 0).length,
    urgent: visibleBase.filter(r => r.inFull && r.urgent).length,
  }

  // Pré-lista com tudo que tem "Enviar agora" no plano (ideais + já no Full),
  // independente do filtro/busca da tela — dá pra tirar/ajustar depois
  async function makePrelist() {
    const items = visibleBase.filter(r => (r.ideal || r.inFull) && r.sendNow > 0)
      .sort((a, b) => (b.urgent - a.urgent) || (b.sendNow - a.sendNow))
      .map(r => ({ ...r, qty: r.sendNow, suggested: r.sendNow }))
    if (!items.length) return toast('Nada pra enviar agora nesse plano')
    setCreating(true)
    try {
      const l = await createPrelist({ platform: plat, items, createdBy: user?.name })
      toast.success(`Pré-lista criada com ${items.length} itens`)
      onPrelist?.(l.id)
    } catch (e) { toast.error(e.message) } finally { setCreating(false) }
  }

  function exportCsv() {
    const head = ['Plataforma', 'Anúncio', 'Variação', 'SKU', 'No Full hoje', 'A caminho', 'Vendas 30d', 'Média/dia', 'Constância', `Média por envio (${cfg.cycle} dias)`, 'Enviar agora', 'Situação', 'Link']
    const lines = list.filter(r => r.sendNow > 0 || r.inFull).map(r => [PLAT[plat].short, r.title, r.variation || '', r.sku || '', r.fullStock, r.coming, r.m0, fmtDec(r.perDay), CONSIST[r.consistency].label, r.perShipment, r.sendNow, r.inFull ? 'Já no Full' : 'Novo no Full', r.permalink || ''])
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `reposicao-full-${plat}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (error) return <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3"><AlertTriangle size={15} /> {error}</div>
  if (!stock || !orders) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 size={18} className="animate-spin" /> Estudando as vendas dos últimos 90 dias...</div>

  const numInput = (k, w = 'w-14') => (
    <input type="number" min="0" value={cfg[k]} onChange={e => set(k, e.target.value)}
      className={`${w} text-sm font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-emerald-400`} />
  )

  return (
    <div className="space-y-5">
      {/* Plataforma + premissas do plano */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles size={16} className="text-emerald-500" />
          <p className="text-sm font-bold text-slate-800 mr-2">Central de reposição do Full</p>
          {Object.entries(PLAT).map(([k, p]) => (
            <button key={k} onClick={() => setPlat(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${plat === k ? p.active : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
              {p.label}
            </button>
          ))}
          <button onClick={makePrelist} disabled={creating}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white disabled:opacity-50">
            {creating ? <Loader2 size={13} className="animate-spin" /> : <ClipboardList size={13} />} Montar pré-lista ({fmtInt(totals.sendNowItems)})
          </button>
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600">
            <Download size={13} /> Baixar plano (Excel)
          </button>
        </div>
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-xs text-slate-600">
          <label className="flex items-center gap-2">
            <CalendarClock size={14} className="text-slate-400" /> Mandar a cada
            <span className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {CYCLES.map(c => (
                <button key={c} onClick={() => set('cycle', c)}
                  className={`px-2.5 py-1 rounded-md font-semibold ${Number(cfg.cycle) === c ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{c} dias</button>
              ))}
            </span>
          </label>
          <label className="flex items-center gap-2" title="Estoque extra pra não zerar se vender mais que o normal ou o envio atrasar">
            Margem de segurança {numInput('safety')} dias
          </label>
          <label className="flex items-center gap-2" title="Produto só é 'ideal pro Full' se vender pelo menos isso por mês e não for esporádico">
            Ideal a partir de {numInput('minMonth')} un./mês
          </label>
          {plat === 'ml' ? (
            <span className="flex items-center gap-1.5" title="Mediana do tempo entre a coleta agendada e o fim da conferência nos envios já finalizados">
              <Truck size={14} className="text-slate-400" /> Prazo até ficar à venda: <strong>{lead} dias</strong>
              <span className="text-slate-400">({leadML.n ? (leadML.n === 1 ? 'do seu último envio' : `mediana dos seus ${leadML.n} envios`) : 'padrão'})</span>
            </span>
          ) : (
            <label className="flex items-center gap-2" title="Ainda não há envio pro Full da Shopee — ajuste quando tiver o primeiro">
              <Truck size={14} className="text-slate-400" /> Prazo até ficar à venda {numInput('leadShopee')} dias
            </label>
          )}
        </div>
      </div>

      {plat === 'shopee' && totals.inFull === 0 && (
        <div className="flex items-start gap-2.5 text-sm bg-orange-50 border border-orange-200 text-orange-900 rounded-2xl px-4 py-3">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>Ainda não tem nada no Full da Shopee, então tudo aqui é <strong>sugestão pro primeiro envio</strong>: a quantidade "Enviar agora" já cobre um ciclo de {cfg.cycle} dias + prazo + margem. Quando o Full da Shopee começar, o estoque de lá passa a ser descontado sozinho.</p>
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat icon={Sparkles} label="Ideais pro Full" value={fmtInt(totals.ideal)} detail={`${fmtInt(totals.candidates)} ainda não estão no Full`} tone="text-emerald-600" />
        <Stat icon={Warehouse} label="Já no Full" value={fmtInt(totals.inFull)} detail="variações com anúncio Full" />
        <Stat icon={CalendarClock} label={`Média por envio`} value={`${fmtInt(totals.perShipment)} un.`} detail={`a cada ${cfg.cycle} dias (ideais + já no Full)`} tone="text-sky-700" />
        <Stat icon={PackagePlus} label="Enviar agora" value={`${fmtInt(totals.sendNow)} un.`} detail={`${fmtInt(totals.sendNowItems)} variações`} tone="text-violet-700" />
        <Stat icon={AlertTriangle} label="Vão zerar no Full" value={fmtInt(totals.urgent)} detail={`antes de um envio novo chegar (${lead}+${cfg.safety} dias)`} tone={totals.urgent ? 'text-rose-600' : 'text-slate-300'} />
      </div>

      {/* Lista */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
            {[['ideal', 'Plano (ideais + Full)'], ['full', `Já no Full (${totals.inFull})`], ['candidates', `Candidatos novos (${totals.candidates})`], ['all', 'Todos']].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 rounded-md font-semibold ${view === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
            ))}
          </span>
          <div className="flex items-center gap-2 flex-1 min-w-[200px] border border-slate-200 rounded-lg px-3 py-1.5">
            <Search size={14} className="text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto, cor ou SKU..." className="bg-transparent outline-none text-sm w-full" />
            {search && <button onClick={() => setSearch('')} className="text-slate-400"><X size={13} /></button>}
          </div>
          <button onClick={() => setHideOpen(o => !o)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <EyeOff size={13} /> Fora do Full ({(cfg.hidden || []).length})
          </button>
        </div>

        {hideOpen && (
          <div className="mb-3 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs">
            <p className="text-slate-500 mb-2">Produtos que vocês não querem no Full (grandes, frágeis, sob encomenda...). Bate por "título contém". Fica salvo neste computador.</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(cfg.hidden || []).map(h => (
                <span key={h} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2 py-0.5">
                  {h}<button onClick={() => set('hidden', cfg.hidden.filter(x => x !== h))} className="text-slate-400 hover:text-rose-500"><X size={11} /></button>
                </span>
              ))}
            </div>
            <form onSubmit={e => { e.preventDefault(); if (newHidden.trim()) { set('hidden', [...(cfg.hidden || []), newHidden.trim()]); setNewHidden('') } }} className="flex gap-2">
              <input value={newHidden} onChange={e => setNewHidden(e.target.value)} placeholder="Ex.: Terrário 100" className="flex-1 border border-slate-200 rounded-lg px-2 py-1 bg-white" />
              <button className="px-3 py-1 rounded-lg bg-slate-700 text-white font-semibold">Adicionar</button>
            </form>
          </div>
        )}

        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-[13px] min-w-[1050px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                <th className="pl-4 pr-2 py-2 font-semibold">Produto</th>
                <th className="px-2 font-semibold" title="Vendas por semana nas últimas 13 semanas">13 semanas</th>
                <th className="px-2 font-semibold text-right">Vendas 30d</th>
                <th className="px-2 font-semibold text-right" title="Média ponderada: último mês 50%, anterior 30%, retrasado 20%">Média/dia</th>
                <th className="px-2 font-semibold text-right">No Full</th>
                <th className="px-2 font-semibold text-right">A caminho</th>
                <th className="px-2 font-semibold text-right" title="Quantos dias o que está no Full + a caminho aguenta">Cobertura</th>
                <th className="px-2 font-semibold text-right" title={`Quanto esse produto precisa por envio, mandando a cada ${cfg.cycle} dias`}>Por envio</th>
                <th className="pl-2 pr-4 font-semibold text-right">Enviar agora</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={9} className="text-center text-slate-400 py-10">Nada nesse filtro.</td></tr>
              )}
              {list.slice(0, 300).map(r => (
                <tr key={`${r.item_id}|${r.variation_id || ''}`} className={`border-b border-slate-50 ${r.urgent && r.inFull ? 'bg-rose-50/40' : ''}`}>
                  <td className="pl-4 pr-2 py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {r.thumbnail ? <img src={r.thumbnail} alt="" className="w-9 h-9 rounded-md object-cover bg-slate-100 shrink-0" loading="lazy" /> : <div className="w-9 h-9 rounded-md bg-slate-100 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-slate-700 leading-snug">{r.title}{r.variation ? <span className="font-semibold"> · {r.variation}</span> : ''}</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          {r.inFull
                            ? <span className="text-[10px] font-bold bg-emerald-600 text-white rounded px-1.5 py-px">NO FULL</span>
                            : r.ideal && <span className="text-[10px] font-bold bg-violet-600 text-white rounded px-1.5 py-px">CANDIDATO</span>}
                          <span className={`text-[10px] font-semibold border rounded px-1.5 py-px ${CONSIST[r.consistency].tone}`} title={CONSIST[r.consistency].hint}>{CONSIST[r.consistency].label}</span>
                          {r.urgent && r.inFull && <span className="text-[10px] font-bold text-rose-600">vai zerar antes do próximo envio</span>}
                          {!r.matched && <span className="text-[10px] text-slate-400" title="Não achei vendas desse anúncio (sem SKU e título diferente do pedido)">sem vendas casadas</span>}
                          {r.sku && <span className="text-[10px] font-mono text-slate-400">{r.sku}</span>}
                          {r.permalink && <a href={r.permalink} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-sky-500"><ExternalLink size={11} /></a>}
                          <button onClick={() => set('hidden', [...(cfg.hidden || []), r.title])} title="Tirar esse produto do plano (não vai pro Full)" className="text-slate-300 hover:text-slate-600"><Eye size={11} /></button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2"><Spark weeks={r.weeks} /></td>
                  <td className="px-2 text-right tabular-nums"><p className="font-semibold text-slate-700">{fmtInt(r.m0)}</p><Trend t={r.trend} /></td>
                  <td className="px-2 text-right tabular-nums text-slate-600">{fmtDec(r.perDay)}</td>
                  <td className="px-2 text-right tabular-nums">{r.inFull ? <span className="font-semibold text-slate-700">{fmtInt(r.fullStock)}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-2 text-right tabular-nums">{r.coming ? <span className="font-semibold text-sky-600">{fmtInt(r.coming)}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-2 text-right tabular-nums">{r.coverDays == null ? <span className="text-slate-300">—</span> : <span className={r.urgent ? 'text-rose-600 font-semibold' : 'text-slate-600'}>{r.coverDays < 1 ? '< 1 dia' : `${Math.floor(r.coverDays)} dia${Math.floor(r.coverDays) === 1 ? '' : 's'}`}</span>}</td>
                  <td className="px-2 text-right tabular-nums font-semibold text-sky-700">{r.perShipment ? fmtInt(r.perShipment) : <span className="text-slate-300">—</span>}</td>
                  <td className="pl-2 pr-4 text-right tabular-nums">{r.sendNow ? <span className="inline-block min-w-[2.5rem] text-center font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-2 py-0.5">{fmtInt(r.sendNow)}</span> : <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length > 300 && <p className="text-xs text-slate-400 mt-2">Mostrando 300 de {list.length} — use a busca ou os filtros.</p>}

        <div className="mt-4 text-[11px] text-slate-500 leading-relaxed bg-slate-50 rounded-xl p-3 flex gap-2">
          <Info size={13} className="shrink-0 mt-0.5 text-slate-400" />
          <div>
            <p><strong>Como a conta é feita:</strong> média/dia = vendas dos últimos 90 dias na {PLAT[plat].label} (todos os canais, não só Full), com peso maior pro mês mais recente (50% · 30% · 20%).</p>
            <p><strong>Por envio</strong> = média/dia × {cfg.cycle} dias. <strong>Enviar agora</strong> = média/dia × ({cfg.cycle} do ciclo + {lead} de prazo + {cfg.safety} de margem) − o que já está no Full − o que está a caminho.</p>
            <p><strong>Ideal pro Full</strong> = vende {cfg.minMonth}+ un./mês e não é esporádico (vendeu em pelo menos 6 das últimas 13 semanas). Tamanho/peso não entra na conta — tire do plano o que não cabe no Full pelo ícone de olho.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
