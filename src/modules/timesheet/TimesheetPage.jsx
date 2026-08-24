import { useState, useEffect, useMemo } from 'react'
import {
  Clock, Users, CheckCircle2, XCircle, AlertTriangle,
  Calendar, Download, ChevronLeft, ChevronRight,
  FileText, Bell, Plus, QrCode, Pencil, Check, X,
  TrendingUp, Coffee, LogIn, LogOut,
} from 'lucide-react'
import { supabase }       from '../../lib/supabase'
import { ConfirmDialog }  from '../../components/ui/ConfirmDialog'
import { Modal }          from '../../components/ui/Modal'
import toast from 'react-hot-toast'

// ─── Helpers ─────────────────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })
}
function fmtHours(h) {
  if (!h && h !== 0) return '—'
  const n = parseFloat(h)
  const hrs = Math.floor(n)
  const min = Math.round((n - hrs) * 60)
  return `${hrs}h${min > 0 ? `${String(min).padStart(2,'0')}m` : ''}`
}

const TYPE_CONFIG = {
  entrada:      { label: 'Entrada',       icon: LogIn,  color: 'text-emerald-600 bg-emerald-50' },
  saida_almoco: { label: 'Saída almoço',  icon: Coffee, color: 'text-amber-600 bg-amber-50'   },
  volta_almoco: { label: 'Volta almoço',  icon: Coffee, color: 'text-sky-600 bg-sky-50'        },
  saida:        { label: 'Saída',         icon: LogOut, color: 'text-rose-600 bg-rose-50'      },
}

const STATUS_CONFIG = {
  pendente:  { label: 'Pendente',  cls: 'bg-amber-50 text-amber-700'   },
  aprovado:  { label: 'Aprovado',  cls: 'bg-emerald-50 text-emerald-700' },
  rejeitado: { label: 'Rejeitado', cls: 'bg-rose-50 text-rose-600'     },
}

