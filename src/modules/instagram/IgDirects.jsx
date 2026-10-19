import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Send, Info, Inbox } from 'lucide-react'
import toast from 'react-hot-toast'
import { igCall, timeAgo, fmtDateTime } from './igApi'

// Directs ao vivo (não ficam gravados no banco — mensagem de cliente é dado
// pessoal). Regra da Meta: só dá pra responder até 24h depois da última
// mensagem da pessoa.
export function IgDirects({ account }) {
  const [convs, setConvs] = useState(null)
  const [selfId, setSelfId] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null)       // conversa
  const [thread, setThread] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(null)
  const endRef = useRef(null)

  const loadInbox = useCallback(async () => {
    setBusy('inbox'); setError(null)
    try { const r = await igCall('inbox'); setConvs(r.conversations); setSelfId(r.self_id) }
    catch (e) { setError(e.message); setConvs([]) } finally { setBusy(null) }
  }, [])
  useEffect(() => { loadInbox() }, [loadInbox])

  const loadThread = useCallback(async c => {
    setOpen(c); setThread(null); setBusy('thread')
    try { const r = await igCall('thread', { conversation_id: c.id }); setThread(r.thread) }
    catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [thread])

  const other = c => (c?.participants?.data || []).find(p => p.id !== selfId && p.username !== account?.username) || {}
  const msgs = [...(thread?.messages?.data || [])].reverse()
  const lastTheirs = msgs.filter(m => m.from?.id !== selfId && m.from?.username !== account?.username).at(-1)
  const windowOpen = lastTheirs && Date.now() - new Date(lastTheirs.created_time) < 24 * 3600e3

  async function send() {
    const to = other(open)
    if (!text.trim() || !to.id) return
    setBusy('send')
    try { await igCall('send_dm', { recipient_id: to.id, text }); setText(''); await loadThread(open) }
    catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  if (error) return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800 max-w-2xl">
      <p className="font-bold mb-1 flex items-center gap-1.5"><Info size={16} /> Directs ainda não liberados</p>
      <p>A Meta respondeu: <i>{error}</i></p>
      <p className="mt-2">Pra ler/responder directs pelo sistema, o app da Meta precisa da permissão <b>instagram_business_manage_messages</b> (marcar ao gerar o token) e, no Instagram do celular, ativar <b>Configurações → Mensagens e respostas a stories → Ferramentas conectadas → Permitir acesso às mensagens</b>. Depois, gere o token de novo e reconecte na aba Conta.</p>
      <button onClick={loadInbox} className="mt-3 px-3 py-1.5 rounded-xl bg-white border border-amber-300 font-semibold flex items-center gap-1.5"><RefreshCw size={14} /> Tentar de novo</button>
    </div>
  )

  return (
    <div className="grid md:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-260px)] min-h-[420px]">
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
        <div className="flex items-center px-3 py-2 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-700">Conversas</p>
          <button onClick={loadInbox} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">{busy === 'inbox' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>
        </div>
        <div className="overflow-y-auto flex-1">
          {!convs ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>
            : !convs.length ? <p className="text-sm text-slate-400 p-6 text-center">Nenhuma conversa.</p>
            : convs.map(c => {
              const o = other(c); const last = c.messages?.data?.[0]
              return (
                <button key={c.id} onClick={() => loadThread(c)} className={`w-full text-left px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 ${open?.id === c.id ? 'bg-pink-50' : ''}`}>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-700 truncate">@{o.username || 'usuário'}</p>
                    <span className="ml-auto text-[10px] text-slate-400 shrink-0">{timeAgo(c.updated_time)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{last?.from?.id === selfId ? 'Você: ' : ''}{last?.message || '(mídia)'}</p>
                </button>
              )
            })}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
        {!open ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm"><Inbox className="mb-2" /> Escolha uma conversa</div>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center">
              <a href={`https://instagram.com/${other(open).username}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-slate-700 hover:underline">@{other(open).username}</a>
              <button onClick={() => loadThread(open)} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><RefreshCw size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-slate-50/50">
              {!thread ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>
                : msgs.map(m => {
                  const mine = m.from?.id === selfId || m.from?.username === account?.username
                  return (
                    <div key={m.id} className={`max-w-[75%] ${mine ? 'self-end' : 'self-start'}`}>
                      <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${mine ? 'bg-gradient-to-r from-pink-500 to-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                        {m.message || (m.attachments?.data?.length ? '📎 anexo (abra no app)' : m.story ? '↩️ resposta a story' : m.shares ? '🔗 post compartilhado' : '(mensagem)')}
                      </div>
                      <p className={`text-[10px] text-slate-400 mt-0.5 ${mine ? 'text-right' : ''}`}>{fmtDateTime(m.created_time)}</p>
                    </div>
                  )
                })}
              <div ref={endRef} />
            </div>
            <div className="border-t border-slate-100 p-3">
              {thread && !windowOpen && <p className="text-[11px] text-amber-700 mb-1.5">⚠️ Já passou de 24h desde a última mensagem da pessoa — a Meta pode bloquear a resposta. Se bloquear, responda pelo app.</p>}
              <div className="flex gap-2">
                <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Escreva a resposta…"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none" />
                <button onClick={send} disabled={!text.trim() || busy === 'send'} className="px-4 rounded-xl bg-pink-500 text-white disabled:opacity-50">
                  {busy === 'send' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
