import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { MessageCircle, Loader2, RefreshCw, Send, Search, X, Info, Package, ShoppingBag, Image as ImageIcon, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PLAT, PlatBadge, Segmented, norm } from './shared'

// Chat da Shopee dentro do sistema (10/10). Lê as conversas e mensagens
// pela API (sellerchat) e responde por aqui — cada envio é um clique de
// alguém da equipe, registrado com quem mandou (`shopee_item_updates`,
// action chat_message → aparece no Histórico). Mandar foto/anúncio/pedido
// continua no app da Shopee; aqui é só texto. Abrir a conversa aqui NÃO
// marca como lida na Shopee (pra ninguém perder o aviso no app).
// O ML não tem chat de pré-venda — as perguntas ficam em /ml/perguntas.

const TZ = 'America/Sao_Paulo'
const fmtTime = iso => {
  if (!iso) return ''
  const d = new Date(iso), today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
  return day === today
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d)
    : new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d)
}
const fmtFull = iso => iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : ''
const TYPE_LABEL = { image: '📷 Foto', video: '🎬 Vídeo', sticker: '😀 Figurinha', item: '🛍️ Anúncio', order: '📦 Pedido', product_list: '🛍️ Produtos', bundle_message: '🛍️ Oferta', faq: '❓ Pergunta frequente' }
const AUTO = new Set(['offwork_autoreply', 'auto_reply', 'autoreply'])
const TEMPLATES = [
  ['Saudação', 'Oiii! Aqui é da Equipe Coisa Pet 🐹💛 Como posso te ajudar?'],
  ['Rastreio', 'Assim que o seu pedido for postado, o código de rastreio aparece direto no app da Shopee, na tela do pedido. Qualquer dúvida, estamos por aqui! 🤎'],
  ['Agradecer', 'Imagina! Qualquer coisa é só chamar por aqui. Obrigada por comprar com a Coisa Pet! 🤎🐹'],
]
const call = async body => {
  const { data, error } = await supabase.functions.invoke('shopee-extra', { body })
  if (error || data?.ok === false || data?.error) throw new Error(data?.error || error?.message || 'falha')
  return data
}

