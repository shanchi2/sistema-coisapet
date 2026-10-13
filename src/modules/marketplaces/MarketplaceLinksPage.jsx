import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Link2, Loader2, Search, X, Check, ExternalLink, Ban, ArrowRightLeft, Info, CheckCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { StatTile } from '../dashboard/widgets'
import { PLAT, PlatBadge, Segmented, norm, fetchAll } from './shared'

// Links dos produtos nos anúncios (13/10). Muitos produtos estavam sem o
// link do ML porque ~70% das variações dos anúncios do ML não têm SKU
// preenchido lá (na Shopee todas têm). O que dava pra ligar com certeza
// (SKU, histórico de vendas, variação irmã) já foi gravado direto; o resto
// ficou em `product_ml_link_suggestions` com o anúncio mais parecido pelo
// nome — o método por nome erra tamanho/espécie (ex.: Plataforma G vs M),
// por isso aqui alguém confere antes de gravar.

const STRONG = 'nome-auto'
const fmtScore = s => s == null ? '' : `${Math.round(Number(s) * 100)}%`

export function MarketplaceLinksPage() {
  const [plat, setPlat] = useState('ml')
  const [view, setView] = useState('sugestao')   // sugestao | sem | nao_tem
  const [products, setProducts] = useState(null)
  const [sugs, setSugs] = useState({})
  const [listings, setListings] = useState({ ml: [], shopee: [] })
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState(new Set())
  const [picker, setPicker] = useState(null)      // product id com o seletor aberto
  const [pickQ, setPickQ] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setProducts(null)
    const [ps, ss, st] = await Promise.all([
      fetchAll(() => supabase.from('products').select('id, name, sku, parent_product_id, url_ml, url_shopee').eq('active', true).order('name')),
      fetchAll(() => supabase.from('product_ml_link_suggestions').select('product_id, item_id, url, ml_title, score, via, status')),
      fetchAll(() => supabase.from('marketplace_stock').select('platform, item_id, title, permalink, thumbnail, status')),
    ])
    const byId = Object.fromEntries(ps.map(p => [p.id, p]))
    setProducts(ps.map(p => ({ ...p, parent: p.parent_product_id ? byId[p.parent_product_id]?.name : null })))
    setSugs(Object.fromEntries(ss.map(s => [s.product_id, s])))
    const lst = { ml: new Map(), shopee: new Map() }
    st.forEach(r => { if (!lst[r.platform]?.has(r.item_id)) lst[r.platform]?.set(r.item_id, { item_id: r.item_id, title: r.title, url: r.permalink, thumb: r.thumbnail?.replace(/^http:\/\//, 'https://'), active: r.status === 'active' }) })
    setListings({ ml: [...lst.ml.values()], shopee: [...lst.shopee.values()] })
    setSel(new Set())
  }, [])
  useEffect(() => { load() }, [load])

  const field = plat === 'ml' ? 'url_ml' : 'url_shopee'
  const thumbOf = useMemo(() => Object.fromEntries([...listings.ml, ...listings.shopee].map(l => [l.item_id, l.thumb])), [listings])

  const rows = useMemo(() => {
    if (!products) return []
    const q = norm(search)
    return products
      .filter(p => !p[field])
      .map(p => ({ ...p, sug: plat === 'ml' ? sugs[p.id] : null }))
      .filter(p => plat !== 'ml' ? view !== 'nao_tem'
        : view === 'sugestao' ? p.sug && p.sug.status === 'pendente'
        : view === 'nao_tem' ? p.sug?.status === 'nao_tem'
        : (!p.sug || p.sug.status === 'aplicado') )
      .filter(p => !q || norm(`${p.name} ${p.parent || ''} ${p.sku || ''} ${p.sug?.ml_title || ''}`).includes(q))
      .sort((a, b) => (b.sug?.via === STRONG) - (a.sug?.via === STRONG) || (Number(b.sug?.score) || 0) - (Number(a.sug?.score) || 0) || (a.parent || a.name).localeCompare(b.parent || b.name))
  }, [products, sugs, plat, view, search, field])

  const total = products?.length || 0
  const withMl = products?.filter(p => p.url_ml).length || 0
  const withSh = products?.filter(p => p.url_shopee).length || 0
  const pend = products?.filter(p => !p.url_ml && sugs[p.id]?.status === 'pendente').length || 0

  async function apply(list) {
    // list: [{ product, url, item_id? }]
    if (!list.length) return
    setBusy(true)
    try {
      for (const { product, url, item_id, title } of list) {
        const { error } = await supabase.from('products').update({ [field]: url }).eq('id', product.id)
        if (error) throw error
        if (plat === 'ml') {
          await supabase.from('product_ml_link_suggestions').upsert({ product_id: product.id, url, item_id: item_id ?? product.sug?.item_id ?? null, ml_title: title ?? product.sug?.ml_title ?? null, via: product.sug && !item_id ? product.sug.via : 'manual', status: 'aplicado' })
        }
      }
      const ids = new Set(list.map(l => l.product.id))
      setProducts(ps => ps.map(p => ids.has(p.id) ? { ...p, [field]: list.find(l => l.product.id === p.id).url } : p))
      if (plat === 'ml') setSugs(s => { const n = { ...s }; list.forEach(l => { n[l.product.id] = { ...(n[l.product.id] || {}), product_id: l.product.id, url: l.url, status: 'aplicado' } }); return n })
      setSel(s => { const n = new Set(s); ids.forEach(i => n.delete(i)); return n })
      toast.success(list.length === 1 ? 'Link gravado no produto' : `${list.length} links gravados`)
    } catch (e) { toast.error('Não gravou: ' + e.message) } finally { setBusy(false); setPicker(null) }
  }

  async function markNone(p) {
    setBusy(true)
    const { error } = await supabase.from('product_ml_link_suggestions').upsert({ product_id: p.id, url: p.sug?.url || '-', item_id: p.sug?.item_id ?? null, ml_title: p.sug?.ml_title ?? null, via: p.sug?.via ?? 'manual', status: 'nao_tem' })
    setBusy(false)
    if (error) return toast.error(error.message)
    setSugs(s => ({ ...s, [p.id]: { ...(s[p.id] || {}), product_id: p.id, status: 'nao_tem' } }))
    toast.success('Marcado como "não está no ML"')
  }

  // Busca por palavras: ordena pelos anúncios com mais palavras em comum
  const pickList = useMemo(() => {
    const words = norm(pickQ).split(' ').filter(w => w.length > 2 && !['para', 'com', 'dos', 'das'].includes(w))
    if (!words.length) return listings[plat].slice(0, 40)
    return listings[plat]
      .map(l => { const t = norm(`${l.title} ${l.item_id}`); return { l, n: words.filter(w => t.includes(w)).length } })
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 40).map(x => x.l)
  }, [listings, plat, pickQ])

  const visible = rows.slice(0, 200)
  const selectable = visible.filter(r => r.sug?.url && r.sug.status === 'pendente')

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFE600] to-[#EE4D2D] flex items-center justify-center shrink-0 shadow-sm"><Link2 size={20} className="text-white" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Links dos anúncios</h1>
          <p className="text-sm text-slate-500">Liga cada produto do sistema ao anúncio dele no Mercado Livre e na Shopee</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatTile icon={Link2} label="Com link do ML" value={products ? `${withMl}/${total}` : '…'} detail={products ? `${Math.round((withMl / (total || 1)) * 100)}% dos produtos` : ''} />
        <StatTile icon={Link2} label="Com link da Shopee" value={products ? `${withSh}/${total}` : '…'} detail={products ? `${Math.round((withSh / (total || 1)) * 100)}% dos produtos` : ''} />
        <StatTile icon={CheckCheck} tone={pend ? 'warning' : 'good'} label="Sugestões do ML pra conferir" value={products ? pend : '…'} detail="anúncio mais parecido pelo nome" />
      </div>

      <div className="card !p-0">
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-slate-100">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
            {['ml', 'shopee'].map(p => (
              <button key={p} onClick={() => { setPlat(p); setView(p === 'ml' ? 'sugestao' : 'sem'); setSel(new Set()) }}
                className={`h-8 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${plat === p ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PLAT[p].color }} />Sem link {PLAT[p].short === 'ML' ? 'do ML' : 'da Shopee'}
              </button>
            ))}
          </div>
          {plat === 'ml' && <Segmented value={view} onChange={v => { setView(v); setSel(new Set()) }} options={[['sugestao', `Com sugestão (${pend})`], ['sem', 'Sem sugestão'], ['nao_tem', 'Não está no ML']]} />}
          <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 h-9 flex-1 min-w-[200px] max-w-sm bg-white focus-within:border-slate-400 ml-auto">
            <Search size={14} className="text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Produto, SKU ou anúncio…" className="bg-transparent outline-none text-sm w-full placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch('')} className="text-slate-400"><X size={13} /></button>}
          </div>
        </div>
        {plat === 'ml' && view === 'sugestao' && (
          <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 bg-slate-50/70 text-xs">
            <button onClick={() => setSel(new Set(selectable.filter(r => r.sug.via === STRONG).map(r => r.id)))} className="font-semibold text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline">Selecionar as sugestões fortes</button>
            <span className="text-slate-300">·</span>
            <button onClick={() => setSel(new Set())} className="font-semibold text-slate-500 hover:text-slate-800">limpar</button>
            <button disabled={!sel.size || busy} onClick={() => apply(rows.filter(r => sel.has(r.id)).map(r => ({ product: r, url: r.sug.url })))}
              className="btn-primary py-1.5 text-xs ml-auto disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Confirmar {sel.size || ''} selecionado{sel.size === 1 ? '' : 's'}</button>
          </div>
        )}
      </div>

      <div className="card !p-0 overflow-hidden">
        {!products ? <div className="py-20 text-center"><Loader2 size={22} className="mx-auto animate-spin text-slate-300" /></div>
          : !rows.length ? <p className="text-sm text-slate-400 text-center py-14">Nada aqui 🎉</p>
          : visible.map(r => {
            const s = r.sug, open = picker === r.id
            return (
              <div key={r.id} className="border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  {plat === 'ml' && view === 'sugestao' && (
                    <input type="checkbox" checked={sel.has(r.id)} onChange={e => setSel(x => { const n = new Set(x); e.target.checked ? n.add(r.id) : n.delete(r.id); return n })} className="w-4 h-4 accent-slate-800 shrink-0" />
                  )}
                  <div className="w-[38%] min-w-0">
                    <p className="text-[13px] font-medium text-slate-800 leading-snug">{r.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{r.sku && <span className="font-mono">{r.sku}</span>}{r.parent && r.parent !== r.name && <> · variação de {r.parent}</>}</p>
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2.5">
                    {s?.url && s.status === 'pendente' ? (<>
                      {thumbOf[s.item_id] ? <img src={thumbOf[s.item_id]} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />}
                      <div className="min-w-0">
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-[12.5px] text-slate-700 hover:underline leading-snug inline-flex items-start gap-1">{s.ml_title}<ExternalLink size={11} className="shrink-0 mt-0.5 text-slate-400" /></a>
                        <p className="text-[10px] mt-0.5 flex items-center gap-1.5"><PlatBadge p="ml" />
                          <span className={`font-bold ${s.via === STRONG ? 'text-emerald-600' : 'text-amber-600'}`}>{s.via === STRONG ? 'sugestão forte' : 'confira'} · {fmtScore(s.score)} parecido</span></p>
                      </div>
                    </>) : <span className="text-[12px] text-slate-400">{view === 'nao_tem' ? 'marcado como não anunciado no ML' : 'sem sugestão — escolha o anúncio'}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {s?.url && s.status === 'pendente' && <button disabled={busy} onClick={() => apply([{ product: r, url: s.url }])} className="btn-primary py-1.5 px-3 text-xs"><Check size={13} />Confirmar</button>}
                    <button onClick={() => { setPicker(open ? null : r.id); setPickQ(r.parent || r.name) }} className="btn-secondary py-1.5 px-3 text-xs"><ArrowRightLeft size={13} />{s?.url && s.status === 'pendente' ? 'Outro' : 'Escolher anúncio'}</button>
                    {plat === 'ml' && view !== 'nao_tem' && <button disabled={busy} onClick={() => markNone(r)} title="Este produto não está anunciado no ML" className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Ban size={14} /></button>}
                  </div>
                </div>
                {open && (
                  <div className="px-4 pb-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 h-8 bg-white mb-2">
                        <Search size={13} className="text-slate-400" />
                        <input autoFocus value={pickQ} onChange={e => setPickQ(e.target.value)} placeholder={`Buscar anúncio ${plat === 'ml' ? 'do ML' : 'da Shopee'}…`} className="bg-transparent outline-none text-sm w-full" />
                      </div>
                      <div className="max-h-64 overflow-y-auto flex flex-col">
                        {!pickList.length && <p className="text-xs text-slate-400 p-3 text-center">Nenhum anúncio com esse nome. Tente menos palavras.</p>}
                        {pickList.map(l => (
                          <button key={l.item_id} disabled={busy} onClick={() => apply([{ product: r, url: l.url, item_id: l.item_id, title: l.title }])}
                            className="flex items-center gap-2.5 text-left px-2 py-1.5 rounded-lg hover:bg-white">
                            {l.thumb ? <img src={l.thumb} alt="" className="w-8 h-8 rounded object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-8 h-8 rounded bg-slate-100 shrink-0" />}
                            <span className="text-[12.5px] text-slate-700 flex-1 min-w-0 truncate">{l.title}</span>
                            {!l.active && <span className="text-[10px] font-bold text-slate-400">pausado</span>}
                            <span className="text-[10px] font-mono text-slate-400">{l.item_id}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        {rows.length > 200 && <p className="text-xs text-slate-400 text-center py-3">Mostrando 200 de {rows.length} — use a busca.</p>}
      </div>

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
        <span>Os links que dava pra ligar com certeza (SKU igual, histórico de vendas ou variação irmã) já foram gravados. As sugestões aqui são pelo nome — conferir o tamanho/modelo antes de confirmar. Pra isso não voltar a acontecer: preencher o SKU nas variações dos anúncios do ML (hoje ~70% estão sem).</span>
      </p>
    </div>
  )
}
