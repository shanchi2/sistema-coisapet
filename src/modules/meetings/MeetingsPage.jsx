import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Calendar, Plus, Check, Clock, X, NotebookPen, Lock, ListChecks, History, Trash2, Loader2,
  Users, CalendarClock, AlertCircle, ChevronRight, Pencil, ThumbsUp, Target, MessageSquareText, CalendarPlus, Search,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { sessionToken } from '../../lib/sessionToken'

// Reuniões individuais (one-a-one). 21/10, pedido do Raphael: registro
// pós-reunião (o que foi falado, combinados, pontos, clima) — SÓ diretoria.
// O registro fica em `meeting_records`, tabela sem acesso direto pela API:
// só abre pelas funções meeting_records_list/meeting_record_save, que
// conferem no banco se o token da sessão é de um diretor. O funcionário
// (app /equipe) continua vendo só título, data e pauta da reunião.
// Também dá pra lançar reunião antiga (data no passado) já com o registro.
// Layout (21/10, 2ª versão): equipe à esquerda, linha do tempo por mês e
// painel deslizante à direita pra ver/editar cada reunião.

const fmtDt = d => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDay = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
const fmtTime = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const monthKey = d => d.slice(0, 7)
const monthLabel = k => (s => s.charAt(0).toUpperCase() + s.slice(1))(new Date(k + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
const daysAgo = d => Math.floor((Date.now() - new Date(d).getTime()) / 86400e3)
function agoLabel(d) {
  const n = daysAgo(d)
  if (n < 0) { const f = -n; return f === 0 ? 'hoje' : f === 1 ? 'amanhã' : `em ${f} dias` }
  if (n === 0) return 'hoje'
  if (n === 1) return 'ontem'
  if (n < 60) return `há ${n} dias`
  const m = Math.round(n / 30)
  return m < 12 ? `há ${m} meses` : `há ${Math.floor(m / 12)} ano${m >= 24 ? 's' : ''}`
}

const EMPTY = { employee_id: '', title: 'One-a-one', scheduled_at: '', notes: '' }
const MOODS = [
  { v: 'otima',   e: '😄', l: 'Ótima',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { v: 'boa',     e: '🙂', l: 'Boa',     cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  { v: 'neutra',  e: '😐', l: 'Neutra',  cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  { v: 'dificil', e: '😟', l: 'Difícil', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
]
const OWNERS = [['colaborador', 'Colaborador'], ['empresa', 'Empresa'], ['ambos', 'Ambos']]
const moodOf = v => MOODS.find(m => m.v === v)
// Cor fixa por pessoa (avatar)
const PALETTE = ['bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-indigo-100 text-indigo-700', 'bg-teal-100 text-teal-700', 'bg-orange-100 text-orange-700']
const colorOf = id => PALETTE[[...(id || '')].reduce((t, c) => t + c.charCodeAt(0), 0) % PALETTE.length]
const initials = n => (n || '?').split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase()
const firstName = n => (n || '').split(' ')[0]

function Avatar({ person, size = 'w-10 h-10 text-sm' }) {
  return <div className={`${size} rounded-2xl ${colorOf(person?.id)} flex items-center justify-center font-black shrink-0`}>{initials(person?.name)}</div>
}

// Painel que desliza da direita (com fundo escurecido e ESC pra fechar)
function Drawer({ open, onClose, children, width = 'max-w-xl' }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!open) { setShown(false); return }
    const r = requestAnimationFrame(() => setShown(true))
    const esc = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => { cancelAnimationFrame(r); window.removeEventListener('keydown', esc) }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1000] flex justify-end" onClick={onClose}>
      <div className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`} />
      <aside onClick={e => e.stopPropagation()}
        className={`relative w-full ${width} h-full bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${shown ? 'translate-x-0' : 'translate-x-full'}`}>
        {children}
      </aside>
    </div>
  )
}

export function MeetingsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [meetings, setMeetings]     = useState([])
  const [employees, setEmployees]   = useState([])
  const [records, setRecords]       = useState({})   // meeting_id → registro (só diretoria)
  const [recordsErr, setRecordsErr] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [filterStatus, setFilter]   = useState('past') // upcoming | past | all
  const [filterEmp, setFilterEmp]   = useState('')
  const [q, setQ]                   = useState('')
  const [openId, setOpenId]         = useState(null)   // reunião aberta no painel
  const [creating, setCreating]     = useState(false)  // painel "nova reunião"

  const loadRecords = useCallback(async () => {
    if (!isAdmin) return
    const { data, error: err } = await supabase.rpc('meeting_records_list', { p_token: sessionToken() })
    if (err) { setRecordsErr(err.message); return }
    setRecordsErr(null)
    setRecords(Object.fromEntries((data || []).map(r => [r.meeting_id, r])))
  }, [isAdmin])

  const loadAll = useCallback(async () => {
    const [{ data: m }, { data: e }] = await Promise.all([
      supabase.from('meetings').select(`
        id, title, scheduled_at, notes, confirmed_at, created_at, employee_id,
        employee:employee_id(id, name, job_title),
        scheduled_by_user:scheduled_by(name)
      `).order('scheduled_at', { ascending: false }),
      supabase.from('system_users')
        .select('id, name, job_title, role')
        .in('role', ['equipe', 'producao', 'administrativo', 'atendimento'])
        .eq('active', true)
        .order('name')
    ])
    setMeetings(m || [])
    setEmployees(e || [])
    await loadRecords()
    setLoading(false)
  }, [loadRecords])
  useEffect(() => { loadAll() }, [loadAll])

  const nowIso = new Date().toISOString()
  const isPast = m => m.scheduled_at < nowIso

  // Resumo por pessoa (coluna da equipe)
  const people = useMemo(() => employees.map(e => {
    const mine = meetings.filter(m => m.employee_id === e.id)
    const past = mine.filter(isPast)
    const next = mine.filter(m => !isPast(m)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0]
    const open = past.reduce((t, m) => t + (records[m.id]?.agreements || []).filter(a => !a.done).length, 0)
    return { ...e, count: mine.length, last: past[0]?.scheduled_at || null, next: next?.scheduled_at || null, open }
  }).sort((a, b) => (a.last ? 0 : 1) - (b.last ? 0 : 1) || String(a.last).localeCompare(String(b.last))), // quem está há mais tempo sem conversa primeiro
  [employees, meetings, records]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    let list = meetings
    if (filterEmp) list = list.filter(m => m.employee_id === filterEmp)
    if (filterStatus === 'upcoming') list = list.filter(m => !isPast(m)).slice().reverse()
    if (filterStatus === 'past') list = list.filter(isPast)
    if (qq) list = list.filter(m => {
      const r = records[m.id]
      return [m.title, m.notes, m.employee?.name, r?.summary, r?.positives, r?.improvements, ...(r?.agreements || []).map(a => a.text)]
        .some(t => (t || '').toLowerCase().includes(qq))
    })
    return list
  }, [meetings, filterStatus, filterEmp, q, records]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const g = []
    for (const m of filtered) {
      const k = monthKey(m.scheduled_at)
      if (!g.length || g[g.length - 1].k !== k) g.push({ k, items: [] })
      g[g.length - 1].items.push(m)
    }
    return g
  }, [filtered])

  const stats = useMemo(() => {
    const upcoming = meetings.filter(m => !isPast(m))
    const past = meetings.filter(isPast)
    const allAg = Object.values(records).flatMap(r => r.agreements || [])
    const late = people.filter(p => !p.next && (!p.last || daysAgo(p.last) > 60)).length
    return {
      upcoming: upcoming.length,
      pending: upcoming.filter(m => !m.confirmed_at).length,
      noRecord: past.filter(m => !records[m.id]).length,
      agOpen: allAg.filter(a => !a.done).length,
      agDone: allAg.filter(a => a.done).length,
      late,
    }
  }, [meetings, records, people]) // eslint-disable-line react-hooks/exhaustive-deps

  const opened = meetings.find(m => m.id === openId) || null
  const selectedPerson = people.find(p => p.id === filterEmp)

  async function handleDelete(m) {
    const hasRec = !!records[m.id]
    if (!confirm(hasRec ? 'Excluir esta reunião E o registro dela (o que foi falado, combinados…)? Não dá pra desfazer.' : 'Excluir esta reunião?')) return
    const { error: err } = await supabase.from('meetings').delete().eq('id', m.id)
    if (err) return toast.error(err.message)
    setOpenId(null)
    loadAll()
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* Cabeçalho */}
      <div className="rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-sky-600 text-white p-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-white/10" />
        <div className="absolute right-24 -bottom-16 w-40 h-40 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/70">Pessoas</p>
            <h2 className="text-2xl font-black mt-0.5" style={{ fontFamily: 'Nunito,sans-serif' }}>Reuniões one-a-one</h2>
            <p className="text-sm text-white/80 mt-1 max-w-xl">Conversas individuais com a equipe{isAdmin ? ' — com o registro do que foi falado e do que ficou combinado (só a diretoria vê).' : '.'}</p>
          </div>
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-white text-indigo-700 font-bold text-sm px-4 py-2.5 rounded-xl shadow-sm hover:bg-indigo-50">
            <Plus size={16} /> Nova reunião
          </button>
        </div>
        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          {[
            { icon: CalendarClock, label: 'Próximas', value: stats.upcoming, sub: stats.pending ? `${stats.pending} aguardando confirmação` : 'todas confirmadas' },
            ...(isAdmin ? [
              { icon: NotebookPen, label: 'Sem registro', value: stats.noRecord, sub: 'reuniões já feitas' },
              { icon: ListChecks, label: 'Combinados em aberto', value: stats.agOpen, sub: `${stats.agDone} já cumpridos` },
            ] : []),
            { icon: AlertCircle, label: 'Sem conversa há +60 dias', value: stats.late, sub: 'e nada agendado' },
          ].map(k => (
            <div key={k.label} className="rounded-2xl bg-white/10 backdrop-blur px-4 py-3 border border-white/10">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/75"><k.icon size={13} />{k.label}</p>
              <p className="text-3xl font-black leading-tight mt-0.5" style={{ fontFamily: 'Nunito,sans-serif' }}>{k.value}</p>
              <p className="text-[11px] text-white/60">{k.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && recordsErr && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">Não consegui abrir os registros: {recordsErr}</p>
      )}

      <div className="grid lg:grid-cols-[18rem_minmax(0,1fr)] gap-5 items-start">

        {/* Equipe */}
        <div className="card p-3 lg:sticky lg:top-4">
          <p className="flex items-center gap-2 px-2 pt-1 pb-2 text-xs font-bold uppercase tracking-wide text-slate-400"><Users size={13} /> Equipe</p>
          <button onClick={() => setFilterEmp('')}
            className={`w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left ${!filterEmp ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'}`}>
            <div className="w-9 h-9 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center"><Users size={16} /></div>
            <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-700">Todos</p><p className="text-[11px] text-slate-400">{meetings.length} reuniões</p></div>
          </button>
          <div className="flex flex-col gap-0.5 mt-1 max-h-[60vh] lg:max-h-[calc(100vh-14rem)] overflow-y-auto">
            {people.map(p => {
              const stale = !p.next && (!p.last || daysAgo(p.last) > 60)
              return (
                <button key={p.id} onClick={() => setFilterEmp(p.id === filterEmp ? '' : p.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${filterEmp === p.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'}`}>
                  <Avatar person={p} size="w-9 h-9 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 truncate">{p.name}</p>
                    <p className={`text-[11px] truncate ${stale ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                      {p.next ? `📅 próxima ${agoLabel(p.next)}` : p.last ? `última ${agoLabel(p.last)}` : 'nunca conversou'}
                    </p>
                  </div>
                  {isAdmin && p.open > 0 && <span title="Combinados em aberto" className="text-[10px] font-bold bg-sky-100 text-sky-700 rounded-full px-1.5 py-0.5">{p.open}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Linha do tempo */}
        <div className="flex flex-col gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {[['upcoming', 'Próximas'], ['past', 'Realizadas'], ['all', 'Todas']].map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filterStatus === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[12rem]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={isAdmin ? 'Buscar no que foi falado, combinados, pessoa…' : 'Buscar reunião ou pessoa…'} className="input pl-9 py-2 text-sm" />
            </div>
          </div>

          {selectedPerson && (
            <div className="card flex items-center gap-4">
              <Avatar person={selectedPerson} size="w-12 h-12 text-base" />
              <div className="min-w-0 flex-1">
                <p className="font-black text-slate-800 text-lg leading-tight">{selectedPerson.name}</p>
                <p className="text-xs text-slate-500">{selectedPerson.job_title || '—'} · {selectedPerson.count} reunião{selectedPerson.count === 1 ? '' : 'ões'}{selectedPerson.last ? ` · última ${agoLabel(selectedPerson.last)}` : ''}</p>
              </div>
              <button onClick={() => setCreating({ employee_id: selectedPerson.id })} className="btn-primary text-sm"><CalendarPlus size={15} /> Agendar com {firstName(selectedPerson.name)}</button>
            </div>
          )}

          {loading ? (
            <div className="card flex items-center justify-center py-16"><Loader2 className="animate-spin text-slate-300" size={26} /></div>
          ) : !groups.length ? (
            <div className="card text-center py-14 text-slate-400">
              <Calendar size={34} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">{q ? 'Nada encontrado nessa busca' : filterStatus === 'upcoming' ? 'Nenhuma reunião agendada' : 'Nenhuma reunião aqui ainda'}</p>
              <button onClick={() => setCreating(filterEmp ? { employee_id: filterEmp } : true)} className="mt-3 text-sm font-semibold text-indigo-600 hover:underline">+ Nova reunião</button>
            </div>
          ) : groups.map(g => (
            <section key={g.k}>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">{monthLabel(g.k)}</p>
              <div className="flex flex-col gap-2.5">
                {g.items.map(m => <MeetingRow key={m.id} m={m} rec={records[m.id]} past={isPast(m)} isAdmin={isAdmin} onOpen={() => setOpenId(m.id)} />)}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Painel: reunião aberta */}
      <Drawer open={!!opened} onClose={() => setOpenId(null)}>
        {opened && (
          <MeetingPanel key={opened.id} m={opened} rec={records[opened.id]} isAdmin={isAdmin} recordsErr={recordsErr}
            history={meetings.filter(x => x.employee_id === opened.employee_id && x.id !== opened.id)} records={records}
            onClose={() => setOpenId(null)} onOpen={setOpenId} onDelete={() => handleDelete(opened)}
            onSaved={r => setRecords(rs => ({ ...rs, [r.meeting_id]: r }))} />
        )}
      </Drawer>

      {/* Painel: nova reunião */}
      <Drawer open={!!creating} onClose={() => setCreating(false)} width="max-w-lg">
        {creating && (
          <NewMeetingPanel employees={employees} isAdmin={isAdmin} initial={typeof creating === 'object' ? creating : null}
            onClose={() => setCreating(false)}
            onCreated={async (id, past) => { setCreating(false); await loadAll(); if (past && isAdmin) { setOpenId(id); toast.success('Reunião lançada — agora registre o que foi falado.') } }} />
        )}
      </Drawer>
    </div>
  )
}

// ── Linha da reunião na linha do tempo ─────────────────────────────────
function MeetingRow({ m, rec, past, isAdmin, onOpen }) {
  const d = new Date(m.scheduled_at)
  const ag = rec?.agreements || []
  const done = ag.filter(a => a.done).length
  const mood = moodOf(rec?.mood)
  const status = past
    ? (isAdmin && !rec ? { t: 'Sem registro', c: 'bg-violet-50 text-violet-600 border-violet-200' } : { t: 'Realizada', c: 'bg-slate-50 text-slate-500 border-slate-200' })
    : m.confirmed_at ? { t: 'Confirmada', c: 'bg-emerald-50 text-emerald-700 border-emerald-200' } : { t: 'Aguardando', c: 'bg-amber-50 text-amber-700 border-amber-200' }
  return (
    <button onClick={onOpen} className="group w-full text-left card p-0 overflow-hidden flex hover:shadow-md hover:-translate-y-px transition-all">
      {/* Data */}
      <div className={`w-20 shrink-0 flex flex-col items-center justify-center py-3 border-r ${past ? 'bg-slate-50 border-slate-100' : 'bg-indigo-50 border-indigo-100'}`}>
        <p className={`text-[10px] font-bold uppercase ${past ? 'text-slate-400' : 'text-indigo-500'}`}>{d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</p>
        <p className={`text-3xl font-black leading-none ${past ? 'text-slate-600' : 'text-indigo-700'}`} style={{ fontFamily: 'Nunito,sans-serif' }}>{d.getDate()}</p>
        <p className={`text-[10px] font-bold uppercase ${past ? 'text-slate-400' : 'text-indigo-500'}`}>{d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</p>
      </div>
      <div className="flex-1 min-w-0 px-4 py-3 flex gap-3 items-start">
        <Avatar person={m.employee} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-800">{m.employee?.name || '—'}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.c}`}>{status.t}</span>
            {mood && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${mood.cls}`}>{mood.e} {mood.l}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{m.title} · {fmtTime(m.scheduled_at)}{m.employee?.job_title ? ` · ${m.employee.job_title}` : ''}</p>
          {isAdmin && rec?.summary && !rec.summary.startsWith('Importado da planilha') && <p className="text-sm text-slate-600 mt-1.5 line-clamp-2">{rec.summary}</p>}
          {isAdmin && rec && (rec.positives || rec.improvements) && (
            <div className="flex flex-col gap-0.5 mt-1.5 text-xs">
              {rec.positives && <p className="text-emerald-700 line-clamp-1"><ThumbsUp size={11} className="inline -mt-0.5 mr-1" />{rec.positives}</p>}
              {rec.improvements && <p className="text-amber-700 line-clamp-1"><Target size={11} className="inline -mt-0.5 mr-1" />{rec.improvements}</p>}
            </div>
          )}
          {!isAdmin && m.notes && <p className="text-sm text-slate-500 mt-1 line-clamp-1">{m.notes}</p>}
          {isAdmin && ag.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <div className="h-1.5 w-28 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(done / ag.length) * 100}%` }} /></div>
              <p className="text-[11px] text-slate-500">{done}/{ag.length} combinados</p>
            </div>
          )}
        </div>
        <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-400 shrink-0 self-center" />
      </div>
    </button>
  )
}

// ── Painel da reunião (ver + editar registro) ──────────────────────────
function MeetingPanel({ m, rec, isAdmin, recordsErr, history, records, onClose, onOpen, onDelete, onSaved }) {
  const [editing, setEditing] = useState(isAdmin && !rec && new Date(m.scheduled_at) < new Date() && !recordsErr)
  const past = new Date(m.scheduled_at) < new Date()
  const mood = moodOf(rec?.mood)
  const ag = rec?.agreements || []

  // Marcar combinado como cumprido direto na visualização
  async function toggleAg(a) {
    const data = { ...rec, agreements: ag.map(x => x.id === a.id ? { ...x, done: !x.done } : x) }
    const { data: saved, error } = await supabase.rpc('meeting_record_save', { p_token: sessionToken(), p_meeting_id: m.id, p_data: data })
    if (error) return toast.error(error.message)
    onSaved(saved)
  }

  return (
    <>
      {/* Topo */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white px-6 pt-5 pb-5 shrink-0">
        <div className="flex items-start gap-3">
          <div className={`w-14 h-14 rounded-2xl ${colorOf(m.employee?.id)} flex items-center justify-center font-black text-lg ring-4 ring-white/20`}>{initials(m.employee?.name)}</div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-black leading-tight">{m.employee?.name || '—'}</p>
            <p className="text-sm text-white/75">{m.employee?.job_title || ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15"><X size={20} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4 text-sm">
          <span className="flex items-center gap-1.5 bg-white/15 rounded-lg px-2.5 py-1"><Calendar size={14} />{new Date(m.scheduled_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} · {fmtTime(m.scheduled_at)}</span>
          <span className="bg-white/15 rounded-lg px-2.5 py-1">{m.title}</span>
          {past ? <span className="bg-white/15 rounded-lg px-2.5 py-1">Realizada</span>
            : m.confirmed_at ? <span className="bg-emerald-400/30 rounded-lg px-2.5 py-1 flex items-center gap-1"><Check size={13} />Confirmada pelo colaborador</span>
            : <span className="bg-amber-400/30 rounded-lg px-2.5 py-1 flex items-center gap-1"><Clock size={13} />Aguardando confirmação</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {editing ? (
          <RecordForm m={m} rec={rec} onCancel={() => setEditing(false)} onSaved={r => { onSaved(r); setEditing(false) }} />
        ) : (
          <div className="p-6 flex flex-col gap-5">
            {m.notes && (
              <Section icon={CalendarClock} title="Pauta" hint="o colaborador vê no app">
                <p className="text-sm text-slate-600 whitespace-pre-line">{m.notes}</p>
              </Section>
            )}

            {isAdmin && (rec ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-violet-600 flex items-center gap-1"><Lock size={11} /> Registro da reunião · só diretoria</span>
                  {mood && <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${mood.cls}`}>{mood.e} Conversa {mood.l.toLowerCase()}</span>}
                  <button onClick={() => setEditing(true)} className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg px-2.5 py-1.5"><Pencil size={14} /> Editar</button>
                </div>

                {rec.summary && (
                  <Section icon={MessageSquareText} title="O que foi falado">
                    <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{rec.summary}</p>
                  </Section>
                )}

                {(rec.positives || rec.improvements) && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {rec.positives && (
                      <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
                        <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 mb-1.5"><ThumbsUp size={13} /> Pontos positivos</p>
                        <p className="text-sm text-emerald-900/80 whitespace-pre-line">{rec.positives}</p>
                      </div>
                    )}
                    {rec.improvements && (
                      <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                        <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5 mb-1.5"><Target size={13} /> Pontos a desenvolver</p>
                        <p className="text-sm text-amber-900/80 whitespace-pre-line">{rec.improvements}</p>
                      </div>
                    )}
                  </div>
                )}

                {ag.length > 0 && (
                  <Section icon={ListChecks} title="O que ficou combinado" hint={`${ag.filter(a => a.done).length}/${ag.length} cumpridos · clique pra marcar`}>
                    <ul className="flex flex-col gap-1.5">
                      {ag.map(a => (
                        <li key={a.id}>
                          <button onClick={() => toggleAg(a)} className={`w-full flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${a.done ? 'bg-emerald-50/60 border-emerald-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <span className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${a.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>{a.done && <Check size={13} className="text-white" />}</span>
                            <span className="flex-1 min-w-0">
                              <span className={`block text-sm ${a.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{a.text}</span>
                              <span className="block text-[11px] text-slate-400 mt-0.5">{OWNERS.find(o => o[0] === a.owner)?.[1] || 'Ambos'}{a.due ? ` · prazo ${fmtDay(a.due)}` : ''}{!a.done && a.due && a.due < new Date().toISOString().slice(0, 10) ? ' · ' : ''}{!a.done && a.due && a.due < new Date().toISOString().slice(0, 10) && <b className="text-rose-500">atrasado</b>}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {rec.private_notes && (
                  <div className="rounded-2xl bg-slate-800 text-slate-100 p-4">
                    <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-1.5"><Lock size={12} /> Observações internas</p>
                    <p className="text-sm whitespace-pre-line">{rec.private_notes}</p>
                  </div>
                )}

                {rec.next_meeting && (
                  <p className="text-sm text-slate-600 flex items-center gap-2"><CalendarClock size={15} className="text-indigo-500" /> Próxima conversa sugerida: <b>{fmtDay(rec.next_meeting)}</b></p>
                )}
                <p className="text-[11px] text-slate-400">Registrado por {rec.created_by}{rec.updated_at !== rec.created_at ? ` · editado por ${rec.updated_by} em ${fmtDt(rec.updated_at)}` : ''}</p>
              </>
            ) : !recordsErr && (
              <button onClick={() => setEditing(true)} className="rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/50 hover:bg-violet-50 p-6 text-center">
                <NotebookPen size={26} className="mx-auto text-violet-500" />
                <p className="font-bold text-violet-700 mt-2">{past ? 'Registrar o que foi falado' : 'Fazer anotações da reunião'}</p>
                <p className="text-xs text-violet-500 mt-0.5">Resumo, pontos, combinados e observações · só a diretoria vê</p>
              </button>
            ))}

            {/* Histórico com a pessoa */}
            {history.length > 0 && (
              <Section icon={History} title={`Outras reuniões com ${firstName(m.employee?.name)}`}>
                <div className="flex flex-col">
                  {history.map(h => {
                    const r = records[h.id], hm = moodOf(r?.mood)
                    const hag = r?.agreements || []
                    return (
                      <button key={h.id} onClick={() => onOpen(h.id)} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 text-left hover:bg-slate-50 rounded-lg px-2 -mx-2">
                        <span className="text-xs font-bold text-slate-500 w-20 shrink-0">{new Date(h.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                        <span className="text-sm text-slate-700 flex-1 truncate">{h.title}</span>
                        {hm && <span title={hm.l}>{hm.e}</span>}
                        {isAdmin && hag.length > 0 && <span className="text-[11px] text-slate-400">{hag.filter(a => a.done).length}/{hag.length}</span>}
                        <ChevronRight size={14} className="text-slate-300" />
                      </button>
                    )
                  })}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>

      {!editing && (isAdmin || !past) && (
        <div className="shrink-0 border-t border-slate-100 px-6 py-3 flex">
          <button onClick={onDelete} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-rose-500"><Trash2 size={14} /> Excluir reunião</button>
        </div>
      )}
    </>
  )
}

function Section({ icon: Icon, title, hint, children }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400 mb-2"><Icon size={13} />{title}{hint && <span className="normal-case tracking-normal font-normal text-slate-400">· {hint}</span>}</p>
      {children}
    </div>
  )
}

// ── Formulário do registro (dentro do painel) ──────────────────────────
function RecordForm({ m, rec, onCancel, onSaved }) {
  const [f, setF] = useState(() => ({
    summary: rec?.summary || '', positives: rec?.positives || '', improvements: rec?.improvements || '',
    agreements: rec?.agreements || [], private_notes: rec?.private_notes || '',
    mood: rec?.mood || '', next_meeting: rec?.next_meeting || '',
  }))
  const [newAg, setNewAg] = useState({ text: '', owner: 'colaborador', due: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const mkAg = () => ({ id: crypto.randomUUID(), text: newAg.text.trim(), owner: newAg.owner, due: newAg.due || null, done: false })

  function addAgreement() {
    if (!newAg.text.trim()) return
    set('agreements', [...f.agreements, mkAg()])
    setNewAg({ text: '', owner: newAg.owner, due: '' })
  }
  const patchAg = (id, patch) => set('agreements', f.agreements.map(a => a.id === id ? { ...a, ...patch } : a))

  async function save() {
    const agreements = newAg.text.trim() ? [...f.agreements, mkAg()] : f.agreements // digitado e não adicionado entra junto
    setSaving(true)
    const { data, error } = await supabase.rpc('meeting_record_save', { p_token: sessionToken(), p_meeting_id: m.id, p_data: { ...f, agreements } })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Registro salvo.')
    onSaved(data)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 flex flex-col gap-4 flex-1">
        <p className="text-[11px] font-bold text-violet-600 flex items-center gap-1"><Lock size={11} /> Registro da reunião · só diretoria vê</p>
        <div>
          <label className="form-label">Como foi a conversa</label>
          <div className="grid grid-cols-4 gap-2">
            {MOODS.map(x => (
              <button key={x.v} type="button" onClick={() => set('mood', f.mood === x.v ? '' : x.v)}
                className={`rounded-xl border-2 py-2 text-center transition-colors ${f.mood === x.v ? x.cls + ' border-current' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                <span className="block text-2xl">{x.e}</span><span className="text-xs font-semibold">{x.l}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="form-label">O que foi falado</label>
          <textarea className="input" rows={6} value={f.summary} onChange={e => set('summary', e.target.value)}
            placeholder="Resumo da conversa: assuntos, o que o colaborador trouxe, o que a diretoria trouxe…" />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label text-emerald-700">👍 Pontos positivos</label>
            <textarea className="input bg-emerald-50/40" rows={3} value={f.positives} onChange={e => set('positives', e.target.value)} placeholder="O que está indo bem" />
          </div>
          <div>
            <label className="form-label text-amber-700">🎯 Pontos a desenvolver</label>
            <textarea className="input bg-amber-50/40" rows={3} value={f.improvements} onChange={e => set('improvements', e.target.value)} placeholder="O que precisa melhorar" />
          </div>
        </div>

        <div>
          <label className="form-label flex items-center gap-1.5"><ListChecks size={14} /> O que ficou combinado</label>
          {f.agreements.length > 0 && (
            <ul className="flex flex-col gap-1.5 mb-2">
              {f.agreements.map(a => (
                <li key={a.id} className={`rounded-xl border px-3 py-2 ${a.done ? 'bg-emerald-50/60 border-emerald-200' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={!!a.done} onChange={e => patchAg(a.id, { done: e.target.checked })} className="w-4 h-4 accent-emerald-600" title="Cumprido" />
                    <input value={a.text} onChange={e => patchAg(a.id, { text: e.target.value })} className={`flex-1 min-w-0 text-sm bg-transparent outline-none ${a.done ? 'line-through text-slate-400' : 'text-slate-700'}`} />
                    <button onClick={() => set('agreements', f.agreements.filter(x => x.id !== a.id))} className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                  </div>
                  <div className="flex gap-2 mt-1.5 pl-6">
                    <select value={a.owner} onChange={e => patchAg(a.id, { owner: e.target.value })} className="text-[11px] border border-slate-200 rounded-md px-1 py-0.5 bg-white text-slate-600">
                      {OWNERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input type="date" value={a.due || ''} onChange={e => patchAg(a.id, { due: e.target.value || null })} className="text-[11px] border border-slate-200 rounded-md px-1 py-0.5 bg-white text-slate-600" title="Prazo" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-2 flex flex-col gap-2">
            <input value={newAg.text} onChange={e => setNewAg(n => ({ ...n, text: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addAgreement()}
              placeholder="Novo combinado — ex: fazer o curso de NR-12 até o fim do mês" className="input py-1.5 text-sm bg-white" />
            <div className="flex gap-2">
              <select value={newAg.owner} onChange={e => setNewAg(n => ({ ...n, owner: e.target.value }))} className="select w-auto text-sm py-1.5">
                {OWNERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input type="date" value={newAg.due} onChange={e => setNewAg(n => ({ ...n, due: e.target.value }))} className="input w-auto text-sm py-1.5" title="Prazo (opcional)" />
              <button onClick={addAgreement} className="btn-secondary text-sm py-1.5 ml-auto"><Plus size={14} /> Adicionar</button>
            </div>
          </div>
        </div>

        <div>
          <label className="form-label">🔒 Observações internas</label>
          <textarea className="input" rows={2} value={f.private_notes} onChange={e => set('private_notes', e.target.value)} placeholder="Algo só pra diretoria lembrar (salário, promoção, cuidado…)" />
        </div>
        <div>
          <label className="form-label">Próxima conversa sugerida</label>
          <input type="date" className="input w-auto" value={f.next_meeting || ''} onChange={e => set('next_meeting', e.target.value)} />
        </div>
      </div>

      <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-3 flex justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar registro</button>
      </div>
    </div>
  )
}

// ── Painel "Nova reunião" ──────────────────────────────────────────────
function NewMeetingPanel({ employees, isAdmin, initial, onClose, onCreated }) {
  const [form, setForm] = useState({ ...EMPTY, ...(initial || {}) })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isPastForm = form.scheduled_at && new Date(form.scheduled_at) < new Date()

  async function save() {
    setError('')
    if (!form.employee_id) return setError('Selecione o colaborador')
    if (!form.title.trim()) return setError('Informe o título')
    if (!form.scheduled_at) return setError('Informe a data e hora')
    setSaving(true)
    const { data, error: err } = await supabase.from('meetings').insert({
      employee_id: form.employee_id, title: form.title.trim(),
      scheduled_at: new Date(form.scheduled_at).toISOString(), notes: form.notes.trim() || null,
    }).select('id').single()
    setSaving(false)
    if (err) return setError('Erro ao salvar: ' + err.message)
    onCreated(data.id, isPastForm)
  }

  return (
    <>
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white px-6 py-5 shrink-0 flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">{isPastForm ? 'Reunião que já aconteceu' : 'Agendar'}</p>
          <p className="text-xl font-black">{isPastForm ? 'Lançar reunião antiga' : 'Nova reunião'}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15"><X size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        <div>
          <label className="form-label">Colaborador *</label>
          <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
            {employees.map(e => (
              <button key={e.id} type="button" onClick={() => setForm(v => ({ ...v, employee_id: e.id }))}
                className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left ${form.employee_id === e.id ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                <Avatar person={e} size="w-7 h-7 text-[10px]" />
                <span className="text-xs font-semibold text-slate-700 truncate">{e.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="form-label">Data e hora *</label>
          <input type="datetime-local" className="input" value={form.scheduled_at} onChange={e => setForm(v => ({ ...v, scheduled_at: e.target.value }))} />
          {isAdmin && <p className="text-[11px] text-slate-400 mt-1">Pode ser uma data passada — pra lançar reuniões antigas, já com o registro.</p>}
        </div>
        <div>
          <label className="form-label">Título *</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {['One-a-one', 'Feedback mensal', 'Avaliação de desempenho', 'Reunião de 1 mês'].map(t => (
              <button key={t} type="button" onClick={() => setForm(v => ({ ...v, title: t }))}
                className={`text-xs px-2.5 py-1 rounded-full border ${form.title === t ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{t}</button>
            ))}
          </div>
          <input type="text" className="input" value={form.title} onChange={e => setForm(v => ({ ...v, title: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Pauta {isPastForm ? '' : '(o colaborador vê no app)'}</label>
          <textarea className="input" rows={4} placeholder="Tópicos que serão abordados…" value={form.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))} />
        </div>
        {error && <p className="text-rose-500 text-sm">{error}</p>}
      </div>
      <div className="shrink-0 border-t border-slate-100 px-6 py-3 flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={15} className="animate-spin" /> : isPastForm ? <><History size={15} /> Lançar e registrar</> : <><Calendar size={15} /> Agendar</>}
        </button>
      </div>
    </>
  )
}
