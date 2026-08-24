import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, User, Printer, TrendingUp, Pencil, Check, X, CalendarX, Plus, Trash2, DollarSign, FileDown, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtH, PageHeader, LoadingCard, Avatar } from './rhHelpers'
import { RHPontoPage } from './RHPontoPage'
import { RHPontoSemanalPage } from './RHPontoSemanalPage'
import { RHHorasFimSemanaPage } from './RHHorasFimSemanaPage'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────
const fmtT   = d => !d ? '—' : new Date(d).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
const fmtDay = d => new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit'})
const fmtBRL = v => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// Converte "HH:MM" + date para ISO string com offset do browser
// Assim 08:00 digitado no Brasil vira 08:00-03:00, não 08:00Z
function toISO(date, timeStr) {
  if (!timeStr) return null
  // Cria Date no fuso local e converte para ISO com offset correto
  const d = new Date(`${date}T${timeStr}:00`)
  // Offset em minutos (ex: -180 para BRT)
  const off = d.getTimezoneOffset()
  const sign = off <= 0 ? '+' : '-'
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')
  const m = String(Math.abs(off) % 60).padStart(2, '0')
  return `${date}T${timeStr}:00${sign}${h}:${m}`
}

// ── Cálculo de horas de um dia — função única usada em todo lugar ─
// Regra: QUALQUER número par de registros = períodos trabalhados válidos
// 2 registros = entrada/saída direto (sem almoço) — PERÍODO COMPLETO
// 4 registros = entrada/saída_almoço/volta/saída — padrão normal
// 6+ registros = múltiplos períodos
// Registros entre 00:00-04:59 = pertencem ao ciclo do dia anterior
// Registros com diferença < 60s do anterior = duplicata, ignorar
function calcDayHours(recs) {
  if (!recs || recs.length === 0) return { h: null, emAberto: false }

  // 1. Ordena por timestamp virtual (madrugada vai pro fim)
  const sorted = [...recs].sort((a, b) => {
    const va = new Date(a.recorded_at).getHours() < 5
      ? new Date(a.recorded_at).getTime() + 86400000
      : new Date(a.recorded_at).getTime()
    const vb = new Date(b.recorded_at).getHours() < 5
      ? new Date(b.recorded_at).getTime() + 86400000
      : new Date(b.recorded_at).getTime()
    return va - vb
  })

  // 2. Remove duplicatas — registros com menos de 60s de diferença do anterior
  const deduped = sorted.filter((r, i) => {
    if (i === 0) return true
    const prev = sorted[i - 1]
    const diff = Math.abs(new Date(r.recorded_at) - new Date(prev.recorded_at))
    return diff > 60000 // mantém só se > 1 minuto de diferença
  })

  // 3. Se ímpar após deduplicação → em aberto
  if (deduped.length % 2 !== 0) return { h: null, emAberto: true }

  // 4. Soma pares
  let soma = 0
  for (let i = 0; i < deduped.length; i += 2) {
    let ms = new Date(deduped[i+1].recorded_at) - new Date(deduped[i].recorded_at)
    if (ms < 0) ms += 86400000 // virada de meia-noite
    if (ms > 0) soma += ms / 3600000 // ignora intervalos negativos/zero
  }
  return { h: Math.round(soma * 100) / 100, emAberto: false }
}

