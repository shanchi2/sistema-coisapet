import { useState, useEffect, useMemo } from 'react'
import {
  Wrench, Plus, Trash2, Edit2, Calendar, AlertTriangle,
  Clock, CheckCircle2, ChevronDown, ChevronUp, X, Save, Bell,
  ToggleLeft, ToggleRight, BarChart2, List, Printer, ChevronLeft, ChevronRight as ChevRight, CalendarDays,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// ─── Helpers ──────────────────────────────────────────────────────
const fmtDate      = d => !d ? '—' : new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})
const fmtDateFull  = d => !d ? '—' : new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})
const fmtDateShort = d => !d ? '—' : new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})
const today        = () => new Date().toISOString().split('T')[0]
const subDays      = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0] }

function getSession(){
  try{ return JSON.parse(localStorage.getItem('coisapet_session')||'{}') }catch{ return {} }
}
function daysUntil(dateStr){
  if(!dateStr) return null
  return Math.ceil((new Date(dateStr+' 12:00:00') - new Date()) / 86400000)
}
function UrgencyBadge({ date }){
  const days = daysUntil(date)
  if(days===null) return null
  if(days<0)  return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 border border-rose-200"><AlertTriangle size={9}/> Atrasado {Math.abs(days)}d</span>
  if(days<=3) return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200"><Bell size={9}/> {days===0?'Hoje':days+'d'}</span>
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500"><Calendar size={9}/> {fmtDateShort(date)}</span>
}

