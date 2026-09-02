import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, RefreshCw, Loader2, AlertTriangle, ExternalLink, Flame, Eye, CheckCircle2, ImageOff } from 'lucide-react'
import { useMlInsights } from './hooks/useMlInsights'

// A API do ML às vezes devolve o thumbnail em http:// puro — o site roda
// em https, então isso vira mixed content bloqueado pelo navegador.
function secureThumb(url) {
  return url ? url.replace(/^http:\/\//, 'https://') : null
}

const PERIODS = [
  { key: 7,  label: '7D'  },
  { key: 15, label: '15D' },
  { key: 30, label: '30D' },
]

function bucketOf(r) {
  if (r.visits >= 10 && (r.conversion ?? 1) < 0.01) return 'high_low_conv'
  if (r.visits < 10) return 'low_traffic'
  return 'ok'
}

// Classes escritas por extenso (não construídas via template string) —
// o Tailwind não gera CSS pra classe montada dinamicamente tipo
// `text-${color}-600`, precisa aparecer literal no código.
const BUCKETS = [
  {
    key: 'high_low_conv', label: 'Alto tráfego, baixa conversão', icon: AlertTriangle,
    text: 'text-rose-600', solid: 'bg-rose-500', badgeText: 'text-rose-700', badgeBg: 'bg-rose-50', badgeBorder: 'border-rose-200',
    ring: 'border-rose-400 ring-1 ring-rose-200',
  },
  {
    key: 'low_traffic', label: 'Baixo tráfego', icon: Eye,
    text: 'text-amber-600', solid: 'bg-amber-500', badgeText: 'text-amber-700', badgeBg: 'bg-amber-50', badgeBorder: 'border-amber-200',
    ring: 'border-amber-400 ring-1 ring-amber-200',
  },
  {
    key: 'ok', label: 'Sem problema aparente', icon: CheckCircle2,
    text: 'text-emerald-600', solid: 'bg-emerald-500', badgeText: 'text-emerald-700', badgeBg: 'bg-emerald-50', badgeBorder: 'border-emerald-200',
    ring: 'border-emerald-400 ring-1 ring-emerald-200',
  },
]

export function MlTrafficPage() {
  const navigate = useNavigate()
  const { loading, progress, error, fetchTrafficAudit } = useMlInsights()
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState(null) // null = nunca escaneado ainda
  const [filter, setFilter] = useState('all') // 'all' | 'high_low_conv' | 'low_traffic' | 'ok'

  const scan = useCallback(async () => {
    const data = await fetchTrafficAudit(days)
    setRows(data)
  }, [fetchTrafficAudit, days])

  useEffect(() => { scan() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- só ao entrar; trocar período exige clicar "Analisar" de novo (é a mesma varredura pesada de sempre)

  const counts = useMemo(() => {
    if (!rows) return null
    const c = { high_low_conv: 0, low_traffic: 0, ok: 0 }
    rows.forEach(r => { c[bucketOf(r)]++ })
    return c
  }, [rows])

  const displayRows = useMemo(() => {
    if (!rows) return []
    const filtered = filter === 'all' ? rows : rows.filter(r => bucketOf(r) === filter)
    return [...filtered].sort((a, b) => (b.visits || 0) - (a.visits || 0))
  }, [rows, filter])

  const trendingByCategory = useMemo(() => {
    if (!rows) return []
    const map = new Map()
    const itemsByCategory = new Map()
    rows.forEach(r => {
      if (!r.category_id) return
      const catMap = map.get(r.category_id) || new Map()
      ;(r.trending_missing || []).forEach(k => catMap.set(k, (catMap.get(k) || 0) + 1))
      map.set(r.category_id, catMap)
      const items = itemsByCategory.get(r.category_id) || []
      if (r.title) items.push(r.title)
      itemsByCategory.set(r.category_id, items)
    })
    const categoryNames = rows.category_names || {}
    return [...map.entries()]
      .map(([category_id, kwMap]) => ({
        category_id,
        category_name: categoryNames[category_id] || category_id,
        example_items: (itemsByCategory.get(category_id) || []).slice(0, 3),
        item_count: (itemsByCategory.get(category_id) || []).length,
        keywords: [...kwMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      }))
      .filter(c => c.keywords.length > 0)
  }, [rows])

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200">
              <TrendingUp size={22} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Tráfego & Conversão</h1>
              <p className="text-sm text-slate-500">Quanta gente vê cada anúncio, não só quantos compram — e palavras-chave em alta que faltam no título</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setDays(p.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${days === p.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={scan} disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors shadow-sm">
              {loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
              {loading ? (progress ? `Analisando ${progress.done}/${progress.total}...` : 'Analisando...') : 'Analisar'}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {rows === null && !loading && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <TrendingUp size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
            <p className="text-slate-500 mb-1">Nenhuma análise ainda</p>
            <p className="text-sm text-slate-400">Clique em "Analisar" pra cruzar visitas da API com vendas reais do sistema.</p>
          </div>
        )}

        {counts && (
          <>
            {/* Resumo em 3 baldes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {BUCKETS.map(b => {
                const Icon = b.icon
                const active = filter === b.key
                return (
                  <button key={b.key} onClick={() => setFilter(f => f === b.key ? 'all' : b.key)}
                    className={`flex items-center gap-3.5 bg-white border rounded-2xl p-4 text-left transition-all ${active ? b.ring : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className={`w-10 h-10 rounded-xl ${b.solid} flex items-center justify-center shrink-0`}>
                      <Icon size={18} strokeWidth={2} className="text-white"/>
                    </div>
                    <div className="min-w-0">
                      <p className={`text-2xl font-bold leading-none ${b.text}`}>{counts[b.key]}</p>
                      <p className="text-xs text-slate-500 mt-1">{b.label}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
              {/* Lista — coluna principal */}
              <div className="xl:col-span-2 space-y-3">
                {filter !== 'all' && (
                  <button onClick={() => setFilter('all')} className="text-xs text-slate-500 hover:text-slate-700 underline">
                    Filtrando por "{BUCKETS.find(b => b.key === filter)?.label}" — limpar filtro
                  </button>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {displayRows.map(r => {
                    const bucket = bucketOf(r)
                    const bucketInfo = BUCKETS.find(b => b.key === bucket)
                    const thumb = secureThumb(r.thumbnail)
                    return (
                      <div key={r.item_id} onClick={() => navigate(`/ml/saude/${r.item_id}`)}
                        className={`group flex gap-3.5 bg-white border rounded-2xl p-4 cursor-pointer hover:shadow-md hover:shadow-slate-100 transition-all ${bucket === 'high_low_conv' ? 'border-rose-100 hover:border-rose-300' : 'border-slate-200 hover:border-emerald-300'}`}>
                        <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy"/> : <ImageOff size={16} className="text-slate-300"/>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-1.5 ${bucketInfo.badgeText} ${bucketInfo.badgeBg} ${bucketInfo.badgeBorder}`}>
                            {r.visits} visitas · {r.sales} vendas · {r.visits > 0 ? `${((r.conversion ?? 0) * 100).toFixed(1)}%` : '—'} conv.
                          </span>
                          <a href={r.permalink || `https://produto.mercadolivre.com.br/${r.item_id}`} target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-sm font-medium text-slate-800 group-hover:text-emerald-600 flex items-start gap-1.5">
                            <span className="line-clamp-2">{r.title || r.item_id}</span>
                            <ExternalLink size={12} className="text-slate-300 mt-0.5 shrink-0"/>
                          </a>
                          {r.trending_missing?.length > 0 && (
                            <span className="inline-block text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mt-1.5">
                              {r.trending_missing.length} palavra-chave em alta ausente
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tendências por categoria — coluna lateral */}
              <div className="space-y-4">
                {trendingByCategory.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Flame size={15} className="text-amber-500"/>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Em alta, ausentes por categoria</p>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">Quanto mais anúncios sem o termo, maior a oportunidade de revisar em massa.</p>
                    <div className="space-y-4">
                      {trendingByCategory.map(c => (
                        <div key={c.category_id}>
                          <p className="text-xs text-slate-600 mb-0.5">
                            <span className="font-semibold">{c.category_name}</span>
                            <span className="text-slate-400"> · {c.item_count} anúncio{c.item_count === 1 ? '' : 's'}</span>
                          </p>
                          {c.example_items.length > 0 && (
                            <p className="text-xs text-slate-400 mb-1.5 truncate">Ex: {c.example_items.join(' · ')}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {c.keywords.map(([kw, count]) => (
                              <span key={kw} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                {kw} <span className="text-amber-400">· {count}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
