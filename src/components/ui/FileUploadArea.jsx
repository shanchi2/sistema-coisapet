import { useRef, useState } from 'react'
import { Upload, FileText, Image, X, Paperclip } from 'lucide-react'

const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE  = 10 * 1024 * 1024 // 10 MB

function FileIcon({ type, size = 16 }) {
  if (type === 'application/pdf')
    return <FileText size={size} className="text-rose-400 shrink-0" />
  return <Image size={size} className="text-sky-400 shrink-0" />
}

/**
 * FileUploadArea — área de drag & drop para upload de arquivo único.
 *
 * Props:
 *   file       → arquivo atual (File | null)
 *   onChange   → (File | null) => void
 *   label      → texto da label (opcional)
 *   hint       → texto de dica abaixo (opcional)
 *   compact    → se true, versão menor (para linhas de parcelamento)
 */
export function FileUploadArea({ file, onChange, label, hint, compact = false }) {
  const [dragOver, setDragOver] = useState(false)
  const [error,    setError]    = useState('')
  const inputRef = useRef()

  function handleFile(f) {
    if (!f) return
    if (!ACCEPTED.includes(f.type)) {
      setError('Formato inválido. Use PDF, JPG ou PNG.')
      return
    }
    if (f.size > MAX_SIZE) {
      setError('Arquivo muito grande. Máximo 10 MB.')
      return
    }
    setError('')
    onChange(f)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  // ── Versão compacta (para linhas de parcelamento) ────────────
  if (compact) {
    return (
      <div>
        {file ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs">
            <FileIcon type={file.type} size={14} />
            <span className="truncate flex-1 text-slate-600 max-w-[120px]">{file.name}</span>
            <button type="button" onClick={() => onChange(null)}
              className="text-slate-400 hover:text-rose-500 shrink-0 transition-colors">
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-200
                       hover:border-rose-300 hover:bg-rose-50 text-slate-400 hover:text-rose-500
                       text-xs transition-all w-full justify-center"
          >
            <Paperclip size={13} />
            <span>Anexar boleto</span>
          </button>
        )}
        <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden" onChange={e => handleFile(e.target.files[0])} />
        {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
      </div>
    )
  }

  // ── Versão normal ─────────────────────────────────────────────
  return (
    <div>
      {label && <label className="form-label">{label}</label>}

      {file ? (
        /* Arquivo selecionado */
        <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
          <FileIcon type={file.type} size={20} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700 truncate">{file.name}</p>
            <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all shrink-0"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        /* Área de drop */
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-xl p-4 flex items-center gap-3
                      cursor-pointer transition-all
                      ${dragOver
                        ? 'border-rose-400 bg-rose-50'
                        : 'border-slate-200 hover:border-rose-300 hover:bg-rose-50/50'
                      }`}
        >
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <Upload size={16} className="text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600">
              Clique ou arraste o arquivo
            </p>
            <p className="text-xs text-slate-400">
              {hint ?? 'PDF, JPG ou PNG — máx. 10 MB'}
            </p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={e => handleFile(e.target.files[0])}
      />
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  )
}
