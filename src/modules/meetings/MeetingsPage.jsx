import { useState, useEffect, useMemo, useCallback } from 'react'
import { Calendar, Plus, Check, Clock, User, X, NotebookPen, Lock, ListChecks, History, Trash2, Loader2 } from 'lucide-react'
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

function fmtDt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
const fmtDay = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

const EMPTY = { employee_id: '', title: '', scheduled_at: '', notes: '' }
const MOODS = [
  { v: 'otima',   e: '😄', l: 'Ótima' },
  { v: 'boa',     e: '🙂', l: 'Boa' },
  { v: 'neutra',  e: '😐', l: 'Neutra' },
  { v: 'dificil', e: '😟', l: 'Difícil' },
]
const OWNERS = [['colaborador', 'Colaborador'], ['empresa', 'Empresa'], ['ambos', 'Ambos']]
const moodOf = v => MOODS.find(m => m.v === v)

export function MeetingsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [meetings, setMeetings]     = useState([])
  const [employees, setEmployees]   = useState([])
  const [records, setRecords]       = useState({})   // meeting_id → registro (só diretoria)
  const [recordsErr, setRecordsErr] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [form, setForm]             = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [filterStatus, setFilter]   = useState('upcoming') // upcoming | past | all
  const [filterEmp, setFilterEmp]   = useState('')
  const [error, setError]           = useState('')
  const [editing, setEditing]       = useState(null) // reunião com o registro aberto

  const loadRecords = useCallback(async () => {
    if (!isAdmin) return
    const { data, error: err } = await supabase.rpc('meeting_records_list', { p_token: sessionToken() })
    if (err) { setRecordsErr(err.message); return }
    setRecordsErr(null)
    setRecords(Object.fromEntries((data || []).map(r => [r.meeting_id, r])))
  }, [isAdmin])

  useEffect(() => { loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true)
    const [{ data: m }, { data: e }] = await Promise.all([
      supabase.from('meetings').select(`
        id, title, scheduled_at, notes, confirmed_at, created_at, employee_id,
        employee:employee_id(id, name, job_title),
        scheduled_by_user:scheduled_by(name)
      `).order('scheduled_at', { ascending: false }),
      supabase.from('system_users')
        .select('id, name, job_title, role')
        .in('role', ['equipe', 'producao', 'administrativo', 'atendimento'])
        .order('name')
    ])
    setMeetings(m || [])
    setEmployees(e || [])
    await loadRecords()
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const now = new Date().toISOString()
    let list = meetings
    if (filterEmp) list = list.filter(m => m.employee_id === filterEmp)
    if (filterStatus === 'upcoming') return list.filter(m => m.scheduled_at >= now).reverse()
    if (filterStatus === 'past')     return list.filter(m => m.scheduled_at < now)
    return list
  }, [meetings, filterStatus, filterEmp])

  const formIsPast = form.scheduled_at && new Date(form.scheduled_at) < new Date()

  async function handleSave() {
    setError('')
    if (!form.employee_id) return setError('Selecione o colaborador')
    if (!form.title.trim()) return setError('Informe o título')
    if (!form.scheduled_at) return setError('Informe a data e hora')
    setSaving(true)
    const { data, error: err } = await supabase.from('meetings').insert({
      employee_id:  form.employee_id,
      title:        form.title.trim(),
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      notes:        form.notes.trim() || null,
    }).select('id, title, scheduled_at, employee_id').single()
    setSaving(false)
    if (err) return setError('Erro ao salvar: ' + err.message)
    const past = formIsPast
    setForm(EMPTY)
    setShowForm(false)
    await loadAll()
    // Reunião antiga: já abre o registro pra lançar o que foi falado
    if (past && isAdmin && data) {
      setEditing({ ...data, employee: employees.find(e => e.id === data.employee_id) })
      toast.success('Reunião lançada — agora registre o que foi falado.')
    }
  }

  async function handleDelete(m) {
    const hasRec = !!records[m.id]
    if (!confirm(hasRec ? 'Excluir esta reunião E o registro dela (o que foi falado, combinados…)? Não dá pra desfazer.' : 'Excluir esta reunião?')) return
    const { error: err } = await supabase.from('meetings').delete().eq('id', m.id)
    if (err) return toast.error(err.message)
    loadAll()
  }

  const statusCounts = useMemo(() => {
    const now = new Date().toISOString()
    const upcoming = meetings.filter(m => m.scheduled_at >= now)
    const past = meetings.filter(m => m.scheduled_at < now)
    const openAgreements = Object.values(records).reduce((t, r) => t + (r.agreements || []).filter(a => !a.done).length, 0)
    return {
      pending:   upcoming.filter(m => !m.confirmed_at).length,
      confirmed: upcoming.filter(m => m.confirmed_at).length,
      total:     meetings.length,
      noRecord:  past.filter(m => !records[m.id]).length,
      openAgreements,
    }
  }, [meetings, records])

  const kpis = [
    { label: 'Aguardando confirmação', value: statusCounts.pending,   color: 'text-amber-600',  bg: 'bg-amber-50' },
    { label: 'Confirmadas (futuras)',   value: statusCounts.confirmed, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Total agendamentos',      value: statusCounts.total,     color: 'text-slate-700',  bg: 'bg-slate-50' },
    ...(isAdmin ? [
      { label: 'Realizadas sem registro', value: statusCounts.noRecord,       color: 'text-violet-600', bg: 'bg-violet-50' },
      { label: 'Combinados em aberto',    value: statusCounts.openAgreements, color: 'text-sky-600',    bg: 'bg-sky-50' },
    ] : []),
  ]

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Reuniões</h2>
          <p className="page-subtitle">Reuniões individuais com a equipe{isAdmin ? ' — e o registro do que foi conversado (só diretoria)' : ''}</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          <Plus size={16} /> Nova reunião
        </button>
      </div>

      {/* KPIs rápidos */}
      <div className={`grid grid-cols-2 gap-3 ${isAdmin ? 'md:grid-cols-5' : 'md:grid-cols-3'}`}>
        {kpis.map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-4 border border-slate-100`}>
            <p className="text-xs text-slate-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-black ${k.color}`} style={{fontFamily:'Nunito,sans-serif'}}>{k.value}</p>
          </div>
        ))}
      </div>

      {isAdmin && recordsErr && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">Não consegui abrir os registros: {recordsErr}</p>
      )}

      {/* Formulário Nova Reunião */}
      {showForm && (
        <div className="card border-2 border-sky-100 bg-sky-50/40">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">{formIsPast ? 'Lançar reunião que já aconteceu' : 'Nova reunião individual'}</h3>
            <button onClick={() => { setShowForm(false); setForm(EMPTY); setError('') }} className="p-1 rounded-lg hover:bg-slate-100">
              <X size={16} className="text-slate-400" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Colaborador */}
            <div>
              <label className="form-label">Colaborador *</label>
              <select className="select" value={form.employee_id} onChange={e => setForm(v => ({...v, employee_id: e.target.value}))}>
                <option value="">Selecione...</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name}{e.job_title ? ` — ${e.job_title}` : ''}</option>
                ))}
              </select>
            </div>

            {/* Data/Hora */}
            <div>
              <label className="form-label">Data e hora *</label>
              <input type="datetime-local" className="input" value={form.scheduled_at}
                onChange={e => setForm(v => ({...v, scheduled_at: e.target.value}))} />
              {isAdmin && <p className="text-[11px] text-slate-400 mt-1">Pode ser uma data passada — pra lançar reuniões antigas, já com o registro.</p>}
            </div>

            {/* Título */}
            <div className="md:col-span-2">
              <label className="form-label">Título da reunião *</label>
              <input type="text" className="input" placeholder="Ex: One-a-one, Avaliação de desempenho, Feedback mensal..."
                value={form.title} onChange={e => setForm(v => ({...v, title: e.target.value}))} />
            </div>

            {/* Notas/Pauta */}
            <div className="md:col-span-2">
              <label className="form-label">Pauta {formIsPast ? '' : '(o colaborador vê no app)'}</label>
              <textarea className="input" rows={3} placeholder="Descreva os tópicos que serão abordados..."
                value={form.notes} onChange={e => setForm(v => ({...v, notes: e.target.value}))} />
            </div>
          </div>

          {error && <p className="text-rose-500 text-sm mt-3">{error}</p>}

          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Salvando…' : formIsPast ? <><History size={15}/> Lançar e registrar</> : <><Calendar size={15}/> Agendar reunião</>}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY); setError('') }} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        {[
          { id: 'upcoming', label: '📅 Próximas' },
          { id: 'past',     label: '📋 Passadas' },
          { id: 'all',      label: '🗂 Todas'    },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              filterStatus === f.id ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {f.label}
          </button>
        ))}
        <select className="select w-auto text-sm ml-auto" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">Todos os colaboradores</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="card flex items-center justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-slate-100 border-t-sky-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">
          <Calendar size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma reunião neste filtro</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(m => {
            const isPast      = new Date(m.scheduled_at) < new Date()
            const isConfirmed = !!m.confirmed_at
            const rec         = records[m.id]
            const ag          = rec?.agreements || []
            const agDone      = ag.filter(a => a.done).length
            const mood        = moodOf(rec?.mood)
            return (
              <div key={m.id} className={`card border-l-4 ${
                isPast         ? (rec ? 'border-l-violet-400' : 'border-l-slate-300') :
                isConfirmed    ? 'border-l-emerald-400' :
                                 'border-l-amber-400'
              }`}>
                <div className="flex items-start gap-3">
                  {/* Avatar colaborador */}
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 font-black text-slate-500 text-sm">
                    {m.employee?.name?.slice(0,2).toUpperCase() ?? '??'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-800">{m.title}</p>
                      {/* Badge status */}
                      {isPast ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Realizada</span>
                      ) : isConfirmed ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                          <Check size={10}/> Confirmada
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                          <Clock size={10}/> Aguardando
                        </span>
                      )}
                      {mood && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">{mood.e} {mood.l}</span>}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                      <User size={11} />
                      <span className="font-semibold">{m.employee?.name ?? '—'}</span>
                      {m.employee?.job_title && <span className="opacity-60">· {m.employee.job_title}</span>}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                      <Calendar size={11} />
                      <span>{fmtDt(m.scheduled_at)}</span>
                    </div>

                    {m.notes && (
                      <p className="text-xs text-slate-500 mt-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 whitespace-pre-line">
                        <b className="text-slate-400 font-semibold">Pauta: </b>{m.notes}
                      </p>
                    )}

                    {isConfirmed && (
                      <p className="text-[11px] text-emerald-600 font-semibold mt-1.5">
                        ✓ Confirmada em {fmtDt(m.confirmed_at)}
                      </p>
                    )}

                    {/* Registro da reunião — só diretoria */}
                    {isAdmin && (rec ? (
                      <button onClick={() => setEditing(m)} className="mt-2.5 w-full text-left rounded-xl border border-violet-200 bg-violet-50/50 hover:bg-violet-50 px-3 py-2.5 transition-colors">
                        <p className="text-[11px] font-bold text-violet-700 flex items-center gap-1.5"><Lock size={11} /> Registro da reunião <span className="font-normal text-violet-400">· só diretoria · por {rec.updated_by || rec.created_by}</span></p>
                        {rec.summary && <p className="text-xs text-slate-600 mt-1 line-clamp-3 whitespace-pre-line">{rec.summary}</p>}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11px] text-slate-500">
                          {ag.length > 0 && <span className="flex items-center gap-1"><ListChecks size={12} className="text-sky-500" />{agDone}/{ag.length} combinados cumpridos</span>}
                          {rec.next_meeting && <span>Próxima conversa: {fmtDay(rec.next_meeting)}</span>}
                          <span className="text-violet-500 font-semibold ml-auto">Abrir / editar →</span>
                        </div>
                      </button>
                    ) : !recordsErr && (
                      <button onClick={() => setEditing(m)} className={`mt-2.5 flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border ${isPast ? 'border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                        <NotebookPen size={13} /> {isPast ? 'Registrar o que foi falado' : 'Anotações (só diretoria)'}
                      </button>
                    ))}
                  </div>

                  {/* Delete */}
                  {(!isPast || isAdmin) && (
                    <button onClick={() => handleDelete(m)} title="Excluir reunião" className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-400 transition-colors shrink-0">
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <RecordModal meeting={editing} record={records[editing.id]}
          onClose={() => setEditing(null)}
          onSaved={r => { setRecords(rs => ({ ...rs, [r.meeting_id]: r })); setEditing(null) }} />
      )}
    </div>
  )
}

// ── Registro da reunião (só diretoria) ─────────────────────────────────
function RecordModal({ meeting, record, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    summary: record?.summary || '', positives: record?.positives || '', improvements: record?.improvements || '',
    agreements: record?.agreements || [], private_notes: record?.private_notes || '',
    mood: record?.mood || '', next_meeting: record?.next_meeting || '',
  }))
  const [newAg, setNewAg] = useState({ text: '', owner: 'colaborador', due: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  function addAgreement() {
    if (!newAg.text.trim()) return
    set('agreements', [...f.agreements, { id: crypto.randomUUID(), text: newAg.text.trim(), owner: newAg.owner, due: newAg.due || null, done: false }])
    setNewAg({ text: '', owner: newAg.owner, due: '' })
  }
  const patchAg = (id, patch) => set('agreements', f.agreements.map(a => a.id === id ? { ...a, ...patch } : a))

  async function save() {
    // combinado digitado e não adicionado entra junto
    const agreements = newAg.text.trim()
      ? [...f.agreements, { id: crypto.randomUUID(), text: newAg.text.trim(), owner: newAg.owner, due: newAg.due || null, done: false }]
      : f.agreements
    setSaving(true)
    const { data, error } = await supabase.rpc('meeting_record_save', { p_token: sessionToken(), p_meeting_id: meeting.id, p_data: { ...f, agreements } })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Registro salvo.')
    onSaved(data)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-violet-600 flex items-center gap-1.5"><Lock size={11} /> Registro da reunião · só diretoria vê</p>
            <h3 className="font-bold text-slate-800 text-lg leading-tight mt-0.5">{meeting.title}</h3>
            <p className="text-xs text-slate-500">{meeting.employee?.name || '—'} · {fmtDt(meeting.scheduled_at)}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="px-6 py-4 flex flex-col gap-4">
          <div>
            <label className="form-label">Como foi a conversa</label>
            <div className="flex gap-2 flex-wrap">
              {MOODS.map(m => (
                <button key={m.v} type="button" onClick={() => set('mood', f.mood === m.v ? '' : m.v)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold border ${f.mood === m.v ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                  {m.e} {m.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">O que foi falado</label>
            <textarea className="input" rows={6} value={f.summary} onChange={e => set('summary', e.target.value)}
              placeholder="Resumo da conversa: assuntos, o que o colaborador trouxe, o que a diretoria trouxe…" />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="form-label">👍 Pontos positivos</label>
              <textarea className="input" rows={3} value={f.positives} onChange={e => set('positives', e.target.value)} placeholder="O que está indo bem" />
            </div>
            <div>
              <label className="form-label">🎯 Pontos a desenvolver</label>
              <textarea className="input" rows={3} value={f.improvements} onChange={e => set('improvements', e.target.value)} placeholder="O que precisa melhorar" />
            </div>
          </div>

          {/* Combinados */}
          <div>
            <label className="form-label flex items-center gap-1.5"><ListChecks size={14} /> O que ficou combinado</label>
            {f.agreements.length > 0 && (
              <ul className="flex flex-col gap-1.5 mb-2">
                {f.agreements.map(a => (
                  <li key={a.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${a.done ? 'bg-emerald-50/60 border-emerald-200' : 'border-slate-200'}`}>
                    <input type="checkbox" checked={!!a.done} onChange={e => patchAg(a.id, { done: e.target.checked })} className="w-4 h-4 accent-emerald-600" title="Cumprido" />
                    <input value={a.text} onChange={e => patchAg(a.id, { text: e.target.value })} className={`flex-1 min-w-0 text-sm bg-transparent outline-none ${a.done ? 'line-through text-slate-400' : 'text-slate-700'}`} />
                    <select value={a.owner} onChange={e => patchAg(a.id, { owner: e.target.value })} className="text-[11px] border border-slate-200 rounded-md px-1 py-0.5 bg-white text-slate-600">
                      {OWNERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input type="date" value={a.due || ''} onChange={e => patchAg(a.id, { due: e.target.value || null })} className="text-[11px] border border-slate-200 rounded-md px-1 py-0.5 bg-white text-slate-600" title="Prazo" />
                    <button onClick={() => set('agreements', f.agreements.filter(x => x.id !== a.id))} className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 flex-wrap">
              <input value={newAg.text} onChange={e => setNewAg(n => ({ ...n, text: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addAgreement()}
                placeholder="Ex: Fazer o curso de NR-12 até o fim do mês" className="input flex-1 min-w-[12rem] py-1.5 text-sm" />
              <select value={newAg.owner} onChange={e => setNewAg(n => ({ ...n, owner: e.target.value }))} className="select w-auto text-sm py-1.5">
                {OWNERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input type="date" value={newAg.due} onChange={e => setNewAg(n => ({ ...n, due: e.target.value }))} className="input w-auto text-sm py-1.5" title="Prazo (opcional)" />
              <button onClick={addAgreement} className="btn-secondary text-sm py-1.5"><Plus size={14} /> Adicionar</button>
            </div>
          </div>

          <div className="grid md:grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="form-label">🔒 Observações internas</label>
              <textarea className="input" rows={2} value={f.private_notes} onChange={e => set('private_notes', e.target.value)} placeholder="Algo só pra diretoria lembrar (salário, promoção, cuidado…)" />
            </div>
            <div>
              <label className="form-label">Próxima conversa</label>
              <input type="date" className="input" value={f.next_meeting || ''} onChange={e => set('next_meeting', e.target.value)} />
            </div>
          </div>

          {record && <p className="text-[11px] text-slate-400">Criado por {record.created_by} em {fmtDt(record.created_at)}{record.updated_at !== record.created_at ? ` · última edição: ${record.updated_by}, ${fmtDt(record.updated_at)}` : ''}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar registro</button>
        </div>
      </div>
    </div>
  )
}