// ─── QR Code Modal ────────────────────────────────────────────────
function QRModal({ open, onClose, employee }) {
  if (!open || !employee) return null
  // Gera QR simples com a URL do app
  const appUrl = `${window.location.origin}/equipe/ponto?uid=${employee.id}`
  const qrSrc  = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(appUrl)}&bgcolor=ffffff&color=061F4A&margin=10`

  return (
    <Modal open={open} onClose={onClose} title="QR Code de Ponto" size="sm"
      subtitle={`Crachá de ${employee.name}`}
      footer={<button onClick={onClose} className="btn-secondary">Fechar</button>}>
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
          <img src={qrSrc} alt="QR Code" className="w-48 h-48" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700">{employee.name}</p>
          <p className="text-xs text-slate-400 mt-1">{employee.job_title || employee.role}</p>
        </div>
        <button
          onClick={() => {
            const a = document.createElement('a')
            a.href = qrSrc
            a.download = `qrcode-${employee.name.split(' ')[0].toLowerCase()}.png`
            a.click()
          }}
          className="btn-primary w-full justify-center">
          <Download size={15} /> Baixar QR Code
        </button>
        <p className="text-xs text-slate-400 text-center">
          Imprima e cole no crachá do funcionário
        </p>
      </div>
    </Modal>
  )
}

// ─── Modal: Novo aviso ────────────────────────────────────────────
function AnnouncementModal({ open, onClose, onSave }) {
  const [form, setForm] = useState({ title:'', body:'', priority:'normal', expires_at:'' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setForm({ title:'', body:'', priority:'normal', expires_at:'' }) }, [open])

  async function handleSave() {
    if (!form.title.trim() || !form.body.trim()) return
    setSaving(true)
    try { await onSave(form); onClose() }
    catch {} finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo Aviso" size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving || !form.title.trim() || !form.body.trim()}>
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <><Bell size={15}/> Publicar</>}
          </button>
        </>
      }>
      <div className="flex flex-col gap-4">
        <div>
          <label className="form-label">Título *</label>
          <input className="input" placeholder="Ex: Reunião amanhã às 8h"
            value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} />
        </div>
        <div>
          <label className="form-label">Mensagem *</label>
          <textarea className="textarea" rows={4} placeholder="Descreva o aviso..."
            value={form.body} onChange={e => setForm(p => ({...p, body: e.target.value}))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Prioridade</label>
            <select className="select" value={form.priority}
              onChange={e => setForm(p => ({...p, priority: e.target.value}))}>
              <option value="normal">Normal</option>
              <option value="importante">Importante</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div>
            <label className="form-label">Expira em (opcional)</label>
            <input type="date" className="input" value={form.expires_at}
              onChange={e => setForm(p => ({...p, expires_at: e.target.value}))} />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export function TimesheetPage() {
  const [tab,      setTab]      = useState('ponto')
  const [employees,setEmployees]= useState([])
  const [records,  setRecords]  = useState([])
  const [vacations,setVacations]= useState([])
  const [certs,    setCerts]    = useState([])
  const [payslips, setPayslips] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [loading,  setLoading]  = useState(true)

  // Filtros
  const [selEmployee, setSelEmployee] = useState('')
  const [selDate,     setSelDate]     = useState(new Date().toISOString().split('T')[0])
  const [selMonth,    setSelMonth]    = useState(new Date().toISOString().slice(0,7))

  // Modais
  const [qrEmployee,  setQrEmployee]  = useState(null)
  const [announcModal,setAnnounceModal]= useState(false)
  const [reviewTarget,setReviewTarget]= useState(null)
  const [rejectReason,setRejectReason]= useState('')
  const [saving,      setSaving]      = useState(false)

  function getSession() {
    try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
  }

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [empRes, recRes, vacRes, certRes, annRes] = await Promise.all([
      supabase.from('system_users').select('id,name,email,role,job_title,active,work_start,work_end,lunch_minutes').eq('active',true).order('name'),
      supabase.from('time_records').select('*,employee:system_users(name)').order('recorded_at',{ascending:false}).limit(200),
      supabase.from('vacation_requests').select('*,employee:system_users(name),reviewer:system_users!reviewed_by(name)').order('created_at',{ascending:false}),
      supabase.from('medical_certificates').select('*,employee:system_users(name)').order('created_at',{ascending:false}),
      supabase.from('announcements').select('*,author:system_users!created_by(name)').order('created_at',{ascending:false}),
    ])
    setEmployees(empRes.data ?? [])
    setRecords(recRes.data ?? [])
    setVacations(vacRes.data ?? [])
    setCerts(certRes.data ?? [])
    setAnnouncements(annRes.data ?? [])
    setLoading(false)
  }

  // ── Registros filtrados por dia / funcionário ─────────────────
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (selEmployee && r.employee_id !== selEmployee) return false
      if (selDate && r.date !== selDate) return false
      return true
    })
  }, [records, selEmployee, selDate])

  // ── Banco de horas por funcionário no mês ─────────────────────
  const hoursData = useMemo(() => {
    return employees.map(emp => {
      const monthRecords = records.filter(r =>
        r.employee_id === emp.id &&
        r.type === 'saida' &&
        r.date.startsWith(selMonth)
      )
      const workedH = monthRecords.reduce((a, r) => a + (parseFloat(r.hours_worked) || 0), 0)
      const daysWorked = new Set(
        records.filter(r => r.employee_id === emp.id && r.date.startsWith(selMonth) && r.type === 'entrada')
          .map(r => r.date)
      ).size

      // Dias úteis esperados no mês (simplificado)
      const [y, m] = selMonth.split('-').map(Number)
      const daysInMonth = new Date(y, m, 0).getDate()
      const expectedDays = Math.round(daysInMonth * 5 / 7)
      const dailyH = emp.work_start && emp.work_end
        ? (new Date(`2000-01-01T${emp.work_end}`) - new Date(`2000-01-01T${emp.work_start}`)) / 3600000
          - (emp.lunch_minutes || 60) / 60
        : 8
      const expectedH = expectedDays * dailyH
      const balance = workedH - expectedH

      return { ...emp, workedH, daysWorked, expectedH, balance }
    })
  }, [employees, records, selMonth])

  // ── Aprovar / rejeitar férias ─────────────────────────────────
  async function reviewVacation(id, status) {
    setSaving(true)
    const session = getSession()
    const { error } = await supabase
      .from('vacation_requests')
      .update({
        status,
        reviewed_by: session.id,
        reviewed_at: new Date().toISOString(),
        reject_reason: status === 'rejeitado' ? rejectReason : null,
      })
      .eq('id', id)
    if (error) { toast.error('Erro ao revisar.'); setSaving(false); return }
    toast.success(status === 'aprovado' ? 'Férias aprovadas! ✅' : 'Férias rejeitadas.')
    setReviewTarget(null); setRejectReason('')
    setSaving(false)
    loadAll()
  }

  // ── Publicar aviso ────────────────────────────────────────────
  async function publishAnnouncement(form) {
    const session = getSession()
    const { error } = await supabase.from('announcements').insert({
      title:      form.title.trim(),
      body:       form.body.trim(),
      priority:   form.priority,
      created_by: session.id,
      expires_at: form.expires_at || null,
    })
    if (error) throw error
    toast.success('Aviso publicado!')
    loadAll()
  }

  // ── Remover aviso ─────────────────────────────────────────────
  async function deleteAnnouncement(id) {
    await supabase.from('announcements').delete().eq('id', id)
    toast.success('Aviso removido.')
    loadAll()
  }

  const pendingVacations = vacations.filter(v => v.status === 'pendente').length

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Gestão de Ponto</h2>
          <p className="page-subtitle">Registros, banco de horas, férias e comunicados</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnnounceModal(true)} className="btn-secondary">
            <Bell size={16}/> Novo aviso
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit flex-wrap">
        {[
          ['ponto',    '⏱️ Registros'],
          ['horas',    '📊 Banco de Horas'],
          ['ferias',   `🏖️ Férias${pendingVacations > 0 ? ` (${pendingVacations})` : ''}`],
          ['atestados','🏥 Atestados'],
          ['avisos',   '📢 Avisos'],
          ['qrcodes',  '🔲 QR Codes'],
        ].map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab===v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            style={{ fontFamily:'Nunito,sans-serif' }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
        </div>
      ) : (

        <>
          {/* ── ABA: Registros de Ponto ── */}
          {tab === 'ponto' && (
            <div className="flex flex-col gap-4">
              {/* Filtros */}
              <div className="flex flex-wrap gap-3">
                <select className="select w-auto min-w-[180px]" value={selEmployee}
                  onChange={e => setSelEmployee(e.target.value)}>
                  <option value="">Todos os funcionários</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <input type="date" className="input w-auto" value={selDate}
                  onChange={e => setSelDate(e.target.value)} />
                <button onClick={() => setSelDate(new Date().toISOString().split('T')[0])}
                  className="btn-secondary text-xs">Hoje</button>
              </div>

              {/* Tabela */}
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Funcionário</th>
                      <th>Tipo</th>
                      <th>Horário</th>
                      <th>Data</th>
                      <th>Horas trabalhadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-400">Nenhum registro encontrado</td></tr>
                    ) : filteredRecords.map(r => {
                      const cfg = TYPE_CONFIG[r.punch_type] ?? { label: r.type, icon: Clock, color: 'text-slate-500 bg-slate-50' }
                      const Icon = cfg.icon
                      return (
                        <tr key={r.id}>
                          <td className="font-semibold text-slate-800">{r.employee?.name ?? '—'}</td>
                          <td>
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>
                              <Icon size={10}/> {cfg.label}
                            </span>
                          </td>
                          <td className="font-mono text-sm text-slate-700">{fmtTime(r.recorded_at)}</td>
                          <td className="text-sm text-slate-500">{fmtDate(r.date)}</td>
                          <td>
                            {r.hours_worked
                              ? <span className="font-semibold text-emerald-600">{fmtHours(r.hours_worked)}</span>
                              : <span className="text-slate-300">—</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ABA: Banco de Horas ── */}
          {tab === 'horas' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <input type="month" className="input w-auto" value={selMonth}
                  onChange={e => setSelMonth(e.target.value)} />
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Funcionário</th>
                      <th>Cargo</th>
                      <th>Dias trabalhados</th>
                      <th>Horas trabalhadas</th>
                      <th>Horas previstas</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hoursData.map(e => (
                      <tr key={e.id}>
                        <td className="font-semibold text-slate-800">{e.name}</td>
                        <td className="text-sm text-slate-500">{e.job_title || e.role}</td>
                        <td className="text-sm text-slate-700">{e.daysWorked} dias</td>
                        <td className="font-semibold text-slate-700">{fmtHours(e.workedH)}</td>
                        <td className="text-sm text-slate-500">{fmtHours(e.expectedH)}</td>
                        <td>
                          <span className={`font-bold ${e.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {e.balance >= 0 ? '+' : ''}{fmtHours(Math.abs(e.balance))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ABA: Férias ── */}
          {tab === 'ferias' && (
            <div className="flex flex-col gap-3">
              {vacations.length === 0 ? (
                <div className="card"><div className="flex flex-col items-center py-12 gap-2">
                  <Calendar size={32} className="text-slate-200"/>
                  <p className="text-slate-400 font-semibold">Nenhuma solicitação de férias</p>
                </div></div>
              ) : vacations.map(v => (
                <div key={v.id} className="card flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800">{v.employee?.name}</p>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_CONFIG[v.status].cls}`}>
                        {STATUS_CONFIG[v.status].label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {fmtDate(v.date_start)} → {fmtDate(v.date_end)} · {v.days} dias
                    </p>
                    {v.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{v.notes}</p>}
                    {v.status === 'rejeitado' && v.reject_reason && (
                      <p className="text-xs text-rose-500 mt-0.5">Motivo: {v.reject_reason}</p>
                    )}
                  </div>
                  {v.status === 'pendente' && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setReviewTarget({ ...v, action: 'aprovado' })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
                        <Check size={13}/> Aprovar
                      </button>
                      <button onClick={() => setReviewTarget({ ...v, action: 'rejeitado' })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition-colors">
                        <X size={13}/> Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Confirm review */}
              {reviewTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setReviewTarget(null)} />
                  <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-1">
                      {reviewTarget.action === 'aprovado' ? '✅ Aprovar férias?' : '❌ Rejeitar férias?'}
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                      {reviewTarget.employee?.name} — {fmtDate(reviewTarget.date_start)} → {fmtDate(reviewTarget.date_end)}
                    </p>
                    {reviewTarget.action === 'rejeitado' && (
                      <div className="mb-4">
                        <label className="form-label">Motivo da rejeição (opcional)</label>
                        <input className="input" value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          placeholder="Ex: Período de alta demanda" />
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setReviewTarget(null)} className="btn-secondary" disabled={saving}>Cancelar</button>
                      <button onClick={() => reviewVacation(reviewTarget.id, reviewTarget.action)}
                        className={reviewTarget.action === 'aprovado' ? 'btn-primary' : 'px-4 py-2 rounded-xl text-sm font-bold bg-rose-500 text-white hover:bg-rose-600 transition-colors'}
                        disabled={saving}>
                        {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ABA: Atestados ── */}
          {tab === 'atestados' && (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Funcionário</th><th>Data</th><th>Dias</th><th>Observações</th><th>Arquivo</th></tr>
                </thead>
                <tbody>
                  {certs.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-slate-400">Nenhum atestado enviado</td></tr>
                  ) : certs.map(c => (
                    <tr key={c.id}>
                      <td className="font-semibold text-slate-800">{c.employee?.name}</td>
                      <td className="text-sm text-slate-500">{fmtDate(c.date)}</td>
                      <td className="text-sm font-semibold text-slate-700">{c.days_off} dia(s)</td>
                      <td className="text-sm text-slate-500">{c.notes || '—'}</td>
                      <td>
                        {c.file_url ? (
                          <button onClick={async () => {
                            const { data } = await supabase.storage.from('employee-docs').createSignedUrl(c.file_url, 3600)
                            if (data) window.open(data.signedUrl, '_blank')
                          }} className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600 font-semibold">
                            <FileText size={13}/> Ver arquivo
                          </button>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── ABA: Avisos ── */}
          {tab === 'avisos' && (
            <div className="flex flex-col gap-3">
              {announcements.map(a => {
                const priCls = a.priority === 'urgente' ? 'border-rose-200 bg-rose-50'
                  : a.priority === 'importante' ? 'border-amber-200 bg-amber-50'
                  : 'border-slate-200 bg-white'
                return (
                  <div key={a.id} className={`card border-l-4 ${priCls}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {a.priority !== 'normal' && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              a.priority === 'urgente' ? 'bg-rose-500 text-white' : 'bg-amber-400 text-amber-900'
                            }`}>{a.priority}</span>
                          )}
                          <p className="font-bold text-slate-800">{a.title}</p>
                        </div>
                        <p className="text-sm text-slate-600 mt-1 leading-relaxed">{a.body}</p>
                        <p className="text-xs text-slate-400 mt-2">
                          Por {a.author?.name ?? 'Sistema'} · {new Date(a.created_at).toLocaleDateString('pt-BR')}
                          {a.expires_at && ` · Expira em ${fmtDate(a.expires_at.split('T')[0])}`}
                        </p>
                      </div>
                      <button onClick={() => deleteAnnouncement(a.id)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0">
                        <X size={15}/>
                      </button>
                    </div>
                  </div>
                )
              })}
              {announcements.length === 0 && (
                <div className="card flex flex-col items-center py-12 gap-2">
                  <Bell size={32} className="text-slate-200"/>
                  <p className="text-slate-400 font-semibold">Nenhum aviso publicado</p>
                  <button onClick={() => setAnnounceModal(true)} className="btn-primary mt-2">
                    <Plus size={15}/> Publicar primeiro aviso
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── ABA: QR Codes ── */}
          {tab === 'qrcodes' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {employees.map(e => (
                <div key={e.id} className="card flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 font-bold text-rose-500">
                    {e.name.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{e.name}</p>
                    <p className="text-xs text-slate-400">{e.job_title || e.role}</p>
                  </div>
                  <button onClick={() => setQrEmployee(e)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-white hover:bg-slate-700 transition-colors shrink-0">
                    <QrCode size={13}/> QR Code
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modais */}
      <QRModal open={!!qrEmployee} onClose={() => setQrEmployee(null)} employee={qrEmployee} />
      <AnnouncementModal open={announcModal} onClose={() => setAnnounceModal(false)} onSave={publishAnnouncement} />
    </div>
  )
}
