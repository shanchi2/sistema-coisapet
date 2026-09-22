import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeartPulse, RefreshCw, Loader2, AlertTriangle, CheckCircle2, AlertCircle, HelpCircle, ExternalLink, ImageOff, Search, X } from 'lucide-react'

import { useShopeeInsights } from './hooks/useShopeeInsights'
import { shopeeHealthCache } from './healthPageCache'

const SHOPEE_ORANGE = '#EE4D2D'

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

export function ShopeeHealthPage() {
  const navigate = useNavigate()
  const { loading, error, fetchItemsHealth } = useShopeeInsights()
  // Estado inicial vem do cache em memória — só null de verdade na 1ª
  // visita da sessão (ou depois de F5). Ver healthPageCache.js.
  const [rows, setRows] = useState(shopeeHealthCache.rows)
  const [search, setSearchState] = useState(shopeeHealthCache.search)

  function setSearch(v) { shopeeHealthCache.search = v; setSearchState(v) }

  const scan = useCallback(async () => {
    const health = await fetchItemsHealth()
    const sorted = [...health].sort((a, b) => {
      const ra = (STATUS_INFO[a.status] ?? UNKNOWN_STATUS).rank
      const rb = (STATUS_INFO[b.status] ?? UNKNOWN_STATUS).rank
      if (ra !== rb) return ra - rb
      return b.pending_count - a.pending_count
    })
    shopeeHealthCache.rows = sorted
    setRows(sorted)
  }, [fetchItemsHealth])

  // Só escaneia sozinho se o cache ainda estiver vazio (1ª vez na
  // sessão) — "Atualizar" continua disponível pra forçar um novo scan.
  useEffect(() => { if (shopeeHealthCache.rows === null) scan() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = rows ? {
    unhealthy: rows.filter(r => r.status === 'unhealthy').length,
    warning:   rows.filter(r => r.status === 'warning').length,
    healthy:   rows.filter(r => r.status === 'healthy').length,
  } : null
  const total = rows?.length || 0

  const displayRows = useMemo(() => {
    if (!rows) return []
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(r => r.title?.toLowerCase().includes(term) || r.item_id?.toString().includes(term))
  }, [rows, search])

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: `linear-gradient(135deg, ${SHOPEE_ORANGE}, #D6431F)`, boxShadow: `0 2px 10px ${SHOPEE_ORANGE}40` }}>
              <HeartPulse size={22} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Saúde dos Anúncios</h1>
              <p className="text-sm text-slate-500">Diagnóstico de conteúdo direto da API da Shopee, anúncio por anúncio</p>
            </div>
          </div>
          <button onClick={scan} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors shadow-sm"
            style={{ background: SHOPEE_ORANGE }}>
            {loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
            {loading ? 'Analisando...' : 'Atualizar'}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {/* Panorama de saúde */}
        {counts && total > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Panorama do catálogo</p>
              <p className="text-xs text-slate-400">{total} anúncio{total > 1 ? 's' : ''} ativo{total > 1 ? 's' : ''} analisado{total > 1 ? 's' : ''}</p>
            </div>

            <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100 mb-5">
              {counts.unhealthy > 0 && <div className={STATUS_INFO.unhealthy.solid} style={{ width: `${(counts.unhealthy / total) * 100}%` }} title={`${counts.unhealthy} perdendo exposição`}/>}
              {counts.warning > 0   && <div className={STATUS_INFO.warning.solid}   style={{ width: `${(counts.warning   / total) * 100}%` }} title={`${counts.warning} em atenção`}/>}
              {counts.healthy > 0   && <div className={STATUS_INFO.healthy.solid}   style={{ width: `${(counts.healthy   / total) * 100}%` }} title={`${counts.healthy} saudáveis`}/>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            </div>
          </div>
        )}

        {/* Busca */}
        {rows !== null && rows.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por título ou ID..."
                className="w-full text-sm bg-white border border-slate-200 rounded-xl pl-9 pr-8 py-2 focus:outline-none"
                style={{ borderColor: search ? SHOPEE_ORANGE : undefined }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  <X size={14}/>
                </button>
              )}
            </div>
            <span className="text-xs text-slate-400 ml-auto">{displayRows.length} de {rows.length} anúncio{rows.length > 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Lista */}
        {rows === null ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <HeartPulse size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
            <p className="text-slate-500 mb-1">Nenhum diagnóstico ainda</p>
            <p className="text-sm text-slate-400">Clique em "Atualizar" pra buscar o status real de cada anúncio ativo direto na API da Shopee.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <CheckCircle2 size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
            <p className="text-slate-400">Nenhum anúncio ativo encontrado</p>
          </div>
        ) : displayRows.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <Search size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
            <p className="text-slate-400">Nenhum anúncio bate com essa busca</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {displayRows.map(r => {
              const statusInfo = STATUS_INFO[r.status] ?? UNKNOWN_STATUS
              return (
              <div key={r.item_id} onClick={() => navigate(`/shopee/item/${r.item_id}`)}
                className="group flex gap-4 bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md hover:shadow-slate-100 transition-all cursor-pointer">

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
                    <StatusBadge status={r.status}/>
                    {r.quality_level != null && (
                      <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                        Qualidade: {r.quality_level}
                      </span>
                    )}
                  </div>

                  <a href={r.permalink} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    className="text-sm font-medium text-slate-800 hover:text-orange-600 inline-flex items-start gap-1.5">
                    <span className="line-clamp-2">{r.title || r.item_id}</span>
                    <ExternalLink size={12} className="text-slate-300 mt-0.5 shrink-0"/>
                  </a>

                  <p className="text-xs font-mono text-slate-400 mt-1.5">{r.item_id}</p>

                  {r.pending_count > 0 && (
                    <div className="flex flex-col gap-1 mt-2.5">
                      {r.pending.map((p, i) => (
                        <span key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg w-fit">
                          {p.suggestion}
                        </span>
                      ))}
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
