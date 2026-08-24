import { useState, useEffect, useMemo } from 'react'
import { MessageSquare, Search, Archive, Send, Lock, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { createNotifications } from '../../components/notifications/NotificationBell'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}
function fmtDT(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_CFG = {
  pendente:   { label: 'Aguardando',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  respondido: { label: 'Respondido',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  arquivado:  { label: 'Arquivado',   cls: 'bg-slate-100 text-slate-500 border-slate-200' },
}

export function RHMensagensPage() {
  const { user } = useAuth()
  const [messages,  setMessages]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [statusFilter, setStatusFilter] = useState('') // '' = todos
  const [replyText, setReplyText] = useState({}) // { [id]: texto }
  const [sending,   setSending]   = useState({}) // { [id]: bool }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('employee_messages')
      .select('*, employee:system_users!employee_id(name, job_title), responder:system_users!responded_by(name)')
      .order('created_at', { ascending: false })
    if (error) { toast.error('Erro ao carregar mensagens.'); console.error(error) }
    else setMessages(data ?? [])
    setLoading(false)
  }

  // Só diretor acessa (mesmo padrão do resto do sistema)
  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center">
          <Lock size={28} className="text-rose-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-700">Acesso restrito</h2>
        <p className="text-sm text-slate-400">Apenas diretores podem ver as mensagens dos funcionários.</p>
      </div>
    )
  }

  const filtered = useMemo(() => {
    return messages.filter(m => {
      if (statusFilter && m.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const matchName = m.employee?.name?.toLowerCase().includes(q)
        const matchMsg  = m.message?.toLowerCase().includes(q)
        if (!matchName && !matchMsg) return false
      }
      return true
    })
  }, [messages, search, statusFilter])

  const counts = {
    pendente:   messages.filter(m => m.status === 'pendente').length,
    respondido: messages.filter(m => m.status === 'respondido').length,
    arquivado:  messages.filter(m => m.status === 'arquivado').length,
  }

  async function handleReply(msg) {
    const text = replyText[msg.id]?.trim()
    if (!text) return
    setSending(s => ({ ...s, [msg.id]: true }))
    const { id: uid } = getSession()

    const { error } = await supabase.from('employee_messages').update({
      response:         text,
      status:           'respondido',
      responded_by:     uid || null,
      responded_at:     new Date().toISOString(),
      seen_by_employee: false,
    }).eq('id', msg.id)

    if (error) {
      toast.error('Erro ao responder.')
    } else {
      toast.success('Resposta enviada!')
      setReplyText(r => ({ ...r, [msg.id]: '' }))
      await load()
    }
    setSending(s => ({ ...s, [msg.id]: false }))
  }

  async function handleArchive(msg) {
    const { id: uid } = getSession()
    const { error } = await supabase.from('employee_messages').update({
      status: 'arquivado', archived_by: uid || null, archived_at: new Date().toISOString(),
    }).eq('id', msg.id)
    if (error) toast.error('Erro ao arquivar.')
    else { toast.success('Arquivado.'); await load() }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2" style={{ fontFamily: 'Nunito,sans-serif' }}>
          <MessageSquare size={22} className="text-rose-400" /> Mensagens e Avisos
        </h1>
        <p className="text-sm text-slate-400">Mensagens enviadas pelos funcionários através do app</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar por funcionário ou conteúdo da mensagem..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {[
            { key: '',          label: 'Todas',      count: messages.length },
            { key: 'pendente',   label: 'Aguardando', count: counts.pendente },
            { key: 'respondido', label: 'Respondidas',count: counts.respondido },
            { key: 'arquivado',  label: 'Arquivadas', count: counts.arquivado },
          ].map(opt => (
            <button key={opt.key || 'all'} onClick={() => setStatusFilter(opt.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === opt.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {opt.label}
              <span className={`text-[10px] px-1.5 rounded-full ${statusFilter === opt.key ? 'bg-slate-100 text-slate-500' : 'bg-white/60 text-slate-400'}`}>
                {opt.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Nenhuma mensagem encontrada</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(m => {
            const st = STATUS_CFG[m.status] || STATUS_CFG.pendente
            return (
              <div key={m.id} className="card p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center text-xs font-black text-rose-500 shrink-0">
                      {m.employee?.name?.split(' ').map(n => n[0]).slice(0, 2).join('') || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                        <User size={12} className="text-slate-400" /> {m.employee?.name || 'Funcionário'}
                      </p>
                      <p className="text-xs text-slate-400">{m.employee?.job_title} · {fmtDT(m.created_at)}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 ${st.cls}`}>{st.label}</span>
                </div>

                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{m.message}</p>

                {m.response && (
                  <div className="mt-3 bg-emerald-50/60 border border-emerald-100 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1">
                      Resposta de {m.responder?.name || 'Diretoria'} · {fmtDT(m.responded_at)}
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{m.response}</p>
                  </div>
                )}

                {m.status !== 'arquivado' && (
                  <div className="flex items-end gap-2 mt-4 pt-4 border-t border-slate-50">
                    <textarea
                      className="textarea flex-1 resize-none text-sm"
                      rows={2}
                      placeholder={m.status === 'respondido' ? 'Responder novamente (opcional)...' : 'Escreva uma resposta...'}
                      value={replyText[m.id] || ''}
                      onChange={e => setReplyText(r => ({ ...r, [m.id]: e.target.value }))}
                    />
                    <button onClick={() => handleReply(m)} disabled={!replyText[m.id]?.trim() || sending[m.id]}
                      className="btn-primary text-xs px-4 py-2.5 flex items-center gap-1.5 shrink-0 disabled:opacity-50">
                      <Send size={13} /> {sending[m.id] ? 'Enviando...' : 'Responder'}
                    </button>
                    <button onClick={() => handleArchive(m)}
                      className="btn-secondary text-xs px-3 py-2.5 flex items-center gap-1.5 shrink-0">
                      <Archive size={13} /> Arquivar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
