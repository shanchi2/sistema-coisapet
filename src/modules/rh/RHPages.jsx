import { useState, useEffect, useMemo, useRef } from 'react'
import {
  TrendingUp, TrendingDown, Calendar, FileText,
  Bell, Receipt, Check, X, Plus, Upload, Eye,
  Trash2, Send, RefreshCw, ChevronDown} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtDate, fmtDT, fmtH, Avatar, Badge, PageHeader, LoadingCard, EmptyState, getSession, viewStorageFile } from './rhHelpers'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// ─── BANCO DE HORAS ───────────────────────────────────────────────
export function RHHorasPage() {
  const [employees, setEmployees] = useState([])
  const [data,      setData]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selMonth,  setSelMonth]  = useState(new Date().toISOString().slice(0,7))

  useEffect(() => { loadEmployees() }, [])
  useEffect(() => { if (employees.length) calcHours() }, [selMonth, employees])

  async function loadEmployees() {
    const { data } = await supabase.from('system_users')
      .select('id,name,role,job_title,work_start,work_end,lunch_minutes').eq('active',true).order('name')
    setEmployees(data ?? [])
  }

  async function calcHours() {
    setLoading(true)
    const [y, m] = selMonth.split('-').map(Number)
    const { data: recs } = await supabase.from('time_records')
      .select('employee_id,punch_type,hours_worked,date')
      .gte('date', `${selMonth}-01`).lte('date', `${selMonth}-31`)

    const records = recs ?? []
    const daysInMonth = new Date(y, m, 0).getDate()
    const expectedDays = Math.round(daysInMonth * 5 / 7)

    const result = employees.map(e => {
      const myRecs  = records.filter(r => r.employee_id === e.id)
      const worked  = myRecs.filter(r => r.punch_type === 'saida').reduce((a, r) => a + (parseFloat(r.hours_worked)||0), 0)
      const daysW   = new Set(myRecs.filter(r => r.punch_type === 'entrada').map(r => r.date)).size
      const dailyH  = e.work_start && e.work_end
        ? (new Date(`2000-01-01T${e.work_end}`) - new Date(`2000-01-01T${e.work_start}`)) / 3600000 - (e.lunch_minutes||60)/60
        : 8
      const expected = expectedDays * dailyH
      const balance  = worked - expected
      return { ...e, worked, daysW, expected, balance, dailyH }
    })
    setData(result)
    setLoading(false)
  }

  const monthLabel = new Date(selMonth+'-01T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <PageHeader title="Banco de Horas" subtitle="Saldo de horas trabalhadas vs previstas por funcionário" />

      <div className="flex items-center gap-3">
        <input type="month" className="input w-auto" value={selMonth} onChange={e => setSelMonth(e.target.value)} />
        <span className="text-sm text-slate-500 font-semibold capitalize">{monthLabel}</span>
      </div>

      {loading ? <LoadingCard /> : (
        <div className="flex flex-col gap-4">
          {data.map(e => {
            const balPos = e.balance >= 0
            return (
              <div key={e.id} className="card">
                <div className="flex items-center gap-4 flex-wrap">
                  <Avatar name={e.name} size="lg" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800">{e.name}</p>
                    <p className="text-xs text-slate-400">{e.job_title || e.role} · {e.dailyH}h/dia</p>
                  </div>
                  {/* Saldo em destaque */}
                  <div className={`px-5 py-3 rounded-2xl border flex items-center gap-2 ${balPos ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                    {balPos ? <TrendingUp size={16} className="text-emerald-500" /> : <TrendingDown size={16} className="text-rose-500" />}
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wide ${balPos ? 'text-emerald-600' : 'text-rose-500'}`}>Saldo</p>
                      <p className={`text-xl font-black ${balPos ? 'text-emerald-700' : 'text-rose-600'}`} style={{fontFamily:'Nunito,sans-serif'}}>
                        {balPos ? '+' : '-'}{fmtH(Math.abs(e.balance))}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Barra de progresso */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-400 font-semibold mb-1.5">
                    <span>{fmtH(e.worked)} trabalhadas</span>
                    <span>{fmtH(e.expected)} previstas · {e.daysW} dias</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${balPos ? 'bg-emerald-400' : 'bg-rose-400'}`}
                      style={{ width: `${Math.min(100, (e.worked / Math.max(e.expected, 0.1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── FÉRIAS ───────────────────────────────────────────────────────
export function RHFeriasPage() {
  const [vacations, setVacations] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('pendente')
  const [target,    setTarget]    = useState(null)
  const [reason,    setReason]    = useState('')
  const [saving,    setSaving]    = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('vacation_requests')
      .select('*, employee:system_users!employee_id(name,job_title)')
      .order('created_at', { ascending: false })
    setVacations(data ?? [])
    setLoading(false)
  }

  async function review(id, status) {
    setSaving(true)
    const { id: uid } = getSession()
    const { error } = await supabase.from('vacation_requests').update({
      status, reviewed_by: uid,
      reviewed_at: new Date().toISOString(),
      reject_reason: status === 'rejeitado' ? reason : null,
    }).eq('id', id)
    if (error) { toast.error('Erro ao processar.'); setSaving(false); return }
    toast.success(status === 'aprovado' ? '✅ Férias aprovadas!' : 'Solicitação rejeitada.')
    setTarget(null); setReason(''); setSaving(false); load()
  }

  const FILT = [['pendente','Pendentes'],['aprovado','Aprovadas'],['rejeitado','Rejeitadas'],['','Todas']]
  const filtered = filter ? vacations.filter(v => v.status === filter) : vacations
  const pending  = vacations.filter(v => v.status === 'pendente').length

  const VAC_CLS = { pendente:'border-amber-300', aprovado:'border-emerald-300', rejeitado:'border-rose-300' }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <PageHeader title="Férias" subtitle="Solicitações de férias da equipe" />

      <div className="flex gap-2 flex-wrap">
        {FILT.map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${filter===v ? 'bg-rose-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {l}
            {v === 'pendente' && pending > 0 && (
              <span className="ml-1.5 bg-white text-rose-500 rounded-full w-4 h-4 inline-flex items-center justify-center text-[10px] font-black">{pending}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? <LoadingCard /> : filtered.length === 0 ? (
        <EmptyState icon={Calendar} title="Nenhuma solicitação" description="Nenhuma solicitação de férias encontrada para este filtro." />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(v => (
            <div key={v.id} className={`card border-l-4 ${VAC_CLS[v.status]||'border-slate-200'}`}>
              <div className="flex items-start gap-4 flex-wrap">
                <Avatar name={v.employee?.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-bold text-slate-800">{v.employee?.name}</p>
                    <Badge variant={v.status}>{v.status.charAt(0).toUpperCase()+v.status.slice(1)}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    <span className="font-semibold">{fmtDate(v.date_start)}</span>
                    <span className="text-slate-400 mx-2">→</span>
                    <span className="font-semibold">{fmtDate(v.date_end)}</span>
                    <span className="text-slate-400 ml-2">· {v.days} dias corridos</span>
                  </p>
                  {v.notes && <p className="text-xs text-slate-400 mt-1 italic">"{v.notes}"</p>}
                  {v.reject_reason && <p className="text-xs text-rose-500 mt-1">Motivo da rejeição: {v.reject_reason}</p>}
                  <p className="text-xs text-slate-300 mt-1">Solicitado em {fmtDT(v.created_at)}</p>
                </div>
                {v.status === 'pendente' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setTarget({...v, action:'aprovado'})}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
                      <Check size={13}/> Aprovar
                    </button>
                    <button onClick={() => setTarget({...v, action:'rejeitado'})}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition-colors">
                      <X size={13}/> Rejeitar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm */}
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
                <label className="form-label">Motivo <span className="text-slate-300">(opcional)</span></label>
                <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: Período de alta demanda" />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setTarget(null)} className="btn-secondary" disabled={saving}>Cancelar</button>
              <button onClick={() => review(target.id, target.action)} disabled={saving}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors ${target.action==='aprovado' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'}`}>
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ATESTADOS ────────────────────────────────────────────────────
export function RHAtestadosPage() {
  const [certs, setCerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('medical_certificates')
      .select('*, employee:system_users!employee_id(name,job_title)')
      .order('created_at', { ascending: false })
    setCerts(data ?? [])
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <PageHeader title="Atestados Médicos" subtitle="Atestados enviados pela equipe via app" />

      {loading ? <LoadingCard /> : certs.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum atestado enviado" description="Quando um funcionário enviar um atestado pelo app, ele aparecerá aqui." />
      ) : (
        <div className="flex flex-col gap-3">
          {certs.map(c => (
            <div key={c.id} className="card flex items-center gap-4 flex-wrap">
              <Avatar name={c.employee?.name} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800">{c.employee?.name}</p>
                <p className="text-xs text-slate-400">{c.employee?.job_title}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-400 font-semibold">Data</p>
                <p className="text-sm font-bold text-slate-700">{fmtDate(c.date)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-400 font-semibold">Afastamento</p>
                <p className="text-sm font-bold text-slate-700">{c.days_off} dia(s)</p>
              </div>
              {c.notes && (
                <div className="text-center max-w-[160px]">
                  <p className="text-xs text-slate-400 font-semibold">Observação</p>
                  <p className="text-xs text-slate-600 truncate">{c.notes}</p>
                </div>
              )}
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-300">{fmtDT(c.created_at)}</p>
                {c.file_url
                  ? <button onClick={() => viewStorageFile(c.file_url)}
                      className="flex items-center gap-1.5 text-xs font-bold text-sky-500 hover:text-sky-600 mt-1">
                      <Eye size={13}/> Ver arquivo
                    </button>
                  : <span className="text-xs text-slate-300">Sem arquivo</span>
                }
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── AVISOS ───────────────────────────────────────────────────────
function RichEditor({ value, onChange }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || ''
    }
  }, [value]) // reage quando value muda (ex: reset do form)

  function exec(cmd, val = null) {
    ref.current?.focus()
    document.execCommand(cmd, false, val)
    onChange(ref.current?.innerHTML || '')
  }

  async function handleImageUpload() {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'
    input.onchange = async e => {
      const file = e.target.files[0]; if (!file) return
      const reader = new FileReader()
      reader.onload = ev => {
        exec('insertImage', ev.target.result)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-slate-50 border-b border-slate-200 flex-wrap">
        {[
          { label: 'B', cmd: 'bold',          style: 'font-bold',   title: 'Negrito' },
          { label: 'I', cmd: 'italic',        style: 'italic',      title: 'Itálico' },
          { label: 'U', cmd: 'underline',     style: 'underline',   title: 'Sublinhado' },
        ].map(t => (
          <button key={t.cmd} type="button" title={t.title} onMouseDown={e => { e.preventDefault(); exec(t.cmd) }}
            className={`w-7 h-7 rounded text-sm ${t.style} text-slate-700 hover:bg-slate-200 transition-colors flex items-center justify-center`}>
            {t.label}
          </button>
        ))}
        <div className="w-px h-4 bg-slate-300 mx-1" />
        {[
          { label: 'H2', cmd: 'formatBlock', val: 'H2', title: 'Título' },
          { label: '¶',  cmd: 'formatBlock', val: 'P',  title: 'Parágrafo' },
        ].map(t => (
          <button key={t.cmd+t.val} type="button" title={t.title} onMouseDown={e => { e.preventDefault(); exec(t.cmd, t.val) }}
            className="px-2 h-7 rounded text-xs text-slate-700 hover:bg-slate-200 transition-colors font-semibold">
            {t.label}
          </button>
        ))}
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <button type="button" title="Inserir imagem" onMouseDown={e => { e.preventDefault(); handleImageUpload() }}
          className="w-7 h-7 rounded text-slate-700 hover:bg-slate-200 transition-colors flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </button>
        <button type="button" title="Link" onMouseDown={e => {
            e.preventDefault()
            const url = window.prompt('URL do link:')
            if (url) exec('createLink', url)
          }}
          className="w-7 h-7 rounded text-slate-700 hover:bg-slate-200 transition-colors flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        </button>
      </div>
      {/* Editor area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML || '')}
        className="min-h-[140px] p-3 text-sm text-slate-700 outline-none prose prose-sm max-w-none"
        style={{ lineHeight: '1.6' }}
        data-placeholder="Escreva o conteúdo do aviso... Use a barra acima para formatar."
      />
      <style>{`[contenteditable]:empty:before{content:attr(data-placeholder);color:#94a3b8;pointer-events:none}`}</style>
    </div>
  )
}

function AnnModal({ open, onClose, onSave }) {
  const [form, setForm] = useState({ title:'', body:'', priority:'normal', expires_at:'', employee_id:'' })
  const [saving,    setSaving]    = useState(false)
  const [employees, setEmployees] = useState([])
  const set = (k,v) => setForm(p => ({...p,[k]:v}))
  useEffect(() => {
    if (open) {
      setForm({ title:'', body:'', priority:'normal', expires_at:'', employee_id:'' })
      supabase.from('system_users').select('id,name').eq('active',true)
        .not('employee_type','eq','escritorio').order('name')
        .then(({data}) => setEmployees(data ?? []))
    }
  }, [open])
  async function save() {
    if (!form.title.trim()||!form.body.trim()||form.body==='<br>') { toast.error('Preencha título e conteúdo.'); return }
    setSaving(true); try { await onSave(form); onClose() } catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Publicar aviso" size="md"
      footer={<><button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={save} className="btn-primary" disabled={saving||!form.title.trim()}>
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <><Send size={14}/>Publicar</>}
        </button></>}>
      <div className="flex flex-col gap-4">
        <div><label className="form-label">Título *</label><input className="input" value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Ex: Reunião amanhã às 8h"/></div>
        <div>
          <label className="form-label">Conteúdo *</label>
          <RichEditor value={form.body} onChange={v => set('body', v)} />
        </div>
        <div><label className="form-label">Destinatário</label>
          <select className="select" value={form.employee_id} onChange={e=>set('employee_id',e.target.value)}>
            <option value="">📢 Todos os colaboradores</option>
            {employees.map(e => <option key={e.id} value={e.id}>👤 {e.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="form-label">Prioridade</label>
            <select className="select" value={form.priority} onChange={e=>set('priority',e.target.value)}>
              <option value="normal">Normal</option><option value="importante">Importante</option><option value="urgente">Urgente</option>
            </select></div>
          <div><label className="form-label">Expira em</label><input type="date" className="input" value={form.expires_at} onChange={e=>set('expires_at',e.target.value)}/></div>
        </div>
      </div>
    </Modal>
  )
}

export function RHAvisosPage() {
  const [anns,    setAnns]    = useState([])
  const [reads,   setReads]   = useState({})   // { ann_id: [{name, read_at}] }
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [delId,   setDelId]   = useState(null)
  const [expanded, setExpanded] = useState({}) // { ann_id: bool }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: annData }, { data: readData }] = await Promise.all([
      supabase.from('announcements')
        .select('*, author:system_users!created_by(name), recipient:system_users!employee_id(name)')
        .order('created_at', { ascending: false }),
      supabase.from('announcement_reads')
        .select('announcement_id, read_at, employee:system_users!employee_id(name)')
        .order('read_at', { ascending: true }),
    ])
    setAnns(annData ?? [])
    // Agrupa leituras por announcement_id
    const grouped = {}
    for (const r of readData ?? []) {
      if (!grouped[r.announcement_id]) grouped[r.announcement_id] = []
      grouped[r.announcement_id].push({ name: r.employee?.name ?? '?', read_at: r.read_at })
    }
    setReads(grouped)
    setLoading(false)
  }

  async function publish(form) {
    const { id } = getSession()
    const { error } = await supabase.from('announcements').insert({
      title:       form.title.trim(),
      body:        form.body.trim(),
      priority:    form.priority,
      created_by:  id,
      expires_at:  form.expires_at || null,
      employee_id: form.employee_id || null,
    })
    if (error) throw error; toast.success('Aviso publicado!'); load()
  }
  async function del(id) {
    await supabase.from('announcements').delete().eq('id',id)
    toast.success('Aviso removido.'); load()
  }

  const PRI = {
    normal:     { cls: 'border-slate-200', tag: null },
    importante: { cls: 'border-amber-300 bg-amber-50/40',  tag: <Badge variant="importante">Importante</Badge> },
    urgente:    { cls: 'border-rose-400   bg-rose-50/40',   tag: <Badge variant="urgente">Urgente</Badge>      },
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <PageHeader title="Avisos" subtitle="Comunicados publicados para a equipe via app"
        actions={<button onClick={() => setModal(true)} className="btn-primary"><Bell size={15}/>Publicar aviso</button>} />

      {loading ? <LoadingCard /> : anns.length === 0 ? (
        <EmptyState icon={Bell} title="Nenhum aviso publicado" description="Os avisos aparecem no app da equipe em tempo real."
          action={<button onClick={() => setModal(true)} className="btn-primary mx-auto inline-flex"><Plus size={15}/>Publicar agora</button>}/>
      ) : (
        <div className="flex flex-col gap-3">
          {anns.map(a => {
            const p       = PRI[a.priority] || PRI.normal
            const expired = a.expires_at && new Date(a.expires_at) < new Date()
            const readers = reads[a.id] ?? []
            const open    = !!expanded[a.id]

            // Extrai primeira imagem do body para exibir ao lado
            const imgMatch = a.body?.match(/<img[^>]+src="([^"]+)"/)
            const imgSrc   = imgMatch?.[1] ?? null
            // Remove a tag img do corpo para não duplicar
            const bodyNoImg = a.body?.replace(/<img[^>]*>/gi, '') ?? ''

            return (
              <div key={a.id} className={`card border-l-4 ${p.cls} ${expired ? 'opacity-60' : ''} transition-all`}>

                {/* ── Cabeçalho accordion (sempre visível) ── */}
                <div
                  className="flex items-center gap-3 cursor-pointer select-none"
                  onClick={() => setExpanded(e => ({...e, [a.id]: !e[a.id]}))}
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    {p.tag}
                    <p className="font-bold text-slate-800 truncate">{a.title}</p>
                    {a.employee_id
                      ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 shrink-0">👤 Direto</span>
                      : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">📢 Todos</span>
                    }
                    {expired && <span className="text-[10px] text-slate-400 font-semibold shrink-0">(Expirado)</span>}
                  </div>

                  {/* leitores mini */}
                  {readers.length > 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-500 shrink-0">
                      <svg width="14" height="9" viewBox="0 0 24 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2 7 7 12 15 4"/><polyline points="9 7 14 12 22 4"/>
                      </svg>
                      {readers.length}
                    </span>
                  )}

                  <button onClick={e=>{e.stopPropagation();setDelId(a.id)}}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0">
                    <Trash2 size={14}/>
                  </button>

                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"
                    className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>

                {/* ── Corpo accordion (expande) ── */}
                {open && (
                  <div className="mt-4 pt-4 border-t border-slate-100">

                    {/* 2 colunas: imagem | texto */}
                    <div className={`gap-4 ${imgSrc ? 'grid grid-cols-[160px_1fr]' : ''}`}>
                      {imgSrc && (
                        <div className="shrink-0">
                          <img src={imgSrc} alt="" className="w-40 h-28 object-cover rounded-xl border border-slate-100"/>
                        </div>
                      )}
                      <div
                        className="text-sm text-slate-600 leading-relaxed [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_p]:mb-2 min-w-0"
                        dangerouslySetInnerHTML={{ __html: bodyNoImg }}
                      />
                    </div>

                    {/* Meta */}
                    <p className="text-xs text-slate-400 mt-3">
                      Por {a.author?.name ?? 'Sistema'} · {fmtDT(a.created_at)}
                      {a.expires_at && ` · Expira ${fmtDate(a.expires_at.split('T')[0])}`}
                      {a.employee_id && a.recipient?.name && ` · Para: ${a.recipient.name}`}
                    </p>

                    {/* Leitores expandidos */}
                    {readers.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                          <svg width="14" height="9" viewBox="0 0 24 14" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="2 7 7 12 15 4"/><polyline points="9 7 14 12 22 4"/>
                          </svg>
                          Visualizado por
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {readers.map((r, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-[11px] font-semibold
                              bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2.5 py-1">
                              {r.name}
                              <span className="text-sky-400 font-normal">
                                · {new Date(r.read_at).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'})}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <AnnModal open={modal} onClose={() => setModal(false)} onSave={publish} />
      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} onConfirm={() => { del(delId); setDelId(null) }}
        title="Remover aviso?" description="O aviso será removido do app da equipe imediatamente." confirmLabel="Remover" />
    </div>
  )
}

// ─── HOLERITES ────────────────────────────────────────────────────
function PayModal({ open, onClose, employees, onSave }) {
  const [form, setForm] = useState({ employee_id:'', month:'', year:new Date().getFullYear(), reference:'' })
  const [file,   setFile]   = useState(null)
  const [mirror, setMirror] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [conflict, setConflict] = useState(null) // { existing, msg }
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const set = (k,v) => {
    setForm(p => { const n={...p,[k]:v}; if(k==='month'||k==='year') n.reference=n.month?`${MESES[parseInt(n.month)-1]}/${n.year}`:''; return n })
  }
  useEffect(() => { if (open) { setForm({ employee_id:'', month:'', year:new Date().getFullYear(), reference:'' }); setFile(null); setMirror(null); setConflict(null) } }, [open])
  async function save(forceOverwrite = false) {
    if (!form.employee_id||!form.month) { toast.error('Selecione funcionário e mês.'); return }
    if (!file && !mirror) { toast.error('Selecione pelo menos um arquivo (holerite ou espelho).'); return }

    // Verifica se já existe registro para este funcionário/mês
    if (!forceOverwrite) {
      const { data: existing } = await supabase
        .from('payslips')
        .select('id, file_url, mirror_url, reference')
        .eq('employee_id', form.employee_id)
        .eq('month', parseInt(form.month))
        .eq('year', parseInt(form.year))
        .maybeSingle()

      if (existing) {
        const hasHolerite = !!existing.file_url
        const hasMirror   = !!existing.mirror_url
        const what = hasHolerite && hasMirror
          ? 'holerite e espelho de ponto'
          : hasHolerite ? 'holerite' : 'espelho de ponto'
        const emp = employees.find(e => e.id === form.employee_id)
        setConflict({
          existing,
          msg: `Já existe um ${what} para ${emp?.name} em ${form.reference}. Deseja sobrepor?`
        })
        return
      }
    }

    setConflict(null)
    setSaving(true)
    try {
      const base = `holerites/${form.employee_id}/${form.year}-${String(form.month).padStart(2,'0')}`

      let path = null
      if (file) {
        const ext = file.name.split('.').pop()
        path = `${base}.${ext}`
        await supabase.storage.from('employee-docs').remove([path])
        const { error:ue } = await supabase.storage.from('employee-docs').upload(path, file)
        if (ue) throw ue
      }

      let mirrorPath = null
      if (mirror) {
        const mExt = mirror.name.split('.').pop()
        mirrorPath = `${base}-espelho.${mExt}`
        await supabase.storage.from('employee-docs').remove([mirrorPath])
        const { error:me } = await supabase.storage.from('employee-docs').upload(mirrorPath, mirror)
        if (me) throw me
      }
      await onSave({
        ...form,
        file_url:    path       || null,
        mirror_url:  mirrorPath || null,
        month:       parseInt(form.month),
        year:        parseInt(form.year)
      })
      onClose()
    } catch (e) { toast.error('Erro ao enviar: ' + (e?.message || 'tente novamente.')); console.error(e) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Enviar holerite"
      footer={<><button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={save} className="btn-primary" disabled={saving||!form.employee_id||!form.month||(!file&&!mirror)}>
          {saving?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<><Upload size={14}/>Enviar</>}
        </button></>}>
      <div className="flex flex-col gap-4">
        <div><label className="form-label">Funcionário *</label>
          <select className="select" value={form.employee_id} onChange={e=>set('employee_id',e.target.value)}>
            <option value="">Selecionar...</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="form-label">Mês *</label>
            <select className="select" value={form.month} onChange={e=>set('month',e.target.value)}>
              <option value="">Selecionar...</option>{MESES.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
            </select></div>
          <div><label className="form-label">Ano</label><input type="number" className="input" value={form.year} onChange={e=>set('year',e.target.value)} min="2020" max="2035"/></div>
        </div>
        {form.reference && <div className="bg-slate-50 rounded-xl px-4 py-2 border border-slate-100"><p className="text-xs text-slate-400">Referência: <strong className="text-slate-700">{form.reference}</strong></p></div>}
        {conflict && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <span className="text-amber-500 text-lg shrink-0">⚠️</span>
              <p className="text-sm font-semibold text-amber-800">{conflict.msg}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConflict(null)} className="btn-secondary flex-1 text-xs py-2">
                Cancelar
              </button>
              <button onClick={() => save(true)} className="flex-1 text-xs py-2 px-3 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors">
                Sim, sobrepor
              </button>
            </div>
          </div>
        )}
        <div><label className="form-label">Holerite (PDF) <span className="text-slate-400 font-normal">(opcional)</span></label>
          <label className="flex items-center gap-3 p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-rose-300 hover:bg-rose-50/30 transition-colors">
            <Upload size={18} className="text-slate-400 shrink-0"/>
            <div className="min-w-0"><p className="text-sm font-semibold text-slate-600 truncate">{file?file.name:'Selecionar PDF'}</p><p className="text-xs text-slate-400">Clique para escolher</p></div>
            <input type="file" accept=".pdf" className="hidden" onChange={e=>setFile(e.target.files[0])}/>
          </label></div>
        <div>
          <label className="form-label">Espelho de Ponto (PDF) <span className="text-slate-400 font-normal">(opcional)</span></label>
          <label className={`flex items-center gap-3 p-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${mirror?'border-emerald-300 bg-emerald-50/30':'border-slate-200 hover:border-sky-300 hover:bg-sky-50/30'}`}>
            <Upload size={18} className={`shrink-0 ${mirror?'text-emerald-500':'text-slate-400'}`}/>
            <div className="min-w-0">
              <p className={`text-sm font-semibold truncate ${mirror?'text-emerald-700':'text-slate-600'}`}>{mirror?mirror.name:'Selecionar espelho de ponto'}</p>
              <p className="text-xs text-slate-400">Relatório de ponto do mês</p>
            </div>
            <input type="file" accept=".pdf" className="hidden" onChange={e=>setMirror(e.target.files[0])}/>
          </label>
        </div>
      </div>
    </Modal>
  )
}

export function RHHoleritesPage() {
  const [employees, setEmployees] = useState([])
  const [payslips,  setPayslips]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [selEmp,    setSelEmp]    = useState('')
  const [delId,     setDelId]     = useState(null)

  useEffect(() => { loadEmployees() }, [])
  useEffect(() => { loadPayslips() }, [selEmp])

  async function loadEmployees() {
    const { data } = await supabase.from('system_users').select('id,name').eq('active',true).order('name')
    setEmployees(data ?? [])
  }
  async function loadPayslips() {
    setLoading(true)
    let q = supabase.from('payslips').select('*,employee:system_users!employee_id(name)').order('year',{ascending:false}).order('month',{ascending:false})
    if (selEmp) q = q.eq('employee_id', selEmp)
    const { data } = await q; setPayslips(data ?? []); setLoading(false)
  }
  async function save(form) {
    const { id } = getSession()
    // Tenta deletar versão anterior do mesmo mês/funcionário antes de inserir
    await supabase.from('payslips').delete()
      .eq('employee_id', form.employee_id)
      .eq('month', form.month)
      .eq('year', form.year)
    const payload = { ...form, created_by:id }
    if (!form.file_url)   delete payload.file_url
    if (!form.mirror_url) delete payload.mirror_url
    const { error } = await supabase.from('payslips').insert(payload)
    if (error) throw error; toast.success('Holerite enviado!'); loadPayslips()
  }
  async function del(id) {
    await supabase.from('payslips').delete().eq('id',id); toast.success('Removido.'); loadPayslips()
  }

  // Nomes dos meses em português
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  // Agrupa payslips por ano-mês, ordenado do mais recente para o mais antigo
  const grouped = useMemo(() => {
    const filtered = selEmp ? payslips.filter(p => p.employee_id === selEmp) : payslips
    const map = new Map()
    filtered.forEach(p => {
      const key = `${p.year}-${String(p.month).padStart(2,'0')}`
      if (!map.has(key)) map.set(key, { year: p.year, month: p.month, label: `${MESES[p.month-1]} ${p.year}`, items: [] })
      map.get(key).items.push(p)
    })
    // Ordena do mais recente para o mais antigo
    return Array.from(map.values()).sort((a,b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
  }, [payslips, selEmp])

  // Controla quais meses estão expandidos (abre o mais recente por padrão)
  const [openMonths, setOpenMonths] = useState(new Set())
  useEffect(() => {
    if (grouped.length > 0) {
      const key = `${grouped[0].year}-${String(grouped[0].month).padStart(2,'0')}`
      setOpenMonths(new Set([key]))
    }
  }, [grouped.length])

  function toggleMonth(key) {
    setOpenMonths(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <PageHeader title="Holerites" subtitle="Contracheques digitais por funcionário"
        actions={<button onClick={()=>setModal(true)} className="btn-primary"><Upload size={15}/>Enviar holerite</button>}/>

      <div className="flex gap-3">
        <select className="select w-auto min-w-[180px]" value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
          <option value="">Todos os funcionários</option>
          {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {loading ? <LoadingCard /> : grouped.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhum holerite" description="Envie os holerites e eles ficarão disponíveis no app da equipe."
          action={<button onClick={()=>setModal(true)} className="btn-primary mx-auto inline-flex"><Upload size={15}/>Enviar agora</button>}/>
      ) : (
        <div className="flex flex-col gap-3">
          {grouped.map(group => {
            const key = `${group.year}-${String(group.month).padStart(2,'0')}`
            const isOpen = openMonths.has(key)
            return (
              <div key={key} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                {/* Header do mês — clicável */}
                <button
                  onClick={() => toggleMonth(key)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                      <Receipt size={16} strokeWidth={1.5} className="text-violet-600"/>
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-slate-800">{group.label}</p>
                      <p className="text-xs text-slate-400">{group.items.length} {group.items.length === 1 ? 'funcionário' : 'funcionários'}</p>
                    </div>
                  </div>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}/>
                </button>

                {/* Lista de funcionários do mês */}
                {isOpen && (
                  <div className="border-t border-slate-100">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Funcionário</th>
                          <th>Holerite</th>
                          <th>Espelho de Ponto</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map(p => (
                          <tr key={p.id}>
                            <td>
                              <div className="flex items-center gap-2">
                                <Avatar name={p.employee?.name} size="sm"/>
                                <span className="font-semibold text-slate-800">{p.employee?.name}</span>
                              </div>
                            </td>
                            <td>
                              {p.file_url
                                ? <button onClick={()=>viewStorageFile(p.file_url)} className="flex items-center gap-1.5 text-xs font-bold text-sky-500 hover:text-sky-600"><Eye size={13}/>Ver PDF</button>
                                : <span className="text-xs text-slate-300">—</span>}
                            </td>
                            <td>
                              {p.mirror_url
                                ? <button onClick={()=>viewStorageFile(p.mirror_url)} className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 hover:text-emerald-600"><Eye size={13}/>Ver espelho</button>
                                : <span className="text-xs text-slate-300">—</span>}
                            </td>
                            <td>
                              <button onClick={()=>setDelId(p.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                                <Trash2 size={14}/>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <PayModal open={modal} onClose={()=>setModal(false)} employees={employees} onSave={save}/>
      <ConfirmDialog open={!!delId} onClose={()=>setDelId(null)} onConfirm={()=>{del(delId);setDelId(null)}} title="Remover holerite?" description="O holerite será removido do app do funcionário." confirmLabel="Remover"/>
    </div>
  )
}