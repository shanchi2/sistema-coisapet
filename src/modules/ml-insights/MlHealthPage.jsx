import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeartPulse, RefreshCw, Loader2, AlertTriangle, CheckCircle2, AlertCircle, HelpCircle, ExternalLink, DollarSign, Megaphone, Truck, Package } from 'lucide-react'
import { useMlInsights } from './hooks/useMlInsights'

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
  unhealthy: { label: 'Perdendo exposição', rank: 0, icon: AlertTriangle, text: 'text-rose-700',   bg: 'bg-rose-50 border-rose-200'   },
  warning:   { label: 'Atenção',            rank: 1, icon: AlertCircle,   text: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  healthy:   { label: 'Saudável',           rank: 2, icon: CheckCircle2, text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
}
const UNKNOWN_STATUS = { label: 'Não informado', rank: 3, icon: HelpCircle, text: 'text-slate-500', bg: 'bg-slate-50 border-slate-200' }

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
  const [rows, setRows] = useState(null) // null = nunca escaneado ainda
  const [priceMap, setPriceMap] = useState(null) // item_id -> { price, suggested_price, price_to_win_status } | null
  const [adsSet, setAdsSet] = useState(null) // Set(item_id) com campanha ativa | null = nunca verificado
  const [shippingFilter, setShippingFilter] = useState('all')

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
        permalink:     a?.permalink ?? null,
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
    setRows(merged)
  }, [fetchItemsHealth, fetchAttributesAudit])

  useEffect(() => { scan() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- só ao entrar na tela, "Atualizar" cobre refresh manual

  const scanPrice = useCallback(async () => {
    const data = await fetchPriceScan()
    setPriceMap(new Map(data.map(d => [d.item_id, d])))
  }, [fetchPriceScan])

  const scanAds = useCallback(async () => {
    const data = await fetchAdsCoverage()
    setAdsSet(new Set(data.item_ids || []))
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
    const filtered = rows.filter(r => matchesShippingFilter(r.shipping, shippingFilter))
    if (!adsSet) return filtered
    return [...filtered].sort((a, b) => (adsSet.has(b.item_id) ? 1 : 0) - (adsSet.has(a.item_id) ? 1 : 0))
  }, [rows, adsSet, shippingFilter])

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0">
              <HeartPulse size={20} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Saúde dos Anúncios</h1>
              <p className="text-sm text-slate-500">Diagnóstico da API do ML + ficha técnica obrigatória, anúncio por anúncio</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={scan} disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors">
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
          <p className="text-xs text-slate-500">
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

        {/* Stats */}
        {counts && (
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border border-rose-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-rose-600">{counts.unhealthy}</p>
              <p className="text-xs text-slate-500 mt-0.5">Perdendo exposição</p>
            </div>
            <div className="bg-white border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{counts.warning}</p>
              <p className="text-xs text-slate-500 mt-0.5">Em atenção</p>
            </div>
            <div className="bg-white border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{counts.healthy}</p>
              <p className="text-xs text-slate-500 mt-0.5">Saudáveis</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{counts.missing}</p>
              <p className="text-xs text-slate-500 mt-0.5">Com ficha incompleta</p>
            </div>
          </div>
        )}

        {/* Filtro de frete/Full */}
        {rows !== null && rows.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
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
            <span className="text-xs text-slate-400">{displayRows.length} de {rows.length} anúncio{rows.length > 1 ? 's' : ''}</span>
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
            <p className="text-slate-400">Nenhum anúncio bate com esse filtro de frete</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayRows.map(r => {
              const price = priceMap?.get(r.item_id)
              const hasAds = adsSet?.has(r.item_id)
              return (
              <div key={r.item_id} onClick={() => navigate(`/ml/saude/${r.item_id}`)}
                className={`bg-white border rounded-xl p-5 cursor-pointer hover:border-emerald-300 hover:shadow-sm transition-all ${hasAds ? 'border-violet-200' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap mb-2">
                      {hasAds && (
                        <span className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <Megaphone size={11}/> Campanha ativa
                        </span>
                      )}
                      <StatusBadge status={r.status}/>
                      {r.shipping?.is_full && (
                        <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <Package size={11}/> Full
                        </span>
                      )}
                      {r.shipping?.free_shipping && !r.shipping?.is_full && (
                        <span className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <Truck size={11}/> Frete grátis
                        </span>
                      )}
                      {r.missing_count > 0 && (
                        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                          {r.missing_count} atributo{r.missing_count > 1 ? 's' : ''} obrigatório{r.missing_count > 1 ? 's' : ''} faltando
                        </span>
                      )}
                      {price?.price_to_win_status === 'competing' && (
                        <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
                          Perdendo buy box
                        </span>
                      )}
                      {price?.suggested_price != null && (
                        <span className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full">
                          Sugerido: {fmtMoney(price.suggested_price)}
                        </span>
                      )}
                      {r.error && (
                        <span className="text-xs font-semibold text-slate-400">falha ao consultar</span>
                      )}
                    </div>
                    <a href={r.permalink || `https://produto.mercadolivre.com.br/${r.item_id}`} target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-sm font-medium text-slate-800 hover:text-emerald-600 inline-flex items-center gap-1.5">
                      {r.title || r.item_id}
                      <ExternalLink size={12} className="text-slate-300"/>
                    </a>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">{r.item_id}</p>

                    {r.missing.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {r.missing.map(m => (
                          <span key={m.id} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
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
