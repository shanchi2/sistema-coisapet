import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Plus, Siren, Trash2, Tv } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { todayISO } from '../../lib/dateBR'

// Afazeres por funcionário (16/10; sem dia desde 22/10, pedido do Raphael):
// a diretoria escolhe a pessoa e escreve o que ela precisa fazer ("Daniel,
// embalar as casinhas de halloween"). NÃO é mais "por dia": a tarefa fica
// aparecendo — aqui e na TV da produção — até ser concluída. Concluída, sai
// da lista e vai pra aba Concluídos. (A coluna `date` da tabela continua
// existindo: guarda o dia em que foi lançada.)
const sinceLabel = iso => {
  if (!iso) return ''
  const d = iso.length > 10 ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : iso
  if (d === todayISO()) return 'hoje'
  return new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
const firstName = n => (n || '').split(' ')[0]
// Fora da lista: diretoria, escritórios terceirizados e contas genéricas
const GENERIC = /^(produção|producao|atendimento|administrador)\b/i

export function DailyFocusTab() {
  const { user } = useAuth()
  const [people, setPeople] = useState([])
  const [items, setItems] = useState(null)
  const [who, setWho] = useState('')
  const [task, setTask] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('system_users').select('id, name, role, employee_type').eq('active', true).order('name')
      .then(({ data }) => setPeople((data || []).filter(u => u.role !== 'admin' && u.employee_type !== 'escritorio' && !GENERIC.test(u.name))))
  }, [])

  // Tudo que ainda não foi concluído, de qualquer dia
  // (o antigo "trazer as pendentes de ontem" copiava a tarefa pro dia novo:
  // cópias da mesma tarefa da mesma pessoa viram UMA só — `ids` guarda todas)
  const load = useCallback(async () => {
    setItems(null)
    const { data, error } = await supabase.from('daily_focus').select('*').eq('done', false).order('id')
    if (error) { toast.error(error.message); setItems([]); return }
    const byKey = new Map()
    for (const r of data || []) {
      const k = `${r.employee_name}|${r.task.trim().toLowerCase()}`
      const cur = byKey.get(k)
      if (cur) { cur.ids.push(r.id); cur.urgent = cur.urgent || r.urgent }
      else byKey.set(k, { ...r, ids: [r.id] })
    }
    setItems([...byKey.values()].sort((a, b) => a.position - b.position || a.id - b.id))
  }, [])
  useEffect(() => { load() }, [load])

  async function add(e) {
    e.preventDefault()
    const p = people.find(x => x.id === who)
    if (!p) return toast.error('Escolha o funcionário')
    if (!task.trim()) return toast.error('Escreva a tarefa')
    setSaving(true)
    const { data, error } = await supabase.from('daily_focus').insert({
      date: todayISO(), employee_id: p.id, employee_name: p.name, task: task.trim(), urgent,
      position: (items || []).length, created_by_name: user?.name || null,
    }).select().single()
    setSaving(false)
    if (error) return toast.error(error.message)
    setItems(its => [...its, { ...data, ids: [data.id] }])
    setTask(''); setUrgent(false)
    toast.success(`Tarefa do ${firstName(p.name)} lançada`)
  }

  async function patch(i, p) {
    setItems(its => its.map(x => x.id === i.id ? { ...x, ...p } : x))
    const { error } = await supabase.from('daily_focus').update(p).in('id', i.ids)
    if (error) { toast.error(error.message); load() }
  }
  async function remove(i) {
    setItems(its => its.filter(x => x.id !== i.id))
    const { error } = await supabase.from('daily_focus').delete().in('id', i.ids)
    if (error) { toast.error(error.message); load() }
  }
  // Agrupa por pessoa (urgentes primeiro, feitas por último)
  const groups = useMemo(() => {
    const m = {}
    for (const i of items || []) (m[i.employee_name] ||= []).push(i)
    return Object.entries(m)
      .map(([name, list]) => [name, list.sort((a, b) => (a.done - b.done) || (b.urgent - a.urgent) || (a.position - b.position))])
      .sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  // marcou como feita: sai da lista (vai pra aba Concluídos)
  async function finish(i) {
    setItems(its => its.filter(x => x.id !== i.id))
    const { error } = await supabase.from('daily_focus').update({ done: true, done_at: new Date().toISOString() }).in('id', i.ids)
    if (error) { toast.error(error.message); load(); return }
    toast.success('Concluída — foi pra aba Concluídos', { icon: '✅' })
  }

  const total = (items || []).length

  return (
    <div className="flex flex-col gap-4">
      {/* Lançar */}
      <form onSubmit={add} className="card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-slate-800">Lançar tarefa pra um funcionário</p>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
            <Tv size={14} className="text-slate-400" /> Fica na lista e na TV até ser concluída
            {total > 0 && <span className="ml-2 font-semibold text-slate-700">· {total} pendente{total > 1 ? 's' : ''}</span>}
          </span>
        </div>
        <div className="flex items-start gap-2 flex-wrap">
          <select value={who} onChange={e => setWho(e.target.value)} className="select w-auto min-w-[200px]">
            <option value="">Funcionário...</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input value={task} onChange={e => setTask(e.target.value)} maxLength={140}
            placeholder="Ex.: embalar as casinhas de halloween" className="input flex-1 min-w-[240px]" />
          <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold cursor-pointer select-none ${urgent ? 'bg-rose-50 border-rose-300 text-rose-700' : 'border-slate-200 text-slate-500'}`}>
            <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="accent-rose-600" />
            <Siren size={14} /> Urgente
          </label>
          <button disabled={saving} className="btn-primary"><Plus size={16} /> Lançar</button>
        </div>
      </form>

      {/* Por pessoa */}
      {items === null ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-300" /></div>
      ) : groups.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-12">Nenhuma tarefa pendente. 🎉</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map(([name, list]) => (
            <div key={name} className="card p-4 flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center text-sm">{name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 truncate">{name}</p>
                  <p className="text-[11px] text-slate-400">{list.length} pendente{list.length > 1 ? 's' : ''}</p>
                </div>
              </div>
              <ul className="flex flex-col gap-1.5">
                {list.filter(i => !i.done).map(i => (
                  <li key={i.id} className={`group flex items-start gap-2 rounded-xl px-2.5 py-2 border ${i.urgent && !i.done ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                    <button onClick={() => finish(i)} title="Marcar como feito"
                      className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${i.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white hover:border-emerald-400'}`}>
                      {i.done && <Check size={12} strokeWidth={3} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${i.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {i.urgent && !i.done && <span className="text-[10px] font-black text-white bg-rose-600 rounded px-1.5 py-px mr-1.5 align-middle">URGENTE</span>}
                        {i.task}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{i.created_by_name ? `por ${firstName(i.created_by_name)} · ` : ''}desde {sinceLabel(i.created_at || i.date)}</p>
                    </div>
                    {!i.done && (
                      <button onClick={() => patch(i, { urgent: !i.urgent })} title={i.urgent ? 'Tirar urgência' : 'Marcar urgente'}
                        className={`p-1 rounded ${i.urgent ? 'text-rose-500' : 'text-slate-300 opacity-0 group-hover:opacity-100'} hover:text-rose-600`}><Siren size={13} /></button>
                    )}
                    <button onClick={() => remove(i)} title="Excluir" className="p-1 rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-600"><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
