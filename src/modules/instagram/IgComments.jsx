import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, EyeOff, Eye, Trash2, Check, CornerDownRight, ExternalLink, Search, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { igCall, timeAgo, fmtDate } from './igApi'
import { Thumb } from './IgDashboard'

const QUICK = [
  'Obrigado pelo carinho! 🧡',
  'Oi! Te chamamos no direct com os detalhes 😊',
  'Temos sim! O link está na bio 🔗',
  'Que fofura! Manda um beijo pro pet 🐹',
]
const FILTERS = { pendentes: 'Para responder', todos: 'Todos', ocultos: 'Ocultos' }

// Caixa de comentários: tudo dos posts dos últimos 45 dias (o sync roda de
// hora em hora). Responder/ocultar/excluir vai direto pro Instagram.
export function IgComments({ media, account, onChanged }) {
  const [rows, setRows] = useState(null)
  const [filter, setFilter] = useState('pendentes')
  const [q, setQ] = useState('')
  const [reply, setReply] = useState({})     // id → texto
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('ig_comments').select('*')
      .gte('commented_at', new Date(Date.now() - 60 * 86400e3).toISOString())
      .order('commented_at', { ascending: false }).limit(1000)
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const mediaById = useMemo(() => Object.fromEntries(media.map(m => [m.id, m])), [media])

  const groups = useMemo(() => {
    if (!rows) return []
    const replies = {}
    for (const r of rows) if (r.parent_id) (replies[r.parent_id] = replies[r.parent_id] || []).push(r)
    const qq = q.trim().toLowerCase()
    const top = rows.filter(r => !r.parent_id && !r.from_self).filter(r =>
      filter === 'pendentes' ? !r.answered && !r.done && !r.hidden
      : filter === 'ocultos' ? r.hidden : true)
      .filter(r => !qq || r.text?.toLowerCase().includes(qq) || r.username?.toLowerCase().includes(qq))
    const g = {}
    for (const r of top) (g[r.media_id] = g[r.media_id] || []).push({ ...r, replies: (replies[r.id] || []).sort((a, b) => new Date(a.commented_at) - new Date(b.commented_at)) })
    return Object.entries(g).map(([mid, list]) => ({ media: mediaById[mid], mid, list }))
      .sort((a, b) => new Date(b.list[0].commented_at) - new Date(a.list[0].commented_at))
  }, [rows, filter, q, mediaById])

  async function act(action, c, extra = {}) {
    setBusy(`${action}:${c.id}`)
    try {
      await igCall(action, { comment_id: c.id, ...extra })
      if (action === 'reply_comment') { setReply(r => ({ ...r, [c.id]: undefined })); toast.success('Resposta publicada') }
      await load(); onChanged?.()
    } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  const count = rows ? rows.filter(r => !r.parent_id && !r.from_self && !r.answered && !r.done && !r.hidden).length : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(FILTERS).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${filter === k ? 'bg-pink-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {l}{k === 'pendentes' && count > 0 ? ` (${count})` : ''}
          </button>
        ))}
        <div className="ml-auto relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar comentário ou @" className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-xl w-56" />
        </div>
      </div>

      {!rows ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
        : !groups.length ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <MessageCircle className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">{filter === 'pendentes' ? 'Nenhum comentário esperando resposta 🎉' : 'Nada por aqui.'}</p>
          </div>
        ) : groups.map(g => (
          <div key={g.mid} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <Thumb url={g.media?.thumbnail_url || (g.media?.media_type !== 'VIDEO' ? g.media?.media_url : null)} video={g.media?.media_type === 'VIDEO'} size="w-9 h-9" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-700 truncate">{g.media?.caption?.split('\n')[0] || 'Post'}</p>
                <p className="text-[11px] text-slate-400">{fmtDate(g.media?.posted_at)} · {g.list.length} comentário{g.list.length === 1 ? '' : 's'}</p>
              </div>
              {g.media?.permalink && <a href={g.media.permalink} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-pink-500"><ExternalLink size={14} /></a>}
            </div>
            <div className="divide-y divide-slate-100">
              {g.list.map(c => (
                <div key={c.id} className={`px-4 py-3 ${c.hidden ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700"><a href={`https://instagram.com/${c.username}`} target="_blank" rel="noreferrer" className="font-bold hover:underline">@{c.username}</a> {c.text}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        há {timeAgo(c.commented_at)}{c.like_count ? ` · ${c.like_count} curtida${c.like_count === 1 ? '' : 's'}` : ''}
                        {c.hidden && ' · oculto'}{c.answered && ' · respondido'}{c.done && !c.answered && ' · resolvido'}{c.handled_by && ` · ${c.handled_by}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <IconBtn title={c.hidden ? 'Mostrar de novo' : 'Ocultar (só quem comentou continua vendo)'} busy={busy === `hide_comment:${c.id}`} onClick={() => act('hide_comment', c, { hide: !c.hidden })}>{c.hidden ? <Eye size={14} /> : <EyeOff size={14} />}</IconBtn>
                      {!c.answered && <IconBtn title={c.done ? 'Voltar pra pendentes' : 'Marcar como resolvido (sem responder)'} busy={busy === `mark_comment:${c.id}`} onClick={() => act('mark_comment', c, { done: !c.done })}><Check size={14} className={c.done ? 'text-emerald-600' : ''} /></IconBtn>}
                      <IconBtn title="Excluir do Instagram" busy={busy === `delete_comment:${c.id}`} onClick={() => confirm(`Excluir o comentário de @${c.username}? Não dá pra desfazer.`) && act('delete_comment', c)} danger><Trash2 size={14} /></IconBtn>
                    </div>
                  </div>
                  {c.replies.map(r => (
                    <div key={r.id} className="flex gap-1.5 ml-4 mt-2 text-sm">
                      <CornerDownRight size={13} className="text-slate-300 mt-1 shrink-0" />
                      <p className={r.from_self ? 'text-pink-700' : 'text-slate-600'}><b>@{r.username}</b> {r.text} <span className="text-[11px] text-slate-400">· há {timeAgo(r.commented_at)}</span></p>
                    </div>
                  ))}
                  <div className="mt-2 ml-4">
                    {reply[c.id] === undefined ? (
                      <button onClick={() => setReply(r => ({ ...r, [c.id]: `@${c.username} ` }))} className="text-xs font-semibold text-pink-600 hover:underline">Responder</button>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap gap-1">
                          {QUICK.map(t => <button key={t} onClick={() => setReply(r => ({ ...r, [c.id]: `@${c.username} ${t}` }))} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-pink-100">{t}</button>)}
                        </div>
                        <div className="flex gap-2">
                          <input autoFocus value={reply[c.id]} onChange={e => setReply(r => ({ ...r, [c.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && reply[c.id].trim() && act('reply_comment', c, { message: reply[c.id] })}
                            className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-1.5" placeholder={`Responder @${c.username}`} />
                          <button onClick={() => act('reply_comment', c, { message: reply[c.id] })} disabled={!reply[c.id].trim() || busy === `reply_comment:${c.id}`}
                            className="px-3 rounded-xl bg-pink-500 text-white text-sm font-semibold disabled:opacity-50">
                            {busy === `reply_comment:${c.id}` ? <Loader2 size={14} className="animate-spin" /> : 'Enviar'}
                          </button>
                          <button onClick={() => setReply(r => ({ ...r, [c.id]: undefined }))} className="text-xs text-slate-400 px-1">cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      <p className="text-[11px] text-slate-400">Comentários dos posts dos últimos 45 dias · atualiza sozinho a cada hora (ou no botão Atualizar). {account?.username && `Respostas saem como @${account.username}.`}</p>
    </div>
  )
}

function IconBtn({ children, title, onClick, busy, danger }) {
  return (
    <button title={title} onClick={onClick} disabled={busy}
      className={`p-1.5 rounded-lg text-slate-400 ${danger ? 'hover:text-red-600 hover:bg-red-50' : 'hover:text-slate-700 hover:bg-slate-100'}`}>
      {busy ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  )
}
