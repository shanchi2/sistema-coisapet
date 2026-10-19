import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, RotateCcw, Target, Wrench, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dateBR'

// Concluídos (20/10, pedido do Raphael): o que cada funcionário já terminou
// sai dos cards (Foco do dia) e da coluna "Feito" (Serviços do barracão) e
// vem pra cá, agrupado por pessoa. Dá pra reabrir se marcou sem querer.

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const PERIODS = [['0', 'Hoje'], ['6', '7 dias'], ['29', '30 dias'], ['mes', 'Este mês'], ['89', '90 dias']]
const initials = n => (n || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
const fmt = iso => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'

export function DoneTab() {
  const [period, setPeriod] = useState('6')
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')

  const since = period === 'mes' ? todayISO().slice(0, 8) + '01' : addDays(todayISO(), -Number(period))

  const load = useCallback(async () => {
    setRows(null)
    const [focus, tasks, users] = await Promise.all([
      supabase.from('daily_focus').select('id, date, employee_name, task, urgent, done_at, created_by_name').eq('done', true).gte('date', since).order('done_at', { ascending: false }),
      supabase.from('maintenance_tasks').select('id, title, category, assigned_to, completed_at, type').eq('status', 'concluido').gte('completed_at', since).order('completed_at', { ascending: false }),
      supabase.from('system_users').select('id, name'),
    ])
    const nameOf = Object.fromEntries((users.data || []).map(u => [u.id, u.name]))
    setRows([
      ...(focus.data || []).map(f => ({ key: `f${f.id}`, kind: 'foco', id: f.id, who: f.employee_name, what: f.task, urgent: f.urgent, when: f.done_at || f.date, day: f.date })),
      ...(tasks.data || []).map(t => ({ key: `s${t.id}`, kind: 'servico', id: t.id, who: nameOf[t.assigned_to] || 'Sem responsável', what: t.title, when: t.completed_at, day: t.completed_at })),
    ])
  }, [since])
  useEffect(() => { load() }, [load])

  async function reopen(r) {
    const { error } = r.kind === 'foco'
      ? await supabase.from('daily_focus').update({ done: false, done_at: null }).eq('id', r.id)
      : await supabase.from('maintenance_tasks').update({ status: 'pendente', completed_at: null, updated_at: new Date().toISOString() }).eq('id', r.id)
    if (error) return toast.error(error.message)
    toast.success('Reaberto — voltou pra lista')
    setRows(rs => rs.filter(x => x.key !== r.key))
  }

  const groups = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const g = {}
    for (const r of rows || []) {
      if (qq && !`${r.who} ${r.what}`.toLowerCase().includes(qq)) continue
      ;(g[r.who] ||= []).push(r)
    }
    return Object.entries(g).map(([who, list]) => [who, list.sort((a, b) => String(b.when).localeCompare(String(a.when)))])
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  }, [rows, q])

  const total = groups.reduce((s, [, l]) => s + l.length, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4 flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {PERIODS.map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${period === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
          ))}
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar pessoa ou tarefa" className="input pl-8 py-1.5 text-sm w-56" />
        </div>
        <p className="ml-auto text-sm text-slate-500"><b className="text-emerald-600">{total}</b> concluída{total === 1 ? '' : 's'} no período</p>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-300" /></div>
      ) : !groups.length ? (
        <p className="text-center text-sm text-slate-400 py-12">Nada concluído nesse período.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map(([who, list]) => (
            <div key={who} className="card p-4 flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 font-bold flex items-center justify-center text-sm">{initials(who)}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 truncate">{who}</p>
                  <p className="text-[11px] text-slate-400">{list.length} concluída{list.length === 1 ? '' : 's'}</p>
                </div>
                <CheckCircle2 size={18} className="text-emerald-400" />
              </div>
              <ul className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
                {list.map(r => (
                  <li key={r.key} className="group flex items-start gap-2 rounded-xl px-2.5 py-2 bg-slate-50 border border-slate-100">
                    {r.kind === 'foco' ? <Target size={13} className="text-indigo-400 mt-0.5 shrink-0" /> : <Wrench size={13} className="text-amber-500 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 leading-snug">{r.what}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{r.kind === 'foco' ? 'Foco do dia' : 'Serviço do barracão'} · concluído {fmt(r.when)}{r.kind === 'foco' && r.day !== String(r.when).slice(0, 10) ? ` (foco de ${fmt(r.day)})` : ''}</p>
                    </div>
                    <button onClick={() => reopen(r)} title="Reabrir (volta pra lista de a fazer)" className="p-1 rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-600 focus:opacity-100"><RotateCcw size={13} /></button>
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
