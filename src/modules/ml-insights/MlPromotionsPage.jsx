import { useState } from 'react'
import { Tag, Loader2, AlertTriangle, ExternalLink, ChevronDown, Zap, Gift } from 'lucide-react'
import { useMlInsights } from './hooks/useMlInsights'

export function MlPromotionsPage() {
  const { loading, progress, error, fetchPromotionsOverview, fetchTrafficAudit } = useMlInsights()
  const [overview, setOverview] = useState(null) // null = nunca verificado
  const [showRaw, setShowRaw] = useState(false)
  const [candidates, setCandidates] = useState(null) // null = nunca buscado

  async function checkOverview() {
    try {
      const res = await fetchPromotionsOverview()
      setOverview(res)
    } catch { /* erro já fica em `error` do hook */ }
  }

  async function findCandidates() {
    try {
      const data = await fetchTrafficAudit(30)
      // "estoque parado" = tem estoque disponível mas vendeu pouco/nada
      // nos últimos 30 dias — quanto maior o estoque parado sem venda,
      // mais faz sentido pra desovar via campanha relâmpago.
      const ranked = data
        .filter(d => (d.available_quantity ?? 0) > 0)
        .map(d => ({ ...d, stagnant_score: (d.available_quantity ?? 0) / (d.sales + 1) }))
        .sort((a, b) => b.stagnant_score - a.stagnant_score)
        .slice(0, 20)
      setCandidates(ranked)
    } catch { /* erro já fica em `error` do hook */ }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0">
            <Tag size={20} strokeWidth={1.5} className="text-white"/>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Promoções</h1>
            <p className="text-sm text-slate-500">Convites de oferta, candidatos e produtos parados — só diagnóstico, nada é criado/aceito automaticamente</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {/* Convites e candidatos */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
            <div className="flex items-center gap-2">
              <Gift size={15} className="text-slate-400"/>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Convites e candidatos pendentes</p>
            </div>
            <button onClick={checkOverview} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
              {loading ? <Loader2 size={13} className="animate-spin"/> : <Gift size={13}/>}
              Verificar
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-3">Oferta do Dia é por convite do ML — aqui só mostramos o que já existe, não dá pra "entrar" numa oferta pela API.</p>

          {overview === null ? (
            <p className="text-sm text-slate-400">Clique em "Verificar" pra checar — endpoint novo, ainda não testado ao vivo, pode precisar de ajuste.</p>
          ) : !overview.available ? (
            <p className="text-sm text-rose-600">{overview.error || 'Não foi possível verificar.'}</p>
          ) : overview.total === 0 ? (
            <p className="text-sm text-slate-400">Nenhum convite ou candidato pendente agora.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {Object.entries(overview.by_type).map(([type, count]) => (
                  <span key={type} className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    {type}: {count}
                  </span>
                ))}
              </div>
              <div className="space-y-2">
                {overview.results.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2">
                    <a href={c.permalink || `https://produto.mercadolivre.com.br/${c.item_id}`} target="_blank" rel="noreferrer"
                      className="text-sm text-slate-700 hover:text-emerald-600 inline-flex items-center gap-1.5">
                      {c.item_id}<ExternalLink size={11} className="text-slate-300"/>
                    </a>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{c.type}</span>
                      <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-full">{c.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {overview?.raw_sample && (
            <>
              <button onClick={() => setShowRaw(s => !s)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mt-3">
                <ChevronDown size={12} className={showRaw ? 'rotate-180' : ''}/> ver dados brutos (amostra)
              </button>
              {showRaw && <pre className="text-[10px] bg-slate-900 text-slate-200 rounded-lg p-3 mt-2 overflow-x-auto">{JSON.stringify(overview.raw_sample, null, 2)}</pre>}
            </>
          )}
        </div>

        {/* Candidatos a relâmpago */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-slate-400"/>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Candidatos a campanha relâmpago</p>
            </div>
            <button onClick={findCandidates} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
              {loading ? <Loader2 size={13} className="animate-spin"/> : <Zap size={13}/>}
              {loading ? (progress ? `Analisando ${progress.done}/${progress.total}...` : 'Analisando...') : 'Buscar candidatos'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-3">Produtos com bastante estoque disponível e pouca venda nos últimos 30 dias — os que mais fazem sentido pra desovar.</p>

          {candidates === null ? (
            <p className="text-sm text-slate-400">Clique em "Buscar candidatos" — mesma varredura de Tráfego & Conversão, pode demorar um pouco.</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum candidato claro encontrado.</p>
          ) : (
            <div className="space-y-2">
              {candidates.map(c => (
                <div key={c.item_id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
                  <a href={c.permalink || `https://produto.mercadolivre.com.br/${c.item_id}`} target="_blank" rel="noreferrer"
                    className="text-sm text-slate-700 hover:text-emerald-600 inline-flex items-center gap-1.5 min-w-0 truncate">
                    {c.title || c.item_id}<ExternalLink size={11} className="text-slate-300 shrink-0"/>
                  </a>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-800">{c.available_quantity} em estoque</p>
                    <p className="text-xs text-slate-400">{c.sales} vendidos em 30d</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
