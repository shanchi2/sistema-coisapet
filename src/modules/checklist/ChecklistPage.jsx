import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  CheckSquare, Square, ChevronLeft, ChevronRight,
  Plus, Pencil, Trash2, X, Save, Loader2, Users,
  ClipboardCheck, Star, FileText, Settings, Check,
} from 'lucide-react'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

const DIAS_PT  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const MESES_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

function fmtDateFull(date) {
  const d = new Date(date + 'T12:00:00')
  const dias = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
  return `${dias[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function getWeekDays(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((dow + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    return day.toISOString().split('T')[0]
  })
}

// ── Modal de gerenciar tarefas (admin) ───────────────────────────────────────
function TaskManagerModal({ onClose, onSaved }) {
  const [tasks,   setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [newCat,   setNewCat]   = useState('diario')
  const [saving,   setSaving]   = useState(false)

  async function load() {
    const { data } = await supabase
      .from('checklist_tasks').select('*')
      .order('category').order('sort_order')
    setTasks(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function addTask() {
    if (!newTitle.trim()) return
    setSaving(true)
    const maxOrder = Math.max(0, ...tasks.filter(t => t.category === newCat).map(t => t.sort_order))
    await supabase.from('checklist_tasks').insert({
      title: newTitle.trim(), category: newCat, sort_order: maxOrder + 1
    })
    setNewTitle('')
    setSaving(false)
    toast.success('Tarefa adicionada!')
    load()
    onSaved()
  }

  async function toggleActive(task) {
    await supabase.from('checklist_tasks').update({ active: !task.active }).eq('id', task.id)
    load(); onSaved()
  }

  async function deleteTask(id) {
    if (!confirm('Remover esta tarefa?')) return
    await supabase.from('checklist_tasks').delete().eq('id', id)
    load(); onSaved()
    toast.success('Tarefa removida.')
  }

  const diario  = tasks.filter(t => t.category === 'diario')
  const pontual = tasks.filter(t => t.category === 'pontual')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Settings size={18} strokeWidth={1.5} className="text-slate-600" />
            <h3 className="font-semibold text-slate-800">Gerenciar tarefas</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16}/></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Adicionar nova */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nova tarefa</p>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              placeholder="Nome da tarefa..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 transition-colors"
            />
            <div className="flex gap-2">
              <select
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              >
                <option value="diario">✅ Checks de Todo Dia</option>
                <option value="pontual">📌 Tarefas Pontuais</option>
              </select>
              <button
                onClick={addTask}
                disabled={!newTitle.trim() || saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
                Adicionar
              </button>
            </div>
          </div>

          {/* Lista diário */}
          {[
            { key: 'diario',  label: '✅ Checks de Todo Dia', items: diario  },
            { key: 'pontual', label: '📌 Tarefas Pontuais',   items: pontual },
          ].map(group => (
            <div key={group.key}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{group.label}</p>
              <div className="space-y-1.5">
                {loading ? (
                  <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                ) : group.items.map(task => (
                  <div key={task.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${task.active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-50'}`}>
                    <span className="flex-1 text-sm text-slate-700">{task.title}</span>
                    <button
                      onClick={() => toggleActive(task)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${task.active ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-600' : 'bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-600'}`}
                    >
                      {task.active ? 'ativa' : 'inativa'}
                    </button>
                    <button onClick={() => deleteTask(task.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 size={13} strokeWidth={1.5}/>
                    </button>
                  </div>
                ))}
                {!loading && group.items.length === 0 && (
                  <p className="text-xs text-slate-400 italic px-2">Nenhuma tarefa nesta categoria.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Visão do admin — checklist de cada atendente ─────────────────────────────
function AdminView({ date, tasks }) {
  const [employees, setEmployees] = useState([])
  const [entries,   setEntries]   = useState([])
  const [notes,     setNotes]     = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: emps }, { data: ents }, { data: nts }] = await Promise.all([
        supabase.from('system_users').select('id, name').eq('role', 'atendimento').eq('active', true).order('name'),
        supabase.from('checklist_entries').select('*').eq('date', date),
        supabase.from('checklist_notes').select('*').eq('date', date),
      ])
      setEmployees(emps || [])
      setEntries(ents || [])
      setNotes(nts || [])
      setLoading(false)
    }
    load()
  }, [date])

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={24} className="animate-spin text-slate-400"/>
    </div>
  )

  if (employees.length === 0) return (
    <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
      <Users size={32} strokeWidth={1} className="mx-auto mb-2 text-slate-200"/>
      <p className="text-slate-400 text-sm">Nenhum usuário de atendimento encontrado.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {employees.map(emp => {
        const empEntries = entries.filter(e => e.employee_id === emp.id)
        const empNotes   = notes.find(n => n.employee_id === emp.id)
        const done       = empEntries.filter(e => e.done).length
        const total      = tasks.filter(t => t.active).length
        const pct        = total > 0 ? Math.round((done / total) * 100) : 0

        return (
          <div key={emp.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Header do atendente */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-600">
                  {emp.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <span className="font-semibold text-slate-800 text-sm">{emp.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold ${pct === 100 ? 'text-emerald-600' : pct > 50 ? 'text-amber-600' : 'text-slate-400'}`}>
                  {done}/{total} tarefas
                </span>
                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-amber-400' : 'bg-slate-300'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-8 text-right ${pct === 100 ? 'text-emerald-600' : 'text-slate-500'}`}>{pct}%</span>
              </div>
            </div>

            {/* Tarefas separadas por categoria */}
            {[
              { key: 'diario',  label: '✅ Checks de Todo Dia',  items: tasks.filter(t => t.active && t.category === 'diario')  },
              { key: 'pontual', label: '📌 Tarefas Mais Pontuais', items: tasks.filter(t => t.active && t.category === 'pontual') },
            ].map(group => group.items.length > 0 && (
              <div key={group.key} className="px-5 py-3 border-t border-slate-50">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{group.label}</p>
                <div className="grid grid-cols-2 gap-1">
                  {group.items.map(task => {
                    const entry = empEntries.find(e => e.task_id === task.id)
                    return (
                      <div key={task.id} className={`flex items-center gap-2 py-1 ${entry?.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {entry?.done
                          ? <Check size={12} strokeWidth={2.5} className="shrink-0"/>
                          : <Square size={12} strokeWidth={1.5} className="shrink-0"/>
                        }
                        <span className="text-xs truncate">{task.title}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Notas — sempre visível para o admin */}
            <div className="px-5 pb-4 space-y-3 border-t border-slate-100 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">⭐ Prioridades</p>
                  {empNotes?.priorities
                    ? <p className="text-xs text-slate-600 whitespace-pre-wrap">{empNotes.priorities}</p>
                    : <p className="text-xs text-slate-300 italic">Não preenchido</p>
                  }
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">📝 Anotações</p>
                  {empNotes?.notes
                    ? <p className="text-xs text-slate-600 whitespace-pre-wrap">{empNotes.notes}</p>
                    : <p className="text-xs text-slate-300 italic">Não preenchido</p>
                  }
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide mb-1">📖 Diário do Dia</p>
                {empNotes?.diary
                  ? <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg px-3 py-2.5">{empNotes.diary}</p>
                  : <p className="text-xs text-slate-300 italic px-1">Não preenchido</p>
                }
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export function ChecklistPage() {
  const me = getSession()
  const isAdmin = ['admin', 'administrativo'].includes(me.role)
  const canEdit = me.role === 'atendimento'

  const [date,       setDate]       = useState(todayStr())
  const [tasks,      setTasks]      = useState([])
  const [entries,    setEntries]    = useState([])
  const [notes,      setNotes]      = useState({ priorities: '', notes: '', diary: '' })
  const [loading,    setLoading]    = useState(true)
  const [savingNote, setSavingNote] = useState(false)
  const [mgmtModal,  setMgmtModal]  = useState(false)

  const weekDays = useMemo(() => getWeekDays(date), [date])
  const today    = todayStr()

  // Carrega tarefas
  const loadTasks = useCallback(async () => {
    const { data } = await supabase
      .from('checklist_tasks').select('*').eq('active', true)
      .order('category').order('sort_order')
    setTasks(data || [])
  }, [])

  // Carrega entries + notas do dia
  const loadDay = useCallback(async () => {
    if (!me.id) return
    setLoading(true)
    const [{ data: ents }, { data: nts }] = await Promise.all([
      supabase.from('checklist_entries').select('*').eq('employee_id', me.id).eq('date', date),
      supabase.from('checklist_notes').select('*').eq('employee_id', me.id).eq('date', date).maybeSingle(),
    ])
    setEntries(ents || [])
    setNotes({ priorities: nts?.priorities || '', notes: nts?.notes || '', diary: nts?.diary || '' })
    setLoading(false)
  }, [me.id, date])

  useEffect(() => { loadTasks() }, [loadTasks])
  useEffect(() => { loadDay()   }, [loadDay])

  // Toggle de tarefa
  async function toggleTask(taskId) {
    if (!canEdit || date !== today) return

    const existing = entries.find(e => e.task_id === taskId)
    if (existing) {
      const newDone = !existing.done
      await supabase.from('checklist_entries')
        .update({ done: newDone, done_at: newDone ? new Date().toISOString() : null })
        .eq('id', existing.id)
      setEntries(prev => prev.map(e => e.id === existing.id ? { ...e, done: newDone } : e))
    } else {
      const { data } = await supabase.from('checklist_entries')
        .insert({ task_id: taskId, employee_id: me.id, date, done: true, done_at: new Date().toISOString() })
        .select().single()
      if (data) setEntries(prev => [...prev, data])
    }
  }

  // Salva notas com debounce
  const saveNoteTimeout = useState(null)
  async function updateNote(key, val) {
    const newNotes = { ...notes, [key]: val }
    setNotes(newNotes)
    clearTimeout(saveNoteTimeout[0])
    saveNoteTimeout[0] = setTimeout(async () => {
      setSavingNote(true)
      // Tenta update primeiro, se não existir faz insert
      const { data: existing } = await supabase
        .from('checklist_notes')
        .select('id')
        .eq('employee_id', me.id)
        .eq('date', date)
        .maybeSingle()

      if (existing?.id) {
        await supabase.from('checklist_notes')
          .update({ priorities: newNotes.priorities, notes: newNotes.notes, diary: newNotes.diary, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase.from('checklist_notes')
          .insert({ employee_id: me.id, date, priorities: newNotes.priorities, notes: newNotes.notes, diary: newNotes.diary })
      }
      setSavingNote(false)
    }, 800)
  }

  // Stats de progresso
  const activeTasks = tasks.filter(t => t.active)
  const doneTasks   = entries.filter(e => e.done)
  const pct         = activeTasks.length > 0 ? Math.round((doneTasks.length / activeTasks.length) * 100) : 0

  const tasksDiario  = activeTasks.filter(t => t.category === 'diario')
  const tasksPontual = activeTasks.filter(t => t.category === 'pontual')

  function isChecked(taskId) {
    return entries.find(e => e.task_id === taskId)?.done || false
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center">
              <ClipboardCheck size={18} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Checklist Diário</h1>
              <p className="text-xs text-slate-500">{fmtDateFull(date)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Progresso — só para atendimento */}
            {canEdit && (
              <div className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-4 py-2">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Progresso do dia</p>
                  <p className={`text-sm font-bold ${pct === 100 ? 'text-emerald-600' : 'text-slate-700'}`}>{pct}%</p>
                </div>
                <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-violet-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Gerenciar tarefas — só admin */}
            {isAdmin && (
              <button
                onClick={() => setMgmtModal(true)}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-2 transition-colors"
              >
                <Settings size={14} strokeWidth={1.5}/>
                Gerenciar tarefas
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

        {/* Navegação de semana */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center px-4 py-2 border-b border-slate-100">
            <button
              onClick={() => setDate(addDays(weekDays[0], -7))}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <ChevronLeft size={16}/>
            </button>
            <span className="flex-1 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
              📅 Semana
            </span>
            <button
              onClick={() => setDate(addDays(weekDays[0], 7))}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
              disabled={weekDays.includes(today)}
            >
              <ChevronRight size={16} className={weekDays.includes(today) ? 'opacity-20' : ''}/>
            </button>
          </div>
          <div className="grid grid-cols-7">
            {weekDays.map(day => {
              const d    = new Date(day + 'T12:00:00')
              const isSel = day === date
              const isTod = day === today
              const isFut = day > today
              return (
                <button
                  key={day}
                  onClick={() => !isFut && setDate(day)}
                  disabled={isFut}
                  className={`flex flex-col items-center py-3 text-xs font-medium transition-colors ${
                    isFut ? 'opacity-25 cursor-not-allowed' :
                    isSel ? 'bg-violet-600 text-white' :
                    isTod ? 'bg-violet-50 text-violet-700' :
                    'hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <span className="text-[10px] opacity-70">{DIAS_PT[d.getDay()]}</span>
                  <span className={`text-base font-bold mt-0.5 ${isSel ? 'text-white' : isTod ? 'text-violet-700' : 'text-slate-800'}`}>
                    {d.getDate()}
                  </span>
                  {isTod && !isSel && <span className="w-1 h-1 rounded-full bg-violet-400 mt-0.5"/>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Aviso de data passada */}
        {date !== today && canEdit && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
            <span>⚠️</span>
            <span>Você está visualizando um dia anterior. Apenas o dia atual pode ser editado.</span>
          </div>
        )}

        {/* VISÃO ADMIN */}
        {isAdmin && (
          <AdminView date={date} tasks={tasks} />
        )}

        {/* VISÃO ATENDIMENTO */}
        {canEdit && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Checks de Todo Dia */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                <CheckSquare size={16} strokeWidth={1.5} className="text-emerald-500"/>
                <h3 className="font-semibold text-slate-800 text-sm">✅ Checks de Todo Dia</h3>
                <span className="ml-auto text-xs text-slate-400">
                  {tasksDiario.filter(t => isChecked(t.id)).length}/{tasksDiario.length}
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {tasksDiario.map(task => {
                  const checked = isChecked(task.id)
                  return (
                    <button
                      key={task.id}
                      onClick={() => toggleTask(task.id)}
                      disabled={date !== today}
                      className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors text-left
                        ${date !== today ? 'cursor-default' : 'hover:bg-slate-50 cursor-pointer'}
                        ${checked ? 'bg-emerald-50/40' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                        checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                      }`}>
                        {checked && <Check size={11} strokeWidth={3} className="text-white"/>}
                      </div>
                      <span className={`text-sm transition-all ${checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {task.title}
                      </span>
                    </button>
                  )
                })}
                {tasksDiario.length === 0 && (
                  <p className="text-xs text-slate-400 italic px-5 py-4">Nenhuma tarefa diária.</p>
                )}
              </div>
            </div>

            {/* Tarefas Pontuais */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                <Star size={16} strokeWidth={1.5} className="text-amber-500"/>
                <h3 className="font-semibold text-slate-800 text-sm">📌 Tarefas Mais Pontuais</h3>
                <span className="ml-auto text-xs text-slate-400">
                  {tasksPontual.filter(t => isChecked(t.id)).length}/{tasksPontual.length}
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {tasksPontual.map(task => {
                  const checked = isChecked(task.id)
                  return (
                    <button
                      key={task.id}
                      onClick={() => toggleTask(task.id)}
                      disabled={date !== today}
                      className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors text-left
                        ${date !== today ? 'cursor-default' : 'hover:bg-slate-50 cursor-pointer'}
                        ${checked ? 'bg-amber-50/40' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                        checked ? 'bg-amber-500 border-amber-500' : 'border-slate-300'
                      }`}>
                        {checked && <Check size={11} strokeWidth={3} className="text-white"/>}
                      </div>
                      <span className={`text-sm transition-all ${checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {task.title}
                      </span>
                    </button>
                  )
                })}
                {tasksPontual.length === 0 && (
                  <p className="text-xs text-slate-400 italic px-5 py-4">Nenhuma tarefa pontual.</p>
                )}
              </div>
            </div>

            {/* Prioridades do Dia */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Star size={16} strokeWidth={1.5} className="text-amber-500"/>
                  <h3 className="font-semibold text-slate-800 text-sm">Prioridades do Dia</h3>
                </div>
                {savingNote && <Loader2 size={12} className="animate-spin text-slate-400"/>}
              </div>
              <div className="p-4">
                <textarea
                  rows={5}
                  value={notes.priorities}
                  onChange={e => updateNote('priorities', e.target.value)}
                  disabled={date !== today}
                  placeholder="Quais são as prioridades de hoje?..."
                  className="w-full text-sm text-slate-700 resize-none focus:outline-none placeholder:text-slate-300 disabled:bg-transparent"
                />
              </div>
            </div>

            {/* Anotações Rápidas */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileText size={16} strokeWidth={1.5} className="text-slate-500"/>
                  <h3 className="font-semibold text-slate-800 text-sm">Anotações Rápidas</h3>
                </div>
                {savingNote && <Loader2 size={12} className="animate-spin text-slate-400"/>}
              </div>
              <div className="p-4">
                <textarea
                  rows={5}
                  value={notes.notes}
                  onChange={e => updateNote('notes', e.target.value)}
                  disabled={date !== today}
                  placeholder="Anote aqui o que precisar..."
                  className="w-full text-sm text-slate-700 resize-none focus:outline-none placeholder:text-slate-300 disabled:bg-transparent"
                />
              </div>
            </div>

            {/* Diário do Dia */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden md:col-span-2">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-base">📖</span>
                  <h3 className="font-semibold text-slate-800 text-sm">Diário do Dia</h3>
                  <span className="text-xs text-slate-400 ml-2">Como foi o dia? O que aconteceu de importante?</span>
                </div>
                {savingNote && <Loader2 size={12} className="animate-spin text-slate-400"/>}
              </div>
              <div className="p-4">
                <textarea
                  rows={6}
                  value={notes.diary}
                  onChange={e => updateNote('diary', e.target.value)}
                  disabled={date !== today}
                  placeholder="Escreva livremente sobre o dia — atendimentos relevantes, situações que chamaram atenção, dificuldades, conquistas..."
                  className="w-full text-sm text-slate-700 resize-none focus:outline-none placeholder:text-slate-300 disabled:bg-transparent leading-relaxed"
                />
              </div>
            </div>
          </div>
        )}

        {loading && canEdit && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-slate-400"/>
          </div>
        )}
      </div>

      {/* Modal de gerenciamento */}
      {mgmtModal && (
        <TaskManagerModal
          onClose={() => setMgmtModal(false)}
          onSaved={loadTasks}
        />
      )}
    </div>
  )
}
