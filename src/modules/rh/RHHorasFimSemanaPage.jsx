import { useState, useEffect, useMemo } from 'react'
import { CalendarDays, FileDown, Calendar, Pencil, X, DollarSign, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtTime, fmtH, Avatar, PageHeader, LoadingCard, EmptyState } from './rhHelpers'
import toast from 'react-hot-toast'

const fmtBRL = v => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─── Helpers ──────────────────────────────────────────────────────
function isWeekend(dateStr) {
  const dow = new Date(dateStr + 'T12:00:00').getDay() // 0=domingo, 6=sábado
  return dow === 0 || dow === 6
}
function monthRange(yyyyMM) {
  const [y, m] = yyyyMM.split('-').map(Number)
  const start = `${yyyyMM}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${yyyyMM}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

// Reconstrói turnos a partir da entrada (mesma regra usada no resto do sistema)
function groupIntoShifts(records) {
  const shifts = []
  let current = null
  records.forEach(r => {
    if (r.punch_type === 'entrada') {
      current = { day: r.date, records: [r] }
      shifts.push(current)
    } else if (current) {
      current.records.push(r)
    }
  })
  return shifts
}
function summarizeShift(shift) {
  const entrada  = shift.records.find(r => r.punch_type === 'entrada')
  const almoco_s = shift.records.find(r => r.punch_type === 'saida_almoco')
  const almoco_v = shift.records.find(r => r.punch_type === 'volta_almoco')
  const saidasReal = shift.records.filter(r => r.punch_type === 'saida')
  const saidaReal = saidasReal[saidasReal.length - 1] || null
  const semIntervalo = almoco_s && !almoco_v && !saidaReal
  if (semIntervalo) {
    const horas = entrada ? (new Date(almoco_s.recorded_at) - new Date(entrada.recorded_at)) / 3600000 : null
    return { entrada, saida: almoco_s, totalH: horas, incomplete: false }
  }
  const totalH = saidaReal?.hours_worked ? parseFloat(saidaReal.hours_worked) : null
  return { entrada, saida: saidaReal, totalH, incomplete: !saidaReal }
}

// Converte "HH:MM" + date para ISO string com o offset correto do navegador
// (mesma lógica usada no Relatório de Ponto — evita o bug de gravar em UTC puro)
function toISO(date, timeStr) {
  if (!timeStr) return null
  const d = new Date(`${date}T${timeStr}:00`)
  const off = d.getTimezoneOffset()
  const sign = off <= 0 ? '+' : '-'
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')
  const m = String(Math.abs(off) % 60).padStart(2, '0')
  return `${date}T${timeStr}:00${sign}${h}:${m}`
}

// ─── Modal de edição do dia — reaproveita as mesmas RPCs do Relatório ──
function EditDayModal({ open, onClose, date, empId, records, onSaved }) {
  const PUNCHES = [
    { type: 'entrada',      label: 'Entrada',      color: 'text-emerald-600' },
    { type: 'saida_almoco', label: 'Saída Almoço', color: 'text-amber-500'   },
    { type: 'volta_almoco', label: 'Retorno',      color: 'text-blue-500'    },
    { type: 'saida',        label: 'Saída',        color: 'text-violet-600'  },
  ]
  const [times,  setTimes]  = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const init = {}
    PUNCHES.forEach(({ type }) => {
      const rec = records.find(r => r.punch_type === type)
      init[type] = rec ? fmtTime(rec.recorded_at) : ''
    })
    setTimes(init)
  }, [open, records])

  async function handleSave() {
    setSaving(true)
    try {
      for (const { type } of PUNCHES) {
        const existing = records.find(r => r.punch_type === type)
        const val = times[type]?.trim()

        if (val) {
          const iso = toISO(date, val)
          const originalTime = existing ? fmtTime(existing.recorded_at) : null
          const wasChanged = val !== originalTime
          const isNew = !existing

          if (wasChanged || isNew) {
            const { error } = await supabase.rpc('admin_upsert_punch', {
              p_employee_id: empId,
              p_punch_type:  type,
              p_date:        date,
              p_recorded_at: iso,
              p_record_id:   existing?.id ?? null,
            })
            if (error) throw error

            let targetId = existing?.id ?? null
            if (!targetId) {
              const { data: fresh } = await supabase
                .from('time_records')
                .select('id')
                .eq('employee_id', empId).eq('date', date).eq('punch_type', type)
                .single()
              targetId = fresh?.id ?? null
            }
            if (targetId) await supabase.rpc('admin_mark_manual', { p_record_id: targetId })
          }
        } else if (!val && existing) {
          const { error } = await supabase.rpc('admin_delete_punch', { p_record_id: existing.id })
          if (error) throw error
        }
      }
      await supabase.rpc('admin_recalc_hours', { p_employee_id: empId, p_date: date })
      toast.success('Ponto ajustado com sucesso!')
      onSaved()
      onClose()
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 capitalize" style={{ fontFamily: 'Nunito,sans-serif' }}>{dayLabel}</h3>
            <p className="text-xs text-slate-400">Ajustar batidas de ponto</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-3">
          {PUNCHES.map(({ type, label, color }) => (
            <div key={type} className="flex items-center justify-between gap-3">
              <span className={`text-sm font-semibold ${color}`}>{label}</span>
              <input type="time" className="input w-32" value={times[type] || ''}
                onChange={e => setTimes(t => ({ ...t, [type]: e.target.value }))} />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400">Deixar em branco remove a batida. Preencher grava/atualiza.</p>

        <div className="flex gap-2 mt-1">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm justify-center">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 text-sm justify-center disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PDF comprovante ──────────────────────────────────────────────
async function generateWeekendPDF(employee, monthLabel, days) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PAGE_W = 210, MARGIN = 14

  doc.setFillColor(61, 31, 13)
  doc.rect(0, 0, PAGE_W, 26, 'F')
  doc.setTextColor(196, 149, 106)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('CoisaPet', MARGIN, 12)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Comprovante de Horas — Fim de Semana', MARGIN, 19)

  let y = 36
  doc.setTextColor(61, 31, 13)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(employee.name, MARGIN, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`${employee.job_title || 'Colaborador'}  ·  Referente a: ${monthLabel}`, MARGIN, y + 6)
  doc.setFontSize(8)
  doc.text('Horas trabalhadas aos sábados e domingos, tratadas à parte do ponto mensal (acordo específico).', MARGIN, y + 12)

  y += 22
  const colX = [MARGIN, MARGIN + 44, MARGIN + 84, MARGIN + 124, MARGIN + 156]
  const headers = ['Data', 'Entrada', 'Saída', 'Total', '']
  const rowH = 10

  doc.setFillColor(241, 226, 205)
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, rowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(110, 63, 37)
  headers.forEach((h, i) => doc.text(h, colX[i] + 2, y + 6.5))
  y += rowH

  let total = 0
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  days.forEach(({ date, summary }, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(250, 248, 245)
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, rowH, 'F')
    }
    const dLabel = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
    doc.setTextColor(60, 60, 60)
    doc.text(dLabel, colX[0] + 2, y + 6.5)
    doc.text(summary.entrada ? fmtTime(summary.entrada.recorded_at) : '--:--', colX[1] + 2, y + 6.5)
    doc.text(summary.saida   ? fmtTime(summary.saida.recorded_at)   : '--:--', colX[2] + 2, y + 6.5)
    doc.text(summary.totalH != null ? fmtH(summary.totalH) : '—', colX[3] + 2, y + 6.5)
    if (summary.totalH) total += summary.totalH
    y += rowH
  })

  doc.setFillColor(61, 31, 13)
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, rowH + 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(196, 149, 106)
  doc.text('TOTAL DO MÊS', colX[0] + 2, y + 7.5)
  doc.setTextColor(255, 255, 255)
  doc.text(fmtH(total), colX[3] + 2, y + 7.5)
  y += rowH + 2

  // Linha de valor a pagar (só aparece se o funcionário tem valor/hora cadastrado)
  if (employee.hourly_rate > 0) {
    const valorPagar = total * employee.hourly_rate
    doc.setFillColor(241, 226, 205)
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, rowH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(110, 63, 37)
    doc.text(`Valor/hora: ${fmtBRL(employee.hourly_rate)}`, colX[0] + 2, y + 6.5)
    doc.setFontSize(10)
    doc.text(`Valor a pagar: ${fmtBRL(valorPagar)}`, colX[2] + 2, y + 6.5)
    y += rowH
  }
  y += 18

  const sigW = 75
  doc.setDrawColor(180, 180, 180)
  doc.line(MARGIN, y, MARGIN + sigW, y)
  doc.line(PAGE_W - MARGIN - sigW, y, PAGE_W - MARGIN, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text('Assinatura do Funcionário', MARGIN, y + 5)
  doc.text('Assinatura do Responsável', PAGE_W - MARGIN - sigW, y + 5)

  doc.setFontSize(7)
  doc.setTextColor(180, 180, 180)
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · CoisaPet Sistema`, MARGIN, 287)

  doc.save(`horas_fds_${employee.name.replace(/\s+/g, '_').toLowerCase()}_${monthLabel.replace(/\s+/g, '_')}.pdf`)
}

