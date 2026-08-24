import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Lock, Plus, Eye, EyeOff, Copy, Check, Search,
  Globe, Mail, User, StickyNote, Trash2, Pencil,
  X, ShieldCheck, ChevronDown, ChevronRight,
  ShoppingBag, MessageSquare, DollarSign, LayoutGrid,
} from 'lucide-react'

// ─── Categorias ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'ecommerce',    label: 'E-commerce',     icon: ShoppingBag,   color: 'text-orange-500',  bg: 'bg-orange-50',  border: 'border-orange-200' },
  { key: 'email',        label: 'E-mail',          icon: Mail,          color: 'text-blue-500',    bg: 'bg-blue-50',    border: 'border-blue-200'   },
  { key: 'social',       label: 'Redes Sociais',   icon: MessageSquare, color: 'text-purple-500',  bg: 'bg-purple-50',  border: 'border-purple-200' },
  { key: 'financeiro',   label: 'Financeiro',      icon: DollarSign,    color: 'text-green-500',   bg: 'bg-green-50',   border: 'border-green-200'  },
  { key: 'outros',       label: 'Outros',          icon: LayoutGrid,    color: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200'  },
]

const EMPTY_FORM = {
  category: 'ecommerce',
  title: '',
  username: '',
  password: '',
  url: '',
  email: '',
  responsible: '',
  notes: '',
}

// ─── Componente de campo com copiar ──────────────────────────────────────────
function CopyField({ label, value, secret }) {
  const [show,   setShow]   = useState(false)
  const [copied, setCopied] = useState(false)

  if (!value) return null

  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className="text-sm text-slate-700 font-mono flex-1 truncate">
          {secret && !show ? '••••••••••' : value}
        </p>
        <div className="flex gap-1 shrink-0">
          {secret && (
            <button
              onClick={() => setShow(s => !s)}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {show ? <EyeOff size={13} strokeWidth={1.5} /> : <Eye size={13} strokeWidth={1.5} />}
            </button>
          )}
          <button
            onClick={copy}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} strokeWidth={1.5} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card de senha ────────────────────────────────────────────────────────────
