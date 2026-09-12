import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Layers, Plus, X, Loader2, CheckCircle2, XCircle, Sparkles, Pencil, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useBlogPosts } from './hooks/useBlogPosts'

function emptyRow() { return { keyword: '', context: '' } }

export function BlogBulkGeneratePage() {
  const navigate = useNavigate()
  const { bulkGenerate } = useBlogPosts()

  const [rows, setRows]       = useState([emptyRow()])
  const [phase, setPhase]     = useState('input') // input | generating | done
  const [items, setItems]     = useState([])       // snapshot do que foi enviado (pra permitir retry)
  const [statuses, setStatuses] = useState([])      // 1 por item: pending | generating | done | error
  const [results, setResults] = useState([])        // resultado final, mesma ordem de items

  function updateRow(i, field, value) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  function addRow() { setRows(prev => [...prev, emptyRow()]) }
  function removeRow(i) { setRows(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)) }

  const validRows = rows.filter(r => r.keyword.trim())

  async function handleStart() {
    if (!validRows.length) return toast.error('Adicione pelo menos uma palavra-chave.')
    const toSend = validRows.map(r => ({ keyword: r.keyword.trim(), context: r.context.trim() }))
    setItems(toSend)
    setStatuses(toSend.map(() => 'pending'))
    setPhase('generating')

    const res = await bulkGenerate(toSend, (done, total, info) => {
      setStatuses(prev => prev.map((s, i) => {
        if (info?.phase === 'generating' && i === done) return 'generating'
        if (info?.phase === 'done' && i === done - 1) return info.ok ? 'done' : 'error'
        return s
      }))
    })
    setResults(res)
    setPhase('done')
  }

  async function retryOne(index) {
    const item = items[index]
    setStatuses(prev => prev.map((s, i) => i === index ? 'generating' : s))
    const [res] = await bulkGenerate([item], () => {})
    setResults(prev => prev.map((r, i) => i === index ? res : r))
    setStatuses(prev => prev.map((s, i) => i === index ? (res.ok ? 'done' : 'error') : s))
  }

  function reset() {
    setRows([emptyRow()]); setPhase('input'); setItems([]); setStatuses([]); setResults([])
  }

  const createdCount = results.filter(r => r.ok).length
  const failedCount  = results.filter(r => !r.ok).length
  const stillWorking = statuses.some(s => s === 'pending' || s === 'generating')

  return (
    <div className="p-6 max-w-3xl mx-auto pb-16">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button onClick={() => navigate('/blog')}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> Voltar pro Blog
        </button>
      </div>

      <div className="flex items-center gap-3.5 mb-6">
        <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-indigo-200">
          <Layers size={20} strokeWidth={1.8} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Geração em massa</h1>
          <p className="text-sm text-slate-500">Uma palavra-chave + mini-contexto por linha — a IA gera cada post como rascunho, pronto pra você revisar.</p>
        </div>
      </div>

      {phase === 'input' && (
        <div className="flex flex-col gap-4">
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-700">
            Cada post sai com ~800 palavras, seguindo as mesmas regras do gerador único (sem "introdução"/"conclusão"/"em suma", sem encher linguiça, informação responsável). Tudo entra como <strong>rascunho</strong> — nada é publicado ou agendado sozinho.
          </div>

          <div className="flex flex-col gap-3">
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2 items-start bg-white border border-slate-200 rounded-2xl p-4">
                <span className="text-xs font-black text-slate-300 w-5 pt-2.5 shrink-0">{i + 1}</span>
                <div className="flex-1 flex flex-col gap-2">
                  <input className="input" placeholder="Palavra-chave foco (ex: terrário para hamster)"
                    value={row.keyword} onChange={e => updateRow(i, 'keyword', e.target.value)} />
                  <textarea className="input min-h-[60px] resize-none" placeholder="Mini-contexto / direcionamento (opcional) — ex: focar em espécies pequenas, tom mais técnico..."
                    value={row.context} onChange={e => updateRow(i, 'context', e.target.value)} />
                </div>
                <button onClick={() => removeRow(i)} disabled={rows.length === 1}
                  className="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 shrink-0"
                  title="Remover linha">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>

          <button onClick={addRow}
            className="flex items-center justify-center gap-1.5 py-3 border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 text-slate-400 hover:text-indigo-500 text-sm font-medium rounded-2xl transition-colors">
            <Plus size={16} /> Adicionar outro conteúdo
          </button>

          <div className="flex justify-end mt-2">
            <button onClick={handleStart} disabled={!validRows.length}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm disabled:opacity-50">
              <Sparkles size={15} /> Gerar {validRows.length > 0 && `(${validRows.length})`}
            </button>
          </div>
        </div>
      )}

      {(phase === 'generating' || phase === 'done') && (
        <div className="flex flex-col gap-4">
          {phase === 'done' && (
            <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${failedCount ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              {createdCount} post(s) criado(s) como rascunho{failedCount > 0 ? ` · ${failedCount} falharam` : ''}.
            </div>
          )}

          <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
            {items.map((item, i) => {
              const st = statuses[i]
              const result = results[i]
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  {st === 'generating' && <Loader2 size={16} className="animate-spin text-indigo-400 shrink-0" />}
                  {st === 'pending'    && <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />}
                  {st === 'done'       && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
                  {st === 'error'      && <XCircle size={16} className="text-rose-500 shrink-0" />}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">
                      {st === 'done' && result?.title ? result.title : item.keyword}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {st === 'generating' && 'Gerando com IA...'}
                      {st === 'pending' && 'Aguardando...'}
                      {st === 'done' && `🔑 ${item.keyword}`}
                      {st === 'error' && (result?.error || 'Erro ao gerar.')}
                    </p>
                  </div>

                  {st === 'done' && result?.id && (
                    <button onClick={() => navigate(`/blog/${result.id}`)}
                      className="flex items-center gap-1 text-xs font-semibold text-indigo-500 hover:text-indigo-700 shrink-0">
                      <Pencil size={12} /> Editar
                    </button>
                  )}
                  {st === 'error' && (
                    <button onClick={() => retryOne(i)}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 shrink-0">
                      <RefreshCw size={12} /> Tentar de novo
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {phase === 'done' && !stillWorking && (
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={reset} className="btn-secondary text-sm">Gerar outro lote</button>
              <button onClick={() => navigate('/blog')}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-colors">
                Ver posts no Blog
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
