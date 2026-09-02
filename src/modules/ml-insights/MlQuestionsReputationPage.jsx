import { useEffect, useState, useCallback } from 'react'
import { MessageCircleQuestion, RefreshCw, Loader2, AlertTriangle, ExternalLink, ThermometerSun, TrendingUp } from 'lucide-react'
import { useMlInsights } from './hooks/useMlInsights'
import { ReputationThermometer } from './ReputationThermometer'

function hoursLabel(h) {
  if (h == null) return '—'
  if (h < 24) return `${h}h em aberto`
  return `${Math.floor(h / 24)}d em aberto`
}

function CancellationCard({ reputation }) {
  const rep = reputation?.seller_reputation
  const rate = rep?.metrics?.cancellations?.rate
  const pct = rate != null ? (rate * 100) : null
  // Threshold documentado: termômetro fica verde com taxa < 3% (< 2% pra
  // Mercado Líder) — alerta preventivo a partir de 80% desse limite.
  const isMercadoLider = !!rep?.power_seller_status
  const threshold = isMercadoLider ? 2 : 3
  const nearLimit = pct != null && pct >= threshold * 0.8

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <ThermometerSun size={16} className="text-slate-400"/>
        <h2 className="text-sm font-semibold text-slate-800">Reputação do vendedor</h2>
      </div>
      {!reputation ? (
        <p className="text-sm text-slate-400">Clique em "Atualizar" pra buscar o termômetro atual.</p>
      ) : (
        <div className="space-y-3">
          <ReputationThermometer levelId={rep?.level_id} size="sm"/>
          {isMercadoLider && (
            <span className="inline-block text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full">
              Mercado Líder
            </span>
          )}
          <div>
            <div className="flex items-baseline gap-2">
              <p className={`text-2xl font-bold ${nearLimit ? 'text-rose-600' : 'text-slate-800'}`}>
                {pct != null ? `${pct.toFixed(1)}%` : '—'}
              </p>
              <p className="text-xs text-slate-400">taxa de cancelamento (limite: {threshold}%)</p>
            </div>
            {nearLimit && (
              <p className="text-xs font-medium text-rose-600 mt-1.5 flex items-center gap-1.5">
                <AlertTriangle size={12}/> Perto do limite — isso afeta o ranking de todos os anúncios ao mesmo tempo.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ResponseTimeCard({ responseTime }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={16} className="text-slate-400"/>
        <h2 className="text-sm font-semibold text-slate-800">Impacto de responder rápido</h2>
      </div>
      {!responseTime ? (
        <p className="text-sm text-slate-400">Clique em "Atualizar" pra ver a projeção da própria API do ML.</p>
      ) : (
        <div>
          <p className="text-2xl font-bold text-sky-600">
            {responseTime.sales_percent_increase != null ? `+${responseTime.sales_percent_increase}%` : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-1">aumento de vendas projetado respondendo perguntas em menos de 1h (últimos 14 dias)</p>
        </div>
      )}
    </div>
  )
}

export function MlQuestionsReputationPage() {
  const { loading, error, fetchQuestions, fetchResponseTime, fetchReputation } = useMlInsights()
  const [questions,    setQuestions]    = useState(null)
  const [responseTime, setResponseTime] = useState(null)
  const [reputation,   setReputation]   = useState(null)

  const scan = useCallback(async () => {
    const [q, rt, rep] = await Promise.all([fetchQuestions(), fetchResponseTime(), fetchReputation()])
    setQuestions(q)
    setResponseTime(rt)
    setReputation(rep)
  }, [fetchQuestions, fetchResponseTime, fetchReputation])

  useEffect(() => { scan() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- só ao entrar na tela, "Atualizar" cobre refresh manual

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200">
              <MessageCircleQuestion size={22} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Perguntas & Reputação</h1>
              <p className="text-sm text-slate-500">Perguntas sem resposta e saúde da conta no Mercado Livre</p>
            </div>
          </div>
          <button onClick={scan} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors shadow-sm">
            {loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
            {loading ? 'Buscando...' : 'Atualizar'}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">

          {/* Perguntas sem resposta — coluna principal */}
          <div className="xl:col-span-2">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">
              Perguntas sem resposta {questions ? `(${questions.length})` : ''}
            </h2>
            {questions === null ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <MessageCircleQuestion size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
                <p className="text-slate-500 mb-1">Nenhuma busca ainda</p>
                <p className="text-sm text-slate-400">Clique em "Atualizar" pra puxar as perguntas pendentes direto do ML.</p>
              </div>
            ) : questions.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400">Nenhuma pergunta sem resposta 🎉</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {questions.map(q => (
                  <div key={q.id} className={`bg-white border rounded-2xl p-4 ${q.hours_open > 24 ? 'border-rose-200' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 leading-relaxed mb-1.5">{q.text}</p>
                        <a href={q.permalink || `https://produto.mercadolivre.com.br/${q.item_id}`} target="_blank" rel="noreferrer"
                          className="text-xs text-slate-500 hover:text-emerald-600 inline-flex items-center gap-1">
                          {q.item_title || q.item_id}
                          <ExternalLink size={10} className="text-slate-300"/>
                        </a>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${q.hours_open > 24 ? 'text-rose-700 bg-rose-50 border border-rose-200' : 'text-slate-600 bg-slate-100'}`}>
                        {hoursLabel(q.hours_open)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saúde da conta — coluna lateral */}
          <div className="space-y-4">
            <ResponseTimeCard responseTime={responseTime}/>
            <CancellationCard reputation={reputation}/>
          </div>
        </div>
      </div>
    </div>
  )
}
