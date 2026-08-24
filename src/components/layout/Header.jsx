import { useAuth } from '../../contexts/AuthContext'
import { NotificationBell } from '../notifications/NotificationBell'

const ROLE_LABELS = {
  admin:          'Diretor',
  administrativo: 'Administrativo',
  atendimento:    'Atendimento',
  producao:       'Produção',
}

export function Header({ title }) {
  const { user } = useAuth()

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'CP'

  return (
    <header
      className="bg-white border-b border-slate-100 flex items-center justify-between px-6 z-10 shrink-0"
      style={{ height: '56px', minHeight: '56px' }}
    >
      {/* Título — trunca se muito longo */}
      <h1
        className="font-bold text-lg text-slate-800 truncate mr-4"
        style={{ fontFamily: 'Nunito, sans-serif' }}
      >
        {title}
      </h1>

      {/* Direita — não encolhe */}
      <div className="flex items-center gap-3 shrink-0">
        <NotificationBell />

        <div className="w-px h-6 bg-slate-100" />

        <div className="flex items-center gap-2.5">
          <div className="text-right hidden md:block">
            <p className="text-xs font-semibold text-slate-700 leading-tight truncate max-w-[120px]"
               style={{ fontFamily: 'Nunito, sans-serif' }}>
              {user?.name ?? '...'}
            </p>
            <p className="text-[10px] text-slate-400">
              {ROLE_LABELS[user?.role] ?? user?.role ?? ''}
            </p>
          </div>
          <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
            <span className="text-rose-500 text-xs font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {initials}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
