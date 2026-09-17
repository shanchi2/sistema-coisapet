import { AlertTriangle, Loader2 } from 'lucide-react'

// Toda escrita no Mercado Livre (ficha técnica, título, descrição, etc.)
// passa por aqui — NUNCA um clique só. Regra explícita do Raphael:
// sempre mostrar o que vai mudar e pedir confirmação de verdade (não o
// confirm() nativo do navegador, fácil de clicar sem ler) antes de
// gravar algo que fica visível pros clientes na hora.
export function ConfirmWriteModal({ open, title, description, detail, confirmLabel = 'Sim, aplicar no Mercado Livre', confirming, onConfirm, onCancel, platform = 'Mercado Livre' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-600"/>
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-800">{title}</p>
            <p className="text-sm text-slate-500 mt-1">{description}</p>
          </div>
        </div>
        {detail && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 mb-3 max-h-40 overflow-y-auto">
            {detail}
          </div>
        )}
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          Isso muda o anúncio real, visível pros seus clientes {platform === 'Mercado Livre' ? 'no' : 'na'} {platform} agora mesmo.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={confirming}
            className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50 transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={confirming}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
            {confirming && <Loader2 size={14} className="animate-spin"/>}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
