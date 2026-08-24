import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Star, MessageSquare, Check, X, Trash2, Send,
  ChevronDown, ChevronRight, Search, Filter,
  Loader2, RefreshCw, Eye, EyeOff,
} from 'lucide-react'
import toast from 'react-hot-toast'

function Stars({ rating, size = 14 }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24">
          <polygon
            points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
            fill={i <= rating ? '#C4956A' : 'none'}
            stroke="#C4956A"
            strokeWidth="1.5"
          />
        </svg>
      ))}
    </div>
  )
}

function StatusBadge({ approved }) {
  return approved
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><Check size={10} strokeWidth={2.5}/> Aprovado</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"><Eye size={10} strokeWidth={2}/> Aguardando</span>
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

// ── Aba Avaliações ────────────────────────────────────────────
function ReviewsTab() {
  const [reviews,  setReviews]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('pending') // pending | approved | all
  const [search,   setSearch]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('product_reviews')
      .select('*, product:products(id, name, sku)')
      .order('created_at', { ascending: false })
    if (filter === 'pending')  q = q.eq('approved', false)
    if (filter === 'approved') q = q.eq('approved', true)
    const { data } = await q
    setReviews(data || [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const filtered = reviews.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.author_name?.toLowerCase().includes(q) ||
           r.comment?.toLowerCase().includes(q) ||
           r.product?.name?.toLowerCase().includes(q)
  })

  async function approve(id) {
    await supabase.from('product_reviews').update({ approved: true }).eq('id', id)
    toast.success('Avaliação aprovada!')
    load()
  }

  async function reject(id) {
    if (!confirm('Remover esta avaliação?')) return
    await supabase.from('product_reviews').delete().eq('id', id)
    toast.success('Avaliação removida.')
    load()
  }

  const pending  = reviews.filter(r => !r.approved).length
  const approved = reviews.filter(r => r.approved).length

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Aguardando',  value: pending,              color: 'text-amber-600'   },
          { label: 'Aprovadas',   value: approved,             color: 'text-emerald-600' },
          { label: 'Total',       value: reviews.length || 0,  color: 'text-slate-800'   },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, comentário ou produto..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"/>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {[
            { key: 'pending',  label: 'Pendentes' },
            { key: 'approved', label: 'Aprovadas' },
            { key: 'all',      label: 'Todas'     },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filter === f.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12 bg-white rounded-xl border border-slate-200">
          <Loader2 size={24} className="animate-spin text-slate-400"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <Star size={32} strokeWidth={1} className="mx-auto mb-2 text-slate-200"/>
          <p className="text-slate-400">Nenhuma avaliação encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className={`bg-white border rounded-xl p-5 ${!r.approved ? 'border-amber-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-sm font-bold text-amber-700 shrink-0">
                      {r.author_name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{r.author_name}</p>
                      <p className="text-xs text-slate-400">{r.author_email} · {fmtDate(r.created_at)}</p>
                    </div>
                    <Stars rating={r.rating}/>
                    <StatusBadge approved={r.approved}/>
                  </div>
                  {r.product && (
                    <p className="text-xs text-slate-400 mb-2">
                      Produto: <span className="font-semibold text-slate-600">{r.product.name}</span>
                      {r.product.sku && <span className="font-mono ml-1 text-slate-400">({r.product.sku})</span>}
                    </p>
                  )}
                  <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg px-3 py-2.5">
                    "{r.comment}"
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!r.approved && (
                    <button onClick={() => approve(r.id)}
                      className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
                      title="Aprovar">
                      <Check size={15} strokeWidth={2}/>
                    </button>
                  )}
                  <button onClick={() => reject(r.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    title="Remover">
                    <Trash2 size={15} strokeWidth={1.5}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Aba Perguntas ─────────────────────────────────────────────
function QuestionsTab() {
  const [questions, setQuestions] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('pending')
  const [search,    setSearch]    = useState('')
  const [answering, setAnswering] = useState(null) // id da pergunta sendo respondida
  const [answer,    setAnswer]    = useState('')
  const [saving,    setSaving]    = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('product_questions')
      .select('*, product:products(id, name, sku)')
      .order('created_at', { ascending: false })
    if (filter === 'pending')    q = q.eq('approved', false)
    if (filter === 'approved')   q = q.eq('approved', true)
    if (filter === 'unanswered') q = q.eq('approved', true).is('answer', null)
    const { data } = await q
    setQuestions(data || [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const filtered = questions.filter(q => {
    if (!search) return true
    const s = search.toLowerCase()
    return q.author_name?.toLowerCase().includes(s) ||
           q.question?.toLowerCase().includes(s) ||
           q.product?.name?.toLowerCase().includes(s)
  })

  async function approve(id) {
    await supabase.from('product_questions').update({ approved: true }).eq('id', id)
    toast.success('Pergunta aprovada!')
    load()
  }

  async function remove(id) {
    if (!confirm('Remover esta pergunta?')) return
    await supabase.from('product_questions').delete().eq('id', id)
    toast.success('Pergunta removida.')
    load()
  }

  async function saveAnswer(id) {
    if (!answer.trim()) { toast.error('Escreva uma resposta'); return }
    setSaving(true)
    await supabase.from('product_questions').update({
      answer: answer.trim(),
      answered_by: 'Clô',
      answered_at: new Date().toISOString(),
      approved: true, // resposta aprovada automaticamente publica a pergunta
    }).eq('id', id)
    setSaving(false)
    setAnswering(null)
    setAnswer('')
    toast.success('Resposta publicada!')
    load()
  }

  const pending    = questions.filter(q => !q.approved).length
  const unanswered = questions.filter(q => q.approved && !q.answer).length

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Aguardando',   value: pending,    color: 'text-amber-600'   },
          { label: 'Sem resposta', value: unanswered, color: 'text-rose-600'    },
          { label: 'Total',        value: questions.length, color: 'text-slate-800' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, pergunta ou produto..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"/>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {[
            { key: 'pending',    label: 'Pendentes'    },
            { key: 'unanswered', label: 'Sem resposta' },
            { key: 'approved',   label: 'Aprovadas'    },
            { key: 'all',        label: 'Todas'        },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filter === f.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12 bg-white rounded-xl border border-slate-200">
          <Loader2 size={24} className="animate-spin text-slate-400"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <MessageSquare size={32} strokeWidth={1} className="mx-auto mb-2 text-slate-200"/>
          <p className="text-slate-400">Nenhuma pergunta encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(q => (
            <div key={q.id} className={`bg-white border rounded-xl p-5 ${!q.approved ? 'border-amber-200' : !q.answer ? 'border-rose-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-sm font-bold text-rose-700 shrink-0">
                      {q.author_name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{q.author_name}</p>
                      <p className="text-xs text-slate-400">{q.author_email} · {fmtDate(q.created_at)}</p>
                    </div>
                    <StatusBadge approved={q.approved}/>
                    {q.approved && !q.answer && (
                      <span className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">Sem resposta</span>
                    )}
                    {q.answer && (
                      <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Respondida</span>
                    )}
                  </div>
                  {q.product && (
                    <p className="text-xs text-slate-400 mb-2">
                      Produto: <span className="font-semibold text-slate-600">{q.product.name}</span>
                    </p>
                  )}
                  {/* Pergunta */}
                  <div className="flex gap-2 items-start mb-3">
                    <span className="text-amber-500 text-base shrink-0">?</span>
                    <p className="text-sm font-medium text-slate-800 leading-relaxed">{q.question}</p>
                  </div>
                  {/* Resposta existente */}
                  {q.answer && (
                    <div className="flex gap-2 items-start bg-emerald-50 rounded-lg px-3 py-2.5 mb-3">
                      <span className="text-xs font-bold text-white bg-emerald-600 px-2 py-0.5 rounded-full shrink-0">Clô</span>
                      <p className="text-sm text-slate-700 leading-relaxed">{q.answer}</p>
                    </div>
                  )}
                  {/* Área de resposta */}
                  {answering === q.id ? (
                    <div className="space-y-2">
                      <textarea
                        autoFocus
                        value={answer}
                        onChange={e => setAnswer(e.target.value)}
                        placeholder="Digite a resposta da Clô aqui..."
                        rows={3}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 resize-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveAnswer(q.id)} disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                          {saving ? <Loader2 size={13} className="animate-spin"/> : <Send size={13}/>}
                          Publicar resposta
                        </button>
                        <button onClick={() => { setAnswering(null); setAnswer('') }}
                          className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setAnswering(q.id); setAnswer(q.answer || '') }}
                      className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
                      <MessageSquare size={13}/>
                      {q.answer ? 'Editar resposta' : 'Responder'}
                    </button>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {!q.approved && (
                    <button onClick={() => approve(q.id)}
                      className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
                      title="Aprovar">
                      <Check size={15} strokeWidth={2}/>
                    </button>
                  )}
                  <button onClick={() => remove(q.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    title="Remover">
                    <Trash2 size={15} strokeWidth={1.5}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export function ReviewsPage() {
  const [tab, setTab] = useState('reviews')

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
            <Star size={20} strokeWidth={1.5} className="text-white"/>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Avaliações & Perguntas</h1>
            <p className="text-sm text-slate-500">Modere avaliações e responda dúvidas dos clientes</p>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {[
            { key: 'reviews',   label: 'Avaliações',  icon: Star           },
            { key: 'questions', label: 'Perguntas',   icon: MessageSquare  },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <t.icon size={15} strokeWidth={1.5}/>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'reviews'   && <ReviewsTab/>}
        {tab === 'questions' && <QuestionsTab/>}
      </div>
    </div>
  )
}
