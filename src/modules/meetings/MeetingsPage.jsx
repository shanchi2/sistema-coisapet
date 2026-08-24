import { useState, useEffect, useMemo } from 'react'
import { Calendar, Plus, Check, Clock, User, X, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function fmtDt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
function fmtDate(d) {
  if (!d) return ''
  // yyyy-MM-dd para input datetime-local
  const dt = new Date(d)
  return dt.toISOString().slice(0, 16)
}

const EMPTY = { employee_id: '', title: '', scheduled_at: '', notes: '' }

export function MeetingsPage() {
  const [meetings, setMeetings]     = useState([])
  const [employees, setEmployees]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [form, setForm]             = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [filterStatus, setFilter]   = useState('upcoming') // upcoming | past | all
  const [error, setError]           = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: m }, { data: e }] = await Promise.all([
      supabase.from('meetings').select(`
        id, title, scheduled_at, notes, confirmed_at, created_at,
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
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const now = new Date().toISOString()
    if (filterStatus === 'upcoming') return meetings.filter(m => m.scheduled_at >= now)
    if (filterStatus === 'past')     return meetings.filter(m => m.scheduled_at < now)
    return meetings
  }, [meetings, filterStatus])

  async function handleSave() {
    setError('')
    if (!form.employee_id) return setError('Selecione o colaborador')
    if (!form.title.trim()) return setError('Informe o título')
    if (!form.scheduled_at) return setError('Informe a data e hora')
    setSaving(true)
    const { error: err } = await supabase.from('meetings').insert({
      employee_id:  form.employee_id,
      title:        form.title.trim(),
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      notes:        form.notes.trim() || null,
    })
    setSaving(false)
    if (err) return setError('Erro ao salvar: ' + err.message)
    setForm(EMPTY)
    setShowForm(false)
    loadAll()
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta reunião?')) return
    await supabase.from('meetings').delete().eq('id', id)
    loadAll()
  }

  const statusCounts = useMemo(() => {
    const now = new Date().toISOString()
    const upcoming = meetings.filter(m => m.scheduled_at >= now)
    return {
      pending:   upcoming.filter(m => !m.confirmed_at).length,
      confirmed: upcoming.filter(m => m.confirmed_at).length,
      total:     meetings.length,
    }
  }, [meetings])

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Reuniões</h2>
          <p className="page-subtitle">Agende reuniões individuais com a equipe</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          <Plus size={16} /> Nova reunião
        </button>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Aguardando confirmação', value: statusCounts.pending,   color: 'text-amber-600',  bg: 'bg-amber-50' },
          { label: 'Confirmadas (futuras)',   value: statusCounts.confirmed, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total agendamentos',      value: statusCounts.total,     color: 'text-slate-700',  bg: 'bg-slate-50' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-4 border border-slate-100`}>
            <p className="text-xs text-slate-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-black ${k.color}`} style={{fontFamily:'Nunito,sans-serif'}}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Formulário Nova Reunião */}
      {showForm && (
        <div className="card border-2 border-sky-100 bg-sky-50/40">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">Nova reunião individual</h3>
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
            </div>

            {/* Título */}
            <div className="md:col-span-2">
              <label className="form-label">Título da reunião *</label>
              <input type="text" className="input" placeholder="Ex: Avaliação de desempenho, Feedback mensal..."
                value={form.title} onChange={e => setForm(v => ({...v, title: e.target.value}))} />
            </div>

            {/* Notas/Pauta */}
            <div className="md:col-span-2">
              <label className="form-label">Pauta / Observações</label>
              <textarea className="input" rows={3} placeholder="Descreva os tópicos que serão abordados..."
                value={form.notes} onChange={e => setForm(v => ({...v, notes: e.target.value}))} />
            </div>
          </div>

          {error && <p className="text-rose-500 text-sm mt-3">{error}</p>}

          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Salvando…' : <><Calendar size={15}/> Agendar reunião</>}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY); setError('') }} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
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
            return (
              <div key={m.id} className={`card border-l-4 ${
                isPast         ? 'border-l-slate-300 opacity-70' :
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
                      <p className="text-xs text-slate-500 mt-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        {m.notes}
                      </p>
                    )}

                    {isConfirmed && (
                      <p className="text-[11px] text-emerald-600 font-semibold mt-1.5">
                        ✓ Confirmada em {fmtDt(m.confirmed_at)}
                      </p>
                    )}
                  </div>

                  {/* Delete */}
                  {!isPast && (
                    <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-400 transition-colors shrink-0">
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
