import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, X, ArrowLeft, Send, Search, Paperclip, FileText, Pin, PinOff, Users, Check, CheckCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/signedUrlCache'
import toast from 'react-hot-toast'
import { useChatLayout, DOCKED_WIDTH } from '../../contexts/ChatLayoutContext'

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024 // 5MB

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}
function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

// Mostra a foto de perfil real do colaborador (bucket employee-docs), e só
// cai pra sigla colorida quando não tem foto cadastrada ou ela falha
// Mostra a foto de perfil real do colaborador — o photo_url de system_users
// já vem como URL assinada PRONTA (diferente do photo_url de produto, que é
// só o caminho dentro do bucket) — usa direto, sem tentar assinar de novo.
// Cai pra sigla colorida se não tiver foto, ou se a URL falhar/expirar.
function Avatar({ name, photoUrl, size = 36 }) {
  const [broken, setBroken] = useState(false)
  if (photoUrl && !broken) {
    return (
      <img src={photoUrl} alt={name} onError={() => setBroken(true)}
        className="rounded-full object-cover shrink-0 border border-black/5"
        style={{ width: size, height: size }} />
    )
  }
  return (
    <div className="rounded-full bg-rose-100 flex items-center justify-center font-black text-rose-500 shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {initials(name)}
    </div>
  )
}
function fmtTime(d) {
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function dayLabel(dateStr) {
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  if (d.getTime() === today.getTime()) return 'Hoje'
  if (d.getTime() === yesterday.getTime()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// Bipe curto, gerado na hora (sem depender de arquivo de áudio)
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.type = 'sine'; osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.2)
  } catch { /* navegador bloqueou áudio — sem problema, segue sem som */ }
}