// ── Modal de edição do dia ────────────────────────────────────
function EditDayModal({ open, onClose, date, empId, records, onSaved }) {
  const PUNCHES = [
    { type: 'entrada',      label: 'Entrada',      color: 'text-emerald-600' },
    { type: 'saida_almoco', label: 'Saída Almoço', color: 'text-amber-500'   },
    { type: 'volta_almoco', label: 'Retorno',      color: 'text-blue-500'    },
    { type: 'saida',        label: 'Saída',        color: 'text-violet-600'  },
  ]

  const [times,   setTimes]   = useState({})
  const [saving,  setSaving]  = useState(false)

  // Troca o valor desse campo com o campo vizinho (pra cima ou pra baixo)
  // — nunca perde dado, só troca de posição. Útil quando o funcionário
  // esqueceu de bater um ponto e todos os seguintes ficaram "deslocados".
  function shiftValue(idx, direction) {
    const toIdx = idx + direction
    if (toIdx < 0 || toIdx >= PUNCHES.length) return
    const fromType = PUNCHES[idx].type
    const toType = PUNCHES[toIdx].type
    setTimes(t => ({
      ...t,
      [fromType]: t[toType] || '',
      [toType]: t[fromType] || '',
    }))
  }

  useEffect(() => {
    if (!open) return
    const init = {}
    PUNCHES.forEach(({ type }) => {
      const rec = records.find(r => r.punch_type === type)
      init[type] = rec ? fmtT(rec.recorded_at) : ''
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

          // Verifica se o horário realmente mudou em relação ao que está no banco
          // Compara HH:MM do campo digitado com HH:MM do registro existente
          const originalTime = existing ? fmtT(existing.recorded_at) : null
          const wasChanged   = val !== originalTime  // ex: "08:05" !== "08:00"
          const isNew        = !existing             // registro que não existia antes

          // Só faz upsert se mudou ou é novo
          if (wasChanged || isNew) {
            const { error } = await supabase.rpc('admin_upsert_punch', {
              p_employee_id: empId,
              p_punch_type:  type,
              p_date:        date,
              p_recorded_at: iso,
              p_record_id:   existing?.id ?? null,
            })
            if (error) throw error

            // Só marca como editado manualmente se era existente e foi alterado,
            // ou se é um registro inserido do zero pelo admin
            let targetId = existing?.id ?? null
            if (!targetId) {
              const { data: fresh } = await supabase
                .from('time_records')
                .select('id')
                .eq('employee_id', empId).eq('date', date).eq('punch_type', type)
                .single()
              targetId = fresh?.id ?? null
            }
            if (targetId) {
              await supabase.rpc('admin_mark_manual', { p_record_id: targetId })
            }
          }
          // Se não mudou: não faz nada, mantém o flag original do banco
        } else if (!val && existing) {
          const { error } = await supabase.rpc('admin_delete_punch', {
            p_record_id: existing.id,
          })
          if (error) throw error
        }
      }

      // Recalcula hours_worked na saída (se existir)
      await recalcHours()
      toast.success('Ponto ajustado com sucesso!')
      onSaved()
      onClose()
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function recalcHours() {
    // Usa RPC com SECURITY DEFINER para recalcular e gravar hours_worked
    // bypassa RLS — o mesmo padrão do admin_upsert_punch
    await supabase.rpc('admin_recalc_hours', {
      p_employee_id: empId,
      p_date:        date,
    })
  }

  if (!open) return null

  const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long'
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl flex flex-col animate-fade-in"
        style={{ border: '1px solid #F1F5F9' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800 text-base">Ajustar Ponto</h2>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">{dayLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400">
            <X size={16}/>
          </button>
        </div>

        {/* Aviso edição manual */}
        <div className="mx-5 mt-4 flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p className="text-xs text-orange-700 leading-relaxed">
            Horários editados aqui ficam marcados com <strong>borda laranja</strong> no relatório para auditoria.
          </p>
        </div>

        {/* Campos */}
        <div className="p-5 flex flex-col gap-3">
          <p className="text-xs text-slate-400">
            Preencha apenas os campos necessários. Deixar em branco remove o registro. Use as setinhas <ChevronUp size={11} className="inline"/><ChevronDown size={11} className="inline"/> pra trocar um horário de posição com o campo vizinho — útil quando esqueceram de bater um ponto e os seguintes ficaram deslocados.
          </p>
          {PUNCHES.map(({ type, label, color }, idx) => (
            <div key={type} className="flex items-center gap-3">
              <label className={`text-xs font-bold w-28 shrink-0 ${color}`}>{label}</label>
              <input
                type="time"
                className="input flex-1 text-sm"
                value={times[type] || ''}
                onChange={e => setTimes(t => ({ ...t, [type]: e.target.value }))}
              />
              <div className="flex flex-col shrink-0 -my-1">
                <button onClick={() => shiftValue(idx, -1)} disabled={idx === 0}
                  className="p-0.5 text-slate-300 hover:text-violet-500 disabled:opacity-0 disabled:pointer-events-none transition-colors"
                  title="Trocar com o campo de cima">
                  <ChevronUp size={13}/>
                </button>
                <button onClick={() => shiftValue(idx, 1)} disabled={idx === PUNCHES.length - 1}
                  className="p-0.5 text-slate-300 hover:text-violet-500 disabled:opacity-0 disabled:pointer-events-none transition-colors"
                  title="Trocar com o campo de baixo">
                  <ChevronDown size={13}/>
                </button>
              </div>
              {times[type] && (
                <button onClick={() => setTimes(t => ({ ...t, [type]: '' }))}
                  className="p-1 text-slate-300 hover:text-rose-400 transition-colors shrink-0">
                  <X size={12}/>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={saving}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
              : <><Check size={14}/> Salvar</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente de linha de dia ────────────────────────────────
function DayRow({ date, records, isWeekend, isToday, isHoliday, isVacation, empId, targetMin, onEdit, onSaveTarget, onToggleHoliday }) {
  const dayLabel = fmtDay(date)

  // Estado para edição inline da meta do dia
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetVal, setTargetVal]         = useState('')
  const entrada     = records.find(r => r.punch_type === 'entrada')
  const saidaAlm    = records.find(r => r.punch_type === 'saida_almoco')
  const voltaAlm    = records.find(r => r.punch_type === 'volta_almoco')
  const saida       = records.find(r => r.punch_type === 'saida')
  const hasRecords  = records.length > 0

  // ── Cálculo de horas trabalhadas ──────────────────────────────
  // Regra: par = fecha, ímpar = em aberto
  //
  // Turno da noite: pontos entre 00:00–04:59 pertencem ao DIA ANTERIOR.
  // Para ordenar corretamente, esses pontos recebem +24h no timestamp
  // virtual — assim 00:04 vira "24:04", ficando DEPOIS de 23:59 na ordem.
  // O diffH ainda calcula com os timestamps reais (sem +24h).

  function getVirtualTs(ts) {
    const h = new Date(ts).getHours()
    // Pontos entre 00:00 e 04:59 → pertencem ao ciclo do dia anterior
    // Soma 24h só para fins de ordenação
    if (h >= 0 && h < 5) return new Date(ts).getTime() + 24 * 3600000
    return new Date(ts).getTime()
  }

  function diffH(tsA, tsB) {
    let ms = new Date(tsB) - new Date(tsA)
    if (ms < 0) ms += 24 * 3600000 // virada de meia-noite
    return ms / 3600000
  }

  const { h: totalH, emAberto } = calcDayHours(records)

  // Helper: célula de horário — laranja se editado manualmente
  function PunchCell({ record, colorClass }) {
    if (!record) return <span className="text-sm font-semibold text-slate-300">—</span>
    if (record.manually_edited) {
      return (
        <span
          title="Ajustado manualmente"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold text-orange-700 bg-orange-50 border border-orange-300"
        >
          <Pencil size={9} className="text-orange-400 shrink-0"/>
          {fmtT(record.recorded_at)}
        </span>
      )
    }
    return <span className={`text-sm font-semibold ${colorClass}`}>{fmtT(record.recorded_at)}</span>
  }

  return (
    <tr className={`border-b border-slate-100 transition-colors group ${
      isHoliday  ? 'bg-purple-50/60' :
      isVacation ? 'bg-emerald-50/50' :
      isWeekend  ? 'bg-slate-50/60' :
      isToday    ? 'bg-sky-50/40' :
      hasRecords ? 'hover:bg-slate-50' : 'hover:bg-slate-50/40'
    }`}>
      {/* Dia */}
      <td className="py-2.5 px-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold capitalize min-w-[32px] ${isWeekend ? 'text-slate-400' : isToday ? 'text-sky-600' : 'text-slate-500'}`}>
            {dayLabel.split(',')[0]}
          </span>
          <span className={`text-sm font-bold ${isWeekend ? 'text-slate-400' : isToday ? 'text-sky-700' : 'text-slate-800'}`}>
            {dayLabel.split(',')[1]?.trim()}
          </span>
          {isToday    && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-600">HOJE</span>}
          {isHoliday  && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">FERIADO</span>}
          {isVacation && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">🌴 FÉRIAS</span>}
          {!isHoliday && !isWeekend && (
            <button onClick={() => onToggleHoliday?.(date)}
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-[9px] text-purple-400 hover:text-purple-600 font-semibold"
              title="Marcar como feriado">
              + feriado
            </button>
          )}
          {isHoliday && (
            <button onClick={() => onToggleHoliday?.(date)}
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-[9px] text-rose-400 hover:text-rose-600 font-semibold"
              title="Remover feriado">
              remover
            </button>
          )}
        </div>
      </td>
      {/* Entrada */}
      <td className="py-2.5 px-3 text-center">
        <PunchCell record={entrada} colorClass="text-emerald-600"/>
      </td>
      {/* Saída almoço */}
      <td className="py-2.5 px-3 text-center">
        <PunchCell record={saidaAlm} colorClass="text-amber-500"/>
      </td>
      {/* Volta almoço */}
      <td className="py-2.5 px-3 text-center">
        <PunchCell record={voltaAlm} colorClass="text-blue-500"/>
      </td>
      {/* Saída */}
      <td className="py-2.5 px-3 text-center">
        <PunchCell record={saida} colorClass="text-violet-600"/>
      </td>
      {/* Total + botão editar */}
      <td className="py-2.5 px-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {totalH != null
            ? <span className="text-sm font-black text-slate-800">{fmtH(totalH)}</span>
            : emAberto
              ? <span className="text-xs text-amber-500 font-semibold">Em aberto</span>
              : <span className="text-xs text-slate-300">—</span>
          }
          <button
              onClick={() => onEdit(date, records)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 shrink-0"
              title="Ajustar ponto deste dia"
            >
              <Pencil size={11}/>
            </button>
        </div>
      </td>

      {/* Meta do dia + Saldo */}
      <td className="py-2.5 px-4 text-right w-28">
        {totalH != null ? (
          <div className="flex flex-col items-end gap-0.5">
            {/* Saldo do dia */}
            {(() => {
              const saldo = totalH - targetMin / 60
              const pos   = saldo >= 0
              return (
                <span className={`text-xs font-black ${pos ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {pos ? '+' : ''}{fmtH(Math.abs(saldo))}
                </span>
              )
            })()}
            {/* Meta clicável */}
            {editingTarget ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                  type="time"
                  className="w-20 text-[10px] border border-slate-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                  value={targetVal}
                  onChange={e => setTargetVal(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (!targetVal) return
                    const [h, m] = targetVal.split(':').map(Number)
                    onSaveTarget(date, h * 60 + m)
                    setEditingTarget(false)
                  }}
                  className="p-0.5 rounded text-emerald-600 hover:bg-emerald-50"
                ><Check size={10}/></button>
                <button
                  onClick={() => setEditingTarget(false)}
                  className="p-0.5 rounded text-slate-400 hover:bg-slate-100"
                ><X size={10}/></button>
              </div>
            ) : (
              <button
                onClick={() => {
                  const h = String(Math.floor(targetMin / 60)).padStart(2,'0')
                  const m = String(targetMin % 60).padStart(2,'0')
                  setTargetVal(`${h}:${m}`)
                  setEditingTarget(true)
                }}
                className="text-[10px] text-slate-400 hover:text-violet-500 transition-colors"
                title="Clique para alterar a meta deste dia"
              >
                meta: {String(Math.floor(targetMin/60)).padStart(2,'0')}h{String(targetMin%60).padStart(2,'0')}m
              </button>
            )}
          </div>
        ) : (() => {
          // Sem registro — dia útil passado = mostra o débito
          const today = new Date().toISOString().split('T')[0]
          const isPast = date < today
          const isDebt = !isWeekend && !isHoliday && !isVacation && isPast && targetMin > 0
          return isDebt ? (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-xs font-black text-rose-400">
                -{fmtH(targetMin/60)}
              </span>
              <span className="text-[10px] text-slate-400">faltou</span>
            </div>
          ) : (
            <span className="text-xs text-slate-300">—</span>
          )
        })()}
      </td>
    </tr>
  )
}

// ── Card de resumo do funcionário ─────────────────────────────
function EmployeeSummaryCard({ emp, records, days }) {
  const totalDays  = days.filter(d => (records[d.date]||[]).length > 0).length
  const totalHours = days.reduce((acc, d) => {
    const dayRecs = records[d.date] || []
    const saida   = dayRecs.find(r => r.punch_type === 'saida')
    if (saida?.hours_worked) return acc + parseFloat(saida.hours_worked)
    const entrada = dayRecs.find(r => r.punch_type === 'entrada')
    if (dayRecs.length === 2 && entrada) {
      const last = dayRecs[dayRecs.length - 1]
      const ms   = new Date(last.recorded_at) - new Date(entrada.recorded_at)
      return acc + Math.round((ms / 3600000) * 100) / 100
    }
    return acc
  }, 0)

  return (
    <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
      <Avatar name={emp.name} size="lg"/>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-800 truncate">{emp.name}</p>
        <p className="text-xs text-slate-400">{emp.job_title || emp.role}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-lg font-black text-slate-800">{fmtH(totalHours)}</p>
        <p className="text-[10px] text-slate-400">{totalDays} dia(s)</p>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export function RHRelatorioPage() {
  const now   = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [employees, setEmployees] = useState([])
  const [selEmp,    setSelEmp]    = useState('all')
  const [records,   setRecords]   = useState({})
  const [targets,   setTargets]   = useState({}) // { empId: { date: minutos } }
  const [loading,   setLoading]   = useState(true)
  const [editModal, setEditModal] = useState(null) // { date, empId, records }
  const [holidays,  setHolidays]  = useState([])   // array de date strings 'YYYY-MM-DD'
  const [vacations, setVacations] = useState([])   // array de { employee_id, start_date, end_date }
  const [showHolidayModal, setShowHolidayModal] = useState(false)
  const [activeTab, setActiveTab]  = useState('relatorio')
  const [diagEmp,   setDiagEmp]    = useState('')
  const [deletingId,setDeletingId] = useState(null)
  const [focusEmp,  setFocusEmp]   = useState(null) // funcionário aberto na tabela
  const [editingSalary, setEditingSalary] = useState(null) // guarda o id do funcionário em edição
  const [salaryVal,     setSalaryVal]     = useState('')
  const [generatingHolerite, setGeneratingHolerite] = useState(false)

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = now.toISOString().split('T')[0]
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    const dateStr = d.toISOString().split('T')[0]
    const dow = d.getDay()
    return {
      date: dateStr,
      isWeekend: dow === 0 || dow === 6,
      isToday: dateStr === today,
      isHoliday: holidays.includes(dateStr),
    }
  })

  useEffect(() => { loadAll() }, [year, month])

  async function loadAll() {
    setLoading(true)
    const dateStart = `${year}-${String(month+1).padStart(2,'0')}-01`
    const dateEnd   = `${year}-${String(month+1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`
    const [empR, recR, tgtR, holR, vacR] = await Promise.all([
      supabase.from('system_users').select('id,name,role,job_title,active,half_day,fixed_monthly_salary').eq('active',true).order('name'),
      supabase.from('time_records').select('id,employee_id,punch_type,recorded_at,date,hours_worked,manually_edited')
        .gte('date', dateStart).lte('date', dateEnd).order('recorded_at',{ascending:true}),
      supabase.from('work_day_targets').select('employee_id,date,target_min')
        .gte('date', dateStart).lte('date', dateEnd),
      supabase.from('holidays').select('date,name').gte('date', dateStart).lte('date', dateEnd),
      supabase.from('vacation_requests').select('employee_id,date_start,date_end')
        .eq('status','aprovado')
        .lte('date_start', dateEnd)
        .gte('date_end', dateStart),
    ])
    setEmployees(empR.data ?? [])
    setHolidays((holR.data ?? []).map(h => h.date))
    setVacations(vacR.data ?? [])
    const grouped = {}
    for (const r of recR.data ?? []) {
      if (!grouped[r.employee_id]) grouped[r.employee_id] = {}
      if (!grouped[r.employee_id][r.date]) grouped[r.employee_id][r.date] = []
      grouped[r.employee_id][r.date].push(r)
    }
    setRecords(grouped)
    const tgrouped = {}
    for (const t of tgtR.data ?? []) {
      if (!tgrouped[t.employee_id]) tgrouped[t.employee_id] = {}
      tgrouped[t.employee_id][t.date] = t.target_min
    }
    setTargets(tgrouped)
    setLoading(false)
  }

  async function deletePunch(id) {
    if (!confirm('Deletar este registro de ponto?')) return
    setDeletingId(id)
    const { error } = await supabase.from('time_records').delete().eq('id', id)
    if (error) {
      toast.error('Erro ao deletar: ' + error.message)
      console.error('deletePunch error:', error)
    } else {
      toast.success('Registro removido.')
      loadAll()
    }
    setDeletingId(null)
  }

  async function toggleHoliday(date, name = 'Feriado') {
    if (holidays.includes(date)) {
      await supabase.from('holidays').delete().eq('date', date)
      setHolidays(prev => prev.filter(d => d !== date))
      toast.success('Feriado removido.')
    } else {
      await supabase.from('holidays').insert({ date, name })
      setHolidays(prev => [...prev, date])
      toast.success('Feriado marcado!')
    }
  }

  function prevMonth() { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }
  function nextMonth() {
    const n=new Date(); if(year===n.getFullYear()&&month===n.getMonth()) return
    if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1)
  }

  function handleEdit(date, recs, empId) {
    setEditModal({ date, empId, records: recs })
  }

  // Salva meta customizada de um dia específico
  async function handleSaveTarget(empId, date, minutes) {
    const { error } = await supabase.rpc('admin_set_day_target', {
      p_employee_id: empId,
      p_date:        date,
      p_target_min:  minutes,
    })
    if (error) { toast.error('Erro ao salvar meta'); return }
    setTargets(prev => ({
      ...prev,
      [empId]: { ...(prev[empId] || {}), [date]: minutes }
    }))
    toast.success('Meta atualizada!')
  }

  // Retorna true se a data é um dia de férias aprovadas do funcionário
  // Meta diária em minutos baseada no regime do funcionário
  function dailyTarget(emp, dateOverride) {
    const base = emp?.half_day ? 300 : 524 // 5h ou 8h44m
    return base
  }

  function isVacationDay(empId, dateStr) {
    return vacations.some(v =>
      v.employee_id === empId &&
      dateStr >= v.date_start &&
      dateStr <= v.date_end
    )
  }

  function calcEmpStats(emp, daysArr) {
    // Usa daysArr explícito ou recalcula na hora com holidays atual
    const _days = daysArr ?? Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1)
      const dateStr = d.toISOString().split('T')[0]
      const dow = d.getDay()
      return {
        date: dateStr,
        isWeekend: dow === 0 || dow === 6,
        isToday: dateStr === today,
        isHoliday: holidays.includes(dateStr),
      }
    })

    const empRecs = records[emp.id] || {}
    let totalH = 0, metaH = 0

    for (const d of _days) {
      if (d.date > today) continue
      const isVac = isVacationDay(emp.id, d.date)
      if (d.isWeekend || d.isHoliday || isVac) {
        const dr = empRecs[d.date] || []
        const { h } = calcDayHours(dr)
        if (h != null) totalH += h
        // Meta customizada pro dia (ex: alguém que trabalha ocasionalmente
        // no fim de semana) — soma na meta do mês. Sem isso, meta continua
        // 0 (comportamento padrão, não conta como falta).
        const customTgt = targets[emp.id]?.[d.date]
        if (customTgt) metaH += customTgt / 60
        continue
      }
      const tgtMin = targets[emp.id]?.[d.date] ?? dailyTarget(emp)
      metaH += tgtMin / 60
      const dr = empRecs[d.date] || []
      if (dr.length === 0) continue
      const { h } = calcDayHours(dr)
      if (h != null) totalH += h
    }

    const saldoH = totalH - metaH
    const totalDays = _days.filter(d => (empRecs[d.date]||[]).length > 0).length
    return { totalH, metaH, saldoH, totalDays, empRecs }
  }

  // ── Salário fixo mensal com desconto por dia útil faltado (ex: Eduardo) ──
  // Nunca gera hora extra — só desconta proporcionalmente por ausência.
  // valorDia = salário ÷ dias úteis do MÊS INTEIRO (constante o mês todo,
  // não muda se o mês tem mais ou menos dias faltados)
  function calcFixedSalaryStats(emp, daysArr) {
    const salario = emp.fixed_monthly_salary || 0
    const empRecs = records[emp.id] || {}

    const diasUteisMes = daysArr.filter(d => !d.isWeekend && !d.isHoliday).length
    const valorDia = diasUteisMes > 0 ? salario / diasUteisMes : 0

    // Dias úteis já "esperados" até hoje (ou o mês inteiro, se for mês passado)
    const diasEsperados = daysArr.filter(d => !d.isWeekend && !d.isHoliday && d.date <= today).length

    // Dias úteis em que ele realmente bateu ponto (fim de semana/feriado não conta pra isso)
    const diasTrabalhados = daysArr.filter(d =>
      !d.isWeekend && !d.isHoliday && d.date <= today &&
      (empRecs[d.date]||[]).length > 0
    ).length

    // Dias de compensação — feriado, sábado ou domingo em que ele bateu ponto
    // mesmo sem precisar. Cada um desses abate um dia faltado normal.
    const diasCompensados = daysArr.filter(d =>
      (d.isWeekend || d.isHoliday) && d.date <= today &&
      (empRecs[d.date]||[]).length > 0
    ).length

    const diasFaltadosBruto = Math.max(0, diasEsperados - diasTrabalhados)
    const diasFaltados = Math.max(0, diasFaltadosBruto - diasCompensados)
    const desconto = diasFaltados * valorDia
    const valorFinal = Math.max(0, salario - desconto)

    return { salario, diasUteisMes, valorDia, diasEsperados, diasTrabalhados, diasCompensados, diasFaltados, desconto, valorFinal }
  }

  async function saveFixedSalary(empId) {
    const v = parseFloat(salaryVal.replace(',', '.'))
    if (isNaN(v) || v < 0) { toast.error('Valor inválido'); return }
    const { error } = await supabase.from('system_users').update({ fixed_monthly_salary: v }).eq('id', empId)
    if (error) { toast.error('Erro ao salvar salário fixo'); return }
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, fixed_monthly_salary: v } : e))
    setEditingSalary(false)
    toast.success('Salário fixo atualizado!')
  }

  // Holerite em dias — NUNCA mostra horas, só a conta do salário fixo
  async function generateFixedSalaryPDF(emp, stats) {
    setGeneratingHolerite(true)
    try {
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
      doc.text('Holerite — Salário Fixo Mensal', MARGIN, 19)

      let y = 34
      doc.setTextColor(61, 31, 13)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text(emp.name, MARGIN, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`${emp.job_title || 'Colaborador'}  ·  Referente a: ${MONTH_NAMES[month]} de ${year}`, MARGIN, y + 6)

      y += 14
      const rows = [
        ['Salário bruto',                fmtBRL(stats.salario)],
        ['Dias úteis do mês',            `${stats.diasUteisMes} dias`],
        ['Valor por dia útil',           fmtBRL(stats.valorDia)],
        ['Dias esperados até hoje',      `${stats.diasEsperados} dias`],
        ['Dias trabalhados',             `${stats.diasTrabalhados} dias`],
        ...(stats.diasCompensados > 0 ? [['Dias compensados (feriado/fim de semana)', `${stats.diasCompensados} dias`]] : []),
        ['Dias faltados',                `${stats.diasFaltados} dias`],
        ['Desconto por faltas',          `- ${fmtBRL(stats.desconto)}`],
      ]
      const rowH = 7
      doc.setFontSize(9)
      rows.forEach(([label, val], idx) => {
        if (idx % 2 === 1) {
          doc.setFillColor(250, 248, 245)
          doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, rowH, 'F')
        }
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(80, 80, 80)
        doc.text(label, MARGIN + 2, y + 4.8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(60, 60, 60)
        doc.text(String(val), PAGE_W - MARGIN - 2, y + 4.8, { align: 'right' })
        y += rowH
      })

      // Lista compacta dos dias específicos de compensação, se houver
      const empRecsForComp = records[emp.id] || {}
      const diasCompensacaoList = days.filter(d =>
        (d.isWeekend || d.isHoliday) && d.date <= today && (empRecsForComp[d.date]||[]).length > 0
      )
      if (diasCompensacaoList.length > 0) {
        y += 3
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8)
        doc.setTextColor(124, 58, 237)
        const compLabel = 'Compensação: ' + diasCompensacaoList.map(d =>
          new Date(d.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + (d.isHoliday ? ' (feriado)' : ' (fim de semana)')
        ).join('  ·  ')
        const compLines = doc.splitTextToSize(compLabel, PAGE_W - MARGIN * 2)
        doc.text(compLines, MARGIN, y)
        y += compLines.length * 4
      }

      // ── Lista dia a dia — só dias úteis, sem horário, igual pedido ──
      y += 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(61, 31, 13)
      doc.text(`Dias úteis de ${MONTH_NAMES[month]}`, MARGIN, y)
      y += 4

      const diasUteisDoMes = days.filter(d => !d.isWeekend && !d.isHoliday)
      const empRecs = records[emp.id] || {}
      const dayRowH = 5

      doc.setFillColor(241, 226, 205)
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, dayRowH, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(110, 63, 37)
      doc.text('Dia', MARGIN + 2, y + 3.6)
      doc.text('Situação', PAGE_W - MARGIN - 2, y + 3.6, { align: 'right' })
      y += dayRowH

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.2)
      diasUteisDoMes.forEach((d, idx) => {
        // Quebra de página só nos raríssimos casos de mês com pouquíssimos feriados
        if (y > 275) { doc.addPage(); y = 20 }

        if (idx % 2 === 1) {
          doc.setFillColor(250, 248, 245)
          doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, dayRowH, 'F')
        }
        const dLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
        doc.setTextColor(60, 60, 60)
        doc.text(dLabel, MARGIN + 2, y + 3.6)

        const trabalhou = (empRecs[d.date] || []).length > 0
        const isFuturo  = d.date > today
        if (isFuturo) {
          doc.setTextColor(180, 180, 180)
          doc.text('—', PAGE_W - MARGIN - 2, y + 3.6, { align: 'right' })
        } else if (trabalhou) {
          doc.setTextColor(22, 163, 74)
          doc.text('Trabalhado', PAGE_W - MARGIN - 2, y + 3.6, { align: 'right' })
        } else {
          doc.setTextColor(220, 38, 38)
          doc.text('Falta', PAGE_W - MARGIN - 2, y + 3.6, { align: 'right' })
        }
        y += dayRowH
      })

      // Quebra de página só se realmente não sobrar espaço pro box final
      if (y > 265) { doc.addPage(); y = 20 }

      y += 5
      doc.setFillColor(61, 31, 13)
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 13, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(196, 149, 106)
      doc.text('VALOR FINAL A RECEBER', MARGIN + 2, y + 8)
      doc.setTextColor(255, 255, 255)
      doc.text(fmtBRL(stats.valorFinal), PAGE_W - MARGIN - 2, y + 8, { align: 'right' })
      y += 13 + 14

      if (y > 278) { doc.addPage(); y = 20 }

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
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · CoisaPet Sistema`, MARGIN, 292)

      doc.save(`holerite_${emp.name.replace(/\s+/g,'_').toLowerCase()}_${MONTH_NAMES[month].toLowerCase()}_${year}.pdf`)
    } finally {
      setGeneratingHolerite(false)
    }
  }

  function handlePrint() {
    // Funcionários com registros nos últimos 6 meses
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMAgo = sixMonthsAgo.toISOString().split('T')[0]
  const activeEmps = employees.filter(emp => {
    const empRecs = records[emp.id] || {}
    return Object.keys(empRecs).some(d => d >= sixMAgo)
  })

  // targetEmps respeita dropdown E focusEmp
  const targetEmps = focusEmp
    ? employees.filter(e => e.id === focusEmp)
    : selEmp === 'all'
      ? [] // sem foco = não mostra tabela
      : employees.filter(e => e.id === selEmp)
    const now2 = new Date()
    const genDate = now2.toLocaleDateString('pt-BR') + ' às ' + now2.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
    const w = window.open('','_blank')

    // Helper para células de horário
    function fmtCell(r) {
      if (!r) return '—'
      if (r.manually_edited) return '<span class="manual">&#9998; ' + fmtT(r.recorded_at) + '</span>'
      return fmtT(r.recorded_at)
    }

    const grandTotal = targetEmps.reduce((a, emp) => a + calcEmpStats(emp, days).totalH, 0)
    const holsCount  = days.filter(d => d.isHoliday).length
    const diasUteis  = days.filter(d => !d.isWeekend && !d.isHoliday && d.date <= today).length

    let html = '<!DOCTYPE html><html><head>'
    html += '<meta charset="UTF-8"/>'
    html += '<title>Extrato de Ponto - ' + MONTH_NAMES[month] + ' ' + year + '</title>'
    html += '<style>'
    html += '@page { size: A4 landscape; margin: 12mm 14mm; }'
    html += '* { box-sizing: border-box; margin: 0; padding: 0; }'
    html += 'body { font-family: Segoe UI, Arial, sans-serif; font-size: 10px; color: #1e293b; background: #fff; print-color-adjust: exact; -webkit-print-color-adjust: exact; }'
    html += '.doc-header { display: flex; align-items: stretch; margin-bottom: 18px; border-radius: 10px; overflow: hidden; border: 1.5px solid #e2e8f0; }'
    html += '.doc-logo { background: #2d1a0e; padding: 14px 22px; display: flex; align-items: center; justify-content: center; min-width: 130px; }'
    html += '.doc-logo-text { font-size: 24px; font-weight: 900; letter-spacing: -1px; }'
    html += '.logo-coisa { color: #C5904A; } .logo-pet { color: #C9A87B; }'
    html += '.doc-logo-sub { font-size: 7px; font-weight: 700; color: rgba(255,255,255,.35); letter-spacing: 2.5px; text-transform: uppercase; display: block; text-align: center; margin-top: 3px; }'
    html += '.doc-info { flex: 1; padding: 14px 20px; display: flex; flex-direction: column; justify-content: center; gap: 3px; }'
    html += '.doc-title { font-size: 16px; font-weight: 900; color: #0f172a; letter-spacing: -.4px; }'
    html += '.doc-period { font-size: 11px; font-weight: 700; color: #64748b; margin-top: 2px; }'
    html += '.doc-gen { font-size: 9px; color: #94a3b8; margin-top: 4px; }'
    html += '.doc-meta { padding: 14px 22px; border-left: 1.5px solid #e2e8f0; display: flex; flex-direction: column; justify-content: center; align-items: flex-end; gap: 5px; }'
    html += '.doc-total-lbl { font-size: 8px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; }'
    html += '.doc-total-val { font-size: 22px; font-weight: 900; color: #0f172a; }'
    html += '.doc-hols { font-size: 9px; color: #7c3aed; font-weight: 600; }'
    html += '.emp-block { margin-bottom: 22px; break-inside: avoid; }'
    html += '.emp-hd { background: #1e293b; color: white; padding: 10px 14px; border-radius: 8px 8px 0 0; display: flex; align-items: center; justify-content: space-between; }'
    html += '.emp-name { font-size: 16px; font-weight: 900; letter-spacing: -.4px; }'
    html += '.emp-role { font-size: 9px; color: rgba(255,255,255,.5); font-weight: 600; margin-top: 1px; }'
    html += '.emp-stats { display: flex; gap: 18px; align-items: center; }'
    html += '.stat-item { text-align: right; }'
    html += '.stat-lbl { font-size: 7px; color: rgba(255,255,255,.4); font-weight: 700; text-transform: uppercase; letter-spacing: .5px; display: block; }'
    html += '.stat-val { font-size: 15px; font-weight: 900; display: block; }'
    html += '.ok { color: #86efac; } .pos { color: #67e8f9; } .neg { color: #fca5a5; }'
    html += 'table { width: 100%; border-collapse: collapse; border: 1.5px solid #e2e8f0; border-top: none; }'
    html += 'thead tr { background: #f8fafc; }'
    html += 'th { padding: 6px 8px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #64748b; border-bottom: 1.5px solid #e2e8f0; text-align: left; }'
    html += 'th.c { text-align: center; } th.r { text-align: right; }'
    html += 'td { padding: 4.5px 8px; border-bottom: 1px solid #f1f5f9; font-size: 9.5px; }'
    html += 'td.c { text-align: center; } td.r { text-align: right; font-weight: 700; }'
    html += 'tr.wk td { background: #f8fafc; color: #94a3b8; }'
    html += 'tr.hol td { background: #faf5ff; } tr.hol td:first-child { color: #7c3aed; font-weight: 700; }'
    html += 'tr.norec td { color: #cbd5e1; }'
    html += '.manual { display: inline-flex; align-items: center; background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; border-radius: 4px; padding: 0 4px; font-size: 8px; font-weight: 700; }'
    html += '.sp { color: #16a34a; font-weight: 900; } .sn { color: #dc2626; font-weight: 900; } .st { color: #94a3b8; }'
    html += 'tr.total-row { background: #f0fdf4 !important; }'
    html += 'tr.total-row td { font-weight: 900; color: #166534; border-top: 2px solid #86efac; font-size: 10.5px; padding: 7px 8px; }'
    html += '.eb { display: inline-block; background: #eff6ff; color: #1d4ed8; font-size: 8px; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-left: 6px; }'
    html += '.hb { display: inline-block; background: #f3e8ff; color: #7c3aed; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 4px; margin-left: 4px; }'
    html += '.vb { display: inline-block; background: #d1fae5; color: #065f46; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 4px; margin-left: 4px; }'
    html += 'tr.vac td { background: #ecfdf5; } tr.vac td:first-child { color: #059669; font-weight: 700; }'
    html += '.meta-bar { display: flex; gap: 0; margin-bottom: 18px; border-radius: 10px; overflow: hidden; border: 1.5px solid #e2e8f0; }'
    html += '.meta-cell { flex: 1; padding: 10px 16px; display: flex; flex-direction: column; justify-content: center; border-right: 1.5px solid #e2e8f0; }'
    html += '.meta-cell:last-child { border-right: none; }'
    html += '.meta-lbl { font-size: 8px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 3px; }'
    html += '.meta-val { font-size: 18px; font-weight: 900; color: #0f172a; }'
    html += '.meta-sub { font-size: 9px; color: #94a3b8; margin-top: 2px; }'
    html += '.meta-val.pos { color: #16a34a; } .meta-val.neg { color: #dc2626; } .meta-val.nt { color: #64748b; }'
    html += '@media print { .emp-block { page-break-inside: avoid; } }'
    html += '</style></head><body>'

    // Header do documento
    html += '<div class="doc-header">'
    html += '<div class="doc-logo"><div><div class="doc-logo-text"><span class="logo-coisa">coisa</span><span class="logo-pet">pet</span></div><span class="doc-logo-sub">CoisaPet</span></div></div>'
    html += '<div class="doc-info">'
    html += '<div class="doc-title">Extrato de Ponto &mdash; ' + MONTH_NAMES[month] + ' ' + year + '</div>'
    html += '<div class="doc-period">' + targetEmps.length + ' colaborador(es) &middot; ' + diasUteis + ' dias &uacute;teis</div>'
    html += '<div class="doc-gen">Gerado em ' + genDate + '</div>'
    html += '</div>'
    html += '<div class="doc-meta">'
    html += '<span class="doc-total-lbl">Total trabalhado</span>'
    html += '<span class="doc-total-val">' + fmtH(grandTotal) + '</span>'
    if (holsCount > 0) html += '<span class="doc-hols">&#128197; ' + holsCount + ' feriado(s)</span>'
    html += '</div></div>'

    // Barra de meta mensal — uma linha por colaborador se vários, ou expandida se um só
    const metaBarEmps = targetEmps.map(emp => {
      const { totalH, metaH, saldoH } = calcEmpStats(emp, days)
      return { emp, totalH, metaH, saldoH }
    })
    const totalMetaGeral = metaBarEmps.reduce((a, e) => a + e.metaH, 0)
    const totalSaldoGeral = grandTotal - totalMetaGeral

    if (targetEmps.length === 1 && targetEmps[0].fixed_monthly_salary > 0) {
      // Único funcionário, e é salário fixo — barra de dias/valor, sem horas
      const fs = calcFixedSalaryStats(targetEmps[0], days)
      html += '<div class="meta-bar">'
      html += '<div class="meta-cell" style="background:#f8fafc"><span class="meta-lbl">Sal&aacute;rio bruto</span><span class="meta-val nt">' + fmtBRL(fs.salario) + '</span><span class="meta-sub">' + fs.diasUteisMes + ' dias &uacute;teis no m&ecirc;s</span></div>'
      html += '<div class="meta-cell" style="background:#f8fafc"><span class="meta-lbl">Valor por dia</span><span class="meta-val nt">' + fmtBRL(fs.valorDia) + '</span><span class="meta-sub">' + fs.diasEsperados + ' dias esperados at&eacute; hoje</span></div>'
      html += '<div class="meta-cell" style="background:#f8fafc"><span class="meta-lbl">Dias trabalhados</span><span class="meta-val ok">' + fs.diasTrabalhados + '</span><span class="meta-sub">' + targetEmps[0].name.split(' ')[0] + (fs.diasCompensados > 0 ? ' &middot; +' + fs.diasCompensados + ' compensado(s)' : '') + '</span></div>'
      html += '<div class="meta-cell" style="background:' + (fs.diasFaltados > 0 ? '#fef2f2' : '#f0fdf4') + '"><span class="meta-lbl">Dias faltados</span><span class="meta-val ' + (fs.diasFaltados > 0 ? 'neg' : 'ok') + '">' + fs.diasFaltados + '</span><span class="meta-sub">desconto: ' + fmtBRL(fs.desconto) + '</span></div>'
      html += '<div class="meta-cell" style="background:#f0fdf4"><span class="meta-lbl">Valor final</span><span class="meta-val ok">' + fmtBRL(fs.valorFinal) + '</span><span class="meta-sub">a receber</span></div>'
      html += '</div>'
    } else if (targetEmps.length === 1) {
      // Um funcionário — barra detalhada
      const { totalH, metaH, saldoH } = metaBarEmps[0]
      const sc = saldoH > 0.05 ? 'pos' : saldoH < -0.05 ? 'neg' : 'nt'
      const ss = saldoH > 0 ? '+' : ''
      html += '<div class="meta-bar">'
      html += '<div class="meta-cell" style="background:#f8fafc"><span class="meta-lbl">Dias &uacute;teis no m&ecirc;s</span><span class="meta-val nt">' + diasUteis + '</span><span class="meta-sub">seg &ndash; sex, sem feriados</span></div>'
      const metaDiariaFmt = fmtH(dailyTarget(metaBarEmps[0]?.emp) / 60)
    html += '<div class="meta-cell" style="background:#f8fafc"><span class="meta-lbl">Meta di&aacute;ria</span><span class="meta-val nt">' + metaDiariaFmt + '</span><span class="meta-sub">por dia &uacute;til</span></div>'
      html += '<div class="meta-cell" style="background:#f8fafc"><span class="meta-lbl">Meta total do m&ecirc;s</span><span class="meta-val nt">' + fmtH(metaH) + '</span><span class="meta-sub">' + diasUteis + ' dias &times; ' + metaDiariaFmt + '</span></div>'
      html += '<div class="meta-cell" style="background:#f8fafc"><span class="meta-lbl">Total trabalhado</span><span class="meta-val ok">' + fmtH(totalH) + '</span><span class="meta-sub">' + metaBarEmps[0].emp.name.split(' ')[0] + '</span></div>'
      html += '<div class="meta-cell" style="background:' + (sc === 'pos' ? '#f0fdf4' : sc === 'neg' ? '#fef2f2' : '#f8fafc') + '"><span class="meta-lbl">Saldo do m&ecirc;s</span><span class="meta-val ' + sc + '">' + ss + fmtH(Math.abs(saldoH)) + '</span><span class="meta-sub">' + (saldoH > 0.05 ? 'sobrando' : saldoH < -0.05 ? 'faltando' : 'em dia') + '</span></div>'
      html += '</div>'
    } else {
      // Vários funcionários — barra consolidada
      const sc = totalSaldoGeral > 0.05 ? 'pos' : totalSaldoGeral < -0.05 ? 'neg' : 'nt'
      const ss = totalSaldoGeral > 0 ? '+' : ''
      html += '<div class="meta-bar">'
      html += '<div class="meta-cell" style="background:#f8fafc"><span class="meta-lbl">Dias &uacute;teis no m&ecirc;s</span><span class="meta-val nt">' + diasUteis + '</span><span class="meta-sub">seg &ndash; sex, sem feriados</span></div>'
      html += '<div class="meta-cell" style="background:#f8fafc"><span class="meta-lbl">Meta di&aacute;ria por pessoa</span><span class="meta-val nt">8h44m</span><span class="meta-sub">por dia &uacute;til</span></div>'
      html += '<div class="meta-cell" style="background:#f8fafc"><span class="meta-lbl">Meta total consolidada</span><span class="meta-val nt">' + fmtH(totalMetaGeral) + '</span><span class="meta-sub">' + targetEmps.length + ' pessoas &times; ' + fmtH(totalMetaGeral / targetEmps.length) + '</span></div>'
      html += '<div class="meta-cell" style="background:#f8fafc"><span class="meta-lbl">Total trabalhado</span><span class="meta-val ok">' + fmtH(grandTotal) + '</span><span class="meta-sub">todos os colaboradores</span></div>'
      html += '<div class="meta-cell" style="background:' + (sc === 'pos' ? '#f0fdf4' : sc === 'neg' ? '#fef2f2' : '#f8fafc') + '"><span class="meta-lbl">Saldo consolidado</span><span class="meta-val ' + sc + '">' + ss + fmtH(Math.abs(totalSaldoGeral)) + '</span><span class="meta-sub">' + (totalSaldoGeral > 0.05 ? 'sobrando' : totalSaldoGeral < -0.05 ? 'faltando' : 'em dia') + '</span></div>'
      html += '</div>'
    }

    // Bloco por funcionário
    for (const emp of targetEmps) {
      // ── Funcionário com salário fixo (ex: Eduardo) — bloco simplificado, sem horas ──
      if (emp.fixed_monthly_salary > 0) {
        const stats = calcFixedSalaryStats(emp, days)
        const empRecs = records[emp.id] || {}

        html += '<div class="emp-block">'
        html += '<div class="emp-hd">'
        html += '<div><div class="emp-name">' + emp.name + '</div><div class="emp-role">' + (emp.job_title || emp.role || '') + ' &middot; sal&aacute;rio fixo mensal</div></div>'
        html += '<div class="emp-stats">'
        html += '<div class="stat-item"><span class="stat-lbl">Dias trabalhados</span><span class="stat-val ok">' + stats.diasTrabalhados + '</span></div>'
        if (stats.diasCompensados > 0) {
          html += '<div class="stat-item"><span class="stat-lbl">Compensados</span><span class="stat-val pos">' + stats.diasCompensados + '</span></div>'
        }
        html += '<div class="stat-item"><span class="stat-lbl">Dias faltados</span><span class="stat-val neg">' + stats.diasFaltados + '</span></div>'
        html += '<div class="stat-item"><span class="stat-lbl">Valor final</span><span class="stat-val ok">' + fmtBRL(stats.valorFinal) + '</span></div>'
        html += '</div></div>'

        html += '<table><thead><tr>'
        html += '<th style="width:140px">Dia</th><th class="c">Situa&ccedil;&atilde;o</th>'
        html += '</tr></thead><tbody>'

        for (const d of days) {
          const { date, isWeekend, isHoliday: isHol } = d
          const isVac = isVacationDay(emp.id, date)
          const dr = empRecs[date] || []
          const dayFmt = new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})
          const isCompensacao = (isWeekend || isHol) && dr.length > 0
          const cls = isVac ? 'vac' : isCompensacao ? 'vac' : isHol ? 'hol' : isWeekend ? 'wk' : dr.length === 0 ? 'norec' : ''
          const holBadge = isHol ? '<span class="hb">Feriado</span>' : isVac ? '<span class="vb">&#127796; F&eacute;rias</span>' : ''

          let statusCell
          if (isCompensacao) statusCell = '<span class="sp">Compensado</span>'
          else if (isWeekend || isHol || isVac) statusCell = '<span class="st">&mdash;</span>'
          else if (date > today) statusCell = '<span class="st">&mdash;</span>'
          else if (dr.length > 0) statusCell = '<span class="sp">Trabalhado</span>'
          else statusCell = '<span class="sn">Falta</span>'

          html += '<tr class="' + cls + '">'
          html += '<td>' + dayFmt + holBadge + '</td>'
          html += '<td class="c">' + statusCell + '</td>'
          html += '</tr>'
        }

        html += '<tr class="total-row">'
        html += '<td><strong>Sal&aacute;rio bruto: ' + fmtBRL(stats.salario) + '</strong></td>'
        html += '<td class="c">Valor/dia: ' + fmtBRL(stats.valorDia) + '</td>'
        html += '</tr>'
        html += '<tr class="total-row">'
        html += '<td><strong>Desconto por faltas: -' + fmtBRL(stats.desconto) + '</strong></td>'
        html += '<td class="c"><strong>Valor final: ' + fmtBRL(stats.valorFinal) + '</strong></td>'
        html += '</tr></tbody></table></div>'
        continue
      }

      const { totalH, metaH, saldoH, totalDays, empRecs } = calcEmpStats(emp, days)
      const saldoClass = saldoH > 0.05 ? 'pos' : saldoH < -0.05 ? 'neg' : 'ok'
      const saldoSign  = saldoH > 0 ? '+' : ''

      html += '<div class="emp-block">'
      html += '<div class="emp-hd">'
      html += '<div><div class="emp-name">' + emp.name + '</div><div class="emp-role">' + (emp.job_title || emp.role || '') + '</div></div>'
      html += '<div class="emp-stats">'
      html += '<div class="stat-item"><span class="stat-lbl">Dias trabalhados</span><span class="stat-val ok">' + totalDays + '</span></div>'
      html += '<div class="stat-item"><span class="stat-lbl">Meta do m&ecirc;s</span><span class="stat-val ok">' + fmtH(metaH) + '</span></div>'
      html += '<div class="stat-item"><span class="stat-lbl">Total trabalhado</span><span class="stat-val ok">' + fmtH(totalH) + '</span></div>'
      html += '<div class="stat-item"><span class="stat-lbl">Saldo</span><span class="stat-val ' + saldoClass + '">' + saldoSign + fmtH(Math.abs(saldoH)) + '</span></div>'
      html += '</div></div>'

      html += '<table><thead><tr>'
      html += '<th style="width:82px">Dia</th><th class="c">Entrada</th><th class="c">Sa&iacute;da Almo&ccedil;o</th><th class="c">Retorno</th><th class="c">Sa&iacute;da</th><th class="r">Total</th><th class="r" style="width:96px">Meta / Saldo</th>'
      html += '</tr></thead><tbody>'

      for (const d of days) {
        const { date, isWeekend, isHoliday: isHol } = d
        const isVac = isVacationDay(emp.id, date)
        const dr = empRecs[date] || []
        const entrada = dr.find(r => r.punch_type === 'entrada')
        const sAlm    = dr.find(r => r.punch_type === 'saida_almoco')
        const vAlm    = dr.find(r => r.punch_type === 'volta_almoco')
        const saida   = dr.find(r => r.punch_type === 'saida')
        const dayFmt  = new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})

        const { h } = calcDayHours(dr)

        const tgtMin = (isHol || isVac) ? 0 : (targets[emp.id]?.[date] ?? (isWeekend ? 0 : dailyTarget(emp)))
        const saldo  = h != null ? h - tgtMin / 60 : null

        const cls = isVac ? 'vac' : isHol ? 'hol' : isWeekend ? 'wk' : dr.length === 0 ? 'norec' : ''
        const holBadge = isHol ? '<span class="hb">Feriado</span>' : isVac ? '<span class="vb">&#127796; F&eacute;rias</span>' : ''

        let totalCell = ''
        if (h != null) totalCell = fmtH(h)
        else if (dr.length > 0) totalCell = 'Em aberto'
        else if (isWeekend || isHol || isVac || date > today) totalCell = '&mdash;'
        else totalCell = 'Falta'

        let saldoCell = ''
        if (saldo != null) {
          const sc = saldo >= 0 ? 'sp' : 'sn'
          const ss = saldo >= 0 ? '+' : ''
          saldoCell = '<span class="' + sc + '">' + ss + fmtH(Math.abs(saldo)) + '</span>'
        } else if (!isWeekend && !isHol && !isVac && date <= today && dr.length === 0) {
          saldoCell = '<span class="sn">-' + fmtH(tgtMin/60) + '</span>'
        } else {
          saldoCell = '<span class="st">&mdash;</span>'
        }

        html += '<tr class="' + cls + '">'
        html += '<td>' + dayFmt + holBadge + '</td>'
        html += '<td class="c">' + fmtCell(entrada) + '</td>'
        html += '<td class="c">' + fmtCell(sAlm) + '</td>'
        html += '<td class="c">' + fmtCell(vAlm) + '</td>'
        html += '<td class="c">' + fmtCell(saida) + '</td>'
        html += '<td class="r">' + totalCell + '</td>'
        html += '<td class="r">' + saldoCell + '</td>'
        html += '</tr>'
      }

      const saldoFinal = saldoH >= 0
        ? '<span class="sp">+' + fmtH(saldoH) + '</span>'
        : '<span class="sn">' + fmtH(saldoH) + '</span>'

      // Rodapé com meta total + trabalhado + saldo
      html += '<tr class="total-row">'
      html += '<td colspan="2"><strong>Total ' + MONTH_NAMES[month] + ' ' + year + '</strong></td>'
      html += '<td colspan="2" style="text-align:right;font-size:9px;color:#64748b;font-weight:600">Meta do período: ' + fmtH(metaH) + '</td>'
      html += '<td class="c">' + totalDays + ' dias</td>'
      html += '<td class="r">' + fmtH(totalH) + '</td>'
      html += '<td class="r">' + saldoFinal + '</td>'
      html += '</tr></tbody></table></div>'
    }

    html += '</body></html>'
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 500)
  }

  // Funcionários com registros nos últimos 6 meses
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMAgo = sixMonthsAgo.toISOString().split('T')[0]
  const activeEmps = employees.filter(emp => {
    const empRecs = records[emp.id] || {}
    return Object.keys(empRecs).some(d => d >= sixMAgo)
  })

  // targetEmps respeita dropdown E focusEmp
  const targetEmps = focusEmp
    ? employees.filter(e => e.id === focusEmp)
    : selEmp === 'all'
      ? [] // sem foco = não mostra tabela
      : employees.filter(e => e.id === selEmp)
  const isNextDisabled = year === now.getFullYear() && month === now.getMonth()

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <PageHeader
        title="Relatório de Ponto"
        subtitle="Horas trabalhadas por funcionário"
        actions={
          <button onClick={handlePrint} className="btn-primary flex items-center gap-1.5">
            <Printer size={15}/> Imprimir / Exportar
          </button>
        }
      />

      {/* Controles */}
      <div className="card flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronLeft size={18}/>
          </button>
          <div className="text-center min-w-[160px]">
            <p className="font-black text-slate-800 text-lg" style={{fontFamily:'Nunito,sans-serif'}}>{MONTH_NAMES[month]}</p>
            <p className="text-xs text-slate-400 font-semibold">{year}</p>
          </div>
          <button onClick={nextMonth} disabled={isNextDisabled}
            className={`p-2 rounded-xl transition-colors ${isNextDisabled ? 'text-slate-200 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-500'}`}>
            <ChevronRight size={18}/>
          </button>
        </div>
        <div className="w-px h-8 bg-slate-100 hidden sm:block"/>
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <User size={15} className="text-slate-400 shrink-0"/>
          <select className="select flex-1" value={selEmp} onChange={e=>{
              const v = e.target.value
              setSelEmp(v)
              setFocusEmp(v !== 'all' ? v : null)
            }}>
            <option value="all">Todos os funcionários</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="ml-auto text-right hidden md:block">
          <p className="text-xs text-slate-400 font-semibold">Total do período</p>
          <p className="text-xl font-black text-slate-800" style={{fontFamily:'Nunito,sans-serif'}}>
            {fmtH(targetEmps.reduce((acc,emp)=>{
              const empRecs=records[emp.id]||{}
              return acc+days.reduce((a,d)=>{
                const s=(empRecs[d.date]||[]).find(r=>r.punch_type==='saida')
                return a+(s?.hours_worked?parseFloat(s.hours_worked):0)
              },0)
            },0))}
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { id:'relatorio',    label:'Relatório de Ponto' },
          { id:'registro',     label:'Registro de Ponto' },
          { id:'semanal',      label:'Ponto Semanal' },
          { id:'fim-semana',   label:'Horas Fim de Semana' },
          { id:'diagnostico',  label:'🔍 Diagnóstico de Registros' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all
              ${activeTab===t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ABA REGISTRO DE PONTO (diário) ── */}
      {activeTab === 'registro' && <RHPontoPage embedded/>}

      {/* ── ABA PONTO SEMANAL (horistas) ── */}
      {activeTab === 'semanal' && <RHPontoSemanalPage embedded/>}

      {/* ── ABA HORAS FIM DE SEMANA (Marlon) ── */}
      {activeTab === 'fim-semana' && <RHHorasFimSemanaPage embedded/>}

      {/* ── ABA DIAGNÓSTICO ── */}
      {activeTab === 'diagnostico' && (
        <div className="flex flex-col gap-4">
          <div className="card p-4 flex items-center gap-3">
            <User size={15} className="text-slate-400"/>
            <select className="select flex-1" value={diagEmp} onChange={e => setDiagEmp(e.target.value)}>
              <option value="">Selecione um colaborador...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          {diagEmp && (() => {
            const empRecs = records[diagEmp] || {}
            const emp = employees.find(e => e.id === diagEmp)

            // Todos os dias com registros, ordenados
            const diasComReg = days.filter(d => (empRecs[d.date]||[]).length > 0)

            return (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-slate-400 font-semibold">
                  {diasComReg.length} dias com registros em {MONTH_NAMES[month]} {year}
                </p>
                {diasComReg.map(({ date, isWeekend, isHoliday }) => {
                  const recs = (empRecs[date] || []).slice().sort((a,b) =>
                    new Date(a.recorded_at) - new Date(b.recorded_at)
                  )
                  const { h, emAberto } = calcDayHours(recs)
                  const hasAnomaly = recs.length !== 4 // diferente do padrão entrada/salmoço/volta/saída

                  const PUNCH_CFG = {
                    entrada:       { label: 'Entrada',       color: '#10b981', bg: 'bg-emerald-50 border-emerald-200'  },
                    saida_almoco:  { label: 'Saída Almoço',  color: '#f59e0b', bg: 'bg-amber-50 border-amber-200'      },
                    volta_almoco:  { label: 'Volta Almoço',  color: '#3b82f6', bg: 'bg-blue-50 border-blue-200'        },
                    saida:         { label: 'Saída',         color: '#6366f1', bg: 'bg-indigo-50 border-indigo-200'    },
                  }

                  return (
                    <div key={date} className={`card overflow-hidden ${hasAnomaly ? 'ring-2 ring-amber-300' : ''}`}>
                      {/* Header do dia */}
                      <div className={`px-4 py-3 flex items-center justify-between border-b border-slate-100
                        ${hasAnomaly ? 'bg-amber-50' : 'bg-slate-50'}`}>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-700">
                            {new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'})}
                          </p>
                          {isWeekend && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">FDS</span>}
                          {isHoliday && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">FERIADO</span>}
                          {hasAnomaly && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⚠ {recs.length} registros</span>}
                        </div>
                        <div className="text-right">
                          {h != null
                            ? <span className="text-sm font-black text-slate-800">{fmtH(h)}</span>
                            : emAberto
                              ? <span className="text-xs font-bold text-amber-500">Em aberto</span>
                              : <span className="text-xs text-slate-400">—</span>
                          }
                        </div>
                      </div>

                      {/* Lista de registros */}
                      <div className="divide-y divide-slate-50">
                        {recs.map((r, i) => {
                          const cfg = PUNCH_CFG[r.punch_type] || { label: r.punch_type, color: '#94a3b8', bg: 'bg-slate-50 border-slate-200' }
                          const ts = new Date(r.recorded_at)
                          // Detecta duplicata — mesma hora que o próximo/anterior
                          const isDuplicate = recs.some((other, j) =>
                            j !== i && Math.abs(new Date(other.recorded_at) - ts) < 60000
                          )
                          return (
                            <div key={r.id} className={`flex items-center gap-3 px-4 py-3
                              ${isDuplicate ? 'bg-rose-50' : ''}`}>
                              <span className={`inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-lg border ${cfg.bg}`}
                                style={{ color: cfg.color }}>
                                {cfg.label}
                              </span>
                              <span className="font-black text-slate-700 tabular-nums">
                                {ts.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                              </span>
                              {r.manually_edited && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 border border-orange-200">✎ editado</span>
                              )}
                              {isDuplicate && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 border border-rose-200">duplicata</span>
                              )}
                              <button onClick={() => deletePunch(r.id)}
                                disabled={deletingId === r.id}
                                className="ml-auto p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40">
                                <Trash2 size={14}/>
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {activeTab === 'relatorio' && loading ? <LoadingCard/> : activeTab === 'relatorio' && (
        <>
          {/* Grid de cards clicáveis */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <TrendingUp size={13}/>
              {focusEmp || selEmp !== 'all' ? (
                <button onClick={() => { setFocusEmp(null) }}
                  className="text-rose-400 hover:text-rose-600 font-bold flex items-center gap-1">
                  ← Todos os funcionários
                </button>
              ) : 'Funcionários ativos'}
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {(selEmp === 'all' ? activeEmps : employees.filter(e => e.id === selEmp)).map(emp => {
                const { totalH, saldoH } = calcEmpStats(emp, days)
                const totalDays = days.filter(d => (records[emp.id]?.[d.date]||[]).length > 0).length
                const isFocused = focusEmp === emp.id
                return (
                  <div key={emp.id}
                    onClick={() => setFocusEmp(isFocused ? null : emp.id)}
                    className={`card p-4 cursor-pointer transition-all hover:shadow-md
                      ${isFocused ? 'ring-2 ring-rose-400 shadow-md' : 'hover:border-rose-200'}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar name={emp.name}/>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{emp.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{emp.job_title||emp.role}</p>
                      </div>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-black text-slate-800">{fmtH(totalH)}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[11px] text-slate-400">{totalDays} dia(s) · {MONTH_NAMES[month]}</p>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${emp.half_day ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                            {emp.half_day ? '½ período' : 'integral'}
                          </span>
                        </div>
                      </div>
                      {saldoH !== 0 && (
                        <span className={`text-sm font-black ${saldoH > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {saldoH > 0 ? '+' : ''}{fmtH(Math.abs(saldoH))}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tabela do funcionário focado */}
          {targetEmps.map(emp => {
            const empRecs = records[emp.id] || {}

            // Calcula total trabalhado E saldo (excedente/faltante) do mês
            // Usa calcEmpStats para consistência com o PDF
            const { totalH, metaH, saldoH } = calcEmpStats(emp, days)

            const totalDays = days.filter(d=>(empRecs[d.date]||[]).length>0).length

            // ── Funcionário com salário fixo (ex: Eduardo) — mostra dias, nunca horas ──
            if (emp.fixed_monthly_salary > 0) {
              const stats = calcFixedSalaryStats(emp, days)
              return (
                <div key={emp.id} className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={emp.name}/>
                      <div>
                        <p className="font-bold text-slate-800">{emp.name}</p>
                        <p className="text-xs text-slate-400">{emp.job_title||emp.role} · salário fixo mensal</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingSalary === emp.id ? (
                        <>
                          <DollarSign size={13} className="text-slate-400"/>
                          <input autoFocus type="text" inputMode="decimal" className="input w-28 text-sm py-1"
                            placeholder="2000,00" value={salaryVal} onChange={e=>setSalaryVal(e.target.value)}
                            onKeyDown={e=>{ if(e.key==='Enter') saveFixedSalary(emp.id); if(e.key==='Escape') setEditingSalary(false) }}/>
                          <button onClick={()=>saveFixedSalary(emp.id)} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg"><Check size={14}/></button>
                          <button onClick={()=>setEditingSalary(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={14}/></button>
                        </>
                      ) : (
                        <button onClick={()=>{ setSalaryVal(String(emp.fixed_monthly_salary ?? '')); setEditingSalary(emp.id) }}
                          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 transition-colors">
                          <Wallet size={13}/> Salário base: {fmtBRL(emp.fixed_monthly_salary)}
                          <Pencil size={11} className="text-slate-300"/>
                        </button>
                      )}
                      <button onClick={()=>generateFixedSalaryPDF(emp, stats)} disabled={generatingHolerite}
                        className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-50">
                        {generatingHolerite
                          ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                          : <FileDown size={14}/>
                        }
                        Gerar Holerite
                      </button>
                    </div>
                  </div>

                  <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl p-3 bg-slate-50 border border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Salário bruto</p>
                      <p className="text-lg font-black text-slate-700">{fmtBRL(stats.salario)}</p>
                    </div>
                    <div className="rounded-xl p-3 bg-slate-50 border border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Dias úteis do mês</p>
                      <p className="text-lg font-black text-slate-700">{stats.diasUteisMes}</p>
                    </div>
                    <div className="rounded-xl p-3 bg-slate-50 border border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Valor por dia</p>
                      <p className="text-lg font-black text-slate-700">{fmtBRL(stats.valorDia)}</p>
                    </div>
                    <div className="rounded-xl p-3 bg-sky-50 border border-sky-100">
                      <p className="text-[10px] text-sky-500 font-bold uppercase tracking-wide">Dias esperados até hoje</p>
                      <p className="text-lg font-black text-sky-700">{stats.diasEsperados}</p>
                    </div>
                    <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-100">
                      <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide">Dias trabalhados</p>
                      <p className="text-lg font-black text-emerald-700">{stats.diasTrabalhados}</p>
                    </div>
                    {stats.diasCompensados > 0 && (
                      <div className="rounded-xl p-3 bg-violet-50 border border-violet-100">
                        <p className="text-[10px] text-violet-500 font-bold uppercase tracking-wide">Dias compensados</p>
                        <p className="text-lg font-black text-violet-700">{stats.diasCompensados}</p>
                        <p className="text-[9px] text-violet-400 mt-0.5">feriado/fim de semana trabalhado</p>
                      </div>
                    )}
                    <div className="rounded-xl p-3 bg-rose-50 border border-rose-100">
                      <p className="text-[10px] text-rose-500 font-bold uppercase tracking-wide">Dias faltados</p>
                      <p className="text-lg font-black text-rose-600">{stats.diasFaltados}</p>
                      {stats.diasCompensados > 0 && (
                        <p className="text-[9px] text-rose-400 mt-0.5">já descontados os compensados</p>
                      )}
                    </div>
                  </div>

                  <div className="mx-5 mb-5 rounded-xl p-4 flex items-center justify-between" style={{background:'#3D1F0D'}}>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide" style={{color:'#C4956A'}}>Desconto por faltas</p>
                      <p className="text-sm font-bold text-white">- {fmtBRL(stats.desconto)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wide" style={{color:'#C4956A'}}>Valor final a receber</p>
                      <p className="text-2xl font-black text-white" style={{fontFamily:'Nunito,sans-serif'}}>{fmtBRL(stats.valorFinal)}</p>
                    </div>
                  </div>

                  {/* Ponto detalhado (entrada/saída) — mantido pra visão da diretoria */}
                  <div className="px-5 pb-2 pt-1 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ponto detalhado</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="py-2.5 px-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Dia</th>
                          <th className="py-2.5 px-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{color:'#10b981'}}>Entrada</th>
                          <th className="py-2.5 px-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{color:'#f59e0b'}}>Saída Almoço</th>
                          <th className="py-2.5 px-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{color:'#3b82f6'}}>Retorno</th>
                          <th className="py-2.5 px-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{color:'#6366f1'}}>Saída</th>
                          <th className="py-2.5 px-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</th>
                          <th className="py-2.5 px-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Meta / Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {days.map(({date, isWeekend, isToday, isHoliday})=>(
                          <DayRow key={date} date={date}
                            records={empRecs[date]||[]}
                            isWeekend={isWeekend} isToday={isToday} isHoliday={isHoliday}
                            isVacation={isVacationDay(emp.id, date)}
                            empId={emp.id}
                            targetMin={(isHoliday || isVacationDay(emp.id, date)) ? 0 : (targets[emp.id]?.[date] ?? (isWeekend ? 0 : dailyTarget(emp)))}
                            onEdit={(d, recs) => handleEdit(d, recs, emp.id)}
                            onSaveTarget={(d, min) => handleSaveTarget(emp.id, d, min)}
                            onToggleHoliday={() => toggleHoliday(date)}
                          />
                        ))}
                        <tr className="border-t-2 border-emerald-100 bg-emerald-50/40">
                          <td colSpan={3} className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Total {MONTH_NAMES[month]} {year}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-xs text-slate-400 font-semibold">
                              meta: {fmtH(metaH)}
                            </span>
                          </td>
                          <td/>
                          <td className="py-3 px-4 text-right text-base font-black text-emerald-700">
                            {fmtH(totalH)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`text-sm font-black ${saldoH > 0 ? 'text-emerald-600' : saldoH < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                {saldoH > 0 ? '+' : ''}{fmtH(Math.abs(saldoH))}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {saldoH > 0 ? 'sobrando' : saldoH < 0 ? 'faltando' : 'em dia'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }

            return (
              <div key={emp.id} className="card p-0 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={emp.name}/>
                    <div>
                      <p className="font-bold text-slate-800">{emp.name}</p>
                      <p className="text-xs text-slate-400">{emp.job_title||emp.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {editingSalary === emp.id ? (
                      <div className="flex items-center gap-1.5">
                        <DollarSign size={13} className="text-slate-400"/>
                        <input autoFocus type="text" inputMode="decimal" className="input w-28 text-sm py-1"
                          placeholder="2000,00" value={salaryVal} onChange={e=>setSalaryVal(e.target.value)}
                          onKeyDown={e=>{ if(e.key==='Enter') saveFixedSalary(emp.id); if(e.key==='Escape') setEditingSalary(false) }}/>
                        <button onClick={()=>saveFixedSalary(emp.id)} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg"><Check size={14}/></button>
                        <button onClick={()=>setEditingSalary(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={14}/></button>
                      </div>
                    ) : (
                      <button onClick={()=>{ setSalaryVal(''); setEditingSalary(emp.id) }}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 transition-colors">
                        <Wallet size={11}/> Ativar salário fixo
                      </button>
                    )}
                    <div className="text-right">
                      <p className="text-2xl font-black text-slate-800" style={{fontFamily:'Nunito,sans-serif'}}>{fmtH(totalH)}</p>
                      <p className="text-xs text-slate-400">{totalDays} dia(s) · {MONTH_NAMES[month]}</p>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="py-2.5 px-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Dia</th>
                        <th className="py-2.5 px-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{color:'#10b981'}}>Entrada</th>
                        <th className="py-2.5 px-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{color:'#f59e0b'}}>Saída Almoço</th>
                        <th className="py-2.5 px-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{color:'#3b82f6'}}>Retorno</th>
                        <th className="py-2.5 px-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{color:'#6366f1'}}>Saída</th>
                        <th className="py-2.5 px-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</th>
                        <th className="py-2.5 px-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Meta / Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map(({date, isWeekend, isToday, isHoliday})=>(
                        <DayRow key={date} date={date}
                          records={empRecs[date]||[]}
                          isWeekend={isWeekend} isToday={isToday} isHoliday={isHoliday}
                          isVacation={isVacationDay(emp.id, date)}
                          empId={emp.id}
                          targetMin={(isHoliday || isVacationDay(emp.id, date)) ? 0 : (targets[emp.id]?.[date] ?? (isWeekend ? 0 : dailyTarget(emp)))}
                          onEdit={(d, recs) => handleEdit(d, recs, emp.id)}
                          onSaveTarget={(d, min) => handleSaveTarget(emp.id, d, min)}
                          onToggleHoliday={() => toggleHoliday(date)}
                        />
                      ))}
                      <tr className="border-t-2 border-emerald-100 bg-emerald-50/40">
                        <td colSpan={3} className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Total {MONTH_NAMES[month]} {year}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-xs text-slate-400 font-semibold">
                            meta: {fmtH(metaH)}
                          </span>
                        </td>
                        <td/>
                        <td className="py-3 px-4 text-right text-base font-black text-emerald-700">
                          {fmtH(totalH)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className={`text-sm font-black ${saldoH > 0 ? 'text-emerald-600' : saldoH < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                              {saldoH > 0 ? '+' : ''}{fmtH(Math.abs(saldoH))}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {saldoH > 0 ? 'sobrando' : saldoH < 0 ? 'faltando' : 'em dia'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* Modal de edição */}
      {editModal && (
        <EditDayModal
          open={!!editModal}
          onClose={() => setEditModal(null)}
          date={editModal.date}
          empId={editModal.empId}
          records={editModal.records}
          onSaved={loadAll}
        />
      )}
    </div>
  )
}