import { useState, useEffect } from 'react'
import { Users, Plus, X, Trash2, Pencil, Check, Search, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchGroups, createGroup, renameGroup, addMember, removeMember, deleteGroup } from './hooks/useChatGroups'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}
function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

// ─── Modal: criar novo grupo ────────────────────────────────────
function NewGroupModal({ open, onClose, users, onCreate }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (!name.trim() || selected.size === 0) return
    setSaving(true)
    try {
      await onCreate(name.trim(), [...selected])
      setName(''); setSelected(new Set()); setSearch('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-6 flex flex-col gap-4 max-h-[85vh]">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>Novo grupo</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        <input className="input" autoFocus placeholder="Nome do grupo" value={name} onChange={e => setName(e.target.value)} />

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5 block">Participantes ({selected.size})</label>
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="w-full text-sm pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-100"
              placeholder="Buscar colaborador..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="border border-slate-200 rounded-xl max-h-64 overflow-y-auto divide-y divide-slate-50">
            {filtered.map(u => {
              const isSel = selected.has(u.id)
              return (
                <button key={u.id} type="button" onClick={() => toggle(u.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 ${isSel ? 'bg-rose-50/60' : ''}`}>
                  <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${isSel ? 'bg-rose-400 border-rose-400' : 'border-slate-300'}`}>
                    {isSel && <Check size={11} className="text-white" />}
                  </div>
                  <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center text-[10px] font-black text-rose-500 shrink-0">
                    {initials(u.name)}
                  </div>
                  <span className="text-sm text-slate-700 flex-1 truncate">{u.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <button onClick={handleCreate} disabled={!name.trim() || selected.size === 0 || saving} className="btn-primary justify-center disabled:opacity-50">
          {saving ? 'Criando...' : 'Criar grupo'}
        </button>
      </div>
    </div>
  )
}

// ─── Modal: gerenciar membros de um grupo existente ─────────────
function ManageGroupModal({ group, open, onClose, users, onChanged }) {
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  useEffect(() => { if (group) setNameDraft(group.name) }, [group])

  if (!open || !group) return null

  const memberIds = new Set((group.members || []).map(m => m.user_id))
  const nonMembers = users.filter(u => !memberIds.has(u.id) && u.name.toLowerCase().includes(search.toLowerCase()))

  async function handleAdd(userId) {
    setBusy(true)
    try { await addMember(group.id, userId, getSession().id); await onChanged() } finally { setBusy(false) }
  }
  async function handleRemove(userId) {
    setBusy(true)
    try { await removeMember(group.id, userId); await onChanged() } finally { setBusy(false) }
  }
  async function handleRename() {
    if (!nameDraft.trim() || nameDraft === group.name) { setEditingName(false); return }
    setBusy(true)
    try { await renameGroup(group.id, nameDraft.trim()); await onChanged(); setEditingName(false) } finally { setBusy(false) }
  }
  async function handleDelete() {
    if (!confirm(`Excluir o grupo "${group.name}"? Isso apaga o histórico de mensagens dele também.`)) return
    setBusy(true)
    try { await deleteGroup(group.id); await onChanged(); onClose() } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-6 flex flex-col gap-4 max-h-[85vh]">
        <div className="flex items-center justify-between">
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input className="input flex-1" autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRename()} />
              <button onClick={handleRename} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600"><Check size={16} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>{group.name}</h3>
              <button onClick={() => setEditingName(true)} className="p-1 rounded-lg text-slate-300 hover:text-slate-500"><Pencil size={13} /></button>
            </div>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5 block">Membros ({group.members?.length || 0})</label>
          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
            {(group.members || []).map(m => (
              <div key={m.user_id} className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2">
                <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center text-[10px] font-black text-rose-500 shrink-0">
                  {initials(m.member?.name)}
                </div>
                <span className="text-sm text-slate-700 flex-1 truncate">{m.member?.name}</span>
                <button onClick={() => handleRemove(m.user_id)} disabled={busy} className="text-slate-300 hover:text-rose-500 shrink-0">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5 block">Adicionar</label>
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="w-full text-sm pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-100"
              placeholder="Buscar colaborador..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-slate-50">
            {nonMembers.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Ninguém encontrado</p>
            ) : nonMembers.map(u => (
              <button key={u.id} onClick={() => handleAdd(u.id)} disabled={busy}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50">
                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0">
                  {initials(u.name)}
                </div>
                <span className="text-sm text-slate-700 flex-1 truncate">{u.name}</span>
                <UserPlus size={14} className="text-emerald-500 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleDelete} disabled={busy}
          className="flex items-center justify-center gap-2 text-sm font-semibold text-rose-500 hover:text-rose-600 py-2">
          <Trash2 size={14} /> Excluir grupo
        </button>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export function ChatGroupsPage() {
  const [groups, setGroups] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [managing, setManaging] = useState(null)
  const me = getSession()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [g, { data: u }] = await Promise.all([
        fetchGroups(),
        supabase.from('system_users').select('id,name').eq('active', true).order('name'),
      ])
      setGroups(g)
      setUsers(u || [])
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(name, memberIds) {
    try {
      await createGroup(name, memberIds, me.id)
      toast.success('Grupo criado!')
      await load()
    } catch (err) {
      toast.error('Erro ao criar grupo: ' + err.message)
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2" style={{ fontFamily: 'Nunito,sans-serif' }}>
            <Users size={22} className="text-rose-400" /> Grupos de Chat
          </h1>
          <p className="text-sm text-slate-400">Grupos aparecem no chat de todo mundo que for adicionado</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Novo grupo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-7 h-7 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" /></div>
      ) : groups.length === 0 ? (
        <div className="card text-center py-12">
          <Users size={32} className="mx-auto mb-2 text-slate-200" />
          <p className="text-slate-400 text-sm">Nenhum grupo criado ainda</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map(g => (
            <button key={g.id} onClick={() => setManaging(g)}
              className="card text-left hover:shadow-md transition-shadow flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                  <Users size={18} className="text-violet-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{g.name}</p>
                  <p className="text-xs text-slate-400">{g.members?.length || 0} membro(s)</p>
                </div>
              </div>
              <div className="flex -space-x-2">
                {(g.members || []).slice(0, 5).map(m => (
                  <div key={m.user_id} className="w-7 h-7 rounded-full bg-rose-100 border-2 border-white flex items-center justify-center text-[9px] font-black text-rose-500">
                    {initials(m.member?.name)}
                  </div>
                ))}
                {(g.members?.length || 0) > 5 && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[9px] font-black text-slate-500">
                    +{g.members.length - 5}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <NewGroupModal open={showNew} onClose={() => setShowNew(false)} users={users} onCreate={handleCreate} />
      <ManageGroupModal group={groups.find(g => g.id === managing?.id)} open={!!managing} onClose={() => setManaging(null)} users={users} onChanged={load} />
    </div>
  )
}
