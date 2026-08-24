import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Modal({ open, onClose, title, subtitle, children, size = 'md', footer }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else      document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const maxWidths = {
    sm:       'max-w-sm',
    md:       'max-w-lg',
    lg:       'max-w-2xl',
    xl:       'max-w-3xl',
    wide:     'max-w-6xl',
    '2xl':    'max-w-5xl',
    comments: 'max-w-6xl',   // ← extra largo para layout 2 colunas
    task:     'max-w-[min(3120px,96vw)]', // ← modal de tarefa do Kanban (5 colunas), 2x mais largo — capado em 96vw pra não estourar em telas menores
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div
        className={`relative w-full ${maxWidths[size] ?? 'max-w-3xl'} bg-white rounded-2xl shadow-modal
                    flex flex-col max-h-[90vh] animate-fade-in`}
        style={{ border: '1px solid #F1F5F9' }}
      >
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div>
            <h2
              className="text-slate-800 leading-tight"
              style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: '18px' }}
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600
                       transition-all ml-4 shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
        {footer && (
          <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}