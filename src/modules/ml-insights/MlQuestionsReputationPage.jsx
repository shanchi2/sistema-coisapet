import { useEffect, useState, useCallback } from 'react'
import { MessageCircleQuestion, RefreshCw, Loader2, AlertTriangle, ExternalLink, ThermometerSun, TrendingUp, Reply, X, Send, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
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

// Responder pergunta — sempre atrás de confirmação explícita (nunca 1
// clique só grava algo visível pro comprador). Existe porque o painel do
// próprio Mercado Livre só deixa filtrar/achar perguntas dos últimos 30
// dias (confirmado em 2026-09-07) — uma pergunta mais antiga que isso
// fica "presa" sem UI de lá pra responder, mas a API não tem esse limite.
function AnswerQuestionModal({ question, onClose, onSent }) {
  const { answerQuestion, draftAnswer } = useMlInsights()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [draftMeta, setDraftMeta] = useState(null) // { confidence, missing_data, matched_product_name } | null

  if (!question) return null

  async function handleDraft() {
    setDrafting(true)
    setDraftMeta(null)
    try {
      const res = await draftAnswer(question.id, question.text, question.item_id)
      setText(res.answer || '')
      setDraftMeta({ confidence: res.confidence, missing_data: res.missing_data, matched_product_name: res.matched_product_name })
    } catch (err) {
      toast.error('Erro ao gerar sugestão: ' + err.message)
    } finally {
      setDrafting(false)
    }
  }

  async function send() {
    if (!text.trim()) return
    setSending(true)
    try {
      await answerQuestion(question.id, text.trim())
      toast.success('Resposta enviada pro Mercado Livre!')
      onSent(question.id)
    } catch (err) {
      toast.error('Erro ao enviar: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
              <Reply size={18} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-slate-800">Responder pergunta</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{question.item_title || question.item_id}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 mb-3">
          <p className="text-sm text-slate-700">{question.text}</p>
          <p className="text-xs text-slate-400 mt-1">{hoursLabel(question.hours_open)} — pergunta de {question.date_created ? new Date(question.date_created).toLocaleDateString('pt-BR') : '—'}</p>
        </div>

        <button onClick={handleDraft} disabled={drafting}
          className="flex items-center gap-1.5 px-3 py-1.5 mb-2 border border-indigo-200 hover:bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
          {drafting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {drafting ? 'Gerando sugestão...' : 'Sugerir resposta com IA'}
        </button>

        <textarea value={text} onChange={e => setText(e.target.value)} rows={4} autoFocus
          placeholder="Digite a resposta, ou clique em 'Sugerir resposta com IA' acima..."
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-400 resize-none mb-2" />

        {draftMeta && (
          <p className={`text-xs rounded-lg px-3 py-2 mb-3 ${draftMeta.confidence === 'low' ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
            {draftMeta.confidence === 'low'
              ? <>⚠️ A IA não tem certeza — {draftMeta.missing_data || 'falta dado na ficha do produto'}. Revise antes de enviar.</>
              : <>✓ Sugestão baseada na ficha de "{draftMeta.matched_product_name || 'produto não identificado'}" — revise antes de enviar.</>}
          </p>
        )}

        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          Isso publica a resposta de verdade no Mercado Livre, visível pra qualquer comprador, agora mesmo.
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={sending}
            className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50 transition-colors">
            Cancelar
          </button>
          <button onClick={send} disabled={sending || !text.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Enviar resposta
          </button>
        </div>
      </div>
    </div>
  )
}

export function MlQuestionsReputationPage() {
  const { loading, error, fetchQuestions, fetchResponseTime, fetchReputation } = useMlInsights()
  const [questions,    setQuestions]    = useState(null)
  const [responseTime, setResponseTime] = useState(null)
  const [reputation,   setReputation]   = useState(null)
  const [answering,    setAnswering]    = useState(null) // pergunta sendo respondida no modal, ou null

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
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${q.hours_open > 24 ? 'text-rose-700 bg-rose-50 border border-rose-200' : 'text-slate-600 bg-slate-100'}`}>
                          {hoursLabel(q.hours_open)}
                        </span>
                        <button onClick={() => setAnswering(q)}
                          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors">
                          <Reply size={12}/> Responder
                        </button>
                      </div>
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

      <AnswerQuestionModal
        question={answering}
        onClose={() => setAnswering(null)}
        onSent={(questionId) => {
          setQuestions(qs => qs.filter(q => q.id !== questionId))
          setAnswering(null)
        }}
      />
    </div>
  )
}
