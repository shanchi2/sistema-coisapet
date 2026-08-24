import { supabase } from '../../lib/supabase'

export const fmtTime  = d => !d ? '—' : new Date(d).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
export const fmtDate  = d => !d ? '—' : new Date(d+'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })
export const fmtDT    = d => !d ? '—' : new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
export const fmtH     = h => { if (!h && h !== 0) return '—'; const f=parseFloat(h); const hrs=Math.floor(f); const m=Math.round((f-hrs)*60); return `${hrs}h${m>0?`${String(m).padStart(2,'0')}m`:''}` }

export function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

export async function viewStorageFile(path) {
  const { data } = await supabase.storage.from('employee-docs').createSignedUrl(path, 3600)
  if (data) window.open(data.signedUrl, '_blank')
}

export function Avatar({ name, size = 'md' }) {
  const initials = name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'
  const sz = size === 'lg' ? 'w-11 h-11 text-sm' : size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'
  return (
    <div className={`${sz} rounded-full bg-rose-100 flex items-center justify-center shrink-0 font-black text-rose-500`}>
      {initials}
    </div>
  )
}

export function Badge({ children, variant = 'default' }) {
  const variants = {
    default:   'bg-slate-100 text-slate-600 border-slate-200',
    pendente:  'bg-amber-50 text-amber-700 border-amber-200',
    aprovado:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejeitado: 'bg-rose-50 text-rose-600 border-rose-200',
    urgente:   'bg-rose-500 text-white border-rose-500',
    importante:'bg-amber-400 text-amber-900 border-amber-400',
  }
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${variants[variant]||variants.default}`}>
      {children}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h2 className="page-title">{title}</h2>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="card flex flex-col items-center py-16 gap-3">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
        <Icon size={24} className="text-slate-300" />
      </div>
      <div className="text-center">
        <p className="font-bold text-slate-600">{title}</p>
        {description && <p className="text-sm text-slate-400 mt-1 max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function LoadingCard() {
  return (
    <div className="card flex justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
        <p className="text-sm text-slate-400">Carregando…</p>
      </div>
    </div>
  )
}
