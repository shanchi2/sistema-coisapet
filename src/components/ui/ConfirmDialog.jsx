import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'

/**
 * ConfirmDialog — diálogo de confirmação para ações destrutivas.
 *
 * Props:
 *   open        → boolean
 *   onClose     → função de cancelar
 *   onConfirm   → função de confirmar
 *   title       → ex: "Excluir matéria-prima"
 *   description → ex: "Esta ação não pode ser desfeita."
 *   loading     → boolean: desabilita botões durante operação
 *   danger      → boolean: botão vermelho (padrão true)
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Tem certeza?',
  description = 'Esta ação não pode ser desfeita.',
  confirmLabel = 'Confirmar',
  loading = false,
  danger = true,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title=" "
      footer={
        <>
          <button onClick={onClose} disabled={loading} className="btn-secondary">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl 
                        font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-50
                        ${danger
                          ? 'bg-rose-500 hover:bg-rose-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-900 text-white'
                        }`}
            style={{ fontFamily: 'Nunito, sans-serif' }}
          >
            {loading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : confirmLabel
            }
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center text-center py-2">
        <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-rose-400" />
        </div>
        <h3
          className="text-slate-800 mb-2"
          style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: '17px' }}
        >
          {title}
        </h3>
        <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
      </div>
    </Modal>
  )
}