// ─── Página ─────────────────────────────────────────────────────
export function RHHorasFimSemanaPage({ embedded = false } = {}) {
  const [employees, setEmployees] = useState([])
  const [records,   setRecords]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selEmp,    setSelEmp]    = useState('')
  const [month,     setMonth]     = useState(() => new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [generating,setGenerating]= useState(false)
  const [editModal, setEditModal] = useState(null) // { date, records }
  const [editingRate, setEditingRate] = useState(false)
  const [rateVal,     setRateVal]     = useState('')

  useEffect(() => { loadEmployees() }, [])
  useEffect(() => { if (selEmp) loadRecords() }, [selEmp, month])

  async function loadEmployees() {
    const { data } = await supabase.from('system_users')
      .select('id,name,role,job_title,hourly_rate')
      .eq('active', true).eq('weekend_hours_separate', true).order('name')
    setEmployees(data ?? [])
    if (data?.length === 1) setSelEmp(data[0].id)
  }

  async function loadRecords() {
    setLoading(true)
    const { start, end } = monthRange(month)
    const { data } = await supabase.from('time_records')
      .select('*')
      .eq('employee_id', selEmp)
      .gte('date', start).lte('date', end)
      .order('recorded_at', { ascending: true })
    setRecords(data ?? [])
    setLoading(false)
  }

  const employee = employees.find(e => e.id === selEmp)

  async function saveHourlyRate() {
    const v = parseFloat(rateVal.replace(',', '.'))
    if (isNaN(v) || v < 0) { toast.error('Valor inválido'); return }
    const { error } = await supabase.from('system_users').update({ hourly_rate: v }).eq('id', selEmp)
    if (error) { toast.error('Erro ao salvar valor/hora'); return }
    setEmployees(prev => prev.map(e => e.id === selEmp ? { ...e, hourly_rate: v } : e))
    setEditingRate(false)
    toast.success('Valor/hora atualizado!')
  }

  const days = useMemo(() => {
    const shifts = groupIntoShifts(records).filter(s => isWeekend(s.day))
    return shifts.map(s => ({ date: s.day, summary: summarizeShift(s), records: s.records })).sort((a, b) => a.date.localeCompare(b.date))
  }, [records])

  const monthTotal = days.reduce((acc, d) => acc + (d.summary.totalH || 0), 0)
  const monthLabel = new Date(month + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  async function handleGeneratePDF() {
    if (!employee) return
    setGenerating(true)
    try { await generateWeekendPDF(employee, monthLabel, days) }
    finally { setGenerating(false) }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {!embedded && (
        <PageHeader
          title="Horas de Fim de Semana"
          subtitle="Horas trabalhadas aos sábados/domingos, à parte do ponto mensal"
        />
      )}

      {employees.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Ninguém com esse acordo ainda"
          description="Nenhum funcionário está marcado com 'weekend_hours_separate'. Ative isso no cadastro do usuário no Supabase para ele aparecer aqui." />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <select className="select w-auto min-w-[220px]" value={selEmp} onChange={e => setSelEmp(e.target.value)}>
              <option value="">Selecione um funcionário...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>

            {selEmp && (
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-slate-400" />
                <input type="month" className="input w-auto" value={month} onChange={e => setMonth(e.target.value)} />
              </div>
            )}

            {selEmp && (
              <button onClick={handleGeneratePDF} disabled={generating || days.length === 0}
                className="btn-primary flex items-center gap-1.5 text-xs ml-auto disabled:opacity-50">
                {generating
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Gerando...</>
                  : <><FileDown size={14}/> Gerar PDF comprovante</>
                }
              </button>
            )}
          </div>

          {!selEmp ? (
            <EmptyState icon={CalendarDays} title="Selecione um funcionário" description="Escolha quem tem acordo de horas de fim de semana." />
          ) : loading ? (
            <LoadingCard />
          ) : (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-4 pb-4 mb-4 border-b border-slate-100 flex-wrap">
                <Avatar name={employee.name} size="lg" />
                <div>
                  <p className="font-bold text-slate-800">{employee.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{monthLabel}</p>
                </div>

                {/* Valor/hora — clicável pra editar */}
                <div className="flex items-center gap-1.5">
                  {editingRate ? (
                    <>
                      <DollarSign size={13} className="text-slate-400"/>
                      <input autoFocus type="text" inputMode="decimal" className="input w-24 text-sm py-1"
                        placeholder="0,00" value={rateVal} onChange={e=>setRateVal(e.target.value)}
                        onKeyDown={e=>{ if(e.key==='Enter') saveHourlyRate(); if(e.key==='Escape') setEditingRate(false) }}/>
                      <button onClick={saveHourlyRate} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg"><Check size={14}/></button>
                      <button onClick={()=>setEditingRate(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={14}/></button>
                    </>
                  ) : (
                    <button onClick={()=>{ setRateVal(String(employee.hourly_rate ?? '')); setEditingRate(true) }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-xl transition-colors">
                      <DollarSign size={13}/>
                      {employee.hourly_rate > 0 ? `${fmtBRL(employee.hourly_rate)}/hora` : 'Definir valor/hora'}
                      <Pencil size={11} className="text-slate-300"/>
                    </button>
                  )}
                </div>

                <div className="ml-auto flex items-center gap-3">
                  {employee.hourly_rate > 0 && (
                    <div className="text-center px-5 py-2.5 rounded-2xl bg-amber-50 border border-amber-100">
                      <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wide">Valor a pagar</p>
                      <p className="text-xl font-black text-amber-700" style={{fontFamily:'Nunito,sans-serif'}}>{fmtBRL(monthTotal * employee.hourly_rate)}</p>
                    </div>
                  )}
                  <div className="text-center px-5 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide">Total do mês</p>
                    <p className="text-xl font-black text-emerald-700" style={{fontFamily:'Nunito,sans-serif'}}>{fmtH(monthTotal)}</p>
                  </div>
                </div>
              </div>

              {days.length === 0 ? (
                <EmptyState icon={CalendarDays} title="Nenhum fim de semana trabalhado" description={`Sem sábados/domingos com ponto batido em ${monthLabel}.`} />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                      <th className="pb-2 pr-3">Data</th>
                      <th className="pb-2 px-3">Entrada</th>
                      <th className="pb-2 px-3">Saída</th>
                      <th className="pb-2 pl-3 text-right">Total</th>
                      <th className="pb-2 pl-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {days.map(({ date, summary, records: dayRecords }) => (
                      <tr key={date} className="group">
                        <td className="py-2.5 pr-3">
                          <p className="font-semibold text-slate-700 capitalize">
                            {new Date(date+'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                          </p>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{summary.entrada ? fmtTime(summary.entrada.recorded_at) : <span className="text-slate-300">--:--</span>}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{summary.saida   ? fmtTime(summary.saida.recorded_at)   : <span className="text-slate-300">--:--</span>}</td>
                        <td className="py-2.5 pl-3 text-right font-bold">
                          {summary.totalH != null
                            ? <span className="text-slate-700">{fmtH(summary.totalH)}</span>
                            : summary.incomplete
                              ? (
                                <button onClick={() => setEditModal({ date, records: dayRecords })}
                                  className="inline-flex items-center gap-1 text-amber-500 text-xs font-bold hover:text-amber-600">
                                  ⚠ em aberto <Pencil size={11} />
                                </button>
                              )
                              : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <button onClick={() => setEditModal({ date, records: dayRecords })}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50">
                            <Pencil size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {editModal && (
        <EditDayModal
          open={!!editModal}
          onClose={() => setEditModal(null)}
          date={editModal.date}
          empId={selEmp}
          records={editModal.records}
          onSaved={loadRecords}
        />
      )}
    </div>
  )
}
