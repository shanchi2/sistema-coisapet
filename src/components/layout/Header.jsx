import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { NotificationBell } from '../notifications/NotificationBell'
import { SaleSoundToggle } from '../notifications/SaleSoundToggle'
import { ThemeToggle } from './ThemeToggle'

const ROLE_LABELS = {
  admin:          'Diretor',
  administrativo: 'Administrativo',
  atendimento:    'Atendimento',
  producao:       'Produção',
  marketplace:    'Marketplace',
  equipe:         'Equipe',
  escritorio:     'Escritório',
}

// 16/10 (pedido do Raphael): nome + "Sair" saíram do rodapé do menu lateral
// (liberou espaço pros módulos) e viraram este menu suspenso no avatar.
export function Header({ title }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Fecha clicando fora ou com Esc
  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'CP'
  const roleLabel = ROLE_LABELS[user?.role] ?? user?.role ?? ''

  function handleLogout() {
    setOpen(false)
    signOut()
    navigate('/login')
  }

  return (
    <header
      className="bg-white border-b border-slate-100 flex items-center justify-between px-6 z-30 shrink-0"
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
        <ThemeToggle />
        <SaleSoundToggle />
        <NotificationBell />

        <div className="w-px h-6 bg-slate-100" />

        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(o => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
            className={`flex items-center gap-2.5 rounded-xl pl-2 pr-1.5 py-1 transition-colors ${open ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
          >
            <div className="text-right hidden md:block">
              <p className="text-xs font-semibold text-slate-700 leading-tight truncate max-w-[140px]"
                 style={{ fontFamily: 'Nunito, sans-serif' }}>
                {user?.name ?? '...'}
              </p>
              <p className="text-[10px] text-slate-400">{roleLabel}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
              <span className="text-rose-500 text-xs font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {initials}
              </span>
            </div>
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div role="menu"
              className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-900/10 overflow-hidden z-50">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
                <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                  <span className="text-rose-500 text-sm font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>{initials}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate" style={{ fontFamily: 'Nunito, sans-serif' }}>{user?.name ?? '...'}</p>
                  {user?.email && <p className="text-xs text-slate-400 truncate">{user.email}</p>}
                  {roleLabel && (
                    <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">{roleLabel}</span>
                  )}
                </div>
              </div>
              <div className="p-1.5">
                <button role="menuitem" onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                  <LogOut size={15} /> Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
