import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeartPulse, RefreshCw, Loader2, AlertTriangle, CheckCircle2, AlertCircle, HelpCircle, ExternalLink, DollarSign, Megaphone, Truck, Package, ImageOff, Search, X } from 'lucide-react'
import { useMlInsights } from './hooks/useMlInsights'
import { mlHealthCache } from './healthPageCache'

// A API do ML às vezes devolve o thumbnail em http:// puro — o site roda
// em https, então isso vira mixed content bloqueado pelo navegador.
function secureThumb(url) {
  return url ? url.replace(/^http:\/\//, 'https://') : null
}

const SHIPPING_FILTERS = [
  { key: 'all',        label: 'Todos' },
  { key: 'free',       label: 'Frete grátis (qualquer)' },
  { key: 'free_no_full', label: 'Frete grátis, sem Full' },
  { key: 'full',       label: 'Full' },
]
function matchesShippingFilter(shipping, filterKey) {
  if (filterKey === 'all') return true
  if (!shipping) return false
  if (filterKey === 'free') return shipping.free_shipping
  if (filterKey === 'free_no_full') return shipping.free_shipping && !shipping.is_full
  if (filterKey === 'full') return shipping.is_full
  return true
}

function fmtMoney(v) {
  if (v == null) return null
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_INFO = {
  unhealthy: { label: 'Perdendo exposição', rank: 0, icon: AlertTriangle, text: 'text-rose-700',   bg: 'bg-rose-50 border-rose-200',   solid: 'bg-rose-500'    },
  warning:   { label: 'Atenção',            rank: 1, icon: AlertCircle,   text: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200', solid: 'bg-amber-500'   },
  healthy:   { label: 'Saudável',           rank: 2, icon: CheckCircle2, text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', solid: 'bg-emerald-500' },
}
const UNKNOWN_STATUS = { label: 'Não informado', rank: 3, icon: HelpCircle, text: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', solid: 'bg-slate-300' }

function StatusBadge({ status }) {
  const info = STATUS_INFO[status] ?? UNKNOWN_STATUS
  const Icon = info.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${info.text} ${info.bg}`}>
      <Icon size={12} strokeWidth={2}/>
      {info.label}
    </span>
  )
}

export function MlHealthPage() {
  const navigate = useNavigate()
  const { loading, progress, error, fetchItemsHealth, fetchAttributesAudit, fetchPriceScan, fetchAdsCoverage } = useMlInsights()
  // Estado inicial vem do cache em memória (module-level, sobrevive a
  // sair/voltar da tela) — só fica null de verdade na 1ª visita da
  // sessão (ou depois de um F5). Ver healthPageCache.js.
  const [rows, setRows] = useState(mlHealthCache.rows)
  const [priceMap, setPriceMap] = useState(mlHealthCache.priceMap)
  const [adsSet, setAdsSet] = useState(mlHealthCache.adsSet)
  const [shippingFilter, setShippingFilterState] = useState(mlHealthCache.shippingFilter)
  const [search, setSearchState] = useState(mlHealthCache.search)

  function setShippingFilter(v) { mlHealthCache.shippingFilter = v; setShippingFilterState(v) }
  function setSearch(v) { mlHealthCache.search = v; setSearchState(v) }

  const scan = useCallback(async () => {
    const [health, audit] = await Promise.all([fetchItemsHealth(), fetchAttributesAudit()])
    const auditByItem = new Map(audit.map(a => [a.item_id, a]))
    const merged = health.map(h => {
      const a = auditByItem.get(h.item_id)
      return {
        item_id:       h.item_id,
        status:        h.status,
        pending_count: h.pending_count ?? 0,
        pending:       h.pending ?? [],
        title:         a?.title ?? h.raw?.item_title ?? null,
        sku:           a?.sku ?? null,
        permalink:     a?.permalink ?? null,
        thumbnail:     secureThumb(a?.thumbnail),
        missing_count: a?.missing_count ?? 0,
        missing:       a?.missing ?? [],
        shipping:      a?.shipping ?? null,
        error:         h.error || a?.error || null,
      }
    })
    merged.sort((x, y) => {
      const rx = (STATUS_INFO[x.status] ?? UNKNOWN_STATUS).rank
      const ry = (STATUS_INFO[y.status] ?? UNKNOWN_STATUS).rank
      if (rx !== ry) return rx - ry
      return y.missing_count - x.missing_count
    })
    mlHealthCache.rows = merged
    setRows(merged)
  }, [fetchItemsHealth, fetchAttributesAudit])

  // Só escaneia sozinho se o cache ainda estiver vazio (1ª vez na
  // sessão) — voltar pra essa tela depois de já ter escaneado usa o
  // que já tem. "Atualizar" continua disponível pra forçar um novo scan.
  useEffect(() => { if (mlHealthCache.rows === null) scan() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const scanPrice = useCallback(async () => {
    const data = await fetchPriceScan()
    const map = new Map(data.map(d => [d.item_id, d]))
    mlHealthCache.priceMap = map
    setPriceMap(map)
  }, [fetchPriceScan])

  const scanAds = useCallback(async () => {
    const data = await fetchAdsCoverage()
    const set = new Set(data.item_ids || [])
    mlHealthCache.adsSet = set
    setAdsSet(set)
  }, [fetchAdsCoverage])

  const counts = rows ? {
    unhealthy: rows.filter(r => r.status === 'unhealthy').length,
    warning:   rows.filter(r => r.status === 'warning').length,
    healthy:   rows.filter(r => r.status === 'healthy').length,
    missing:   rows.filter(r => r.missing_count > 0).length,
  } : null

  // Com campanha ativa primeiro (pra achar rápido um item real pra testar
  // o card de Ads do detalhe) — dentro disso mantém a ordem por status.
  const displayRows = useMemo(() => {
    if (!rows) return []
    const term = search.trim().toLowerCase()
    let filtered = rows.filter(r => matchesShippingFilter(r.shipping, shippingFilter))
    if (term) {
      filtered = filtered.filter(r =>
        r.title?.toLowerCase().includes(term)
        || r.item_id?.toLowerCase().includes(term)
        || r.sku?.toLowerCase().includes(term)
      )
    }
    if (!adsSet) return filtered
    return [...filtered].sort((a, b) => (adsSet.has(b.item_id) ? 1 : 0) - (adsSet.has(a.item_id) ? 1 : 0))
  }, [rows, adsSet, shippingFilter, search])

  const total = rows?.length || 0

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200">
              <HeartPulse size={22} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Saúde dos Anúncios</h1>
              <p className="text-sm text-slate-500">Diagnóstico da API do ML + ficha técnica obrigatória, anúncio por anúncio</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={scan} disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors shadow-sm">
              {loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
              {loading ? (progress ? `Analisando ${progress.done}/${progress.total}...` : 'Analisando...') : 'Atualizar'}
            </button>
            <button onClick={scanPrice} disabled={loading || rows === null}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 text-sm font-medium rounded-xl disabled:opacity-50 transition-colors">
              <DollarSign size={15}/> Analisar Preço
            </button>
            <button onClick={scanAds} disabled={loading || rows === null}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 text-sm font-medium rounded-xl disabled:opacity-50 transition-colors">
              <Megaphone size={15}/> Ver quem tem Ads
            </button>
          </div>
        </div>

        {adsSet && (
          <p className="text-xs text-slate-500 -mt-3">
            {adsSet.size > 0
              ? `${adsSet.size} anúncio(s) com campanha ativa — subidos pro topo da lista, com o selo 📢.`
              : 'Nenhum anúncio com campanha ativa encontrado.'}
          </p>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {/* Panorama de saúde: barra de proporção + tiles */}
        {counts && total > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Panorama do catálogo</p>
              <p className="text-xs text-slate-400">{total} anúncio{total > 1 ? 's' : ''} ativo{total > 1 ? 's' : ''} analisado{total > 1 ? 's' : ''}</p>
            </div>

            {/* Barra de proporção — visão instantânea do catálogo inteiro */}
            <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100 mb-5">
              {counts.unhealthy > 0 && <div className={STATUS_INFO.unhealthy.solid} style={{ width: `${(counts.unhealthy / total) * 100}%` }} title={`${counts.unhealthy} perdendo exposição`}/>}
              {counts.warning > 0   && <div className={STATUS_INFO.warning.solid}   style={{ width: `${(counts.warning   / total) * 100}%` }} title={`${counts.warning} em atenção`}/>}
              {counts.healthy > 0   && <div className={STATUS_INFO.healthy.solid}   style={{ width: `${(counts.healthy   / total) * 100}%` }} title={`${counts.healthy} saudáveis`}/>}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { key: 'unhealthy', label: 'Perdendo exposição', value: counts.unhealthy, ...STATUS_INFO.unhealthy },
                { key: 'warning',   label: 'Em atenção',         value: counts.warning,   ...STATUS_INFO.warning },
                { key: 'healthy',   label: 'Saudáveis',          value: counts.healthy,   ...STATUS_INFO.healthy },
              ].map(s => {
                const Icon = s.icon
                return (
                  <div key={s.key} className={`flex items-center gap-3 rounded-xl border p-3.5 ${s.bg}`}>
                    <div className={`w-9 h-9 rounded-lg ${s.solid} flex items-center justify-center shrink-0`}>
                      <Icon size={16} strokeWidth={2} className="text-white"/>
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xl font-bold leading-none ${s.text}`}>{s.value}</p>
                      <p className="text-xs text-slate-500 mt-1 truncate">{s.label}</p>
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="w-9 h-9 rounded-lg bg-slate-400 flex items-center justify-center shrink-0">
                  <ImageOff size={16} strokeWidth={2} className="text-white"/>
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold leading-none text-slate-800">{counts.missing}</p>
                  <p className="text-xs text-slate-500 mt-1 truncate">Ficha incompleta</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Busca + filtro de frete/Full */}
        {rows !== null && rows.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por título, SKU ou ID..."
                className="w-full text-sm bg-white border border-slate-200 rounded-xl pl-9 pr-8 py-2 focus:outline-none focus:border-emerald-300"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  <X size={14}/>
                </button>
              )}
            </div>
            <span className="text-xs font-semibold text-slate-400 uppercase">Frete:</span>
            {SHIPPING_FILTERS.map(f => (
              <button key={f.key} onClick={() => setShippingFilter(f.key)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  shippingFilter === f.key
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'
                }`}>
                {f.label}
              </button>
            ))}
            <span className="text-xs text-slate-400 ml-auto">{displayRows.length} de {rows.length} anúncio{rows.length > 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Lista */}
        {rows === null ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <HeartPulse size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
            <p className="text-slate-500 mb-1">Nenhum diagnóstico ainda</p>
            <p className="text-sm text-slate-400">Clique em "Atualizar" pra buscar o status real de cada anúncio ativo direto na API do ML.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <CheckCircle2 size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
            <p className="text-slate-400">Nenhum anúncio ativo encontrado</p>
          </div>
        ) : displayRows.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <Truck size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
            <p className="text-slate-400">{search.trim() ? 'Nenhum anúncio bate com essa busca' : 'Nenhum anúncio bate com esse filtro de frete'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {displayRows.map(r => {
              const price = priceMap?.get(r.item_id)
              const hasAds = adsSet?.has(r.item_id)
              const statusInfo = STATUS_INFO[r.status] ?? UNKNOWN_STATUS
              return (
              <div key={r.item_id} onClick={() => navigate(`/ml/saude/${r.item_id}`)}
                className={`group flex gap-4 bg-white border rounded-2xl p-4 cursor-pointer hover:border-emerald-300 hover:shadow-md hover:shadow-slate-100 transition-all ${hasAds ? 'border-violet-200' : 'border-slate-200'}`}>

                {/* Barra de status + thumbnail */}
                <div className="flex items-stretch gap-3 shrink-0">
                  <div className={`w-1 rounded-full ${statusInfo.solid}`}/>
                  <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                    {r.thumbnail
                      ? <img src={r.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy"/>
                      : <ImageOff size={18} className="text-slate-300"/>}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    {hasAds && (
                      <span className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Megaphone size={10}/> Campanha
                      </span>
                    )}
                    <StatusBadge status={r.status}/>
                    {r.shipping?.is_full && (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Package size={10}/> Full
                      </span>
                    )}
                    {r.shipping?.free_shipping && !r.shipping?.is_full && (
                      <span className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Truck size={10}/> Frete grátis
                      </span>
                    )}
                    {price?.price_to_win_status === 'competing' && (
                      <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                        Perdendo buy box
                      </span>
                    )}
                  </div>

                  <a href={r.permalink || `https://produto.mercadolivre.com.br/${r.item_id}`} target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-sm font-medium text-slate-800 group-hover:text-emerald-600 inline-flex items-start gap-1.5">
                    <span className="line-clamp-2">{r.title || r.item_id}</span>
                    <ExternalLink size={12} className="text-slate-300 mt-0.5 shrink-0"/>
                  </a>

                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    <p className="text-xs font-mono text-slate-400">{r.item_id}</p>
                    {price?.suggested_price != null && (
                      <span className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                        Sugerido: {fmtMoney(price.suggested_price)}
                      </span>
                    )}
                    {r.error && <span className="text-xs font-semibold text-slate-400">falha ao consultar</span>}
                  </div>

                  {r.missing_count > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <span className="text-xs font-semibold text-slate-500">
                        {r.missing_count} faltando:
                      </span>
                      {r.missing.slice(0, 4).map(m => (
                        <span key={m.id} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          {m.name}
                        </span>
                      ))}
                      {r.missing.length > 4 && (
                        <span className="text-xs text-slate-400">+{r.missing.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
