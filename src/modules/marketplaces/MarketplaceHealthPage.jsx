import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeartPulse, Loader2, RefreshCw, Search, X, AlertTriangle, AlertCircle, CheckCircle2, HelpCircle, ChevronLeft, ChevronRight, Info, ArrowRight, ListChecks } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useMlInsights } from '../ml-insights/hooks/useMlInsights'
import { useShopeeInsights } from '../shopee-insights/hooks/useShopeeInsights'
import { mlHealthCache } from '../ml-insights/healthPageCache'
import { shopeeHealthCache } from '../shopee-insights/healthPageCache'
import { PLAT, PLATFORMS, usePlatformFilter, PlatformFilter, PlatBadge, Segmented, norm, fmtN, fetchAll } from './shared'

// Saúde dos anúncios ML + Shopee (Fase 1 da unificação, concluída 10/10).
// Cada plataforma tem seu diagnóstico (ML: /item/{id}/performance + ficha
// técnica incompleta; Shopee: get_item_content_diagnosis) — aqui viram a
// mesma régua (perdendo exposição / atenção / saudável) e cruzam pelo SKU
// (`marketplace_stock`): "o mesmo produto está mal numa e bem na outra"
// geralmente é sinal de que dá pra copiar o que funciona. Reaproveita o
// cache em memória das telas de Saúde de cada plataforma (escanear uma vez
// por sessão serve pras três telas).