export function MarketplaceChatPage() {
  const { user } = useAuth()
  const [type, setType] = useState('all')
  const [convs, setConvs] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [moreLoading, setMoreLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState(null)
  const [msgs, setMsgs] = useState(null)
  const [older, setOlder] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)

  const loadList = useCallback(async (quiet = false) => {
    if (!quiet) setConvs(null)
    setErr(null)
    try {
      const r = await call({ action: 'chat_list', type, page_size: 40 })
      setConvs(r.conversations); setCursor(r.more ? r.cursor : null)
    } catch (e) { setErr(e.message); if (!quiet) setConvs([]) }
  }, [type])
  useEffect(() => { loadList() }, [loadList])
  // Atualiza a lista sozinho a cada 60s enquanto a tela está aberta
  useEffect(() => { const t = setInterval(() => loadList(true), 60_000); return () => clearInterval(t) }, [loadList])

  async function loadMore() {
    setMoreLoading(true)
    try {
      const r = await call({ action: 'chat_list', type, page_size: 40, cursor })
      setConvs(c => [...c, ...r.conversations.filter(x => !c.some(y => y.conversation_id === x.conversation_id))]); setCursor(r.more ? r.cursor : null)
    } catch (e) { toast.error(e.message) } finally { setMoreLoading(false) }
  }

  const openConv = useCallback(async c => {
    setSel(c); setMsgs(null); setOlder(null); setText('')
    try { const r = await call({ action: 'chat_messages', conversation_id: c.conversation_id, page_size: 40 }); setMsgs(r.messages); setOlder(r.next_offset) }
    catch (e) { toast.error('Não abriu a conversa: ' + e.message); setMsgs([]) }
  }, [])
  async function loadOlder() {
    try { const r = await call({ action: 'chat_messages', conversation_id: sel.conversation_id, page_size: 40, offset: older }); setMsgs(m => [...r.messages.filter(x => !m.some(y => y.id === x.id)), ...m]); setOlder(r.messages.length ? r.next_offset : null) }
    catch (e) { toast.error(e.message) }
  }
  useEffect(() => { if (msgs) endRef.current?.scrollIntoView({ block: 'end' }) }, [sel?.conversation_id, msgs?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    const t = text.trim()
    if (!t || !sel) return
    setSending(true)
    try {
      await call({ action: 'chat_send', to_id: sel.buyer_id, conversation_id: sel.conversation_id, buyer: sel.buyer, text: t, by: user?.name || null })
      const now = new Date().toISOString()
      setMsgs(m => [...(m || []), { id: `local-${Date.now()}`, from_me: true, type: 'text', text: t, at: now, by: user?.name }])
      setConvs(cs => cs.map(c => c.conversation_id === sel.conversation_id ? { ...c, unread: 0, last: { type: 'text', text: t, from_me: true, at: now } } : c))
      setText('')
    } catch (e) { toast.error('Não enviou: ' + e.message) } finally { setSending(false) }
  }

  const list = useMemo(() => {
    const q = norm(search)
    return (convs || []).filter(c => !q || norm(`${c.buyer} ${c.last?.text || ''}`).includes(q))
  }, [convs, search])
  const unreadTotal = (convs || []).reduce((t, c) => t + c.unread, 0)
  // Última mensagem é do comprador e ninguém respondeu (sem contar resposta automática)
  const waiting = c => !c.last?.from_me

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: `linear-gradient(135deg, ${PLAT.shopee.color}, #D6431F)` }}><MessageCircle size={20} className="text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Chat da Shopee</h1>
            <p className="text-sm text-slate-500">Conversas com os compradores — ler e responder sem abrir o app da Shopee</p>
          </div>
        </div>
        <button onClick={() => { loadList(); if (sel) openConv(sel) }} disabled={convs === null} className="btn-secondary py-1.5 text-sm disabled:opacity-50">{convs === null ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar</button>
      </div>

      {err && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">Não deu pra carregar o chat: {err}</p>}

      <div className="card !p-0 overflow-hidden grid md:grid-cols-[340px_1fr] h-[calc(100vh-230px)] min-h-[480px]">
        {/* Lista de conversas */}
        <div className={`flex flex-col border-r border-slate-100 min-h-0 ${sel ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 flex flex-col gap-2 border-b border-slate-100">
            <Segmented value={type} onChange={setType} options={[['all', 'Todas'], ['unread', `Não lidas${unreadTotal ? ` (${unreadTotal})` : ''}`]]} />
            <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 h-9 bg-white focus-within:border-slate-400">
              <Search size={14} className="text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Comprador ou mensagem…" className="bg-transparent outline-none text-sm w-full placeholder:text-slate-400" />
              {search && <button onClick={() => setSearch('')} className="text-slate-400"><X size={13} /></button>}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convs === null ? <div className="py-16 text-center"><Loader2 size={20} className="mx-auto animate-spin text-slate-300" /></div>
              : !list.length ? <p className="text-sm text-slate-400 text-center py-12">{type === 'unread' ? 'Nenhuma conversa não lida 🎉' : 'Nenhuma conversa.'}</p>
              : list.map(c => (
                <button key={c.conversation_id} onClick={() => openConv(c)} className={`w-full text-left flex gap-3 px-3 py-2.5 border-b border-slate-50 ${sel?.conversation_id === c.conversation_id ? 'bg-orange-50/70' : 'hover:bg-slate-50'}`}>
                  {c.avatar ? <img src={c.avatar} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-100 shrink-0" loading="lazy" /> : <span className="w-10 h-10 rounded-full bg-slate-100 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] truncate flex-1 ${c.unread ? 'font-bold text-slate-800' : 'font-medium text-slate-700'}`}>{c.buyer}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{fmtTime(c.last?.at)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[12px] truncate flex-1 ${c.unread ? 'text-slate-700' : 'text-slate-400'}`}>{c.last?.from_me && <span className="text-slate-400">Você: </span>}{c.last?.text || TYPE_LABEL[c.last?.type] || '…'}</span>
                      {c.unread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: PLAT.shopee.color }}>{c.unread}</span>}
                      {!c.unread && waiting(c) && <span className="text-[9px] font-bold text-amber-600 uppercase">aguardando</span>}
                    </div>
                  </div>
                </button>
              ))}
            {cursor && list.length > 0 && !search && (
              <button onClick={loadMore} disabled={moreLoading} className="w-full py-3 text-xs font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center justify-center gap-1">{moreLoading ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} />} Carregar mais conversas</button>
            )}
          </div>
        </div>

        {/* Conversa aberta */}
        <div className={`flex flex-col min-h-0 ${sel ? 'flex' : 'hidden md:flex'}`}>
          {!sel ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 p-8 text-center">
              <MessageCircle size={32} className="text-slate-200" />
              <p className="text-sm">Escolha uma conversa à esquerda</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <button onClick={() => setSel(null)} className="md:hidden text-slate-400 text-sm">←</button>
                {sel.avatar ? <img src={sel.avatar} alt="" className="w-9 h-9 rounded-full object-cover bg-slate-100" /> : <span className="w-9 h-9 rounded-full bg-slate-100" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{sel.buyer}</p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1"><PlatBadge p="shopee" /> comprador</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto bg-slate-50/60 px-4 py-3 flex flex-col gap-2">
                {msgs === null ? <div className="py-16 text-center"><Loader2 size={20} className="mx-auto animate-spin text-slate-300" /></div> : (
                  <>
                    {older && <button onClick={loadOlder} className="self-center text-[11px] font-semibold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-full px-3 py-1 mb-1">mensagens anteriores</button>}
                    {msgs.map(m => {
                      const auto = AUTO.has(m.status)
                      return (
                        <div key={m.id} className={`flex ${m.from_me ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-[13px] shadow-sm ${m.from_me ? (auto ? 'bg-slate-200 text-slate-600 rounded-br-md' : 'bg-[#EE4D2D] text-white rounded-br-md') : 'bg-white text-slate-800 border border-slate-100 rounded-bl-md'}`}>
                            {m.quoted && <p className={`text-[11px] border-l-2 pl-2 mb-1 ${m.from_me ? 'border-white/50 opacity-80' : 'border-slate-300 text-slate-500'}`}>{m.quoted}</p>}
                            {m.type === 'text' ? <p className="whitespace-pre-line break-words">{m.text}</p>
                              : m.type === 'image' && m.image ? <a href={m.image} target="_blank" rel="noreferrer"><img src={m.image} alt="" className="max-w-[220px] max-h-[220px] rounded-lg object-cover" loading="lazy" /></a>
                              : m.type === 'order' ? <p className="inline-flex items-center gap-1.5 font-semibold"><Package size={13} />Pedido {m.order_sn}</p>
                              : m.type === 'item' ? <p className="inline-flex items-center gap-1.5 font-semibold"><ShoppingBag size={13} />Anúncio {m.item_id}</p>
                              : <p className="italic opacity-80 inline-flex items-center gap-1.5">{m.type === 'image' && <ImageIcon size={13} />}{TYPE_LABEL[m.type] || m.type} <span className="text-[10px]">(abrir no app)</span></p>}
                            <p className={`text-[10px] mt-0.5 text-right ${m.from_me && !auto ? 'text-white/70' : 'text-slate-400'}`}>{auto ? 'resposta automática · ' : m.by ? `${m.by} · ` : ''}{fmtFull(m.at)}</p>
                          </div>
                        </div>
                      )
                    })}
                    {!msgs.length && <p className="text-sm text-slate-400 text-center py-10">Sem mensagens.</p>}
                    <div ref={endRef} />
                  </>
                )}
              </div>
              <div className="border-t border-slate-100 p-3 flex flex-col gap-2 bg-white">
                <div className="flex gap-1.5 flex-wrap">{TEMPLATES.map(([l, t]) => <button key={l} onClick={() => setText(t)} className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-slate-200 hover:border-slate-400 bg-white">{l}</button>)}</div>
                <div className="flex gap-2 items-end">
                  <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }}
                    rows={2} maxLength={1000} placeholder="Escreva a resposta… (Ctrl+Enter envia)" className="input text-sm resize-none flex-1" />
                  <button onClick={send} disabled={sending || !text.trim()} className="btn-primary h-10 disabled:opacity-50" style={{ background: PLAT.shopee.color }}>{sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
        <span>A mensagem vai direto pro comprador na Shopee, em nome da loja — fica registrado quem enviou (Histórico de alterações). Abrir a conversa aqui não marca como lida no app. Foto, anúncio e pedido aparecem aqui, mas pra mandar esses tipos use o app da Shopee.</span>
      </p>
    </div>
  )
}