// ─── Machine Form Modal ───────────────────────────────────────────
function MachineModal({ machine, open, onClose, onSave }){
  const [form, setForm] = useState({name:'',sector:'',type:''})
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(p=>({...p,[k]:v}))
  useEffect(()=>{
    if(machine?.id) setForm({name:machine.name||'',sector:machine.sector||'',type:machine.type||''})
    else setForm({name:'',sector:'',type:''})
  },[machine])
  async function handleSave(){
    if(!form.name.trim()||!form.sector.trim()||!form.type.trim()){ toast.error('Preencha todos os campos.'); return }
    setSaving(true)
    try{ await onSave({...machine,...form}); onClose() }
    catch{ toast.error('Erro ao salvar.') }
    finally{ setSaving(false) }
  }
  return(
    <Modal open={open} onClose={onClose} title={machine?.id?'Editar máquina':'Nova máquina'} size="sm"
      footer={<div className="flex gap-2 ml-auto"><button onClick={onClose} className="btn-secondary">Cancelar</button><button onClick={handleSave} disabled={saving} className="btn-primary">{saving?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<><Save size={14}/> Salvar</>}</button></div>}>
      <div className="flex flex-col gap-3">
        <div><label className="form-label">Nome da máquina *</label><input className="input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Ex: Laser CO2 01"/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="form-label">Setor *</label><input className="input" value={form.sector} onChange={e=>set('sector',e.target.value)} placeholder="Ex: Corte"/></div>
          <div><label className="form-label">Tipo *</label><input className="input" value={form.type} onChange={e=>set('type',e.target.value)} placeholder="Ex: Laser"/></div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Log Form Modal ───────────────────────────────────────────────
function LogModal({ machines, initialMachine, log, open, onClose, onSave }){
  const emptyForm = { machine_id: initialMachine?.id||'', description:'', performed_at:today(), notes:'' }
  const [form,       setForm]       = useState(emptyForm)
  const [recurrence, setRecurrence] = useState(false)
  const [nextDate,   setNextDate]   = useState('')
  const [alertDays,  setAlertDays]  = useState(3)
  const [saving,     setSaving]     = useState(false)
  const set = (k,v) => setForm(p=>({...p,[k]:v}))
  useEffect(()=>{
    if(log){
      setForm({ machine_id:log.machine_id||initialMachine?.id||'', description:log.description||'', performed_at:log.performed_at||today(), notes:log.notes||'' })
      if(log.next_service_at){ setRecurrence(true); setNextDate(log.next_service_at); setAlertDays(log.alert_days_before||3) }
      else { setRecurrence(false); setNextDate(''); setAlertDays(3) }
    } else {
      setForm({ machine_id:initialMachine?.id||'', description:'', performed_at:today(), notes:'' })
      setRecurrence(false); setNextDate(''); setAlertDays(3)
    }
  },[log, initialMachine, open])
  async function handleSave(){
    if(!form.machine_id)        { toast.error('Selecione uma máquina.'); return }
    if(!form.description.trim()){ toast.error('Descrição obrigatória.'); return }
    if(!form.performed_at)      { toast.error('Informe a data.'); return }
    if(recurrence && !nextDate) { toast.error('Informe a data do próximo serviço.'); return }
    setSaving(true)
    const{id:uid}=getSession()
    const payload = { ...log, machine_id:form.machine_id, description:form.description, performed_at:form.performed_at, notes:form.notes||null, next_service_at:recurrence?nextDate:null, alert_days_before:recurrence?alertDays:null, performed_by:uid||null }
    try{ await onSave(payload); onClose() }
    catch{ toast.error('Erro ao salvar.') }
    finally{ setSaving(false) }
  }
  return(
    <Modal open={open} onClose={onClose} title={log?.id?'Editar manutenção':'Registrar manutenção'} size="sm"
      footer={<div className="flex gap-2 ml-auto"><button onClick={onClose} className="btn-secondary">Cancelar</button><button onClick={handleSave} disabled={saving} className="btn-primary">{saving?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<><Save size={14}/> Salvar</>}</button></div>}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="form-label">Máquina *</label>
          <select className="select w-full" value={form.machine_id} onChange={e=>set('machine_id',e.target.value)}>
            <option value="">Selecionar máquina...</option>
            {[...machines].sort((a,b)=>a.sector.localeCompare(b.sector)||a.name.localeCompare(b.name)).map(m=>(
              <option key={m.id} value={m.id}>{m.name} — {m.sector}</option>
            ))}
          </select>
        </div>
        <div><label className="form-label">Serviço realizado *</label><textarea className="textarea" rows={2} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Ex: Limpeza de chapas e canaletas"/></div>
        <div><label className="form-label">Data da manutenção *</label><input type="date" className="input" value={form.performed_at} onChange={e=>set('performed_at',e.target.value)}/></div>
        <div>
          <button type="button" onClick={()=>setRecurrence(r=>!r)}
            className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border transition-all text-sm font-semibold ${recurrence?'bg-amber-50 border-amber-300 text-amber-700':'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            {recurrence?<ToggleRight size={18} className="text-amber-500 shrink-0"/>:<ToggleLeft size={18} className="text-slate-400 shrink-0"/>}
            <Bell size={13} className={recurrence?'text-amber-500':'text-slate-400'}/>
            Agendar próximo serviço
          </button>
          {recurrence && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl grid grid-cols-2 gap-3">
              <div><label className="text-xs text-amber-700 font-bold mb-1 block">Data do próximo serviço *</label><input type="date" className="input text-sm" value={nextDate} onChange={e=>setNextDate(e.target.value)} min={today()}/></div>
              <div><label className="text-xs text-amber-700 font-bold mb-1 block">Alertar X dias antes</label><input type="number" className="input text-sm" min={1} max={30} value={alertDays} onChange={e=>setAlertDays(parseInt(e.target.value)||3)}/></div>
            </div>
          )}
        </div>
        <div><label className="form-label">Observações</label><textarea className="textarea" rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Detalhes adicionais..."/></div>
      </div>
    </Modal>
  )
}

// ─── Machine Card ─────────────────────────────────────────────────
function MachineCard({ machine, logs, onEdit, onDelete, onAddLog, onEditLog, onDeleteLog }){
  const [expanded, setExpanded] = useState(false)
  const [delLog,   setDelLog]   = useState(null)
  const machineLogs = logs.filter(l=>l.machine_id===machine.id).sort((a,b)=>new Date(b.performed_at)-new Date(a.performed_at))
  const nextService = machineLogs.find(l=>l.next_service_at)
  const lastMaint   = machineLogs[0]
  return(
    <div className="card overflow-hidden">
      <div className="flex items-center gap-4 cursor-pointer" onClick={()=>setExpanded(e=>!e)}>
        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0"><Wrench size={18} className="text-slate-500"/></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-800">{machine.name}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{machine.type}</span>
            <span className="text-[10px] font-semibold text-slate-400">{machine.sector}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {lastMaint && <span className="text-xs text-slate-400 flex items-center gap-1"><CheckCircle2 size={10} className="text-emerald-400"/> Última: {fmtDateShort(lastMaint.performed_at)}</span>}
            {nextService && <UrgencyBadge date={nextService.next_service_at}/>}
            {machineLogs.length===0 && <span className="text-xs text-slate-400">Nenhuma manutenção registrada</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={e=>{e.stopPropagation();onAddLog(machine)}} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Registrar manutenção"><Plus size={14}/></button>
          <button onClick={e=>{e.stopPropagation();onEdit(machine)}} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"><Edit2 size={14}/></button>
          <button onClick={e=>{e.stopPropagation();onDelete(machine)}} className="p-2 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors"><Trash2 size={14}/></button>
          {expanded?<ChevronUp size={16} className="text-slate-400"/>:<ChevronDown size={16} className="text-slate-400"/>}
        </div>
      </div>
      {expanded && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Histórico de manutenções</span>
            <button onClick={()=>onAddLog(machine)} className="flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-rose-600"><Plus size={12}/> Registrar</button>
          </div>
          {machineLogs.length===0
            ? <p className="text-sm text-slate-400 text-center py-6">Nenhuma manutenção registrada ainda</p>
            : <div className="flex flex-col gap-2">
                {machineLogs.map(log=>(
                  <div key={log.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5"><Wrench size={13} className="text-emerald-600"/></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700">{log.description}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={9}/> {fmtDate(log.performed_at)}</span>
                        {log.next_service_at && <span className="flex items-center gap-1.5"><Bell size={9} className="text-amber-400"/><span className="text-xs text-slate-400">Próximo:</span><UrgencyBadge date={log.next_service_at}/></span>}
                      </div>
                      {log.notes && <p className="text-xs text-slate-400 mt-1 italic">{log.notes}</p>}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={()=>onEditLog(machine,log)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700"><Edit2 size={11}/></button>
                      <button onClick={()=>setDelLog(log)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500"><Trash2 size={11}/></button>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}
      <ConfirmDialog open={!!delLog} onClose={()=>setDelLog(null)} onConfirm={()=>{onDeleteLog(delLog);setDelLog(null)}}
        title="Excluir registro?" description="Este registro de manutenção será removido permanentemente." confirmLabel="Excluir"/>
    </div>
  )
}

// ─── Relatório ────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { value: '7',    label: 'Últimos 7 dias'  },
  { value: '30',   label: 'Últimos 30 dias' },
  { value: '60',   label: 'Últimos 60 dias' },
  { value: 'custom', label: 'Personalizado' },
]

function ReportView({ logs, machines }){
  const [period,    setPeriod]    = useState('30')
  const [customStart, setCustomStart] = useState(subDays(30))
  const [customEnd,   setCustomEnd]   = useState(today())
  const [filterMachine, setFilterMachine] = useState('')

  // Calcula intervalo
  const { startDate, endDate } = useMemo(()=>{
    if(period === 'custom') return { startDate: customStart, endDate: customEnd }
    return { startDate: subDays(parseInt(period)), endDate: today() }
  }, [period, customStart, customEnd])

  // Filtra logs no período
  const filtered = useMemo(()=>{
    return logs
      .filter(l => l.performed_at >= startDate && l.performed_at <= endDate)
      .filter(l => !filterMachine || l.machine_id === filterMachine)
      .map(l => ({ ...l, machine: machines.find(m => m.id === l.machine_id) }))
      .sort((a,b) => b.performed_at.localeCompare(a.performed_at))
  }, [logs, startDate, endDate, filterMachine, machines])

  // Agrupa por dia
  const byDay = useMemo(()=>{
    const groups = {}
    filtered.forEach(l => {
      if(!groups[l.performed_at]) groups[l.performed_at] = []
      groups[l.performed_at].push(l)
    })
    return Object.entries(groups).sort(([a],[b]) => b.localeCompare(a))
  }, [filtered])

  // Stats
  const machineCount = new Set(filtered.map(l=>l.machine_id)).size
  const dayCount     = byDay.length

  function handlePrint(){
    const w = window.open('', '_blank')
    const periodLabel = period === 'custom'
      ? `${fmtDate(customStart)} a ${fmtDate(customEnd)}`
      : PERIOD_OPTIONS.find(p=>p.value===period)?.label

    w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>Relatório de Manutenção</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',sans-serif;font-size:11px;color:#1e293b;padding:24px}
      h1{font-size:18px;font-weight:900;color:#0f172a;margin-bottom:2px}
      .sub{font-size:10px;color:#94a3b8;margin-bottom:20px}
      .stats{display:flex;gap:16px;margin-bottom:20px}
      .stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 18px;text-align:center}
      .stat .n{font-size:22px;font-weight:900;color:#0f172a}
      .stat .l{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
      .day-header{background:#f1f5f9;padding:8px 12px;border-radius:6px;font-weight:700;font-size:12px;color:#334155;margin:16px 0 8px;text-transform:capitalize}
      table{width:100%;border-collapse:collapse;margin-bottom:8px}
      th{padding:6px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc}
      td{padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:10px;vertical-align:top}
      .mach{font-weight:700;color:#1e293b}.sec{color:#94a3b8;font-size:9px}
      .next{color:#d97706;font-size:9px;margin-top:2px}
      .notes{color:#64748b;font-style:italic;font-size:9px;margin-top:2px}
      @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body>`)

    w.document.write(`
    <h1>Relatório de Manutenção</h1>
    <p class="sub">Período: ${periodLabel} &nbsp;·&nbsp; ${filtered.length} registro(s) em ${dayCount} dia(s) &nbsp;·&nbsp; ${machineCount} máquina(s) &nbsp;·&nbsp; Gerado em ${fmtDate(today())}</p>
    <div class="stats">
      <div class="stat"><div class="n">${filtered.length}</div><div class="l">Manutenções</div></div>
      <div class="stat"><div class="n">${dayCount}</div><div class="l">Dias com registro</div></div>
      <div class="stat"><div class="n">${machineCount}</div><div class="l">Máquinas atendidas</div></div>
    </div>`)

    byDay.forEach(([date, dayLogs]) => {
      w.document.write(`<div class="day-header">${fmtDateFull(date)}</div>
      <table><thead><tr><th>Máquina</th><th>Setor</th><th>Serviço realizado</th><th>Próximo serviço</th></tr></thead><tbody>`)
      dayLogs.forEach(l => {
        w.document.write(`<tr>
          <td><span class="mach">${l.machine?.name ?? '—'}</span></td>
          <td><span class="sec">${l.machine?.sector ?? '—'}</span></td>
          <td>${l.description}${l.notes?`<div class="notes">${l.notes}</div>`:''}</td>
          <td>${l.next_service_at?`<span class="next">📅 ${fmtDate(l.next_service_at)}</span>`:'—'}</td>
        </tr>`)
      })
      w.document.write('</tbody></table>')
    })

    w.document.write('</body></html>')
    w.document.close()
    w.focus()
    setTimeout(()=>w.print(), 400)
  }

  return(
    <div className="flex flex-col gap-5">

      {/* Controles do relatório */}
      <div className="card flex flex-wrap items-end gap-4">
        {/* Seletor de período */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Período</p>
          <div className="flex gap-1.5 flex-wrap">
            {PERIOD_OPTIONS.map(o=>(
              <button key={o.value} onClick={()=>setPeriod(o.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  period===o.value ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}>{o.label}</button>
            ))}
          </div>
          {/* Datas personalizadas */}
          {period==='custom' && (
            <div className="flex items-center gap-2 mt-2">
              <input type="date" className="input text-sm w-36" value={customStart} onChange={e=>setCustomStart(e.target.value)} max={customEnd}/>
              <span className="text-slate-400 text-sm">até</span>
              <input type="date" className="input text-sm w-36" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} min={customStart} max={today()}/>
            </div>
          )}
        </div>

        {/* Filtro de máquina */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Máquina</p>
          <select className="select w-auto min-w-[200px]" value={filterMachine} onChange={e=>setFilterMachine(e.target.value)}>
            <option value="">Todas as máquinas</option>
            {[...machines].sort((a,b)=>a.sector.localeCompare(b.sector)||a.name.localeCompare(b.name)).map(m=>(
              <option key={m.id} value={m.id}>{m.name} — {m.sector}</option>
            ))}
          </select>
        </div>

        {/* Imprimir */}
        <button onClick={handlePrint} disabled={filtered.length===0}
          className="btn-secondary flex items-center gap-1.5 ml-auto self-end disabled:opacity-40">
          <Printer size={15}/> Imprimir relatório
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Manutenções realizadas', value: filtered.length,  color: 'text-slate-800' },
          { label: 'Dias com registros',     value: dayCount,          color: 'text-slate-800' },
          { label: 'Máquinas atendidas',     value: machineCount,      color: 'text-slate-800' },
        ].map(s=>(
          <div key={s.label} className="card text-center py-4">
            <p className={`text-3xl font-black ${s.color}`} style={{fontFamily:'Nunito,sans-serif'}}>{s.value}</p>
            <p className="text-xs text-slate-400 font-semibold mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Lista agrupada por dia */}
      {filtered.length===0 ? (
        <div className="card text-center py-14">
          <BarChart2 size={32} className="mx-auto mb-3 text-slate-200"/>
          <p className="font-bold text-slate-600">Nenhum registro no período</p>
          <p className="text-sm text-slate-400 mt-1">Tente ampliar o intervalo de datas.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {byDay.map(([date, dayLogs])=>(
            <div key={date} className="flex flex-col gap-2">
              {/* Header do dia */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center justify-center w-12 h-12 rounded-2xl bg-slate-800 text-white shrink-0">
                  <span className="text-lg font-black leading-none" style={{fontFamily:'Nunito,sans-serif'}}>
                    {new Date(date+'T12:00:00').getDate()}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wide opacity-70">
                    {new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{month:'short'})}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-slate-800 capitalize">{fmtDateFull(date)}</p>
                  <p className="text-xs text-slate-400">{dayLogs.length} manutenção(ões)</p>
                </div>
              </div>

              {/* Registros do dia */}
              <div className="ml-15 flex flex-col gap-2" style={{marginLeft:'60px'}}>
                {dayLogs.map(l=>(
                  <div key={l.id} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Wrench size={13} className="text-emerald-600"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-800 text-sm">{l.machine?.name ?? '—'}</p>
                        {l.machine?.sector && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{l.machine.sector}</span>}
                        {l.machine?.type  && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">{l.machine.type}</span>}
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{l.description}</p>
                      {l.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{l.notes}</p>}
                      {l.next_service_at && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Bell size={10} className="text-amber-400"/>
                          <span className="text-xs text-amber-600 font-semibold">Próximo serviço: {fmtDate(l.next_service_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// ─── Calendar View ────────────────────────────────────────────────
const WEEKDAYS_CAL = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']
const MONTH_NAMES_CAL = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function CalendarDayModal({ date, events, onClose }){
  const todayStr = today()
  if(!date) return null
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[80vh]" style={{border:'1px solid #F1F5F9'}}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-base">{fmtDateFull(date)}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{events.length} evento(s)</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400"><X size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {events.length===0
            ? <p className="text-sm text-slate-400 text-center py-8">Nenhum evento neste dia.</p>
            : events.map((ev,i)=>{
                const isLate = ev.kind==='next' && ev.next_service_at < todayStr
                const bg  = ev.kind==='done' ? 'bg-emerald-50 border-emerald-200' : isLate ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'
                const ico = ev.kind==='done' ? 'bg-emerald-200' : isLate ? 'bg-rose-200' : 'bg-amber-200'
                const lbl = ev.kind==='done' ? 'text-emerald-600' : isLate ? 'text-rose-600' : 'text-amber-600'
                const txt = ev.kind==='done' ? 'Manutenção realizada' : isLate ? `Atrasado ${Math.abs(daysUntil(ev.next_service_at))}d — serviço não confirmado` : 'Próximo serviço agendado'
                return(
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${bg}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${ico}`}>
                      {ev.kind==='done'
                        ? <CheckCircle2 size={14} className="text-emerald-700"/>
                        : isLate
                          ? <AlertTriangle size={14} className="text-rose-700"/>
                          : <Bell size={14} className="text-amber-700"/>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-800 text-sm">{ev.machine?.name ?? '—'}</p>
                        {ev.machine?.sector && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/60 text-slate-500">{ev.machine.sector}</span>}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{ev.description}</p>
                      {ev.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{ev.notes}</p>}
                      <p className={`text-[10px] font-bold mt-1 ${lbl}`}>{txt}</p>
                    </div>
                  </div>
                )
              })
          }
        </div>
      </div>
    </div>
  )
}

function CalendarView({ logs, machines }){
  const now = new Date()
  const [year,   setYear]   = useState(now.getFullYear())
  const [month,  setMonth]  = useState(now.getMonth())
  const [selDay, setSelDay] = useState(null)

  function prevMonth(){ if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }
  function nextMonth(){ if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }

  const eventsByDate = useMemo(()=>{
    const map = {}
    logs.forEach(l=>{
      const machine = machines.find(m=>m.id===l.machine_id)
      if(l.performed_at){
        if(!map[l.performed_at]) map[l.performed_at]=[]
        map[l.performed_at].push({...l, machine, kind:'done'})
      }
      if(l.next_service_at){
        if(!map[l.next_service_at]) map[l.next_service_at]=[]
        map[l.next_service_at].push({...l, machine, kind:'next'})
      }
    })
    return map
  },[logs, machines])

  const daysInMonth = new Date(year, month+1, 0).getDate()
  const firstDow    = new Date(year, month, 1).getDay()
  const todayStr    = now.toISOString().split('T')[0]

  const cells = []
  for(let i=0; i<firstDow; i++) cells.push(null)
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0')
    cells.push({ d, dateStr, events: eventsByDate[dateStr]||[] })
  }
  while(cells.length%7!==0) cells.push(null)

  const selEvents = selDay ? (eventsByDate[selDay]||[]) : []
  const monthLabel = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][month]

  return(
    <div className="flex flex-col gap-4">
      <div className="card flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><ChevronLeft size={18}/></button>
          <div className="text-center min-w-[160px]">
            <p className="font-black text-slate-800 text-lg" style={{fontFamily:'Nunito,sans-serif'}}>{monthLabel}</p>
            <p className="text-xs text-slate-400 font-semibold">{year}</p>
          </div>
          <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><ChevRight size={18}/></button>
        </div>
        <button onClick={()=>{setYear(now.getFullYear());setMonth(now.getMonth())}}
          className="text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-all">
          Hoje
        </button>
        <div className="flex items-center gap-4 ml-auto text-xs font-semibold">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-400"/><span className="text-slate-500">Realizada</span></span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400"/><span className="text-slate-500">Agendada</span></span>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100">
          {['Dom','Seg','Ter','Qua','Qui','Sex','Sab'].map(w=>(
            <div key={w} className="py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell,i)=>{
            if(!cell) return <div key={'e'+i} className="min-h-[80px] border-b border-r border-slate-50 bg-slate-50/30 last:border-r-0"/>
            const isToday  = cell.dateStr===todayStr
            const isPast   = cell.dateStr<todayStr
            const hasDone  = cell.events.some(e=>e.kind==='done')
            const hasNext  = cell.events.some(e=>e.kind==='next')
            const isLastCol = (i+1)%7===0
            return(
              <div key={cell.dateStr}
                onClick={()=>cell.events.length>0 && setSelDay(cell.dateStr)}
                className={[
                  'min-h-[100px] border-b p-2 flex flex-col transition-colors',
                  !isLastCol ? 'border-r border-slate-100' : '',
                  cell.events.length>0 ? 'cursor-pointer hover:bg-slate-50' : '',
                  isToday ? 'bg-sky-50/60' : '',
                ].join(' ')}
              >
                <div className={[
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 shrink-0',
                  isToday ? 'bg-sky-500 text-white' : isPast ? 'text-slate-400' : 'text-slate-700',
                ].join(' ')}>
                  {cell.d}
                </div>
                <div className="flex flex-col gap-0.5 flex-1">
                  {cell.events.filter(e=>e.kind==='done').map((ev,i)=>(
                    <div key={'d'+i} className="flex items-start gap-1.5 px-1.5 py-1 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold overflow-hidden">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"/>
                      <span className="leading-tight flex flex-col min-w-0">
                        <span className="font-black truncate">{ev.machine?.name ?? 'Manut.'}</span>
                        {ev.description && <span className="font-normal opacity-75 truncate">{ev.description}</span>}
                      </span>
                    </div>
                  ))}
                  {cell.events.filter(e=>e.kind==='next').map((ev,i)=>{
                    const isLate = ev.next_service_at < todayStr
                    return(
                      <div key={'n'+i} className={`flex items-start gap-1.5 px-1.5 py-1 rounded text-[10px] font-bold overflow-hidden ${isLate ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLate ? 'bg-rose-500' : 'bg-amber-500'}`}/>
                        <span className="leading-tight flex flex-col min-w-0">
                          <span className="font-black truncate">{ev.machine?.name ?? 'Agend.'}</span>
                          {ev.description && <span className="font-normal opacity-75 truncate">{ev.description}</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selDay && <CalendarDayModal date={selDay} events={selEvents} onClose={()=>setSelDay(null)}/>}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export function MaintenancePage(){
  const [machines,   setMachines]   = useState([])
  const [logs,       setLogs]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [view,       setView]       = useState('report') // 'report' | 'list' | 'calendar'
  const [machModal,  setMachModal]  = useState(null)
  const [logModal,   setLogModal]   = useState(null)
  const [delMachine, setDelMachine] = useState(null)
  const [filterSec,  setFilterSec]  = useState('')

  useEffect(()=>{ load() },[])

  async function load(){
    setLoading(true)
    const [mR,lR]=await Promise.all([
      supabase.from('machines').select('*').eq('active',true).order('sector').order('name'),
      supabase.from('maintenance_logs').select('*').order('performed_at',{ascending:false}),
    ])
    setMachines(mR.data??[])
    setLogs(lR.data??[])
    setLoading(false)
  }

  async function saveMachine(data){
    if(data.id){
      const{error}=await supabase.from('machines').update({name:data.name,sector:data.sector,type:data.type}).eq('id',data.id)
      if(error) throw error; toast.success('Máquina atualizada!')
    } else {
      const{error}=await supabase.from('machines').insert({name:data.name,sector:data.sector,type:data.type})
      if(error) throw error; toast.success('Máquina cadastrada!')
    }
    load()
  }

  async function deleteMachine(machine){
    await supabase.from('machines').update({active:false}).eq('id',machine.id)
    toast.success('Máquina removida.'); setDelMachine(null); load()
  }

  async function saveLog(data){
    const{id:uid}=getSession()
    if(data.id){
      const{error}=await supabase.from('maintenance_logs').update({
        machine_id:data.machine_id,description:data.description,performed_at:data.performed_at,
        next_service_at:data.next_service_at,alert_days_before:data.alert_days_before,notes:data.notes,
      }).eq('id',data.id)
      if(error) throw error; toast.success('Registro atualizado!')
    } else {
      const{error}=await supabase.from('maintenance_logs').insert({
        machine_id:data.machine_id,description:data.description,performed_at:data.performed_at,
        next_service_at:data.next_service_at,alert_days_before:data.alert_days_before,
        notes:data.notes||null,performed_by:uid||null,
      })
      if(error) throw error; toast.success('Manutenção registrada!')
    }
    load()
  }

  async function deleteLog(log){
    await supabase.from('maintenance_logs').delete().eq('id',log.id)
    toast.success('Registro removido.'); load()
  }

  const alerts = logs.filter(l=>{ const d=daysUntil(l.next_service_at); return d!==null&&d<=7 })
    .map(l=>({...l,machine:machines.find(m=>m.id===l.machine_id)}))
    .filter(l=>l.machine)
    .sort((a,b)=>new Date(a.next_service_at)-new Date(b.next_service_at))

  const sectors  = [...new Set(machines.map(m=>m.sector))].sort()
  const filtered = filterSec ? machines.filter(m=>m.sector===filterSec) : machines

  return(
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Manutenção de Máquinas</h2>
          <p className="page-subtitle">{machines.length} máquina(s) · {logs.length} registro(s)</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle lista / relatório */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
            <button onClick={()=>setView('report')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${view==='report'?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
              <BarChart2 size={13}/> Relatório
            </button>
            <button onClick={()=>setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${view==='list'?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
              <List size={13}/> Máquinas
            </button>
            <button onClick={()=>setView('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${view==='calendar'?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
              <CalendarDays size={13}/> Calendário
            </button>
          </div>
          <button onClick={()=>setLogModal({})} className="btn-secondary flex items-center gap-1.5"><Wrench size={15}/> Registrar manutenção</button>
          <button onClick={()=>setMachModal({})} className="btn-primary flex items-center gap-1.5"><Plus size={16}/> Nova máquina</button>
        </div>
      </div>

      {/* View: relatório */}
      {view==='report' && <ReportView logs={logs} machines={machines}/>}

      {/* View: calendário */}
      {view==='calendar' && <CalendarView logs={logs} machines={machines}/>}

      {/* View: lista de máquinas */}
      {view==='list' && <>
        {/* Alertas */}
        {alerts.length>0 && (
          <div className="card border-amber-200 bg-amber-50/40">
            <div className="flex items-center gap-2 mb-3">
              <Bell size={15} className="text-amber-500"/>
              <span className="text-sm font-bold text-amber-700">Manutenções agendadas</span>
              <span className="text-xs bg-amber-200 text-amber-800 font-bold px-2 py-0.5 rounded-full">{alerts.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {alerts.map(a=>{
                const days=daysUntil(a.next_service_at)
                return(
                  <div key={a.id} className={`flex items-center gap-3 p-3 rounded-xl border ${days<0?'bg-rose-50 border-rose-200':days<=3?'bg-amber-50 border-amber-200':'bg-white border-slate-200'}`}>
                    {days<0?<AlertTriangle size={14} className="text-rose-500 shrink-0"/>:<Bell size={14} className="text-amber-500 shrink-0"/>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700">{a.machine?.name}</p>
                      <p className="text-xs text-slate-500 truncate">{a.description}</p>
                    </div>
                    <UrgencyBadge date={a.next_service_at}/>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Filtros de setor */}
        {sectors.length>1 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={()=>setFilterSec('')} className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${!filterSec?'bg-slate-800 text-white border-slate-800':'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>Todos</button>
            {sectors.map(s=>(
              <button key={s} onClick={()=>setFilterSec(s)} className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${filterSec===s?'bg-slate-800 text-white border-slate-800':'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>{s}</button>
            ))}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="card flex justify-center py-12"><div className="w-7 h-7 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin"/></div>
        ) : filtered.length===0 ? (
          <div className="card text-center py-16">
            <Wrench size={36} className="mx-auto mb-3 text-slate-200"/>
            <p className="font-bold text-slate-600">Nenhuma máquina cadastrada</p>
            <p className="text-sm text-slate-400 mt-1">Cadastre as máquinas para controlar as manutenções.</p>
            <button onClick={()=>setMachModal({})} className="btn-primary mt-4 mx-auto inline-flex"><Plus size={15}/> Cadastrar máquina</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(m=>(
              <MachineCard key={m.id} machine={m} logs={logs}
                onEdit={m=>setMachModal(m)}
                onDelete={m=>setDelMachine(m)}
                onAddLog={m=>setLogModal({initialMachine:m})}
                onEditLog={(m,l)=>setLogModal({initialMachine:m,log:l})}
                onDeleteLog={deleteLog}/>
            ))}
          </div>
        )}
      </>}

      {/* Modais */}
      <MachineModal machine={machModal} open={machModal!==null} onClose={()=>setMachModal(null)} onSave={saveMachine}/>
      {logModal!==null && (
        <LogModal machines={machines} initialMachine={logModal.initialMachine||null} log={logModal.log||null}
          open={true} onClose={()=>setLogModal(null)} onSave={saveLog}/>
      )}
      <ConfirmDialog open={!!delMachine} onClose={()=>setDelMachine(null)} onConfirm={()=>deleteMachine(delMachine)}
        title="Remover máquina?" description={`"${delMachine?.name}" e todo seu histórico de manutenções serão desativados.`} confirmLabel="Remover"/>
    </div>
  )
}
