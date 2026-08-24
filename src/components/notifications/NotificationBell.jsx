import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Bell, Check, CheckCheck, X, ClipboardList, MessageCircle, ArrowRight, UserPlus, ExternalLink, ShoppingBag } from 'lucide-react'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

function fmtRelative(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min  = Math.floor(diff / 60000)
  if (min < 1)  return 'agora'
  if (min < 60) return `${min}min atrás`
  const h = Math.floor(min / 60)
  if (h < 24)   return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 7)    return `${d}d atrás`
  return new Date(dateStr).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })
}

const TYPE_CFG = {
  task_assigned: { icon: UserPlus,      color: 'text-violet-500', bg: 'bg-violet-50',  label: 'Atribuída a você'    },
  task_created:  { icon: ClipboardList, color: 'text-blue-500',   bg: 'bg-blue-50',    label: 'Nova tarefa'         },
  task_moved:    { icon: ArrowRight,    color: 'text-amber-500',  bg: 'bg-amber-50',   label: 'Tarefa movida'       },
  task_comment:  { icon: MessageCircle, color: 'text-emerald-500',bg: 'bg-emerald-50', label: 'Novo comentário'     },
  ml_order_synced: { icon: ShoppingBag, color: 'text-amber-600',  bg: 'bg-amber-50',   label: 'Venda no ML'         },
}

export function NotificationBell() {
  const me = getSession()
  const navigate = useNavigate()
  const [notifs,   setNotifs]   = useState([])
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [ringing,  setRinging]  = useState(false)
  const ref = useRef(null)

  // Reage ao aviso de venda nova do ML (disparado em MLSaleToast.jsx) —
  // o sino "chacoalha" alguns instantes, além do badge de não-lidas
  // normal que já vem do INSERT em `notifications` logo abaixo.
  useEffect(() => {
    function onPing() {
      setRinging(true)
      setTimeout(() => setRinging(false), 1000)
    }
    window.addEventListener('ml-sale-ping', onPing)
    return () => window.removeEventListener('ml-sale-ping', onPing)
  }, [])

  const unread = notifs.filter(n => !n.read).length

  const load = useCallback(async () => {
    if (!me?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', me.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifs(data || [])
    setLoading(false)
  }, [me?.id])

  // Carrega ao montar
  useEffect(() => { load() }, [load])

  // Realtime — escuta notificações novas para este usuário
  useEffect(() => {
    if (!me?.id) return
    const channel = supabase
      .channel(`notifications:${me.id}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${me.id}`,
      }, payload => {
        setNotifs(prev => [payload.new, ...prev])
        // Vibração sutil se suportado
        if (navigator.vibrate) navigator.vibrate(80)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [me?.id])

  // Fecha ao clicar fora
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function markRead(id) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  function openNotif(n) {
    markRead(n.id)
    if (n.link) { navigate(n.link); setOpen(false) }
  }

  async function markAllRead() {
    if (!me?.id) return
    await supabase.from('notifications').update({ read: true })
      .eq('user_id', me.id).eq('read', false)
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function deleteNotif(e, id) {
    e.stopPropagation()
    await supabase.from('notifications').delete().eq('id', id)
    setNotifs(prev => prev.filter(n => n.id !== id))
  }

  return (
    <div ref={ref} className="relative">
      {/* Botão do sino */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) load() }}
        className={`relative p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors ${ringing ? 'animate-bounce text-amber-500' : ''}`}
        aria-label="Notificações"
      >
        <Bell size={20} strokeWidth={1.5}/>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Painel dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden"
          style={{ animation: 'fadeIn .15s ease' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell size={15} strokeWidth={1.5} className="text-slate-500"/>
              <h3 className="font-semibold text-slate-800 text-sm">Notificações</h3>
              {unread > 0 && (
                <span className="text-[10px] bg-rose-100 text-rose-600 font-bold px-1.5 py-0.5 rounded-full">
                  {unread} nova{unread > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-violet-600 transition-colors"
              >
                <CheckCheck size={13}/>
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="overflow-y-auto" style={{ maxHeight: '420px' }}>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin"/>
              </div>
            ) : notifs.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Bell size={32} strokeWidth={1} className="mx-auto mb-2 text-slate-200"/>
                <p className="text-sm text-slate-400 font-medium">Nenhuma notificação</p>
                <p className="text-xs text-slate-300 mt-1">Você está em dia com tudo!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifs.map(n => {
                  const cfg  = TYPE_CFG[n.type] || TYPE_CFG.task_created
                  const Icon = cfg.icon
                  return (
                    <div
                      key={n.id}
                      onClick={() => openNotif(n)}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50 ${!n.read ? 'bg-violet-50/40' : ''}`}
                    >
                      {/* Ícone do tipo */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg}`}>
                        <Icon size={14} strokeWidth={1.5} className={cfg.color}/>
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-semibold leading-snug ${!n.read ? 'text-slate-800' : 'text-slate-600'}`}>
                            {n.title}
                          </p>
                          <button
                            onClick={e => deleteNotif(e, n.id)}
                            className="shrink-0 p-0.5 rounded text-slate-300 hover:text-slate-500 transition-colors"
                          >
                            <X size={11}/>
                          </button>
                        </div>
                        {n.body && (
                          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.body}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          {n.task_code && (
                            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              #{n.task_code}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-300">{fmtRelative(n.created_at)}</span>
                          {n.link && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-violet-500">
                              <ExternalLink size={9}/> Abrir tarefa
                            </span>
                          )}
                          {!n.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 ml-auto shrink-0"/>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifs.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 text-center">
              <button
                onClick={async () => {
                  if (!me?.id) return
                  await supabase.from('notifications').delete().eq('user_id', me.id).eq('read', true)
                  setNotifs(prev => prev.filter(n => !n.read))
                }}
                className="text-xs text-slate-400 hover:text-rose-500 transition-colors"
              >
                Limpar lidas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helper para criar notificações (exportado para uso nos kanbans) ──────────
export async function createNotifications({ taskId, taskCode, taskTitle, type, body, recipientIds, link }) {
  if (!recipientIds?.length) return
  const notifs = recipientIds.map(userId => ({
    user_id:   userId,
    type,
    title:     taskTitle,
    body,
    task_id:   taskId,
    task_code: taskCode,
    link:      link || null,
  }))
  const { error } = await supabase.from('notifications').insert(notifs)
  if (error) console.error('[notifications] erro ao inserir:', error)
}
