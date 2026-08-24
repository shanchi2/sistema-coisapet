import { useState, useEffect, useCallback } from 'react'
import {
  ShoppingCart, Plus, X, Check, Loader2,
  Filter, CheckCircle2, Circle, Pencil, Trash2, AlertTriangle,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const CAT_CFG = {
  barracao:      { label: 'Barracão',       color: '#6366f1' },
  infraestrutura:{ label: 'Infraestrutura', color: '#0ea5e9' },
  maquinas:      { label: 'Máquinas',       color: '#f59e0b' },
  outros:        { label: 'Outros',         color: '#94a3b8' },
}

const COLUMNS = [
  { id: 'aquisicao_pendente',   type: 'aquisicao', status: 'pendente',   label: 'A Comprar',  icon: ShoppingCart, color: '#f59e0b', bg: 'bg-amber-50/60'   },
  { id: 'aquisicao_prioridade', type: 'aquisicao', status: 'prioridade', label: 'Prioridade', icon: AlertTriangle, color: '#ef4444', bg: 'bg-rose-50/60'   },
  { id: 'aquisicao_concluido',  type: 'aquisicao', status: 'concluido',  label: 'Comprado',   icon: CheckCircle2, color: '#22c55e', bg: 'bg-emerald-50/60' },
]

const EMPTY_FORM = {
  title: '', description: '', type: 'aquisicao',
  status: 'pendente', category: 'barracao', assigned_to: '',
  completed_at: '', purchase_value: '', purchase_date: '',
}

// ── Modal de conclusão de compra ──────────────────────────────
function CompleteModal({ task, onClose, onConfirm }) {
  const today = new Date().toISOString().split('T')[0]
  const [value,  setValue]  = useState('')
  const [date,   setDate]   = useState(today)
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    const numValue = value
      ? parseFloat(value.replace(/\./g,'').replace(',','.'))
      : null
    await onConfirm({ value: numValue, date })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Registrar compra</h3>
          <p className="text-sm text-slate-400 mt-0.5 truncate">{task.title}</p>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div>
            <label className="form-label">Valor pago <span className="text-slate-400 font-normal">(opcional)</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
              <input type="text" className="input pl-8" placeholder="0,00" value={value}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g,'')
                  if (!digits) { setValue(''); return }
                  setValue((parseInt(digits,10)/100).toLocaleString('pt-BR',{minimumFractionDigits:2}))
                }}/>
            </div>
          </div>
          <div>
            <label className="form-label">Data da compra</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)}/>
            <p className="text-[11px] text-slate-400 mt-1">Padrão: hoje. Altere se a compra foi em outra data.</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleConfirm} disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin"/> : <ShoppingCart size={15}/>}
            Marcar como comprado
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de criação/edição ────────────────────────────────────
function TaskModal({ open, onClose, onSave, users, initial }) {
  const isEditing = !!initial?.id
  const [form, setForm]   = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(initial ? {
      title:          initial.title          ?? '',
      description:    initial.description    ?? '',
      type:           'aquisicao',
      status:         initial.status         ?? 'pendente',
      category:       initial.category       ?? 'barracao',
      assigned_to:    initial.assigned_to    ?? '',
      completed_at:   initial.completed_at   ?? '',
      purchase_value: initial.purchase_value
        ? Number(initial.purchase_value).toLocaleString('pt-BR',{minimumFractionDigits:2})
        : '',
      purchase_date:  initial.purchase_date  ?? '',
    } : EMPTY_FORM)
  }, [open, initial])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Título obrigatório'); return }
    setSaving(true)
    await onSave({ ...form, assigned_to: form.assigned_to || null })
    setSaving(false)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <ShoppingCart size={18} className="text-amber-500"/>
            {isEditing ? 'Editar compra' : 'Nova compra'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={17}/></button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {/* Status */}
          <div>
            <label className="form-label">Status</label>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => set('status', 'pendente')}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all
                  ${form.status === 'pendente' ? 'bg-amber-50 text-amber-600 border-amber-300' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                <ShoppingCart size={15}/> A Comprar
              </button>
              <button onClick={() => set('status', 'prioridade')}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all
                  ${form.status === 'prioridade' ? 'bg-rose-50 text-rose-600 border-rose-300' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                <AlertTriangle size={15}/> Prioridade
              </button>
              <button onClick={() => set('status', 'concluido')}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all
                  ${form.status === 'concluido' ? 'bg-emerald-50 text-emerald-600 border-emerald-300' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                <CheckCircle2 size={15}/> Comprado
              </button>
            </div>
          </div>

          <div>
            <label className="form-label">Título *</label>
            <input className="input" placeholder="Ex: Ventilador para o galpão"
              value={form.title} onChange={e => set('title', e.target.value)}/>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Categoria</label>
              <select className="select" value={form.category} onChange={e => set('category', e.target.value)}>
                {Object.entries(CAT_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Responsável</label>
              <select className="select" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
                <option value="">Sem responsável</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Descrição <span className="text-slate-400 font-normal">(opcional)</span></label>
            <textarea className="textarea resize-none" rows={3} placeholder="Detalhes do item a ser adquirido..."
              value={form.description} onChange={e => set('description', e.target.value)}/>
          </div>

          {/* Campos de compra — só quando concluído */}
          {form.status === 'concluido' && (
            <div className="flex flex-col gap-3 p-3 rounded-xl border bg-amber-50 border-amber-200">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">🛒 Dados da compra</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Valor pago (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                    <input type="text" className="input pl-8" placeholder="0,00"
                      value={form.purchase_value}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g,'')
                        if (!digits) { set('purchase_value',''); return }
                        set('purchase_value',(parseInt(digits,10)/100).toLocaleString('pt-BR',{minimumFractionDigits:2}))
                      }}/>
                  </div>
                </div>
                <div>
                  <label className="form-label">Data da compra</label>
                  <input type="date" className="input" value={form.purchase_date}
                    onChange={e => set('purchase_date', e.target.value)}/>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !form.title.trim()} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>}
            {isEditing ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card individual ────────────────────────────────────────────
function TaskCard({ task, users, onEdit, onDelete, onMoveStatus }) {
  const [expanded, setExpanded] = useState(false)
  const cat      = CAT_CFG[task.category] ?? CAT_CFG.outros
  const assigned = users.find(u => u.id === task.assigned_to)
  const isDone   = task.status === 'concluido'

  const STATUS_ORDER = ['pendente','prioridade','concluido']
  const currentIdx = STATUS_ORDER.indexOf(task.status)
  const canGoLeft  = currentIdx > 0
  const canGoRight = currentIdx < STATUS_ORDER.length - 1

  return (
    <div className={`bg-white border rounded-xl shadow-sm transition-all
      ${isDone ? 'opacity-60 border-slate-100' : task.status === 'prioridade' ? 'border-rose-300 bg-rose-50/20' : 'border-slate-100 hover:border-slate-200 hover:shadow-md'}`}>

      {/* ── Header accordion ── */}
      <div className="flex items-center gap-2 px-3.5 py-3 cursor-pointer"
        onClick={() => setExpanded(x => !x)}>
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: cat.color + '18', color: cat.color }}>
          {cat.label}
        </span>
        <p className={`text-sm font-semibold flex-1 min-w-0 truncate ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button disabled={!canGoLeft}
            onClick={() => canGoLeft && onMoveStatus(task, STATUS_ORDER[currentIdx - 1])}
            className={`p-1 rounded-lg transition-colors ${canGoLeft ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-200 cursor-default'}`}>
            <ChevronLeft size={13}/>
          </button>
          <button disabled={!canGoRight}
            onClick={() => canGoRight && onMoveStatus(task, STATUS_ORDER[currentIdx + 1])}
            className={`p-1 rounded-lg transition-colors ${canGoRight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-200 cursor-default'}`}>
            <ChevronRight size={13}/>
          </button>
        </div>
        <div className="text-slate-300 hover:text-slate-500 transition-colors ml-0.5" onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}>
          {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        </div>
      </div>

      {/* ── Conteúdo expandido ── */}
      {expanded && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-2.5 border-t border-slate-100 pt-3">
          {task.description && <p className="text-xs text-slate-500 leading-relaxed">{task.description}</p>}

          {isDone && (task.purchase_value || task.purchase_date) && (
            <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-amber-50 text-[10px] font-semibold text-amber-700">
              {task.purchase_value && <span>💰 R$ {Number(task.purchase_value).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>}
              {task.purchase_date  && <span>📅 {new Date(task.purchase_date+'T12:00:00').toLocaleDateString('pt-BR')}</span>}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-50">
            {assigned ? (
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center text-[8px] font-black text-rose-500">
                  {assigned.name.split(' ').map(n=>n[0]).slice(0,2).join('')}
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{assigned.name.split(' ')[0]}</span>
              </div>
            ) : <span className="text-[10px] text-slate-300">Sem responsável</span>}
            <div className="flex items-center gap-1">
              <button onClick={() => onEdit(task)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <Pencil size={12}/>
              </button>
              <button onClick={() => onDelete(task)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                <Trash2 size={12}/>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Coluna ─────────────────────────────────────────────────────
function Column({ col, tasks, users, onEdit, onDelete, onMoveStatus, onNew }) {
  const Icon  = col.icon
  const items = tasks.filter(t => t.type === col.type && t.status === col.status)

  return (
    <div className="flex flex-col gap-3 min-h-[400px]">
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${col.bg}`}>
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color: col.color }}/>
          <span className="text-sm font-bold text-slate-700">{col.label}</span>
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-white/70 text-slate-500">{items.length}</span>
        </div>
        {col.status === 'pendente' && (
          <button onClick={() => onNew()}
            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/70 transition-colors text-slate-500 hover:text-slate-700">
            <Plus size={14}/>
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {items.length === 0
          ? <div className="text-center py-8"><p className="text-xs text-slate-300 font-medium">Nenhum item</p></div>
          : items.map(task => (
              <TaskCard key={task.id} task={task} users={users}
                onEdit={onEdit} onDelete={onDelete} onMoveStatus={onMoveStatus}/>
            ))
        }
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────
export function PurchasesPage() {
  const { user } = useAuth()
  const [tasks,          setTasks]          = useState([])
  const [users,          setUsers]          = useState([])
  const [loading,        setLoading]        = useState(true)
  const [modal,          setModal]          = useState(false)
  const [editing,        setEditing]        = useState(null)
  const [completeModal,  setCompleteModal]  = useState(false)
  const [completingTask, setCompletingTask] = useState(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [tasksRes, usersRes] = await Promise.all([
      supabase.from('maintenance_tasks').select('*').eq('type','aquisicao').order('created_at',{ascending:false}),
      supabase.from('system_users').select('id,name').eq('active',true).order('name'),
    ])
    setTasks(tasksRes.data ?? [])
    setUsers(usersRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function getSession() {
    try { return JSON.parse(localStorage.getItem('coisapet_session')||'{}') } catch { return {} }
  }

  async function handleSave(form) {
    const s = getSession()
    const payload = {
      ...form,
      type: 'aquisicao',
      purchase_value: form.purchase_value
        ? parseFloat(String(form.purchase_value).replace(/\./g,'').replace(',','.'))
        : null,
      purchase_date:  form.purchase_date  || null,
      completed_at:   form.completed_at   || null,
      updated_at:     new Date().toISOString(),
    }
    if (editing?.id) {
      await supabase.from('maintenance_tasks').update(payload).eq('id', editing.id)
      toast.success('Compra atualizada!')
    } else {
      await supabase.from('maintenance_tasks').insert({ ...payload, created_by: s.id ?? null })
      toast.success('Compra criada!')
    }
    setEditing(null)
    load()
  }

  async function handleDelete(task) {
    if (!confirm(`Excluir "${task.title}"?`)) return
    await supabase.from('maintenance_tasks').delete().eq('id', task.id)
    toast.success('Compra removida.')
    load()
  }

  async function handleMoveStatus(task, newStatus) {
    if (newStatus === 'concluido') {
      setCompletingTask(task)
      setCompleteModal(true)
      return
    }
    // prioridade ou reabrir — sem modal
    const upd = { status: newStatus, updated_at: new Date().toISOString() }
    if (newStatus !== 'concluido') { upd.purchase_value = null; upd.purchase_date = null; upd.completed_at = null }
    await supabase.from('maintenance_tasks').update(upd).eq('id', task.id)
    load()
  }

  async function handleCompleteCompra({ value, date }) {
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('maintenance_tasks')
      .update({ status:'concluido', purchase_value: value||null, purchase_date: date||today, completed_at: date||today, updated_at: new Date().toISOString() })
      .eq('id', completingTask.id)
    setCompleteModal(false); setCompletingTask(null)
    load()
  }

  const filtered = tasks.filter(t =>
    (!filterCategory || t.category === filterCategory) &&
    (!filterAssigned || t.assigned_to === filterAssigned)
  )

  const pendente   = tasks.filter(t => t.status === 'pendente').length
  const prioridade = tasks.filter(t => t.status === 'prioridade').length
  const concluido  = tasks.filter(t => t.status === 'concluido').length
  const totalGasto = tasks.filter(t => t.purchase_value).reduce((a,t) => a + Number(t.purchase_value), 0)

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      <div className="page-header">
        <div>
          <h2 className="page-title">Compras</h2>
          <p className="page-subtitle">Aquisições e compras pendentes</p>
        </div>
        <button onClick={() => { setEditing(null); setModal(true) }} className="btn-primary">
          <Plus size={16}/> Nova compra
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-2xl">🛒</div>
          <div><p className="text-xs text-slate-400 font-semibold">Total</p><p className="text-3xl font-black text-slate-800">{tasks.length}</p></div>
        </div>
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-2xl">⏳</div>
          <div><p className="text-xs text-slate-400 font-semibold">A Comprar</p><p className="text-3xl font-black text-amber-600">{pendente}</p></div>
        </div>
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-2xl">🔴</div>
          <div><p className="text-xs text-slate-400 font-semibold">Prioridade</p><p className="text-3xl font-black text-rose-600">{prioridade}</p></div>
        </div>
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl">✅</div>
          <div><p className="text-xs text-slate-400 font-semibold">Comprados</p><p className="text-3xl font-black text-emerald-600">{concluido}</p></div>
        </div>
        <div className="card p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center text-2xl">💰</div>
          <div>
            <p className="text-xs text-slate-400 font-semibold">Total gasto</p>
            <p className="text-xl font-black text-violet-600">{totalGasto.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <Filter size={14} className="text-slate-400"/>
        <select className="select w-auto text-sm" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">Todas as categorias</option>
          {Object.entries(CAT_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="select w-auto text-sm" value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}>
          <option value="">Todos os responsáveis</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(filterCategory || filterAssigned) && (
          <button onClick={() => { setFilterCategory(''); setFilterAssigned('') }}
            className="text-xs text-rose-500 font-semibold">Limpar</button>
        )}
      </div>

      {/* 2 colunas */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-300"/></div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map(col => (
            <Column key={col.id} col={col} tasks={filtered} users={users}
              onEdit={t => { setEditing(t); setModal(true) }}
              onDelete={handleDelete}
              onMoveStatus={handleMoveStatus}
              onNew={() => { setEditing(null); setModal(true) }}
            />
          ))}
        </div>
      )}

      {completeModal && completingTask && (
        <CompleteModal task={completingTask}
          onClose={() => { setCompleteModal(false); setCompletingTask(null) }}
          onConfirm={handleCompleteCompra}/>
      )}

      <TaskModal
        open={modal}
        onClose={() => { setModal(false); setEditing(null) }}
        onSave={handleSave}
        users={users}
        initial={editing ?? EMPTY_FORM}
      />
    </div>
  )
}