function VaultCard({ item, onEdit, onDelete, catCfg }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = catCfg?.icon || Lock

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-md ${catCfg?.border || 'border-slate-200'}`}>
      {/* Header do card */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${catCfg?.bg || 'bg-slate-50'}`}>
          <Icon size={15} strokeWidth={1.5} className={catCfg?.color || 'text-slate-500'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
          {item.url && (
            <p className="text-xs text-slate-400 truncate">{item.url.replace(/^https?:\/\//, '')}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onEdit(item) }}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Pencil size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(item) }}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
          {expanded
            ? <ChevronDown size={14} className="text-slate-400" />
            : <ChevronRight size={14} className="text-slate-400" />
          }
        </div>
      </div>

      {/* Detalhes expandidos */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
          <CopyField label="Usuário / Login" value={item.username} />
          <CopyField label="Senha" value={item.password} secret />
          <CopyField label="E-mail vinculado" value={item.email} />
          <CopyField label="URL" value={item.url} />
          {item.responsible && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Responsável</p>
              <p className="text-sm text-slate-700">{item.responsible}</p>
            </div>
          )}
          {item.notes && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Notas</p>
              <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 whitespace-pre-wrap">{item.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Modal de criar/editar ────────────────────────────────────────────────────
function VaultModal({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [showPwd, setShowPwd] = useState(false)
  const firstRef = useRef()

  useEffect(() => { firstRef.current?.focus() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={18} strokeWidth={1.5} className="text-slate-600" />
            <h3 className="font-semibold text-slate-800">
              {initial?.id ? 'Editar credencial' : 'Nova credencial'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          {/* Categoria */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Categoria</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => set('category', cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    form.category === cat.key
                      ? `${cat.bg} ${cat.border} ${cat.color}`
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <cat.icon size={12} strokeWidth={1.5} />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">
              Nome <span className="text-red-400">*</span>
            </label>
            <input
              ref={firstRef}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              autoComplete="off"
              placeholder="Ex: Shopee - Conta Principal"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>

          {/* Usuário + Senha lado a lado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Usuário / Login</label>
              <input
                value={form.username}
                onChange={e => set('username', e.target.value)}
                autoComplete="new-password"
                placeholder="usuario@..."
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                Senha <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-slate-400 transition-colors"
                />
                <button
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Email + URL */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">E-mail vinculado</label>
              <input
                value={form.email}
                onChange={e => set('email', e.target.value)}
                autoComplete="new-password"
                placeholder="email@empresa.com"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">URL do site</label>
              <input
                value={form.url}
                onChange={e => set('url', e.target.value)}
                autoComplete="off"
                placeholder="https://..."
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 transition-colors"
              />
            </div>
          </div>

          {/* Responsável */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Responsável</label>
            <input
              value={form.responsible}
              onChange={e => set('responsible', e.target.value)}
              autoComplete="off"
              placeholder="Nome de quem gerencia este acesso"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Notas</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              autoComplete="off"
              placeholder="Informações adicionais, instruções de 2FA, etc."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.title.trim() || !form.password.trim() || saving}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>{initial?.id ? 'Salvar alterações' : 'Adicionar'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function VaultPage() {
  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [activeCat,   setActiveCat]   = useState('all')
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editItem,    setEditItem]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [deleteItem,  setDeleteItem]  = useState(null)
  const [deleting,    setDeleting]    = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('password_vault')
      .select('*')
      .order('category')
      .order('title')
    setItems(data || [])
    setLoading(false)
  }

  async function handleSave(form) {
    setSaving(true)
    if (form.id) {
      await supabase.from('password_vault').update({
        category:    form.category,
        title:       form.title,
        username:    form.username,
        password:    form.password,
        url:         form.url,
        email:       form.email,
        responsible: form.responsible,
        notes:       form.notes,
        updated_at:  new Date().toISOString(),
      }).eq('id', form.id)
    } else {
      await supabase.from('password_vault').insert({
        category:    form.category,
        title:       form.title,
        username:    form.username,
        password:    form.password,
        url:         form.url,
        email:       form.email,
        responsible: form.responsible,
        notes:       form.notes,
      })
    }
    setSaving(false)
    setModalOpen(false)
    setEditItem(null)
    load()
  }

  async function handleDelete() {
    if (!deleteItem) return
    setDeleting(true)
    await supabase.from('password_vault').delete().eq('id', deleteItem.id)
    setDeleting(false)
    setDeleteItem(null)
    load()
  }

  // Filtra por busca e categoria
  const filtered = items.filter(item => {
    const matchCat = activeCat === 'all' || item.category === activeCat
    const q = search.toLowerCase()
    const matchSearch = !q || [item.title, item.username, item.email, item.url, item.notes]
      .some(v => v && v.toLowerCase().includes(q))
    return matchCat && matchSearch
  })

  // Agrupa por categoria para exibição
  const grouped = CATEGORIES.reduce((acc, cat) => {
    const catItems = filtered.filter(i => i.category === cat.key)
    if (catItems.length > 0) acc.push({ cat, items: catItems })
    return acc
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
              <Lock size={18} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Cofre de Senhas</h1>
              <p className="text-sm text-slate-500">Acesso restrito à diretoria</p>
            </div>
          </div>
          <button
            onClick={() => { setEditItem(null); setModalOpen(true) }}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus size={16} strokeWidth={1.5} />
            Nova credencial
          </button>
        </div>

        {/* Busca + filtro de categoria */}
        <div className="space-y-3">
          <div className="relative">
            <Search size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoComplete="off"
              placeholder="Buscar por nome, usuário, email..."
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:border-slate-400 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filtros de categoria */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveCat('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                activeCat === 'all'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              Todas ({items.length})
            </button>
            {CATEGORIES.map(cat => {
              const count = items.filter(i => i.category === cat.key).length
              if (count === 0) return null
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCat(activeCat === cat.key ? 'all' : cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    activeCat === cat.key
                      ? `${cat.bg} ${cat.border} ${cat.color}`
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <cat.icon size={11} strokeWidth={1.5} />
                  {cat.label} ({count})
                </button>
              )
            })}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <Lock size={36} strokeWidth={1} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-medium">Nenhuma credencial ainda</p>
            <p className="text-sm text-slate-400 mt-1">Clique em "Nova credencial" para começar</p>
          </div>
        )}

        {/* Sem resultados na busca */}
        {!loading && items.length > 0 && filtered.length === 0 && (
          <div className="text-center py-10 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-500">Nenhuma credencial encontrada para "{search}"</p>
          </div>
        )}

        {/* Lista agrupada por categoria */}
        {!loading && grouped.map(({ cat, items: catItems }) => (
          <div key={cat.key} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <cat.icon size={13} strokeWidth={1.5} className={cat.color} />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cat.label}</p>
              <span className="text-xs text-slate-400">({catItems.length})</span>
            </div>
            <div className="space-y-2">
              {catItems.map(item => (
                <VaultCard
                  key={item.id}
                  item={item}
                  catCfg={cat}
                  onEdit={i => { setEditItem(i); setModalOpen(true) }}
                  onDelete={i => setDeleteItem(i)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal criar/editar */}
      {modalOpen && (
        <VaultModal
          initial={editItem}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditItem(null) }}
          saving={saving}
        />
      )}

      {/* Modal confirmar exclusão */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                <Trash2 size={16} strokeWidth={1.5} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Excluir credencial?</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  "<span className="font-medium">{deleteItem.title}</span>" será removida permanentemente.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteItem(null)}
                className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 rounded-lg transition-colors"
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
