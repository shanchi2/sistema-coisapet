import { useState, useEffect, useCallback } from 'react'
import {
  Wrench, ShoppingCart, Plus, X, Check, Loader2,
  User, Filter, CheckCircle2, Circle, Pencil, Trash2, AlertTriangle,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

// ── Configurações ──────────────────────────────────────────────
const CAT_CFG = {
  barracao:      { label: 'Barracão',       color: '#6366f1' },
  infraestrutura:{ label: 'Infraestrutura', color: '#0ea5e9' },
  maquinas:      { label: 'Máquinas',       color: '#f59e0b' },
  outros:        { label: 'Outros',         color: '#94a3b8' },
}

// 4 colunas — 2 para Serviços, 2 para Compras
const COLUMNS = [
  { id: 'servico_pendente',   type: 'servico',   status: 'pendente',   label: 'A Fazer',   icon: Wrench,       color: '#6366f1', bg: 'bg-indigo-50/60'  },
  { id: 'servico_prioridade', type: 'servico',   status: 'prioridade', label: 'Prioridade',icon: AlertTriangle, color: '#f59e0b', bg: 'bg-amber-50/60'   },
  { id: 'servico_concluido',  type: 'servico',   status: 'concluido',  label: 'Feito',     icon: CheckCircle2, color: '#22c55e', bg: 'bg-emerald-50/60' },
]

const EMPTY_FORM = {
  title: '', description: '', type: 'servico',
  status: 'pendente', category: 'barracao', assigned_to: '',
  completed_at: '', purchase_value: '', purchase_date: '',
}
// ServicesPage sempre usa type='servico'
const SERVICES_DEFAULT = { ...EMPTY_FORM, type: 'servico' }

// ── Modal de conclusão de compra ──────────────────────────────
function CompleteModal({ task, onClose, onConfirm }) {
  const today = new Date().toISOString().split('T')[0]
  const [value, setValue] = useState('')
  const [date,  setDate]  = useState(today)
  const [saving,setSaving]= useState(false)

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
              <input type="text" className="input pl-8" placeholder="0,00"
                value={value}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g,'')
                  if (!digits) { setValue(''); return }
                  const num = parseInt(digits,10)/100
                  setValue(num.toLocaleString('pt-BR',{minimumFractionDigits:2}))
                }}/>
            </div>
          </div>
          <div>
            <label className="form-label">Data da compra</label>
            <input type="date" className="input" value={date}
              onChange={e => setDate(e.target.value)}/>
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
  const isEditing = !!initial
  const [form,   setForm]   = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(initial ? {
      title:          initial.title          ?? '',
      description:    initial.description    ?? '',
      type:           initial.type           ?? 'servico',
      status:         initial.status         ?? 'pendente',
      category:       initial.category       ?? 'barracao',
      assigned_to:    initial.assigned_to    ?? '',
      completed_at:   initial.completed_at   ?? '',
      purchase_value: initial.purchase_value ?? '',
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

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-lg">
            {isEditing ? 'Editar tarefa' : 'Nova tarefa'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
            <X size={17}/>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">

          {/* Tipo fixo: serviço */}
          <input type="hidden" value="servico"/>

          {/* Status — editável */}
          <div>
            <label className="form-label">Status</label>
            <div className="grid grid-cols-3 gap-2">
              {form.type === 'servico' ? (
                <>
                  <button onClick={() => set('status', 'pendente')}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all
                      ${form.status === 'pendente' ? 'bg-slate-100 text-slate-700 border-slate-400' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                    <Circle size={15}/> A Fazer
                  </button>
                  <button onClick={() => set('status', 'prioridade')}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all
                      ${form.status === 'prioridade' ? 'bg-amber-50 text-amber-600 border-amber-300' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                    <AlertTriangle size={15}/> Prioridade
                  </button>
                  <button onClick={() => set('status', 'concluido')}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all
                      ${form.status === 'concluido' ? 'bg-emerald-50 text-emerald-600 border-emerald-300' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                    <CheckCircle2 size={15}/> Feito
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => set('status', 'pendente')}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all
                      ${form.status === 'pendente' ? 'bg-amber-50 text-amber-600 border-amber-300' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                    <ShoppingCart size={15}/> A Comprar
                  </button>
                  <button onClick={() => set('status', 'concluido')}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all
                      ${form.status === 'concluido' ? 'bg-emerald-50 text-emerald-600 border-emerald-300' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                    <CheckCircle2 size={15}/> Comprado
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="form-label">Título *</label>
            <input className="input" placeholder="Ex: Trocar lâmpada do galpão"
              value={form.title} onChange={e => set('title', e.target.value)}/>
          </div>

          {/* Categoria + Responsável */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Categoria</label>
              <select className="select" value={form.category} onChange={e => set('category', e.target.value)}>
                {Object.entries(CAT_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
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

          {/* Descrição */}
          <div>
            <label className="form-label">Descrição <span className="text-slate-400 font-normal">(opcional)</span></label>
            <textarea className="textarea resize-none" rows={3}
              placeholder="Detalhes do serviço ou item a ser adquirido..."
              value={form.description} onChange={e => set('description', e.target.value)}/>
          </div>

          {/* Campos de conclusão — só aparecem se status = concluido */}
          {form.status === 'concluido' && (
            <div className={`flex flex-col gap-3 p-3 rounded-xl border ${form.type === 'aquisicao' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {form.type === 'aquisicao' ? '🛒 Dados da compra' : '✅ Dados da conclusão'}
              </p>
              {form.type === 'aquisicao' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Valor pago (R$)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input type="text" className="input pl-8" placeholder="0,00"
                        value={form.purchase_value}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, '')
                          if (!digits) { set('purchase_value', ''); return }
                          const num = parseInt(digits, 10) / 100
                          set('purchase_value', num.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
                        }}/>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Data da compra</label>
                    <input type="date" className="input" value={form.purchase_date}
                      onChange={e => set('purchase_date', e.target.value)}/>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="form-label">Data de conclusão</label>
                  <input type="date" className="input" value={form.completed_at}
                    onChange={e => set('completed_at', e.target.value)}/>
                </div>
              )}
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
function TaskCard({ task, users, onEdit, onDelete, onMoveStatus, colIndex, colCount, isDragging, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const [expanded, setExpanded] = useState(false)
  const cat      = CAT_CFG[task.category] ?? CAT_CFG.outros
  const assigned = users.find(u => u.id === task.assigned_to)
  const isDone   = task.status === 'concluido'
  const isCompra = task.type === 'aquisicao'

  const STATUS_ORDER = ['pendente','prioridade','concluido']
  const currentIdx = STATUS_ORDER.indexOf(task.status)
  const canGoLeft  = currentIdx > 0
  const canGoRight = currentIdx < STATUS_ORDER.length - 1

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed='move'; onDragStart?.(task.id) }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; onDragOver?.(task.id) }}
      onDrop={e => { e.preventDefault(); onDrop?.(task.id) }}
      onDragEnd={() => onDragEnd?.()}
      className={`bg-white border rounded-xl shadow-sm transition-all cursor-grab active:cursor-grabbing
      ${isDragging === task.id ? 'opacity-30 scale-95 border-dashed' : ''}
      ${isDone ? 'opacity-60 border-slate-100' : task.status === 'prioridade' ? 'border-amber-300 bg-amber-50/30 shadow-amber-100' : 'border-slate-100 hover:border-slate-200 hover:shadow-md'}`}>

      {/* ── Header do accordion — sempre visível ── */}
      <div className="flex items-center gap-2 px-3.5 py-3"
        onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
        style={{ cursor: 'pointer' }}>
        {/* Categoria */}
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: cat.color + '18', color: cat.color }}>
          {cat.label}
        </span>
        {/* Título */}
        <p className={`text-sm font-semibold flex-1 min-w-0 truncate ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {task.title}
        </p>
        {/* Setas status + expand */}
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
        <div onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
          className="text-slate-300 hover:text-slate-500 transition-colors ml-0.5">
          {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        </div>
      </div>

      {/* ── Conteúdo expandido ── */}
      {expanded && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-2.5 border-t border-slate-100 pt-3"
          onClick={e => e.stopPropagation()}>

          {/* Descrição */}
          {task.description && (
            <p className="text-xs text-slate-500 leading-relaxed">{task.description}</p>
          )}

          {/* Info de conclusão */}
          {isDone && (task.purchase_value || task.completed_at || task.purchase_date) && (
            <div className={`flex flex-wrap gap-2 p-2 rounded-lg text-[10px] font-semibold
              ${isCompra ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {task.purchase_value && (
                <span>💰 R$ {Number(task.purchase_value).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
              )}
              {(task.purchase_date || task.completed_at) && (
                <span>📅 {new Date((task.purchase_date || task.completed_at) + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
              )}
            </div>
          )}

          {/* Footer — responsável + ações */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-50">
            {assigned ? (
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center text-[8px] font-black text-rose-500">
                  {assigned.name.split(' ').map(n => n[0]).slice(0,2).join('')}
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

// ── Coluna do Kanban ───────────────────────────────────────────
function Column({ col, tasks, users, onEdit, onDelete, onMoveStatus, onNew, dragging, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const Icon  = col.icon
  const items = tasks.filter(t => t.type === col.type && t.status === col.status)
  const STATUS_ORDER = ['pendente','prioridade','concluido']
  const colIndex = STATUS_ORDER.indexOf(col.status)

  return (
    <div className="flex flex-col gap-3 min-h-[400px]"
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); if (dragging) onDrop?.(null, col.status) }}>
      {/* Header da coluna */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${col.bg}`}>
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color: col.color }}/>
          <span className="text-sm font-bold text-slate-700">{col.label}</span>
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-white/70 text-slate-500">
            {items.length}
          </span>
        </div>
        {col.status === 'pendente' && (
          <button onClick={() => onNew(col.type)}
            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/70 transition-colors text-slate-500 hover:text-slate-700">
            <Plus size={14}/>
          </button>
        )}
      </div>

      {/* Cards */}
      <div className={`flex flex-col gap-2 flex-1 rounded-xl p-1 transition-colors min-h-[80px]
        ${dragging ? 'ring-1 ring-dashed ring-slate-200 bg-slate-50/60' : ''}`}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-slate-300 font-medium">Nenhum item</p>
          </div>
        ) : (
          items.map(task => (
            <TaskCard key={task.id} task={task} users={users}
              onEdit={onEdit} onDelete={onDelete} onMoveStatus={onMoveStatus}
              colIndex={colIndex} colCount={STATUS_ORDER.length}
              isDragging={dragging}
              onDragStart={onDragStart}
              onDragOver={id => onDragOver?.(id, col.status)}
              onDrop={(id) => onDrop?.(id, col.status)}
              onDragEnd={onDragEnd}/>
          ))
        )}
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────
export function ServicesPage() {
  const { user } = useAuth()
  const [tasks,   setTasks]   = useState([])
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState(null)
  const [defaultType,    setDefaultType]    = useState('servico')
  const [completeModal,  setCompleteModal]  = useState(false)
  const [completingTask, setCompletingTask] = useState(null)

  // Filtros
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')
  const [dragging, setDragging] = useState(null) // task.id sendo arrastada

  const load = useCallback(async () => {
    setLoading(true)
    const [tasksRes, usersRes] = await Promise.all([
      supabase.from('maintenance_tasks')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('system_users').select('id,name').eq('active', true).order('name'),
    ])
    setTasks(tasksRes.data ?? [])
    setUsers(usersRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function getSession() {
    try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
  }

  async function handleSave(form) {
    const s = getSession()
    if (editing) {
      const payload = {
        ...form,
        purchase_value: form.purchase_value
          ? parseFloat(String(form.purchase_value).replace(/\./g,'').replace(',','.'))
          : null,
        purchase_date:  form.purchase_date  || null,
        completed_at:   form.completed_at   || null,
        updated_at:     new Date().toISOString(),
      }
      await supabase.from('maintenance_tasks').update(payload).eq('id', editing.id)
      toast.success('Tarefa atualizada!')
    } else {
      const insertPayload = {
        title:          form.title.trim(),
        description:    form.description || null,
        type:           form.type,
        status:         form.status,
        category:       form.category,
        assigned_to:    form.assigned_to || null,
        completed_at:   form.completed_at   || null,
        purchase_date:  form.purchase_date  || null,
        purchase_value: form.purchase_value
          ? parseFloat(String(form.purchase_value).replace(/\./g,'').replace(',','.'))
          : null,
        created_by:     s.id ?? null,
      }
      const { error: insErr } = await supabase.from('maintenance_tasks').insert(insertPayload)
      if (insErr) { toast.error('Erro ao criar: ' + insErr.message); return }
      toast.success('Tarefa criada!')
    }
    setEditing(null)
    load()
  }

  async function handleDelete(task) {
    if (!confirm(`Excluir "${task.title}"?`)) return
    await supabase.from('maintenance_tasks').delete().eq('id', task.id)
    toast.success('Tarefa removida.')
    load()
  }

  async function handleDrop(targetId, targetStatus) {
    if (!dragging) return
    const task = tasks.find(t => t.id === dragging)
    if (!task) return
    if (task.status !== targetStatus) {
      await handleMoveStatus(task, targetStatus)
    }
    setDragging(null)
  }

  async function handleMoveStatus(task, newStatus) {
    if (newStatus === 'concluido' && task.type === 'aquisicao') {
      // Abre modal pedindo valor e data da compra
      setCompletingTask({ ...task, _targetStatus: newStatus })
      setCompleteModal(true)
      return
    }
    // Serviço concluído ou qualquer reabertura — salva data automaticamente
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('maintenance_tasks')
      .update({
        status:       newStatus,
        completed_at: newStatus === 'concluido' ? today : null,
        updated_at:   new Date().toISOString()
      })
      .eq('id', task.id)
    load()
  }

  async function handleCompleteCompra({ value, date }) {
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('maintenance_tasks')
      .update({
        status:         'concluido',
        purchase_value: value || null,
        purchase_date:  date || today,
        completed_at:   date || today,
        updated_at:     new Date().toISOString()
      })
      .eq('id', completingTask.id)
    setCompleteModal(false)
    setCompletingTask(null)
    load()
  }

  function openNew(type) {
    setDefaultType(type)
    setEditing(null)
    setModal(true)
  }

  // Filtra tasks
  const filtered = tasks.filter(t =>
    (!filterCategory || t.category === filterCategory) &&
    (!filterAssigned || t.assigned_to === filterAssigned)
  )

  const total     = tasks.length
  const pendente  = tasks.filter(t => t.status === 'pendente').length
  const prioridade= tasks.filter(t => t.status === 'prioridade').length
  const concluido = tasks.filter(t => t.status === 'concluido').length

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Serviços</h2>
          <p className="page-subtitle">Tarefas e serviços pendentes do barracão</p>
        </div>
        <button onClick={() => openNew('servico')} className="btn-primary">
          <Plus size={16}/> Nova tarefa
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
            <span className="text-2xl font-black text-slate-700">{total}</span>
          </div>
          <span className="text-sm font-semibold text-slate-500">Total</span>
        </div>
        <div className="card py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <span className="text-2xl font-black text-indigo-600">{pendente}</span>
          </div>
          <span className="text-sm font-semibold text-slate-500">Pendentes</span>
        </div>
        <div className="card py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <span className="text-2xl font-black text-amber-600">{prioridade}</span>
          </div>
          <span className="text-sm font-semibold text-slate-500">Prioridade</span>
        </div>
        <div className="card py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <span className="text-2xl font-black text-emerald-600">{concluido}</span>
          </div>
          <span className="text-sm font-semibold text-slate-500">Concluídos</span>
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
          <option value={user?.id}>Só os meus</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(filterCategory || filterAssigned) && (
          <button onClick={() => { setFilterCategory(''); setFilterAssigned('') }}
            className="text-xs text-rose-500 font-semibold">Limpar</button>
        )}
      </div>

      {/* Separadores de seção + 4 colunas */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-slate-300"/>
        </div>
      ) : (
        <div className="flex flex-col gap-6">

          {/* 2 colunas — só serviços */}
          <div className="grid grid-cols-3 gap-3">
            {COLUMNS.map(col => (
              <Column
                key={col.id}
                col={col}
                tasks={filtered}
                users={users}
                onEdit={t => { setEditing(t); setModal(true) }}
                onDelete={handleDelete}
                onMoveStatus={handleMoveStatus}
                onNew={openNew}
                dragging={dragging}
                onDragStart={id => setDragging(id)}
                onDragOver={() => {}}
                onDrop={handleDrop}
                onDragEnd={() => setDragging(null)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modal de conclusão de compra */}
      {completeModal && completingTask && (
        <CompleteModal
          task={completingTask}
          onClose={() => { setCompleteModal(false); setCompletingTask(null) }}
          onConfirm={handleCompleteCompra}
        />
      )}

      {/* Modal */}
      <TaskModal
        open={modal}
        onClose={() => { setModal(false); setEditing(null) }}
        onSave={handleSave}
        users={users}
        initial={editing ?? { ...EMPTY_FORM, type: defaultType }}
      />
    </div>
  )
}