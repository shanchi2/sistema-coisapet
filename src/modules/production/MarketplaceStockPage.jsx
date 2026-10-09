import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Boxes, RefreshCw, Loader2, Search, X, ExternalLink, AlertOctagon, AlertTriangle, PackageCheck, Warehouse, Download, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { StatTile, Panel, fmtInt } from '../dashboard/widgets'

// Estoque nos Marketplaces (09/10, fase102) — sem estoque / estoque baixo
// do ML e da Shopee num lugar só, por VARIAÇÃO. Dados da foto
// `marketplace_stock` (Edge Function `marketplace-stock`, de hora em hora)
// cruzados com o ritmo de venda dos últimos 30 dias (orders/order_items)
// pra estimar "acaba em X dias". Cruzamento: SKU quando existe; senão
// título + variação normalizada (muito anúncio do ML não tem SKU).
// Só quantidade — sem R$.

const PLAT = {
  ml:     { label: 'Mercado Livre', short: 'ML', color: '#2D3277' },
  shopee: { label: 'Shopee', short: 'Shopee', color: '#EE4D2D' },
}
const LEVELS = {
  zero:  { label: 'Sem estoque', tone: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  crit:  { label: 'Crítico', tone: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  low:   { label: 'Baixo', tone: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  ok:    { label: 'OK', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
}
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
// "COR: AMADEIRADO - SALA DUPLA" / "Amadeirado / Sala dupla" / "Completo,25g" → "amadeirado|sala dupla"
const normVar = v => norm(v).split(/[,/;|]|\s-\s/).map(p => p.replace(/^[^:]*:\s*/, '').trim()).filter(Boolean).sort().join('|')
function fmtAgo(iso) {
  if (!iso) return 'nunca'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `há ${Math.max(1, m)} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dias`
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

export function MarketplaceStockPage() {
  const [stock, setStock] = useState(null)
  const [sales, setSales] = useState([])
  const [sync, setSync] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [plat, setPlat] = useState('')
  const [level, setLevel] = useState('alert') // alert | zero | crit | low | ok | all
  const [search, setSearch] = useState('')
  const [showFull, setShowFull] = useState(true)
  const [showPaused, setShowPaused] = useState(true)

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
      return { ...r, sold30: sold30 ?? 0, matched: sold30 != null, perDay, days, level: lvl }
    })
  }, [stock, vel])

  const visible = useMemo(() => {
    const q = norm(search)
    const order = { zero: 0, crit: 1, low: 2, ok: 3 }
    return rows
      .filter(r => !plat || r.platform === plat)
      .filter(r => showFull || !r.is_full)
      .filter(r => showPaused || r.status === 'active')
      .filter(r => level === 'all' ? true : level === 'alert' ? r.level !== 'ok' : r.level === level)
      .filter(r => !q || norm(r.title).includes(q) || norm(r.variation).includes(q) || norm(r.sku).includes(q) || norm(r.item_id).includes(q))
      .sort((a, b) => order[a.level] - order[b.level] || b.sold30 - a.sold30 || (a.days ?? 9e9) - (b.days ?? 9e9))
  }, [rows, plat, level, search, showFull, showPaused])

  const count = (lv, p) => rows.filter(r => r.level === lv && (!p || r.platform === p)).length
  const lastSync = sync.reduce((m, s) => (!m || (s.synced_at && s.synced_at < m) ? s.synced_at : m), null)
  const syncErr = sync.filter(s => s.error)

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
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center shrink-0 shadow-sm"><Boxes size={20} className="text-white" /></div>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['zero', AlertOctagon, 'critical', 'Sem estoque', 'zerado agora — comprador não consegue comprar'],
              ['crit', AlertTriangle, 'warning', 'Crítico', 'acaba em menos de 7 dias (ou ≤ 2 un.)'],
              ['low', AlertTriangle, 'warning', 'Baixo', 'acaba em 7–15 dias (ou ≤ 5 un.)'],
              ['ok', PackageCheck, 'good', 'OK', 'estoque confortável'],
            ].map(([lv, Icon, tone, label, hint]) => (
              <button key={lv} onClick={() => setLevel(l => l === lv ? 'alert' : lv)} className={`text-left rounded-2xl ring-2 transition ${level === lv ? 'ring-slate-800' : 'ring-transparent'}`}>
                <StatTile icon={Icon} tone={tone} label={label} value={fmtInt(count(lv))}
                  detail={<span>{hint}<br /><span className="font-semibold" style={{ color: PLAT.ml.color }}>ML {count(lv, 'ml')}</span> · <span className="font-semibold" style={{ color: PLAT.shopee.color }}>Shopee {count(lv, 'shopee')}</span></span>} />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-slate-100 rounded-xl p-1">
              {[['alert', 'Precisam de atenção'], ['all', 'Todos']].map(([k, l]) => (
                <button key={k} onClick={() => setLevel(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${level === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
              ))}
            </div>
            <div className="flex bg-slate-100 rounded-xl p-1">
              {[['', 'ML + Shopee'], ['ml', 'Mercado Livre'], ['shopee', 'Shopee']].map(([k, l]) => (
                <button key={k} onClick={() => setPlat(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${plat === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{l}</button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={showFull} onChange={e => setShowFull(e.target.checked)} /> Mostrar ML Full</label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={showPaused} onChange={e => setShowPaused(e.target.checked)} /> Mostrar pausados</label>
            <div className="ml-auto flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
              <Search size={13} className="text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar anúncio, cor, SKU ou MLB..." className="bg-transparent outline-none text-sm w-60 placeholder:text-slate-400" />
              {search && <button onClick={() => setSearch('')} className="text-slate-400"><X size={12} /></button>}
            </div>
          </div>

          <Panel title={`${fmtInt(visible.length)} variações`} subtitle="Primeiro o que está zerado, depois o que acaba antes · mais vendidos no topo de cada grupo">
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-[13px] min-w-[980px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                    <th className="pl-5 pr-2 py-2 font-semibold">Anúncio</th>
                    <th className="px-2 font-semibold">Variação</th>
                    <th className="px-2 font-semibold text-right">Estoque</th>
                    <th className="px-2 font-semibold text-right">Vendeu 30d</th>
                    <th className="px-2 font-semibold text-right">Acaba em</th>
                    <th className="px-2 font-semibold">Situação</th>
                    <th className="px-2 pr-5 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, 500).map(r => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="pl-5 pr-2 py-2">
                        <div className="flex items-center gap-2.5 max-w-[420px]">
                          {r.thumbnail ? <img src={r.thumbnail} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-slate-700 font-medium truncate" title={r.title}>{r.title}</p>
                            <p className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold" style={{ color: PLAT[r.platform].color }}>{PLAT[r.platform].short}</span>
                              {r.is_full && <span className="inline-flex items-center gap-0.5 font-bold text-[#7c83d6]"><Warehouse size={9} />Full</span>}
                              {r.status !== 'active' && <span className="font-bold text-slate-500">{r.sub_status === 'out_of_stock' ? 'pausado por falta de estoque' : 'pausado'}</span>}
                              {r.sku && <span className="font-mono">{r.sku}</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 text-slate-600">{r.variation || <span className="text-slate-300">—</span>}</td>
                      <td className={`px-2 text-right font-black tabular-nums ${r.level === 'zero' ? 'text-rose-600' : r.level === 'crit' ? 'text-orange-600' : r.level === 'low' ? 'text-amber-600' : 'text-slate-800'}`}>{r.stock ?? '—'}</td>
                      <td className="px-2 text-right tabular-nums text-slate-600">{r.matched ? r.sold30 : <span className="text-slate-300" title="Não achei vendas desse anúncio pelo SKU nem pelo título">?</span>}</td>
                      <td className="px-2 text-right tabular-nums text-slate-700">{r.level === 'zero' ? <span className="text-rose-600 font-semibold">acabou</span> : r.days != null ? (r.days < 1 ? '< 1 dia' : `${Math.floor(r.days)} dias`) : <span className="text-slate-300">—</span>}</td>
                      <td className="px-2"><span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${LEVELS[r.level].tone}`}><span className={`w-1.5 h-1.5 rounded-full ${LEVELS[r.level].dot}`} />{LEVELS[r.level].label}</span></td>
                      <td className="px-2 pr-5 text-right">{r.permalink && <a href={r.permalink} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-sky-500" title="Abrir anúncio"><ExternalLink size={14} /></a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && <p className="text-sm text-slate-400 text-center py-10">Nada aqui — tudo com estoque confortável.</p>}
            </div>
            <p className="text-[11px] text-slate-400 mt-3 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />"Acaba em" = estoque ÷ média de vendas dos últimos 30 dias daquela variação. "?" = não achei as vendas do anúncio (sem SKU e título diferente do pedido) — nesse caso a situação usa só a quantidade. ML Full: o estoque é o que está no armazém do ML.</p>
          </Panel>
        </>
      )}
    </div>
  )
}