// Anexo dentro da bolha — imagem mostra inline, outros arquivos viram link de download
function ChatAttachment({ url, name, type, mine }) {
  const signedUrl = useSignedUrl('chat-attachments', url)
  const isImage = type?.startsWith('image/')

  if (isImage) {
    return (
      <a href={signedUrl || undefined} target="_blank" rel="noreferrer" className="block mb-1.5">
        {signedUrl
          ? <img src={signedUrl} alt={name} className="rounded-lg max-w-full max-h-52 object-cover" />
          : <div className="w-40 h-32 bg-black/10 rounded-lg animate-pulse" />}
      </a>
    )
  }
  return (
    <a href={signedUrl || undefined} target="_blank" rel="noreferrer"
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 mb-1.5 ${mine ? 'bg-white/15 hover:bg-white/20' : 'bg-slate-100 hover:bg-slate-200'}`}>
      <FileText size={15} className="shrink-0" />
      <span className="text-xs truncate">{name}</span>
    </a>
  )
}

export function ChatWidget() {
  const me = getSession()
  const { mode, setMode } = useChatLayout()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('list') // 'list' | 'conversation'
  const [users, setUsers] = useState([])
  const [inbox, setInbox] = useState({}) // { [otherUserId]: { lastMessage, unread } }
  const [activeUser, setActiveUser] = useState(null)
  const [groups, setGroups] = useState([])
  const [groupUnread, setGroupUnread] = useState({})
  const [activeGroup, setActiveGroup] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [toasts, setToasts] = useState([]) // [{id, user, body}]
  const [sending, setSending] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const scrollRef = useRef(null)
  const activeUserRef = useRef(null)
  const activeGroupRef = useRef(null)
  const openRef = useRef(false)
  const fileInputRef = useRef(null)
  const draftInputRef = useRef(null)
  const originalTitleRef = useRef(document.title)
  const flashIntervalRef = useRef(null)

  useEffect(() => { activeUserRef.current = activeUser }, [activeUser])
  useEffect(() => { activeGroupRef.current = activeGroup }, [activeGroup])
  useEffect(() => { openRef.current = open }, [open])

  function startTitleFlash() {
    if (flashIntervalRef.current) return
    let toggle = false
    flashIntervalRef.current = setInterval(() => {
      document.title = toggle ? originalTitleRef.current : '💬 Nova mensagem!'
      toggle = !toggle
    }, 1000)
  }
  function stopTitleFlash() {
    if (flashIntervalRef.current) { clearInterval(flashIntervalRef.current); flashIntervalRef.current = null }
    document.title = originalTitleRef.current
  }
  useEffect(() => {
    function onVisible() { if (!document.hidden) stopTitleFlash() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // ── Carga inicial ────────────────────────────────────────────
  useEffect(() => {
    if (!me?.id) return
    loadUsers()
    refreshInbox()
    loadGroups().then(refreshGroupUnread)
  }, [me?.id])

  // Recarrega a lista de grupos sempre que o chat é aberto — assim um grupo
  // criado depois que a página já estava aberta aparece na hora, sem
  // depender só do tempo real
  useEffect(() => {
    if (open && me?.id) loadGroups().then(refreshGroupUnread)
  }, [open])

  async function loadUsers() {
    const { data } = await supabase.from('system_users')
      .select('id, name, role, photo_url').eq('active', true).neq('id', me.id).order('name')
    setUsers(data || [])
  }

  async function loadGroups() {
    const { data, error } = await supabase.from('chat_group_members')
      .select('group_id, group:chat_groups(id,name)')
      .eq('user_id', me.id)
    if (error) console.error('[Chat] Erro ao carregar grupos:', error)
    const list = (data || []).map(r => r.group).filter(Boolean)
    setGroups(list)
    return list
  }

  async function refreshGroupUnread(groupList) {
    const list = groupList || groups
    if (!list.length) { setGroupUnread({}); return }
    const { data: reads } = await supabase.from('chat_group_reads').select('group_id,last_read_at').eq('user_id', me.id)
    const readMap = {}
    ;(reads || []).forEach(r => { readMap[r.group_id] = r.last_read_at })
    const counts = {}
    await Promise.all(list.map(async g => {
      const since = readMap[g.id] || '1970-01-01T00:00:00Z'
      const { count } = await supabase.from('chat_messages').select('id', { count: 'exact', head: true })
        .eq('group_id', g.id).neq('sender_id', me.id).gt('created_at', since)
      counts[g.id] = count || 0
    }))
    setGroupUnread(counts)
  }

  const refreshInbox = useCallback(async () => {
    if (!me?.id) return
    const { data } = await supabase.from('chat_messages')
      .select('*')
      .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
      .order('created_at', { ascending: true })
    const map = {}
    ;(data || []).forEach(m => {
      const otherId = m.sender_id === me.id ? m.recipient_id : m.sender_id
      if (!map[otherId]) map[otherId] = { lastMessage: m, unread: 0 }
      map[otherId].lastMessage = m
      if (m.recipient_id === me.id && !m.read) map[otherId].unread++
    })
    setInbox(map)
  }, [me?.id])

  // ── Realtime — recebe mensagem mesmo com o widget fechado ──────
  useEffect(() => {
    if (!me?.id) return
    const channel = supabase.channel('chat-' + me.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `recipient_id=eq.${me.id}`,
      }, payload => handleIncoming(payload.new))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `sender_id=eq.${me.id}`,
      }, payload => {
        // Uma mensagem MINHA foi marcada como lida do outro lado —
        // atualiza na hora se for a conversa que está aberta agora
        const updated = payload.new
        if (activeUserRef.current && updated.recipient_id === activeUserRef.current.id) {
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, read: updated.read } : m))
        }
      })
      .subscribe(status => {
        console.log('[Chat] status da conexão em tempo real:', status)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Chat] Tempo real falhou — provavelmente falta rodar: alter publication supabase_realtime add table chat_messages;')
        }
      })
    return () => { supabase.removeChannel(channel) }
  }, [me?.id])

  // ── Realtime — minha lista de grupos muda (fui add/removido) ────
  useEffect(() => {
    if (!me?.id) return
    const channel = supabase.channel('chat-membership-' + me.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_group_members', filter: `user_id=eq.${me.id}`,
      }, () => {
        loadGroups().then(refreshGroupUnread)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [me?.id])

  // ── Realtime — grupos: um canal por grupo que eu participo ──────
  useEffect(() => {
    if (!me?.id || !groups.length) return
    const channels = groups.map(g =>
      supabase.channel('chat-group-' + g.id)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `group_id=eq.${g.id}`,
        }, payload => handleGroupIncoming(payload.new, g))
        .subscribe()
    )
    return () => { channels.forEach(c => supabase.removeChannel(c)) }
  }, [me?.id, groups.map(g => g.id).join(',')])

  function handleGroupIncoming(msg, group) {
    if (msg.sender_id === me.id) return // já é meu, veio da própria inserção
    playBeep()
    if (document.hidden) startTitleFlash()

    const isCurrentGroup = openRef.current && activeGroupRef.current?.id === group.id
    if (isCurrentGroup) {
      setMessages(prev => [...prev, msg])
      supabase.from('chat_group_reads').upsert(
        { group_id: group.id, user_id: me.id, last_read_at: new Date().toISOString() },
        { onConflict: 'group_id,user_id' }
      )
    } else {
      setGroupUnread(prev => ({ ...prev, [group.id]: (prev[group.id] || 0) + 1 }))
      const sender = users.find(u => u.id === msg.sender_id)
      const toastId = crypto.randomUUID()
      setToasts(prev => [...prev, { id: toastId, user: { name: `${group.name} · ${sender?.name || '?'}` }, body: msg.body || '📎 Anexo', groupId: group.id }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 6000)
    }
  }

  function handleIncoming(msg) {
    playBeep()
    if (document.hidden) startTitleFlash()

    const isCurrentConvo = openRef.current && activeUserRef.current?.id === msg.sender_id
    if (isCurrentConvo) {
      setMessages(prev => [...prev, msg])
      supabase.from('chat_messages').update({ read: true }).eq('id', msg.id)
    } else {
      const sender = users.find(u => u.id === msg.sender_id)
      const toastId = crypto.randomUUID()
      setToasts(prev => [...prev, { id: toastId, user: sender, body: msg.body || '📎 Anexo', senderId: msg.sender_id }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 6000)
    }
    refreshInbox()
  }

  function dismissToast(id) { setToasts(prev => prev.filter(t => t.id !== id)) }

  async function openConversation(user) {
    stopTitleFlash()
    setActiveUser(user); setActiveGroup(null); setView('conversation'); setOpen(true)
    setTimeout(() => draftInputRef.current?.focus(), 50) // espera o painel montar
    const { data } = await supabase.from('chat_messages')
      .select('*')
      .or(`and(sender_id.eq.${me.id},recipient_id.eq.${user.id}),and(sender_id.eq.${user.id},recipient_id.eq.${me.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    await supabase.from('chat_messages').update({ read: true }).eq('sender_id', user.id).eq('recipient_id', me.id).eq('read', false)
    refreshInbox()
    setToasts(prev => prev.filter(t => t.senderId !== user.id))
  }

  async function openGroupConversation(group) {
    stopTitleFlash()
    setActiveGroup(group); setActiveUser(null); setView('conversation'); setOpen(true)
    setTimeout(() => draftInputRef.current?.focus(), 50)
    const { data } = await supabase.from('chat_messages')
      .select('*, sender:system_users!sender_id(name)')
      .eq('group_id', group.id)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    await supabase.from('chat_group_reads').upsert(
      { group_id: group.id, user_id: me.id, last_read_at: new Date().toISOString() },
      { onConflict: 'group_id,user_id' }
    )
    setGroupUnread(prev => ({ ...prev, [group.id]: 0 }))
    setToasts(prev => prev.filter(t => t.groupId !== group.id))
  }

  function openFromToast(toast) {
    dismissToast(toast.id)
    if (toast.groupId) {
      const group = groups.find(g => g.id === toast.groupId)
      if (group) openGroupConversation(group)
      return
    }
    const user = toast.user || users.find(u => u.id === toast.senderId)
    if (user) openConversation(user)
  }

  async function sendMessage() {
    if (!draft.trim() || (!activeUser && !activeGroup) || sending) return
    setSending(true)
    const body = draft.trim()
    setDraft('')
    const payload = activeGroup
      ? { sender_id: me.id, group_id: activeGroup.id, body }
      : { sender_id: me.id, recipient_id: activeUser.id, body }
    const { data, error } = await supabase.from('chat_messages')
      .insert(payload)
      .select('*, sender:system_users!sender_id(name)').single()
    if (!error && data) {
      setMessages(prev => [...prev, data])
      if (activeGroup) {
        supabase.from('chat_group_reads').upsert(
          { group_id: activeGroup.id, user_id: me.id, last_read_at: new Date().toISOString() },
          { onConflict: 'group_id,user_id' }
        )
      } else {
        refreshInbox()
      }
    }
    setSending(false)
  }

  async function uploadAndSendFile(file) {
    if (!file || (!activeUser && !activeGroup)) return
    if (file.size > MAX_ATTACHMENT_SIZE) { toast.error('Arquivo muito grande — máximo de 5MB.'); return }

    setUploadingFile(true)
    try {
      const path = `${me.id}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('chat-attachments').upload(path, file)
      if (upErr) throw upErr

      const payload = activeGroup
        ? { sender_id: me.id, group_id: activeGroup.id, body: draft.trim() || null,
            attachment_url: path, attachment_name: file.name, attachment_type: file.type }
        : { sender_id: me.id, recipient_id: activeUser.id, body: draft.trim() || null,
            attachment_url: path, attachment_name: file.name, attachment_type: file.type }

      const { data, error } = await supabase.from('chat_messages').insert(payload)
        .select('*, sender:system_users!sender_id(name)').single()
      if (error) throw error

      setMessages(prev => [...prev, data])
      setDraft('')
      if (activeGroup) {
        supabase.from('chat_group_reads').upsert(
          { group_id: activeGroup.id, user_id: me.id, last_read_at: new Date().toISOString() },
          { onConflict: 'group_id,user_id' }
        )
      } else {
        refreshInbox()
      }
    } catch (err) {
      toast.error('Erro ao enviar arquivo: ' + err.message)
    } finally {
      setUploadingFile(false)
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    await uploadAndSendFile(file)
  }

  // Cola print/imagem direto do clipboard (Ctrl+V) — bem comum no dia a dia
  async function handlePasteImage(e) {
    const files = e.clipboardData?.files
    const items = e.clipboardData?.items
    console.log('[Chat] Ctrl+V detectado — files:', files?.length, 'items:', items?.length)

    // Caminho 1: via clipboardData.files (mais direto, funciona na maioria dos navegadores)
    if (files && files.length > 0) {
      const imgFile = [...files].find(f => f.type.startsWith('image/'))
      if (imgFile) {
        e.preventDefault()
        const named = new File([imgFile], `print-${Date.now()}.png`, { type: imgFile.type })
        await uploadAndSendFile(named)
        return
      }
    }

    // Caminho 2 (reserva): via clipboardData.items
    if (!items) { console.log('[Chat] Nenhum clipboardData.items disponível'); return }
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const named = new File([file], `print-${Date.now()}.png`, { type: file.type })
          await uploadAndSendFile(named)
        }
        return
      }
    }
    console.log('[Chat] Nada de imagem encontrado no que foi colado')
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, view])

  if (!me?.id) return null

  const totalUnread = Object.values(inbox).reduce((a, c) => a + c.unread, 0)
    + Object.values(groupUnread).reduce((a, c) => a + c, 0)
  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))
  const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
  const withConvo = filteredUsers
    .filter(u => inbox[u.id])
    .sort((a, b) => new Date(inbox[b.id].lastMessage.created_at) - new Date(inbox[a.id].lastMessage.created_at))
  const withoutConvo = filteredUsers
    .filter(u => !inbox[u.id])
    .sort((a, b) => a.name.localeCompare(b.name))

  function ContactRow({ u }) {
    const info = inbox[u.id]
    return (
      <button onClick={() => openConversation(u)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50 text-left">
        <Avatar name={u.name} photoUrl={u.photo_url} size={36} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-700 truncate">{u.name}</p>
          <p className="text-xs text-slate-400 truncate">
            {info?.lastMessage
              ? (info.lastMessage.sender_id === me.id ? 'Você: ' : '') + (info.lastMessage.body || '📎 Anexo')
              : 'Iniciar conversa'}
          </p>
        </div>
        {info?.unread > 0 && (
          <span className="w-5 h-5 rounded-full bg-rose-400 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{info.unread}</span>
        )}
      </button>
    )
  }

  function GroupRow({ g }) {
    const unread = groupUnread[g.id] || 0
    return (
      <button onClick={() => openGroupConversation(g)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50 text-left">
        <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
          <Users size={16} className="text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-700 truncate">{g.name}</p>
          <p className="text-xs text-slate-400 truncate">Grupo</p>
        </div>
        {unread > 0 && (
          <span className="w-5 h-5 rounded-full bg-rose-400 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{unread}</span>
        )}
      </button>
    )
  }

  const pinButton = (
    <button onClick={() => setMode(mode === 'docked' ? 'floating' : 'docked')}
      className="p-1 text-white/70 hover:text-white" title={mode === 'docked' ? 'Soltar (voltar a balão flutuante)' : 'Fixar chat na lateral da tela'}>
      {mode === 'docked' ? <PinOff size={16} /> : <Pin size={16} />}
    </button>
  )

  const panelBody = view === 'list' ? (
    <>
      <div className="bg-[#3D1F0D] px-4 py-3.5 flex items-center justify-between shrink-0">
        <p className="text-white font-bold text-sm">Conversas</p>
        <div className="flex items-center gap-1">
          {pinButton}
          {mode !== 'docked' && (
            <button onClick={() => setOpen(false)} className="p-1 text-white/70 hover:text-white"><X size={18} /></button>
          )}
        </div>
      </div>
      <div className="p-3 border-b border-slate-100 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="w-full text-sm pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:border-rose-200"
            placeholder="Buscar colaborador..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredGroups.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-4 pt-3 pb-1">Grupos</p>
            <div className="divide-y divide-slate-50">
              {filteredGroups.map(g => <GroupRow key={g.id} g={g} />)}
            </div>
          </>
        )}
        {withConvo.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-4 pt-3 pb-1">Conversas</p>
            <div className="divide-y divide-slate-50">
              {withConvo.map(u => <ContactRow key={u.id} u={u} />)}
            </div>
          </>
        )}
        {withoutConvo.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-4 pt-3 pb-1">Todos os colaboradores</p>
            <div className="divide-y divide-slate-50">
              {withoutConvo.map(u => <ContactRow key={u.id} u={u} />)}
            </div>
          </>
        )}
      </div>
    </>
  ) : (
    <>
      <div className="bg-[#3D1F0D] px-3 py-3 flex items-center gap-2.5 shrink-0">
        <button onClick={() => setView('list')} className="p-1 text-white/70 hover:text-white"><ArrowLeft size={18} /></button>
        {activeGroup ? (
          <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
            <Users size={15} className="text-white" />
          </div>
        ) : (
          <Avatar name={activeUser?.name} photoUrl={activeUser?.photo_url} size={32} />
        )}
        <p className="text-white font-bold text-sm flex-1 truncate">{activeGroup ? activeGroup.name : activeUser?.name}</p>
        {pinButton}
        {mode !== 'docked' && (
          <button onClick={() => setOpen(false)} className="p-1 text-white/70 hover:text-white"><X size={18} /></button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-1 bg-slate-50">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-slate-400 mt-8">Nenhuma mensagem ainda — manda um oi 👋</p>
        ) : messages.map((m, idx) => {
          const mine = m.sender_id === me.id
          const prevDay = idx > 0 ? new Date(messages[idx - 1].created_at).toDateString() : null
          const thisDay = new Date(m.created_at).toDateString()
          const showDivider = thisDay !== prevDay
          return (
            <div key={m.id}>
              {showDivider && (
                <div className="flex justify-center my-2">
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-200/70 px-2.5 py-1 rounded-full">{dayLabel(m.created_at)}</span>
                </div>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'} mb-1`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-rose-400 text-white rounded-br-sm' : 'bg-white text-slate-700 border border-slate-100 rounded-bl-sm'}`}>
                  {activeGroup && !mine && (
                    <p className="text-[10px] font-bold text-violet-500 mb-0.5">{m.sender?.name || 'Alguém'}</p>
                  )}
                  {m.attachment_url && <ChatAttachment url={m.attachment_url} name={m.attachment_name} type={m.attachment_type} mine={mine} />}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <p className={`text-[10px] mt-0.5 text-right flex items-center justify-end gap-1 ${mine ? 'text-white/70' : 'text-slate-300'}`}>
                    {fmtTime(m.created_at)}
                    {mine && !activeGroup && (
                      m.read ? <CheckCheck size={13} className="text-sky-200" /> : <Check size={13} />
                    )}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="p-2.5 border-t border-slate-100 flex items-center gap-2 shrink-0">
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" />
        <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}
          className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 disabled:opacity-40" title="Anexar arquivo (máx 5MB)">
          <Paperclip size={15} />
        </button>
        <input
          ref={draftInputRef}
          className="flex-1 text-sm px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:border-rose-200"
          placeholder={uploadingFile ? 'Enviando arquivo...' : 'Escreva uma mensagem...'} value={draft} disabled={uploadingFile}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          onPaste={handlePasteImage}
        />
        <button onClick={sendMessage} disabled={!draft.trim() || sending || uploadingFile}
          className="w-9 h-9 rounded-xl bg-rose-400 hover:bg-rose-500 text-white flex items-center justify-center shrink-0 disabled:opacity-40">
          <Send size={15} />
        </button>
      </div>
    </>
  )

  // ── Modo FIXO — painel sempre visível na lateral direita ──────
  if (mode === 'docked') {
    return (
      <>
        <div className="fixed top-16 flex flex-col gap-2 items-end z-[1000]" style={{ right: DOCKED_WIDTH + 16, fontFamily: 'Nunito,sans-serif' }}>
          {toasts.map(t => (
            <div key={t.id} onClick={() => openFromToast(t)} role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') openFromToast(t) }}
              className="w-72 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 flex items-start gap-2.5 text-left hover:shadow-2xl transition-shadow animate-fade-in cursor-pointer">
              <Avatar name={t.user?.name} photoUrl={t.user?.photo_url} size={36} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700">{t.user?.name || 'Alguém'}</p>
                <p className="text-xs text-slate-500 truncate">{t.body}</p>
              </div>
              <button onClick={e => { e.stopPropagation(); dismissToast(t.id) }} className="p-1 text-slate-300 hover:text-slate-500 shrink-0">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="fixed top-0 right-0 bottom-0 z-[999] flex flex-col bg-white border-l border-slate-100 shadow-xl"
          style={{ width: DOCKED_WIDTH, fontFamily: 'Nunito,sans-serif' }}>
          {panelBody}
        </div>
      </>
    )
  }

  // ── Modo BALÃO FLUTUANTE (padrão) ──────────────────────────────
  return (
    <div className="fixed bottom-24 right-5 md:bottom-5 z-[999] flex flex-col items-end gap-3" style={{ fontFamily: 'Nunito,sans-serif' }}>

      {/* Toasts de mensagem nova */}
      <div className="flex flex-col gap-2 items-end">
        {toasts.map(t => (
          <div key={t.id} onClick={() => openFromToast(t)} role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter') openFromToast(t) }}
            className="w-72 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 flex items-start gap-2.5 text-left hover:shadow-2xl transition-shadow animate-fade-in cursor-pointer">
            <Avatar name={t.user?.name} photoUrl={t.user?.photo_url} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700">{t.user?.name || 'Alguém'}</p>
              <p className="text-xs text-slate-500 truncate">{t.body}</p>
            </div>
            <button onClick={e => { e.stopPropagation(); dismissToast(t.id) }} className="p-1 text-slate-300 hover:text-slate-500 shrink-0">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Painel do chat */}
      {open && (
        <div className="w-80 h-[480px] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
          {panelBody}
        </div>
      )}

      {/* Balão flutuante */}
      <button onClick={() => { setOpen(v => !v); if (!open) { setView('list'); stopTitleFlash() } }}
        className="w-14 h-14 rounded-full bg-[#3D1F0D] hover:bg-[#2A1509] text-white shadow-xl flex items-center justify-center relative transition-transform hover:scale-105">
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>
    </div>
  )
}
