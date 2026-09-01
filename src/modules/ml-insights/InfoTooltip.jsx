import { useEffect, useRef, useState } from 'react'

// "?" clicável — explicação em linguagem simples pra quem não é da área
// técnica. Clique pra abrir/fechar (sem depender de hover, funciona em
// celular também). Fecha também clicando em qualquer lugar fora dele.
export function InfoTooltip({ text, source }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  if (!text) return null
  const sourceLabel = source === 'ia' ? 'Explicação gerada por IA — confira se tiver dúvida real.'
    : source === 'nosso' ? 'Explicação da nossa equipe, não é texto oficial do Mercado Livre.'
    : null
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 text-[10px] font-bold flex items-center justify-center transition-colors">
        ?
      </button>
      {open && (
        <span className="absolute left-1/2 -translate-x-1/2 top-6 z-20 w-60 bg-slate-800 text-white text-xs leading-relaxed rounded-lg px-3 py-2.5 shadow-lg space-y-1.5">
          <span className="block">{text}</span>
          {sourceLabel && <span className="block text-slate-400 italic">{sourceLabel}</span>}
        </span>
      )}
    </span>
  )
}