const ST = {
  unhealthy: { label: 'Perdendo exposição', rank: 0, icon: AlertTriangle, text: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', solid: '#F43F5E' },
  warning:   { label: 'Atenção',            rank: 1, icon: AlertCircle,   text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', solid: '#F59E0B' },
  healthy:   { label: 'Saudável',           rank: 2, icon: CheckCircle2, text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', solid: '#10B981' },
  unknown:   { label: 'Sem diagnóstico',    rank: 3, icon: HelpCircle,   text: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', solid: '#CBD5E1' },
}
const stOf = s => ST[s] ? s : 'unknown'
const detailUrl = r => r.platform === 'ml' ? `/ml/saude/${r.item_id}` : `/shopee/item/${r.item_id}`
const secure = u => u ? u.replace(/^http:\/\//, 'https://') : null

function StatusBadge({ s, small }) {
  const i = ST[s]; const Icon = i.icon
  return <span className={`inline-flex items-center gap-1 font-semibold rounded-full border ${i.text} ${i.bg} ${small ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'}`}><Icon size={small ? 10 : 11} strokeWidth={2.2} />{i.label}</span>
}

export function MarketplaceHealthPage() {
  const ml = useMlInsights()
  const sh = useShopeeInsights()
  const [plat, setPlat] = usePlatformFilter()
  const [mlRows, setMlRows] = useState(mlHealthCache.rows)
  const [shRows, setShRows] = useState(shopeeHealthCache.rows)
  const [errs, setErrs] = useState({})
  const [skus, setSkus] = useState(null)
  const [status, setStatus] = useState('problem')   // problem | unhealthy | warning | healthy | all
  const [cross, setCross] = useState('all')         // all | diverge
  const [search, setSearch] = useState('')
  const [issue, setIssue] = useState('')
  const [page, setPage] = useState(0)
  const PAGE = 30

  const scanMl = useCallback(async () => {
    setErrs(e => ({ ...e, ml: null })); setMlRows(null)
    try {
      const [health, audit] = await Promise.all([ml.fetchItemsHealth(), ml.fetchAttributesAudit()])
      const byItem = new Map(audit.map(a => [a.item_id, a]))
      // Mesmo formato que a tela /ml/saude guarda no cache
      const rows = health.map(h => {
        const a = byItem.get(h.item_id)
        return { item_id: h.item_id, status: h.status, pending_count: h.pending_count ?? 0, pending: h.pending ?? [], title: a?.title ?? h.raw?.item_title ?? null, sku: a?.sku ?? null, permalink: a?.permalink ?? null, thumbnail: secure(a?.thumbnail), missing_count: a?.missing_count ?? 0, missing: a?.missing ?? [], shipping: a?.shipping ?? null, error: h.error || a?.error || null }
      })
      mlHealthCache.rows = rows; setMlRows(rows)
    } catch (e) { setErrs(x => ({ ...x, ml: e.message })); setMlRows([]) }
  }, [ml.fetchItemsHealth, ml.fetchAttributesAudit]) // eslint-disable-line react-hooks/exhaustive-deps

  const scanSh = useCallback(async () => {
    setErrs(e => ({ ...e, shopee: null })); setShRows(null)
    try { const rows = await sh.fetchItemsHealth(); shopeeHealthCache.rows = rows; setShRows(rows) }
    catch (e) { setErrs(x => ({ ...x, shopee: e.message })); setShRows([]) }
  }, [sh.fetchItemsHealth]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mlHealthCache.rows === null) scanMl()
    if (shopeeHealthCache.rows === null) scanSh()
    fetchAll(() => supabase.from('marketplace_stock').select('platform, item_id, sku')).then(rows => {
      const m = {}
      rows.forEach(r => { if (r.sku) (m[`${r.platform}|${r.item_id}`] ||= new Set()).add(String(r.sku).trim().toUpperCase()) })
      setSkus(m)
    }).catch(() => setSkus({}))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Linhas normalizadas das duas plataformas
  const all = useMemo(() => {
    const out = []
    for (const r of mlRows || []) out.push({
      platform: 'ml', item_id: r.item_id, title: r.title, thumb: r.thumbnail, status: stOf(r.status), error: r.error,
      issues: [...(r.pending || []).map(p => p.title || p.name || p.key).filter(Boolean), ...(r.missing_count ? [`Ficha técnica: ${r.missing_count} campo(s) faltando`] : [])],
      missing: (r.missing || []).map(m => m.name), full: !!r.shipping?.is_full,
    })
    for (const r of shRows || []) out.push({
      platform: 'shopee', item_id: String(r.item_id), title: r.title, thumb: r.thumbnail, status: stOf(r.status), quality: r.quality_level,
      issues: (r.pending || []).map(p => p.suggestion).filter(Boolean), missing: [],
    })
    // Gêmeos pelo SKU (mesmo produto na outra plataforma)
    const bySku = {}
    out.forEach(r => (skus?.[`${r.platform}|${r.item_id}`] || []).forEach(s => (bySku[s] ||= []).push(r)))
    out.forEach(r => {
      const tw = new Map()
      ;(skus?.[`${r.platform}|${r.item_id}`] || []).forEach(s => bySku[s].forEach(o => { if (o.platform !== r.platform) tw.set(o.item_id, o) }))
      r.twins = [...tw.values()]
      r.diverge = r.twins.some(t => Math.abs(ST[t.status].rank - ST[r.status].rank) >= 1 && t.status !== 'unknown' && r.status !== 'unknown')
    })
    return out
  }, [mlRows, shRows, skus])

  // Pendências mais comuns (texto normalizado)
  const topIssues = useMemo(() => {
    const m = {}
    all.filter(r => !plat || r.platform === plat).forEach(r => r.issues.forEach(t => {
      const k = norm(t.replace(/\d+ campo\(s\)/, 'N campos'))
      m[k] ||= { text: t.replace(/\d+ campo\(s\)/, 'campos'), n: 0, plats: new Set() }
      m[k].n++; m[k].plats.add(r.platform)
    }))
    return Object.entries(m).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.n - a.n).slice(0, 8)
  }, [all, plat])

  const rows = useMemo(() => {
    const q = norm(search)
    return all
      .filter(r => !plat || r.platform === plat)
      .filter(r => status === 'all' || (status === 'problem' ? r.status === 'unhealthy' || r.status === 'warning' : r.status === status))
      .filter(r => cross === 'all' || r.diverge)
      .filter(r => !issue || r.issues.some(t => norm(t.replace(/\d+ campo\(s\)/, 'N campos')) === issue))
      .filter(r => !q || norm(r.title).includes(q) || String(r.item_id).includes(q))
      .sort((a, b) => ST[a.status].rank - ST[b.status].rank || b.issues.length - a.issues.length)
  }, [all, plat, status, cross, issue, search])

  useEffect(() => { setPage(0) }, [plat, status, cross, issue, search])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const counts = { ml: all.filter(r => r.platform === 'ml').length, shopee: all.filter(r => r.platform === 'shopee').length }
  const scanning = { ml: mlRows === null, shopee: shRows === null }
  const prog = ml.progress

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFE600] to-[#EE4D2D] flex items-center justify-center shrink-0 shadow-sm"><HeartPulse size={20} className="text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Saúde dos anúncios</h1>
            <p className="text-sm text-slate-500">O diagnóstico do ML e da Shopee na mesma régua — o que está perdendo exposição e o que falta arrumar</p>
          </div>
        </div>
        <button onClick={() => { scanMl(); scanSh() }} disabled={scanning.ml || scanning.shopee}
          className="flex items-center gap-2 px-4 h-10 text-sm font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {scanning.ml || scanning.shopee ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Analisar de novo
        </button>
      </div>

      {/* Panorama por plataforma */}
      <div className="grid md:grid-cols-2 gap-4">
        {PLATFORMS.map(p => {
          const list = all.filter(r => r.platform === p)
          const c = Object.fromEntries(Object.keys(ST).map(k => [k, list.filter(r => r.status === k).length]))
          const tot = list.length
          return (
            <div key={p} className={`card !p-5 ${plat && plat !== p ? 'opacity-50' : ''}`} style={{ boxShadow: `inset 0 4px 0 ${PLAT[p].color}` }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-slate-700 flex items-center gap-2"><PlatBadge p={p} />{PLAT[p].label}</p>
                <span className="text-xs text-slate-400">{scanning[p] ? (p === 'ml' && prog ? `analisando ${prog.done}/${prog.total}…` : 'analisando…') : `${fmtN(tot)} anúncios`}</span>
              </div>
              {errs[p] ? <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">Não deu pra analisar: {errs[p]}</p>
                : scanning[p] ? <div className="h-3 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-slate-300 animate-pulse transition-all" style={{ width: p === 'ml' && prog?.total ? `${(prog.done / prog.total) * 100}%` : '40%' }} /></div>
                : <>
                  <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                    {['unhealthy', 'warning', 'healthy', 'unknown'].map(k => c[k] > 0 && <div key={k} style={{ width: `${(c[k] / tot) * 100}%`, background: ST[k].solid }} title={`${c[k]} ${ST[k].label}`} />)}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {['unhealthy', 'warning', 'healthy'].map(k => (
                      <button key={k} onClick={() => { setPlat(p); setStatus(k) }} className="text-left rounded-xl px-3 py-2 hover:bg-slate-50 border border-transparent hover:border-slate-200">
                        <p className="text-xl font-black tabular-nums" style={{ color: ST[k].solid }}>{fmtN(c[k])}</p>
                        <p className="text-[11px] text-slate-500">{ST[k].label}</p>
                      </button>
                    ))}
                  </div>
                </>}
            </div>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <div className="card !p-0">
            <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-slate-100">
              <PlatformFilter value={plat} onChange={setPlat} counts={counts} />
              <Segmented value={status} onChange={setStatus} options={[['problem', 'Com problema'], ['unhealthy', 'Perdendo exposição'], ['warning', 'Atenção'], ['healthy', 'Saudáveis'], ['all', 'Todos']]} />
            </div>
            <div className="flex items-center gap-2 flex-wrap px-4 py-3">
              <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 h-9 flex-1 min-w-[200px] max-w-sm bg-white focus-within:border-slate-400">
                <Search size={14} className="text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome ou código do anúncio…" className="bg-transparent outline-none text-sm w-full placeholder:text-slate-400" />
                {search && <button onClick={() => setSearch('')} className="text-slate-400"><X size={13} /></button>}
              </div>
              <Segmented value={cross} onChange={setCross} options={[['all', 'Todos'], ['diverge', 'Diferente na outra plataforma']]} />
            </div>
            {issue && (
              <div className="px-4 pb-3 -mt-1">
                <button onClick={() => setIssue('')} className="text-[11px] font-semibold bg-slate-800 text-white rounded-full pl-2.5 pr-1.5 py-1 inline-flex items-center gap-1">Pendência: {topIssues.find(t => t.key === issue)?.text || 'selecionada'} <X size={11} /></button>
              </div>
            )}
          </div>

          <div className="card !p-0 overflow-hidden">
            {(scanning.ml && scanning.shopee) ? <div className="py-20 text-center"><Loader2 size={22} className="mx-auto animate-spin text-slate-300" /></div>
              : !rows.length ? <p className="text-sm text-slate-400 text-center py-14">{status === 'problem' ? 'Nenhum anúncio com problema nesses filtros 🎉' : 'Nenhum anúncio com esses filtros.'}</p>
              : rows.slice(cur * PAGE, cur * PAGE + PAGE).map(r => (
                <div key={`${r.platform}${r.item_id}`} className="flex gap-3 px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/60" style={{ boxShadow: `inset 4px 0 0 ${PLAT[r.platform].color}` }}>
                  {r.thumb ? <img src={r.thumb} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-12 h-12 rounded-lg bg-slate-100 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PlatBadge p={r.platform} />
                      <StatusBadge s={r.status} />
                      {r.quality != null && <span className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-px rounded-full">Qualidade: {r.quality}</span>}
                      {r.full && <span className="text-[10px] font-bold text-[#2D3277]">Full</span>}
                      {r.error && <span className="text-[10px] text-slate-400">falha ao consultar</span>}
                    </div>
                    <Link to={detailUrl(r)} className="block text-[13px] font-medium text-slate-800 hover:underline underline-offset-2 mt-1 leading-snug">{r.title || r.item_id}</Link>
                    {r.issues.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {r.issues.slice(0, 4).map((t, i) => <span key={i} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">{t}</span>)}
                        {r.issues.length > 4 && <span className="text-[11px] text-slate-400 self-center">+{r.issues.length - 4}</span>}
                      </div>
                    )}
                    {r.missing.length > 0 && <p className="text-[11px] text-slate-400 mt-1 truncate" title={r.missing.join(', ')}>Faltando na ficha: {r.missing.slice(0, 6).join(', ')}{r.missing.length > 6 ? '…' : ''}</p>}
                  </div>
                  <div className="w-52 shrink-0 hidden md:flex flex-col items-end justify-center gap-1 text-right">
                    {r.twins.length ? r.twins.slice(0, 2).map(t => (
                      <Link key={t.item_id} to={detailUrl(t)} className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-800" title={t.title}>
                        <span>na {PLAT[t.platform].short}:</span><StatusBadge s={t.status} small />
                      </Link>
                    )) : <span className="text-[11px] text-slate-300">sem par na outra plataforma</span>}
                    <Link to={detailUrl(r)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-0.5 mt-0.5">arrumar <ArrowRight size={11} /></Link>
                  </div>
                </div>
              ))}
            {rows.length > PAGE && (
              <div className="flex items-center justify-between px-5 py-3 text-xs text-slate-500 border-t border-slate-100">
                <span>{cur * PAGE + 1}–{Math.min(rows.length, (cur + 1) * PAGE)} de {rows.length}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(cur - 1)} disabled={cur === 0} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30"><ChevronLeft size={14} /></button>
                  <span className="px-2">página {cur + 1} de {pages}</span>
                  <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30"><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card !p-5 lg:sticky lg:top-4">
          <p className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1"><ListChecks size={15} className="text-slate-400" />Pendências mais comuns</p>
          <p className="text-[11px] text-slate-400 mb-3">Clique pra ver só os anúncios com aquela pendência — arrumar em lote rende mais.</p>
          {!topIssues.length ? <p className="text-xs text-slate-400 py-4 text-center">{scanning.ml || scanning.shopee ? 'Analisando…' : 'Nenhuma pendência 🎉'}</p>
            : topIssues.map(t => (
              <button key={t.key} onClick={() => setIssue(issue === t.key ? '' : t.key)} className={`w-full text-left flex items-start gap-2 px-2.5 py-2 rounded-lg mb-1 ${issue === t.key ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}>
                <span className="flex gap-0.5 mt-1 shrink-0">{[...t.plats].map(p => <span key={p} className="w-2 h-2 rounded-sm" style={{ background: PLAT[p].color }} />)}</span>
                <span className={`text-[12px] flex-1 leading-snug ${issue === t.key ? '' : 'text-slate-600'}`}>{t.text}</span>
                <span className={`text-[12px] font-black tabular-nums ${issue === t.key ? '' : 'text-slate-800'}`}>{t.n}</span>
              </button>
            ))}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
        <span>"Perdendo exposição / Atenção / Saudável" é a nota que cada plataforma dá (ML: desempenho do anúncio; Shopee: diagnóstico de conteúdo). O par na outra plataforma é achado pelo SKU. A análise fica guardada enquanto a aba estiver aberta — "Analisar de novo" refaz.</span>
      </p>
    </div>
  )
}
