import { useState } from 'react'
import { Upload, Loader2, FileText, AlertTriangle, CheckSquare, Square } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../../../components/ui/Modal'
import { parseWordPressExport } from '../wpImport'

const STATUS_LABEL = { publish: 'Publicado', draft: 'Rascunho', pending: 'Pendente', private: 'Privado', future: 'Agendado' }

export function WpImportModal({ open, onClose, existingSlugs, onDone }) {
  const [posts, setPosts] = useState(null)
  const [skippedOther, setSkippedOther] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  function reset() {
    setPosts(null); setSkippedOther(0); setProgress({ done: 0, total: 0 })
  }

  function handleClose() {
    if (importing) return
    reset()
    onClose()
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    try {
      const text = await file.text()
      const { posts: parsed, skippedOther: skipped } = parseWordPressExport(text)
      if (!parsed.length) {
        toast.error('Nenhum post encontrado nesse arquivo.')
      } else {
        // Desmarca por padrão quem já existe (mesmo slug) — evita
        // reimportar sem querer; dá pra marcar na mão se for o caso.
        setPosts(parsed.map(p => ({ ...p, selected: !existingSlugs.has(p.slug) })))
        setSkippedOther(skipped)
      }
    } catch (err) {
      toast.error(err.message || 'Erro ao ler o arquivo.')
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

  function toggle(wpId) {
    setPosts(prev => prev.map(p => p.wpId === wpId ? { ...p, selected: !p.selected } : p))
  }

  function toggleAll(value) {
    setPosts(prev => prev.map(p => ({ ...p, selected: value })))
  }

  const selectedCount = posts?.filter(p => p.selected).length ?? 0

  async function handleImport() {
    const toImport = posts.filter(p => p.selected).map(({ wpId, wpStatus, selected, ...row }) => row)
    if (!toImport.length) return toast.error('Selecione pelo menos 1 post.')

    setImporting(true)
    setProgress({ done: 0, total: toImport.length })
    try {
      const result = await onDone(toImport, (done, total) => setProgress({ done, total }))
      const parts = [`${result.imported} importado(s)`]
      if (result.skipped) parts.push(`${result.skipped} pulado(s) por slug duplicado`)
      if (result.failed) parts.push(`${result.failed} com erro`)
      toast.success(parts.join(', ') + '.')
      reset()
      onClose()
    } catch (err) {
      toast.error('Erro na importação: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} size="xl"
      title="Importar do WordPress"
      subtitle="Ferramentas → Exportar → Posts, no admin do WordPress — gera um arquivo .xml">
      {!posts ? (
        <label className="flex flex-col items-center justify-center gap-2 h-40 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
          {parsing
            ? <><Loader2 size={22} className="animate-spin text-slate-400" /><span className="text-sm text-slate-400">Lendo arquivo...</span></>
            : <><Upload size={22} className="text-slate-400" /><span className="text-sm text-slate-500">Escolher arquivo de exportação (.xml)</span></>}
          <input type="file" accept=".xml" className="hidden" onChange={handleFile} disabled={parsing} />
        </label>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">
              <strong className="text-slate-700">{posts.length}</strong> post(s) encontrado(s)
              {skippedOther > 0 && <> · {skippedOther} outro(s) item(ns) ignorado(s) (páginas, mídia, lixeira etc.)</>}
            </p>
            <div className="flex gap-2">
              <button onClick={() => toggleAll(true)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Marcar todos</button>
              <span className="text-slate-300">·</span>
              <button onClick={() => toggleAll(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Desmarcar todos</button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[45vh] overflow-y-auto">
            {posts.map(p => {
              const conflict = existingSlugs.has(p.slug)
              return (
                <button key={p.wpId} type="button" onClick={() => toggle(p.wpId)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-0 text-left hover:bg-slate-50 transition-colors">
                  {p.selected ? <CheckSquare size={16} className="text-indigo-500 shrink-0" /> : <Square size={16} className="text-slate-300 shrink-0" />}
                  <FileText size={14} className="text-slate-300 shrink-0" />
                  <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{p.title}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${p.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {STATUS_LABEL[p.wpStatus] || p.wpStatus}
                  </span>
                  {conflict && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 shrink-0" title="Já existe um post com esse slug no sistema">
                      <AlertTriangle size={12} /> slug existente
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-slate-400">
              {importing ? `Importando ${progress.done}/${progress.total}...` : `${selectedCount} selecionado(s)`}
            </span>
            <div className="flex gap-2">
              <button onClick={reset} disabled={importing} className="btn-secondary text-sm">Escolher outro arquivo</button>
              <button onClick={handleImport} disabled={importing || !selectedCount}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
                {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Importar {selectedCount > 0 && `(${selectedCount})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
