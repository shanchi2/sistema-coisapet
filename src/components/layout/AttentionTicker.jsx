import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'

// Barra de atenção no rodapé (09/10, fase103) — passa devagar o que
// precisa de atenção agora (estoque zerado, reclamações, devoluções,
// coleta do Full, pedidos atrasados…), cada item com link pra tela certa.
// Dados da Edge Function `attention-feed` (cache de 5 min). Só mostra o
// que a pessoa tem permissão de abrir. Liga/desliga por pessoa (fica
// salvo no navegador). Só contagens — nunca R$.

const DOT = { critico: 'bg-rose-500', atencao: 'bg-amber-400', info: 'bg-sky-400' }
const REFRESH_MS = 5 * 60 * 1000

export function AttentionTicker() {
  const { user } = useAuth()
  const { canAccess } = usePermissions()
  const storeKey = `coisapet_barra_atencao_${user?.id || 'anon'}`
  const [on, setOn] = useState(() => { try { return localStorage.getItem(storeKey) !== 'off' } catch { return true } })
  const [items, setItems] = useState([])

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('attention-feed', { body: {} })
      if (!error && data?.items) setItems(data.items)
    } catch { /* barra é acessória — sem dados, some */ }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  function toggle(v) {
    setOn(v)
    try { localStorage.setItem(storeKey, v ? 'on' : 'off') } catch { /* sem storage */ }
  }

  const visible = items.filter(i => !i.module || canAccess(i.module))
  if (!visible.length) return null
  const critical = visible.filter(i => i.level === 'critico').length

  if (!on) {
    return (
      <button onClick={() => toggle(true)} title="Mostrar a barra de atenção"
        className="absolute bottom-3 left-4 z-30 h-7 pl-2 pr-2.5 rounded-full bg-white border border-slate-200 shadow-sm flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 hover:border-slate-400">
        <AlertTriangle size={12} className={critical ? 'text-rose-500' : 'text-amber-500'} />{visible.length}
      </button>
    )
  }

  // Velocidade constante (~45 px/s): quanto mais texto, mais tempo a volta
  const chars = visible.reduce((t, i) => t + i.text.length + 6, 0)
  const duration = Math.max(25, Math.round((chars * 7) / 45))
  const row = visible.map(i => (
    <span key={i.key} className="inline-flex items-center gap-2 pr-10 whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[i.level] || DOT.info}`} />
      {i.to
        ? <Link to={i.to} className="text-slate-600 hover:text-slate-900 hover:underline underline-offset-2">{i.text}</Link>
        : <span className="text-slate-600">{i.text}</span>}
    </span>
  ))

  return (
    <div className="attention-ticker shrink-0 h-8 flex items-center bg-white border-t border-slate-200 text-xs md:pr-20" role="region" aria-label="Itens que precisam de atenção">
      <span className={`shrink-0 h-full px-3 flex items-center gap-1.5 font-bold border-r border-slate-100 ${critical ? 'text-rose-600' : 'text-amber-600'}`}>
        <AlertTriangle size={13} /> Atenção <span className="font-semibold text-slate-400">{visible.length}</span>
      </span>
      <div className="attention-ticker-viewport flex-1 min-w-0 overflow-hidden h-full flex items-center"
        style={{ maskImage: 'linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent)' }}>
        <div className="attention-ticker-track flex w-max pl-4" style={{ '--ticker-duration': `${duration}s` }}>
          <div className="flex">{row}</div>
          <div className="flex" aria-hidden="true">{row}</div>
        </div>
      </div>
      <button onClick={() => toggle(false)} title="Ocultar a barra (dá pra ligar de novo no botão do canto)"
        className="shrink-0 h-full px-3 text-slate-300 hover:text-slate-600 border-l border-slate-100">
        <EyeOff size={13} />
      </button>
    </div>
  )
}
