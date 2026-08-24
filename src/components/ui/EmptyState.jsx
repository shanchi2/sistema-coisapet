/**
 * EmptyState — exibido quando uma listagem não tem dados ainda.
 *
 * Props:
 *   icon        → componente de ícone Lucide
 *   title       → título da mensagem
 *   description → texto explicativo
 *   action      → botão de ação (opcional)
 */
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {Icon && (
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-5">
          <Icon size={28} className="text-slate-400" />
        </div>
      )}
      <h3
        className="text-slate-700 mb-2"
        style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: '16px' }}
      >
        {title}
      </h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-xs leading-relaxed mb-5">
          {description}
        </p>
      )}
      {action && action}
    </div>
  )
}
