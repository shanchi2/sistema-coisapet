import { Construction } from 'lucide-react'

/**
 * ComingSoonPage — placeholder para módulos ainda não desenvolvidos.
 * Recebe `title` e `description` para descrever o módulo.
 */
export function ComingSoonPage({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {/* Ícone */}
      <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-5">
        <Construction size={28} className="text-amber-400" />
      </div>

      {/* Texto */}
      <h2
        className="font-display font-bold text-xl text-slate-700 mb-2"
        style={{ fontFamily: 'Nunito, sans-serif' }}
      >
        {title}
      </h2>
      <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
        {description ?? 'Este módulo está em desenvolvimento e será disponibilizado em breve.'}
      </p>

      {/* Badge */}
      <div className="mt-6 px-4 py-2 bg-amber-50 rounded-xl inline-flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
        <span className="text-xs font-semibold text-amber-600">Em desenvolvimento</span>
      </div>
    </div>
  )
}
