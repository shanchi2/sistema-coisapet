import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CornerDownRight, Loader2, Plus, Siren, Trash2, Tv } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { todayISO } from '../../lib/dateBR'

// Foco do dia por funcionário (16/10, pedido do Raphael): a diretoria escolhe
// a pessoa e escreve o que é prioridade pra ela naquele dia ("Daniel, focar em
// embalar casinhas de halloween"). Aparece na TV da produção (módulo
// "Foco do dia"). Dá pra planejar o dia seguinte e puxar o que ficou pendente.

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dayLabel = iso => {
  const t = todayISO()
  if (iso === t) return 'Hoje'
  if (iso === addDays(t, 1)) return 'Amanhã'
  if (iso === addDays(t, -1)) return 'Ontem'
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
}
const firstName = n => (n || '').split(' ')[0]
// Fora da lista: diretoria, escritórios terceirizados e contas genéricas
const GENERIC = /^(produção|producao|atendimento|administrador)\b/i

export function DailyFocusTab({ onShowDone }) {
  const { user } = useAuth()
  const [date, setDate] = useState(todayISO())
  const [people, setPeople] = useState([])
  const [items, setItems] = useState(null)
  const [who, setWho] = useState('')
  const [task, setTask] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingYesterday, setPendingYesterday] = useState([])

  useEffect(() => {
    supabase.from('system_users').select('id, name, role, employee_type').eq('active', true).order('name')
      .then(({ data }) => setPeople((data || []).filter(u => u.role !== 'admin' && u.employee_type !== 'escritorio' && !GENERIC.test(u.name))))
  }, [])

  const load = useCallback(async () => {
    setItems(null)
    const [{ data, error }, { data: prev }] = await Promise.all([
      supabase.from('daily_focus').select('*').eq('date', date).order('position').order('id'),
      supabase.from('daily_focus').select('*').eq('date', addDays(date, -1)).eq('done', false).order('position').order('id'),
    ])
    if (error) { toast.error(error.message); setItems([]); return }
    setItems(data || [])
    setPendingYesterday(prev || [])
  }, [date])
  useEffect(() => { load() }, [load])

  async function add(e) {
    e.preventDefault()
    const p = people.find(x => x.id === who)
    if (!p) return toast.error('Escolha o funcionário')
    if (!task.trim()) return toast.error('Escreva a tarefa')
    setSaving(true)
    const { data, error } = await supabase.from('daily_focus').insert({
      date, employee_id: p.id, employee_name: p.name, task: task.trim(), urgent,
      position: (items || []).length, created_by_name: user?.name || null,
    }).select().single()
    setSaving(false)
    if (error) return toast.error(error.message)
    setItems(its => [...its, data])
    setTask(''); setUrgent(false)
    toast.success(`Foco do ${firstName(p.name)} lançado`)
  }

  async function patch(id, p) {
    setItems(its => its.map(i => i.id === id ? { ...i, ...p } : i))
    const { error } = await supabase.from('daily_focus').update(p).eq('id', id)
    if (error) { toast.error(error.message); load() }
  }
  async function remove(id) {
    setItems(its => its.filter(i => i.id !== id))
    const { error } = await supabase.from('daily_focus').delete().eq('id', id)
    if (error) { toast.error(error.message); load() }
  }
  async function carryOver() {
    const rows = pendingYesterday
      .filter(y => !(items || []).some(i => i.employee_name === y.employee_name && i.task === y.task))
      .map((y, k) => ({ date, employee_id: y.employee_id, employee_name: y.employee_name, task: y.task, urgent: y.urgent, position: (items || []).length + k, created_by_name: user?.name || null }))
    if (!rows.length) return toast('Já está tudo aqui')
    const { error } = await supabase.from('daily_focus').insert(rows)
    if (error) return toast.error(error.message)
    toast.success(`${rows.length} tarefa${rows.length > 1 ? 's' : ''} trazida${rows.length > 1 ? 's' : ''} de ontem`)
    load()
  }

  // Agrupa por pessoa (urgentes primeiro, feitas por último)
  const groups = useMemo(() => {
    const m = {}
    for (const i of items || []) (m[i.employee_name] ||= []).push(i)
    return Object.entries(m)
      .map(([name, list]) => [name, list.sort((a, b) => (a.done - b.done) || (b.urgent - a.urgent) || (a.position - b.position))])
      .sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const total = (items || []).length
  const done = (items || []).filter(i => i.done).length
  const isPast = date < todayISO()
  const carry = pendingYesterday.filter(y => !(items || []).some(i => i.employee_name === y.employee_name && i.task === y.task))

  return (
    <div className="flex flex-col gap-4">
      {/* Dia */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <button onClick={() => setDate(d => addDays(d, -1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={18} /></button>
        <div className="min-w-[160px] text-center">
          <p className="font-bold text-slate-800 capitalize">{dayLabel(date)}</p>
          <p className="text-[11px] text-slate-400">{new Date(date + 'T12:00:00Z').toLocaleDateString('pt-BR')}</p>
        </div>
        <button onClick={() => setDate(d => addDays(d, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronRight size={18} /></button>
        {date !== todayISO() && <button onClick={() => setDate(todayISO())} className="text-xs font-semibold text-indigo-600">Voltar pra hoje</button>}
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <Tv size={14} className="text-slate-400" />
          {date === todayISO() ? 'O de hoje aparece na TV da produção' : 'Só o de hoje aparece na TV'}
          {total > 0 && <span className="ml-2 font-semibold text-slate-700">{done} de {total} feitas</span>}
        </div>
      </div>

      {/* Lançar */}
      {!isPast && (
        <form onSubmit={add} className="card p-4 flex flex-col gap-3">
          <p className="text-sm font-bold text-slate-800">Lançar foco pra {dayLabel(date).toLowerCase()}</p>
          <div className="flex items-start gap-2 flex-wrap">
            <select value={who} onChange={e => setWho(e.target.value)} className="select w-auto min-w-[200px]">
              <option value="">Funcionário...</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input value={task} onChange={e => setTask(e.target.value)} maxLength={140}
              placeholder="Ex.: focar em embalar as casinhas de halloween" className="input flex-1 min-w-[240px]" />
            <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold cursor-pointer select-none ${urgent ? 'bg-rose-50 border-rose-300 text-rose-700' : 'border-slate-200 text-slate-500'}`}>
              <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="accent-rose-600" />
              <Siren size={14} /> Urgente
            </label>
            <button disabled={saving} className="btn-primary"><Plus size={16} /> Lançar</button>
          </div>
          {carry.length > 0 && (
            <button type="button" onClick={carryOver} className="self-start flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-100">
              <CornerDownRight size={13} /> Trazer {carry.length} tarefa{carry.length > 1 ? 's' : ''} que ficaram pendentes do dia anterior
            </button>
          )}
        </form>
      )}

      {/* Por pessoa */}
      {items === null ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-300" /></div>
      ) : groups.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-12">Nenhum foco lançado pra {dayLabel(date).toLowerCase()}.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map(([name, list]) => (
            <div key={name} className="card p-4 flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center text-sm">{name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 truncate">{name}</p>
                  <p className="text-[11px] text-slate-400">{list.filter(i => i.done).length} de {list.length} feitas</p>
                </div>
              </div>
              {/* 20/10: concluídas saem do card (ficam na aba Concluídos) */}
              {list.every(i => i.done) && <p className="text-xs text-emerald-600 font-semibold py-1">🎉 Tudo feito por hoje!</p>}
              <ul className="flex flex-col gap-1.5">
                {list.filter(i => !i.done).map(i => (
                  <li key={i.id} className={`group flex items-start gap-2 rounded-xl px-2.5 py-2 border ${i.urgent && !i.done ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                    <button onClick={() => patch(i.id, { done: !i.done, done_at: !i.done ? new Date().toISOString() : null })} title={i.done ? 'Desmarcar' : 'Marcar como feito'}
                      className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${i.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white hover:border-emerald-400'}`}>
                      {i.done && <Check size={12} strokeWidth={3} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${i.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {i.urgent && !i.done && <span className="text-[10px] font-black text-white bg-rose-600 rounded px-1.5 py-px mr-1.5 align-middle">URGENTE</span>}
                        {i.task}
                      </p>
                      {i.created_by_name && <p className="text-[10px] text-slate-400 mt-0.5">por {firstName(i.created_by_name)}</p>}
                    </div>
                    {!i.done && (
                      <button onClick={() => patch(i.id, { urgent: !i.urgent })} title={i.urgent ? 'Tirar urgência' : 'Marcar urgente'}
                        className={`p-1 rounded ${i.urgent ? 'text-rose-500' : 'text-slate-300 opacity-0 group-hover:opacity-100'} hover:text-rose-600`}><Siren size={13} /></button>
                    )}
                    <button onClick={() => remove(i.id)} title="Excluir" className="p-1 rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-600"><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
              {list.some(i => i.done) && (
                <button onClick={onShowDone} className="self-start text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1">
                  <Check size={12} /> {list.filter(i => i.done).length} concluída{list.filter(i => i.done).length === 1 ? '' : 's'} — ver em Concluídos
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
