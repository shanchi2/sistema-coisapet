import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Users, Clock, Calendar, FileText, Bell, QrCode,
  Check, X, ChevronDown, ChevronUp, Download, Upload,
  Plus, Search, Filter, RefreshCw, AlertTriangle,
  LogIn, LogOut, Coffee, TrendingUp, TrendingDown,
  Eye, Trash2, Send, DollarSign,
} from 'lucide-react'
import { supabase }      from '../../lib/supabase'
import { Modal }         from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// ─── Helpers ─────────────────────────────────────────────────────
const fmtTime  = d => !d ? '—' : new Date(d).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
const fmtDate  = d => !d ? '—' : new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })
const fmtDT    = d => !d ? '—' : new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
const fmtHours = h => {
  if (!h && h !== 0) return '—'
  const n = parseFloat(h); const hrs = Math.floor(n); const min = Math.round((n - hrs) * 60)
  return `${hrs}h${min > 0 ? `${String(min).padStart(2,'0')}m` : ''}`
}
const fmtMonth = (y, m) => new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// ─── Config visual ────────────────────────────────────────────────
const PUNCH_LABELS = {
  entrada:      { label: 'Entrada',       cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400', Icon: LogIn },
  saida_almoco: { label: 'Saída almoço',  cls: 'bg-amber-50 text-amber-700',    dot: 'bg-amber-400',   Icon: Coffee },
  volta_almoco: { label: 'Volta almoço',  cls: 'bg-sky-50 text-sky-700',        dot: 'bg-sky-400',     Icon: Coffee },
  saida:        { label: 'Saída',         cls: 'bg-rose-50 text-rose-600',      dot: 'bg-rose-400',    Icon: LogOut },
}

const VAC_STATUS = {
  pendente:  { label: 'Pendente',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  aprovado:  { label: 'Aprovado',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejeitado: { label: 'Rejeitado', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
}

// ─── Badge ────────────────────────────────────────────────────────
function Badge({ children, cls }) {
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full border ${cls}`}>
      {children}
    </span>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = 'rose', onClick }) {
  const colors = {
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-500'    },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500' },
    sky:     { bg: 'bg-sky-50',     icon: 'text-sky-500'     },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-500'   },
    violet:  { bg: 'bg-violet-50',  icon: 'text-violet-500'  },
  }
  const c = colors[color] || colors.rose
  return (
    <div
      className={`card flex items-center gap-4 py-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${c.bg}`}>
        <Icon size={20} className={c.icon} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-semibold truncate">{label}</p>
        <p className="text-2xl font-black text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Modal QR Code ────────────────────────────────────────────────
function QRModal({ open, onClose }) {
  if (!open) return null
  const url   = 'https://coisapet.com.br/equipe/?punch=COISAPET-PONTO-2025'
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}&bgcolor=F6F0E5&color=2e1609&margin=12`

  return (
    <Modal open={open} onClose={onClose} title="QR Code de Ponto" size="sm"
      subtitle="Imprima e fixe na entrada da empresa"
      footer={<button onClick={onClose} className="btn-secondary">Fechar</button>}>
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="p-3 bg-[#F6F0E5] rounded-2xl border border-slate-200 shadow-sm">
          <img src={qrSrc} alt="QR Code" className="w-56 h-56 rounded-xl" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700">QR Code único — todos os funcionários</p>
          <p className="text-xs text-slate-400 mt-1 font-mono break-all max-w-xs">{url}</p>
        </div>
        <div className="flex gap-2 w-full">
          <a href={qrSrc} download="qrcode-ponto-coisapet.png" className="btn-secondary flex-1 flex items-center justify-center gap-2">
            <Download size={14} /> Baixar PNG
          </a>
          <button
            onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copiado!') }}
            className="btn-secondary flex-1">
            Copiar link
          </button>
        </div>
        <p className="text-xs text-slate-400 text-center">
          O funcionário escaneia com o app da equipe.<br/>O sistema identifica quem é pelo login.
        </p>
      </div>
    </Modal>
  )
}

// ─── Modal Novo Aviso ─────────────────────────────────────────────
function AnnouncementModal({ open, onClose, onSave }) {
  const [form, setForm] = useState({ title: '', body: '', priority: 'normal', expires_at: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { if (open) setForm({ title: '', body: '', priority: 'normal', expires_at: '' }) }, [open])

  async function handleSave() {
    if (!form.title.trim() || !form.body.trim()) { toast.error('Preencha título e mensagem.'); return }
    setSaving(true)
    try { await onSave(form); onClose() } catch {} finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Publicar aviso" size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving || !form.title.trim() || !form.body.trim()}>
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><Send size={14} /> Publicar</>}
          </button>
        </>
      }>
      <div className="flex flex-col gap-4">
        <div>
          <label className="form-label">Título *</label>
          <input className="input" placeholder="Ex: Reunião amanhã às 8h" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Mensagem *</label>
          <textarea className="textarea" rows={4} placeholder="Descreva o aviso para a equipe..." value={form.body} onChange={e => set('body', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Prioridade</label>
            <select className="select" value={form.priority} onChange={e => set('priority', e.target.value)}>
              <option value="normal">Normal</option>
              <option value="importante">Importante</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div>
            <label className="form-label">Expira em</label>
            <input type="date" className="input" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal Upload Holerite ────────────────────────────────────────
function PayslipModal({ open, onClose, employees, onSave }) {
  const [form, setForm]     = useState({ employee_id: '', month: '', year: new Date().getFullYear(), reference: '' })
  const [file, setFile]     = useState(null)
  const [mirror, setMirror] = useState(null) // espelho de ponto
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) { setForm({ employee_id: '', month: '', year: new Date().getFullYear(), reference: '' }); setFile(null); setMirror(null) } }, [open])

  function buildRef(month, year) {
    if (!month || !year) return ''
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    return `${meses[parseInt(month) - 1]}/${year}`
  }

  const set = (k, v) => {
    setForm(p => {
      const next = { ...p, [k]: v }
      next.reference = buildRef(k === 'month' ? v : next.month, k === 'year' ? v : next.year)
      return next
    })
  }

  async function handleSave() {
    if (!form.employee_id || !form.month || !file) { toast.error('Preencha funcionário, mês e selecione o arquivo.'); return }
    setSaving(true)
    try {
      const base = `holerites/${form.employee_id}/${form.year}-${String(form.month).padStart(2,'0')}`
      // Upload holerite
      const ext  = file.name.split('.').pop()
      const path = `${base}.${ext}`
      const { error: upErr } = await supabase.storage.from('employee-docs').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      // Upload espelho (opcional)
      let mirrorPath = null
      if (mirror) {
        const mExt = mirror.name.split('.').pop()
        mirrorPath = `${base}-espelho.${mExt}`
        const { error: mErr } = await supabase.storage.from('employee-docs').upload(mirrorPath, mirror, { upsert: true })
        if (mErr) throw mErr
      }
      await onSave({ ...form, file_url: path, mirror_url: mirrorPath, month: parseInt(form.month), year: parseInt(form.year) })
      onClose()
    } catch (e) { toast.error('Erro ao fazer upload.'); console.error(e) } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Enviar holerite" size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving || !form.employee_id || !form.month || !file}>
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Upload size={14}/> Enviar</>}
          </button>
        </>
      }>
      <div className="flex flex-col gap-4">
        <div>
          <label className="form-label">Funcionário *</label>
          <select className="select" value={form.employee_id} onChange={e => set('employee_id', e.target.value)}>
            <option value="">Selecionar...</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Mês *</label>
            <select className="select" value={form.month} onChange={e => set('month', e.target.value)}>
              <option value="">Selecionar...</option>
              {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m,i) => (
                <option key={i+1} value={i+1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Ano</label>
            <input type="number" className="input" value={form.year} onChange={e => set('year', e.target.value)} min="2020" max="2030" />
          </div>
        </div>
        {form.reference && (
          <div className="bg-slate-50 rounded-xl px-4 py-2 border border-slate-100">
            <p className="text-xs text-slate-400">Referência: <strong className="text-slate-700">{form.reference}</strong></p>
          </div>
        )}
        <div>
          <label className="form-label">Holerite (PDF) *</label>
          <label className="flex items-center gap-3 p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-rose-300 hover:bg-rose-50/30 transition-colors">
            <Upload size={18} className="text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-600 truncate">{file ? file.name : 'Selecionar PDF'}</p>
              <p className="text-xs text-slate-400">Clique para escolher o arquivo</p>
            </div>
            <input type="file" accept=".pdf" className="hidden" onChange={e => setFile(e.target.files[0])} />
          </label>
        </div>
        <div>
          <label className="form-label">
            Espelho de Ponto (PDF)
            <span className="text-slate-400 font-normal ml-1">(opcional)</span>
          </label>
          <label className={`flex items-center gap-3 p-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors
            ${mirror ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 hover:border-sky-300 hover:bg-sky-50/30'}`}>
            <Upload size={18} className={mirror ? 'text-emerald-500 shrink-0' : 'text-slate-400 shrink-0'} />
            <div className="min-w-0">
              <p className={`text-sm font-semibold truncate ${mirror ? 'text-emerald-700' : 'text-slate-600'}`}>
                {mirror ? mirror.name : 'Selecionar espelho de ponto'}
              </p>
              <p className="text-xs text-slate-400">Relatório de ponto do mês</p>
            </div>
            <input type="file" accept=".pdf" className="hidden" onChange={e => setMirror(e.target.files[0])} />
          </label>
        </div>
      </div>
    </Modal>
  )
}

// ─── Aba: Visão Geral ─────────────────────────────────────────────
function TabOverview({ employees, records, vacations, certs, setTab }) {
  const today = new Date().toISOString().split('T')[0]
  const punchesToday = records.filter(r => r.date === today)
  const presentToday = new Set(punchesToday.map(r => r.employee_id)).size
  const pendingVacs  = vacations.filter(v => v.status === 'pendente').length

  // Quem está dentro (entrada sem saída hoje)
  const inOffice = employees.filter(e => {
    const todayRecs = punchesToday.filter(r => r.employee_id === e.id)
    if (!todayRecs.length) return false
    const last = todayRecs[todayRecs.length - 1]
    return last.punch_type === 'entrada' || last.punch_type === 'volta_almoco'
  })

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Users}       label="Funcionários ativos" value={employees.length} color="rose" />
        <KpiCard icon={Clock}       label="Presentes hoje"      value={presentToday}     color="emerald" />
        <KpiCard icon={Calendar}    label="Férias pendentes"    value={pendingVacs}      color="amber"
          onClick={() => setTab('ferias')} />
        <KpiCard icon={FileText}    label="Atestados (30 dias)" value={certs.length}     color="sky" />
      </div>

      {/* Presença hoje */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-700">Situação atual — {new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' })}</h3>
          <button onClick={() => setTab('ponto')} className="text-xs text-rose-500 font-semibold hover:text-rose-600">
            Ver detalhes →
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {employees.map(e => {
            const recs = punchesToday.filter(r => r.employee_id === e.id)
            const last = recs[recs.length - 1]
            const cfg = last ? PUNCH_LABELS[last.punch_type] : null
            return (
              <div key={e.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-xs font-black text-rose-500">
                  {e.name.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{e.name}</p>
                  <p className="text-xs text-slate-400 truncate">{e.job_title || e.role}</p>
                </div>
                {cfg
                  ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                  : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Ausente</span>
                }
              </div>
            )
          })}
        </div>
      </div>

      {/* Férias pendentes em destaque */}
      {pendingVacs > 0 && (
        <div className="card border-l-4 border-amber-400 bg-amber-50/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              <p className="text-sm font-bold text-amber-700">{pendingVacs} solicitação(ões) de férias aguardando aprovação</p>
            </div>
            <button onClick={() => setTab('ferias')} className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors">
              Revisar agora →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Aba: Registros de Ponto ──────────────────────────────────────
function TabPonto({ employees }) {
  const [records, setRecords]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [selEmp,  setSelEmp]      = useState('')
  const [selDate, setSelDate]     = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { loadRecords() }, [selEmp, selDate])

  async function loadRecords() {
    setLoading(true)
    let q = supabase.from('time_records')
      .select('*, employee:system_users(name,job_title)')
      .order('recorded_at', { ascending: false })
      .limit(300)
    if (selEmp)  q = q.eq('employee_id', selEmp)
    if (selDate) q = q.eq('date', selDate)
    const { data } = await q
    setRecords(data ?? [])
    setLoading(false)
  }

  // Agrupa por funcionário para o dia selecionado
  const grouped = useMemo(() => {
    const map = {}
    records.forEach(r => {
      if (!map[r.employee_id]) map[r.employee_id] = { name: r.employee?.name, job_title: r.employee?.job_title, recs: [] }
      map[r.employee_id].recs.push(r)
    })
    return Object.entries(map)
  }, [records])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <select className="select w-auto min-w-[180px]" value={selEmp} onChange={e => setSelEmp(e.target.value)}>
          <option value="">Todos os funcionários</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" className="input w-auto" value={selDate} onChange={e => setSelDate(e.target.value)} />
        <button onClick={() => setSelDate(new Date().toISOString().split('T')[0])} className="btn-secondary text-xs">Hoje</button>
        <button onClick={loadRecords} className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-semibold">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="card flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">
          <Clock size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Nenhum registro encontrado</p>
        </div>
      ) : grouped.map(([empId, { name, job_title, recs }]) => (
        <div key={empId} className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-xs font-black text-rose-500">
              {name?.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{name}</p>
              <p className="text-xs text-slate-400">{job_title}</p>
            </div>
            {/* Total do dia */}
            {recs.find(r => r.punch_type === 'saida') && (
              <div className="ml-auto text-right">
                <p className="text-xs text-slate-400">Total do dia</p>
                <p className="text-sm font-black text-emerald-600">{fmtHours(recs.find(r => r.punch_type === 'saida')?.hours_worked)}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-0">
            {[...recs].reverse().map(r => {
              const cfg = PUNCH_LABELS[r.punch_type] ?? { label: r.punch_type, cls: 'bg-slate-50 text-slate-600', dot: 'bg-slate-400', Icon: Clock }
              const IconComp = cfg.Icon
              return (
                <div key={r.id} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.cls}`}>
                    <IconComp size={10} /> {cfg.label}
                  </span>
                  <span className="font-mono text-sm text-slate-700 font-semibold">{fmtTime(r.recorded_at)}</span>
                  {r.hours_worked && <span className="text-xs text-emerald-600 font-bold ml-auto">+{fmtHours(r.hours_worked)}</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Aba: Banco de Horas ──────────────────────────────────────────
function TabHoras({ employees }) {
  const [selMonth, setSelMonth] = useState(new Date().toISOString().slice(0,7))
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { load() }, [selMonth])

  async function load() {
    setLoading(true)
    const [y, m] = selMonth.split('-').map(Number)
    // Busca registros do mês
    const { data: recs } = await supabase
      .from('time_records')
      .select('employee_id,punch_type,hours_worked,date')
      .gte('date', `${selMonth}-01`)
      .lte('date', `${selMonth}-31`)
    const records = recs ?? []

    const result = employees.map(e => {
      const myRecs   = records.filter(r => r.employee_id === e.id)
      const worked   = myRecs.filter(r => r.punch_type === 'saida').reduce((a, r) => a + (parseFloat(r.hours_worked) || 0), 0)
      const daysW    = new Set(myRecs.filter(r => r.punch_type === 'entrada').map(r => r.date)).size
      const dailyH   = e.work_start && e.work_end
        ? (new Date(`2000-01-01T${e.work_end}`) - new Date(`2000-01-01T${e.work_start}`)) / 3600000 - (e.lunch_minutes || 60) / 60
        : 8
      // Dias úteis no mês (aprox)
      const daysInMonth = new Date(y, m, 0).getDate()
      const expectedDays = Math.round(daysInMonth * 5 / 7)
      const expected = expectedDays * dailyH
      const balance  = worked - expected
      return { ...e, worked, daysW, expected, balance }
    })
    setData(result)
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <input type="month" className="input w-auto" value={selMonth} onChange={e => setSelMonth(e.target.value)} />
        <span className="text-sm text-slate-500 font-semibold capitalize">
          {new Date(selMonth + '-01T12:00:00').toLocaleDateString('pt-BR', { month:'long', year:'numeric' })}
        </span>
      </div>

      {loading ? (
        <div className="card flex justify-center py-12"><div className="w-7 h-7 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" /></div>
      ) : (
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
              {data.map(e => (
                <tr key={e.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center text-[10px] font-black text-rose-500 shrink-0">
                        {e.name.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-800">{e.name}</span>
                    </div>
                  </td>
                  <td className="text-slate-500 text-sm">{e.job_title || e.role}</td>
                  <td className="text-sm text-slate-700">{e.daysW} dias</td>
                  <td className="font-semibold text-slate-700">{fmtHours(e.worked)}</td>
                  <td className="text-sm text-slate-400">{fmtHours(e.expected)}</td>
                  <td>
                    <span className={`font-black text-sm flex items-center gap-1 ${e.balance >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {e.balance >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {e.balance >= 0 ? '+' : ''}{fmtHours(Math.abs(e.balance))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Aba: Férias ─────────────────────────────────────────────────
function TabFerias({ vacations, reload }) {
  const [filter, setFilter] = useState('pendente')
  const [target, setTarget] = useState(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = vacations.filter(v => !filter || v.status === filter)

  async function review(id, status) {
    setSaving(true)
    const session = getSession()
    const { error } = await supabase.from('vacation_requests').update({
      status, reviewed_by: session.id,
      reviewed_at: new Date().toISOString(),
      reject_reason: status === 'rejeitado' ? reason : null,
    }).eq('id', id)
    if (error) { toast.error('Erro ao processar.'); setSaving(false); return }
    toast.success(status === 'aprovado' ? '✅ Férias aprovadas!' : 'Solicitação rejeitada.')
    setTarget(null); setReason(''); setSaving(false)
    reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {[['pendente','Pendentes'],['aprovado','Aprovadas'],['rejeitado','Rejeitadas'],['','Todas']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              filter === v ? 'bg-rose-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {l}
            {v === 'pendente' && vacations.filter(x => x.status === 'pendente').length > 0 && (
              <span className="ml-1.5 bg-white text-rose-500 rounded-full w-4 h-4 inline-flex items-center justify-center text-[10px] font-black">
                {vacations.filter(x => x.status === 'pendente').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">
          <Calendar size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Nenhuma solicitação</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(v => (
            <div key={v.id} className={`card flex items-center gap-4 border-l-4 ${
              v.status === 'pendente' ? 'border-amber-400' : v.status === 'aprovado' ? 'border-emerald-400' : 'border-rose-400'
            }`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-bold text-slate-800">{v.employee?.name}</p>
                  <Badge cls={VAC_STATUS[v.status].cls}>{VAC_STATUS[v.status].label}</Badge>
                </div>
                <p className="text-sm text-slate-600 font-semibold">
                  {fmtDate(v.date_start)} → {fmtDate(v.date_end)}
                  <span className="text-slate-400 font-normal ml-2">· {v.days} dias</span>
                </p>
                {v.notes && <p className="text-xs text-slate-400 mt-1 italic">{v.notes}</p>}
                {v.status === 'rejeitado' && v.reject_reason && (
                  <p className="text-xs text-rose-500 mt-1">Motivo: {v.reject_reason}</p>
                )}
                <p className="text-xs text-slate-300 mt-1">Solicitado em {fmtDT(v.created_at)}</p>
              </div>
              {v.status === 'pendente' && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setTarget({ ...v, action: 'aprovado' })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
                    <Check size={13} /> Aprovar
                  </button>
                  <button onClick={() => setTarget({ ...v, action: 'rejeitado' })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition-colors">
                    <X size={13} /> Rejeitar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirm dialog */}
      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setTarget(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-1 text-lg">
              {target.action === 'aprovado' ? '✅ Aprovar férias?' : '❌ Rejeitar solicitação?'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              <strong>{target.employee?.name}</strong> · {fmtDate(target.date_start)} → {fmtDate(target.date_end)} · {target.days} dias
            </p>
            {target.action === 'rejeitado' && (
              <div className="mb-4">
                <label className="form-label">Motivo da rejeição <span className="text-slate-300">(opcional)</span></label>
                <input className="input" value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Ex: Período de alta demanda" />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setTarget(null)} className="btn-secondary" disabled={saving}>Cancelar</button>
              <button onClick={() => review(target.id, target.action)} disabled={saving}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors ${
                  target.action === 'aprovado' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
                }`}>
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Aba: Atestados ───────────────────────────────────────────────
function TabAtestados({ certs }) {
  async function viewFile(url) {
    const { data } = await supabase.storage.from('employee-docs').createSignedUrl(url, 3600)
    if (data) window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr><th>Funcionário</th><th>Data</th><th>Dias afastado</th><th>Observações</th><th>Enviado em</th><th>Arquivo</th></tr>
        </thead>
        <tbody>
          {certs.length === 0 ? (
            <tr><td colSpan={6} className="text-center py-12 text-slate-400">Nenhum atestado enviado</td></tr>
          ) : certs.map(c => (
            <tr key={c.id}>
              <td className="font-semibold text-slate-800">{c.employee?.name}</td>
              <td className="text-sm text-slate-600">{fmtDate(c.date)}</td>
              <td><span className="font-bold text-slate-700">{c.days_off}</span> <span className="text-slate-400 text-xs">dia(s)</span></td>
              <td className="text-sm text-slate-500 max-w-[200px] truncate">{c.notes || '—'}</td>
              <td className="text-xs text-slate-400">{fmtDT(c.created_at)}</td>
              <td>
                {c.file_url
                  ? <button onClick={() => viewFile(c.file_url)} className="flex items-center gap-1.5 text-xs font-bold text-sky-500 hover:text-sky-600">
                      <Eye size={13} /> Ver arquivo
                    </button>
                  : <span className="text-slate-300 text-sm">—</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Aba: Avisos ─────────────────────────────────────────────────
function TabAvisos({ announcements, onNew, reload }) {
  const [delId, setDelId] = useState(null)

  async function deleteAnn(id) {
    const { error } = await supabase.from('announcements').delete().eq('id', id)
    if (error) { toast.error('Erro ao remover.'); return }
    toast.success('Aviso removido.')
    reload()
  }

  const priorityStyle = {
    normal:     { cls: 'border-slate-200', tag: null },
    importante: { cls: 'border-amber-300 bg-amber-50/50', tag: <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-amber-900">IMPORTANTE</span> },
    urgente:    { cls: 'border-rose-300 bg-rose-50/50',   tag: <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white">URGENTE</span> },
  }

  return (
    <div className="flex flex-col gap-3">
      {announcements.length === 0 ? (
        <div className="card text-center py-14 text-slate-400">
          <Bell size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Nenhum aviso publicado</p>
          <button onClick={onNew} className="btn-primary mt-4 mx-auto inline-flex">
            <Plus size={15} /> Publicar primeiro aviso
          </button>
        </div>
      ) : announcements.map(a => {
        const ps = priorityStyle[a.priority] ?? priorityStyle.normal
        const expired = a.expires_at && new Date(a.expires_at) < new Date()
        return (
          <div key={a.id} className={`card border-l-4 ${ps.cls} ${expired ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {ps.tag}
                  <p className="font-bold text-slate-800">{a.title}</p>
                  {expired && <span className="text-[10px] text-slate-400 font-semibold">(Expirado)</span>}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{a.body}</p>
                <p className="text-xs text-slate-300 mt-2">
                  Por {a.author?.name ?? 'Sistema'} · {fmtDT(a.created_at)}
                  {a.expires_at && ` · Expira ${fmtDate(a.expires_at.split('T')[0])}`}
                </p>
              </div>
              <button onClick={() => setDelId(a.id)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        )
      })}

      <ConfirmDialog
        open={!!delId}
        onClose={() => setDelId(null)}
        onConfirm={() => { deleteAnn(delId); setDelId(null) }}
        title="Remover aviso?"
        description="O aviso será removido do mural da equipe imediatamente."
        confirmLabel="Remover"
      />
    </div>
  )
}

// ─── Aba: Holerites ───────────────────────────────────────────────
function TabHolerites({ employees, reload }) {
  const [payslips, setPayslips] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [selEmp,   setSelEmp]   = useState('')

  useEffect(() => { loadPs() }, [selEmp])

  async function loadPs() {
    setLoading(true)
    let q = supabase.from('payslips').select('*, employee:system_users(name)').order('year', { ascending: false }).order('month', { ascending: false })
    if (selEmp) q = q.eq('employee_id', selEmp)
    const { data } = await q
    setPayslips(data ?? [])
    setLoading(false)
  }

  async function savePayslip(form) {
    const session = getSession()
    const payload = {
      employee_id: form.employee_id,
      reference:   form.reference,
      month:       form.month,
      year:        form.year,
      file_url:    form.file_url,
      created_by:  session.id,
    }
    if (form.mirror_url) payload.mirror_url = form.mirror_url
    const { error } = await supabase.from('payslips').upsert(payload, { onConflict: 'employee_id,month,year' })
    if (error) throw error
    toast.success('Holerite enviado!')
    loadPs()
  }

  async function viewFile(url) {
    const { data } = await supabase.storage.from('employee-docs').createSignedUrl(url, 3600)
    if (data) window.open(data.signedUrl, '_blank')
  }

  async function deletePs(id) {
    await supabase.from('payslips').delete().eq('id', id)
    toast.success('Holerite removido.')
    loadPs()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <select className="select w-auto min-w-[180px]" value={selEmp} onChange={e => setSelEmp(e.target.value)}>
          <option value="">Todos os funcionários</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button onClick={() => setModal(true)} className="btn-primary ml-auto">
          <Upload size={15} /> Enviar holerite
        </button>
      </div>

      {loading ? (
        <div className="card flex justify-center py-12"><div className="w-7 h-7 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" /></div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Funcionário</th><th>Referência</th><th>Holerite</th><th>Espelho de Ponto</th><th></th></tr>
            </thead>
            <tbody>
              {payslips.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-10 text-slate-400">Nenhum holerite enviado</td></tr>
              ) : payslips.map(p => (
                <tr key={p.id}>
                  <td className="font-semibold text-slate-800">{p.employee?.name}</td>
                  <td className="text-sm text-slate-600 font-semibold">{p.reference}</td>
                  <td>
                    <button onClick={() => viewFile(p.file_url)} className="flex items-center gap-1.5 text-xs font-bold text-sky-500 hover:text-sky-600">
                      <Eye size={13} /> Ver PDF
                    </button>
                  </td>
                  <td>
                    {p.mirror_url ? (
                      <button onClick={() => viewFile(p.mirror_url)} className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 hover:text-emerald-600">
                        <Eye size={13} /> Ver espelho
                      </button>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td>
                    <button onClick={() => deletePs(p.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PayslipModal open={modal} onClose={() => setModal(false)} employees={employees} onSave={savePayslip} />
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────
export function RHPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'overview'
  function setTab(t) { setSearchParams(t === 'overview' ? {} : { tab: t }) }
  const [employees,     setEmployees]    = useState([])
  const [vacations,     setVacations]    = useState([])
  const [certs,         setCerts]        = useState([])
  const [announcements, setAnnouncements]= useState([])
  const [loading,       setLoading]      = useState(true)
  const [annModal,      setAnnModal]     = useState(false)
  const [qrModal,       setQrModal]      = useState(false)

  const pendingVacs = vacations.filter(v => v.status === 'pendente').length

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [empR, vacR, cerR, annR] = await Promise.all([
      supabase.from('system_users').select('id,name,email,role,job_title,active,work_start,work_end,lunch_minutes').eq('active', true).order('name'),
      supabase.from('vacation_requests').select('*, employee:system_users!employee_id(name)').order('created_at', { ascending: false }),
      supabase.from('medical_certificates').select('*, employee:system_users!employee_id(name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('announcements').select('*, author:system_users!created_by(name)').order('created_at', { ascending: false }),
    ])
    setEmployees(empR.data ?? [])
    setVacations(vacR.data ?? [])
    setCerts(cerR.data ?? [])
    setAnnouncements(annR.data ?? [])
    setLoading(false)
  }

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
    toast.success('Aviso publicado para a equipe!')
    loadAll()
  }

  const TABS = [
    { id: 'overview',  label: 'Visão Geral' },
    { id: 'ponto',     label: 'Registros de Ponto' },
    { id: 'horas',     label: 'Banco de Horas' },
    { id: 'ferias',    label: `Férias${pendingVacs > 0 ? ` (${pendingVacs})` : ''}` },
    { id: 'atestados', label: 'Atestados' },
    { id: 'avisos',    label: 'Avisos' },
    { id: 'holerites', label: 'Holerites' },
  ]

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Recursos Humanos</h2>
          <p className="page-subtitle">Ponto, férias, atestados, avisos e holerites da equipe</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setQrModal(true)} className="btn-secondary">
            <QrCode size={16} /> QR Code
          </button>
          <button onClick={() => setAnnModal(true)} className="btn-secondary">
            <Bell size={16} /> Publicar aviso
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap bg-slate-100 p-1 rounded-2xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
            style={{ fontFamily: 'Nunito, sans-serif' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="card flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
            <p className="text-sm text-slate-400">Carregando dados da equipe…</p>
          </div>
        </div>
      ) : (
        <>
          {tab === 'overview'  && <TabOverview employees={employees} records={[]} vacations={vacations} certs={certs} setTab={setTab} />}
          {tab === 'ponto'     && <TabPonto employees={employees} />}
          {tab === 'horas'     && <TabHoras employees={employees} />}
          {tab === 'ferias'    && <TabFerias vacations={vacations} reload={loadAll} />}
          {tab === 'atestados' && <TabAtestados certs={certs} />}
          {tab === 'avisos'    && <TabAvisos announcements={announcements} onNew={() => setAnnModal(true)} reload={loadAll} />}
          {tab === 'holerites' && <TabHolerites employees={employees} reload={loadAll} />}
        </>
      )}

      {/* Modals */}
      <AnnouncementModal open={annModal} onClose={() => setAnnModal(false)} onSave={publishAnnouncement} />
      <QRModal open={qrModal} onClose={() => setQrModal(false)} />
    </div>
  )
}