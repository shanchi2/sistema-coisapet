import { useState, useEffect, useMemo } from 'react'
import { Clock, LogIn, LogOut, Coffee, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtTime, fmtDate, fmtH, Avatar, PageHeader, LoadingCard, EmptyState } from './rhHelpers'

const PUNCH_CFG = {
  entrada:      { label: 'Entrada',      bg: 'bg-emerald-100', text: 'text-emerald-700', dot: '#22c55e', Icon: LogIn    },
  saida_almoco: { label: 'Saída Almoço', bg: 'bg-amber-100',   text: 'text-amber-700',   dot: '#f59e0b', Icon: Coffee   },
  volta_almoco: { label: 'Volta Almoço', bg: 'bg-sky-100',     text: 'text-sky-700',     dot: '#60a5fa', Icon: Coffee   },
  saida:        { label: 'Saída',        bg: 'bg-rose-100',    text: 'text-rose-600',    dot: '#f43f5e', Icon: LogOut   },
}

function EmployeeDayCard({ employee, records }) {
  const [open, setOpen] = useState(true)

  // Suporta múltiplos períodos (hora extra)
  // Pega TODOS os registros de entrada/saída em ordem
  const entrada = records.find(r => r.punch_type === 'entrada')
  const almoco_s = records.find(r => r.punch_type === 'saida_almoco')
  const almoco_v = records.find(r => r.punch_type === 'volta_almoco')
  // Última saída (pode haver mais de uma em caso de hora extra)
  const saidasAll = records.filter(r => r.punch_type === 'saida')
  const saida = saidasAll[saidasAll.length - 1] || null
  // Hora extra = mais de uma entrada
  const entradasAll = records.filter(r => r.punch_type === 'entrada')
  const hasOvertime = entradasAll.length > 1

  // Total acumulado = horas da última saída (RPC já soma tudo)
  const totalH  = saida?.hours_worked ? parseFloat(saida.hours_worked) : null
  const almMin  = almoco_s && almoco_v
    ? Math.round((new Date(almoco_v.recorded_at) - new Date(almoco_s.recorded_at)) / 60000)
    : null

  // Status do dia
  const lastRec = records[records.length - 1]
  const isWorking = lastRec && ['entrada','volta_almoco'].includes(lastRec.punch_type)
  const isLunch   = lastRec?.punch_type === 'saida_almoco'
  const isDone    = lastRec?.punch_type === 'saida'

  return (
    <div className="card overflow-hidden">
      {/* Header do funcionário */}
      <div
        className="flex items-center gap-4 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <Avatar name={employee.name} size="lg" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-800">{employee.name}</p>
            {isWorking && <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />Trabalhando</span>}
            {isLunch   && <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Em almoço</span>}
            {isDone    && <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Encerrado</span>}
            {!lastRec  && <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">Ausente</span>}
            {hasOvertime && <span className="text-[10px] font-black text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">Hora extra</span>}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{employee.job_title || employee.role}</p>
        </div>

        {/* Resumo compacto */}
        <div className="hidden sm:flex items-center gap-6 shrink-0">
          {entrada && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Entrada</p>
              <p className="text-sm font-bold text-slate-700 font-mono">{fmtTime(entrada.recorded_at)}</p>
            </div>
          )}
          {saida && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Saída</p>
              <p className="text-sm font-bold text-slate-700 font-mono">{fmtTime(saida.recorded_at)}</p>
            </div>
          )}
          {almMin !== null && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Almoço</p>
              <p className="text-sm font-bold text-slate-700">{almMin}min</p>
            </div>
          )}
          {totalH !== null && (
            <div className="text-center px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide">Total</p>
              <p className="text-lg font-black text-emerald-700" style={{fontFamily:'Nunito,sans-serif'}}>{fmtH(totalH)}</p>
            </div>
          )}
        </div>

        {open
          ? <ChevronUp size={16} className="text-slate-400 shrink-0 ml-2" />
          : <ChevronDown size={16} className="text-slate-400 shrink-0 ml-2" />
        }
      </div>

      {/* Timeline expandida */}
      {open && records.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          {/* Barra visual do dia */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Linha do tempo</p>
            </div>
            <div className="relative h-10 bg-slate-100 rounded-xl overflow-hidden">
              {/* Período trabalhado da manhã */}
              {(() => {
                const workStart = employee.work_start || '08:00'
                const workEnd   = employee.work_end   || '17:00'
                const dayStart  = new Date(`2000-01-01T${workStart}`)
                const dayEnd    = new Date(`2000-01-01T${workEnd}`)
                const totalMin  = (dayEnd - dayStart) / 60000

                const toPercent = ts => {
                  if (!ts) return null
                  const t = new Date(ts)
                  const d = new Date(`2000-01-01T${t.toTimeString().slice(0,5)}`)
                  return Math.min(100, Math.max(0, (d - dayStart) / 60000 / totalMin * 100))
                }

                const pIn   = toPercent(entrada?.recorded_at)
                const pAl   = toPercent(almoco_s?.recorded_at)
                const pVol  = toPercent(almoco_v?.recorded_at)
                const pOut  = toPercent(saida?.recorded_at)
                const pNow  = toPercent(new Date().toISOString())

                return (
                  <>
                    {/* Período trabalhado manhã */}
                    {pIn !== null && (pAl ?? pOut ?? pNow) !== null && (
                      <div className="absolute h-full bg-emerald-300 opacity-70 rounded"
                        style={{ left: `${pIn}%`, width: `${(pAl ?? pOut ?? pNow) - pIn}%` }} />
                    )}
                    {/* Almoço */}
                    {pAl !== null && pVol !== null && (
                      <div className="absolute h-full bg-amber-200 opacity-70"
                        style={{ left: `${pAl}%`, width: `${pVol - pAl}%` }} />
                    )}
                    {/* Período trabalhado tarde */}
                    {pVol !== null && (pOut ?? pNow) !== null && (
                      <div className="absolute h-full bg-emerald-300 opacity-70"
                        style={{ left: `${pVol}%`, width: `${(pOut ?? pNow) - pVol}%` }} />
                    )}
                    {/* Horário previsto */}
                    <div className="absolute left-0 top-0 h-full w-full border-2 border-slate-200 rounded-xl pointer-events-none" />
                    {/* Labels de hora */}
                    <div className="absolute bottom-1 left-1 text-[9px] text-slate-500 font-bold">{workStart}</div>
                    <div className="absolute bottom-1 right-1 text-[9px] text-slate-500 font-bold">{workEnd}</div>
                  </>
                )
              })()}
            </div>
            <div className="flex gap-3 mt-2">
              <div className="flex items-center gap-1"><div className="w-3 h-2 rounded bg-emerald-300 opacity-70" /><span className="text-[10px] text-slate-400">Trabalhado</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-2 rounded bg-amber-200 opacity-70" /><span className="text-[10px] text-slate-400">Almoço</span></div>
            </div>
          </div>

          {/* Cards de cada batida */}
          {/* Períodos normais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['entrada','saida_almoco','volta_almoco','saida'].map(type => {
              const rec = records.find(r => r.punch_type === type)
              const cfg = PUNCH_CFG[type]
              const Icon = cfg.Icon
              return (
                <div key={type} className={`rounded-2xl p-4 border ${rec ? `${cfg.bg} border-transparent` : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${rec ? 'bg-white/60' : 'bg-slate-200/60'}`}>
                      <Icon size={13} className={rec ? cfg.text : 'text-slate-400'} />
                    </div>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${rec ? cfg.text : 'text-slate-400'}`}>{cfg.label}</p>
                  </div>
                  {rec
                    ? <>
                        <p className={`text-2xl font-black font-mono ${cfg.text}`} style={{fontFamily:'Nunito,sans-serif'}}>
                          {fmtTime(rec.recorded_at)}
                        </p>
                        {type === 'saida' && rec.hours_worked && (
                          <p className={`text-[10px] font-semibold mt-1 ${cfg.text} opacity-70`}>
                            {fmtH(rec.hours_worked)} trabalhadas
                          </p>
                        )}
                      </>
                    : <p className="text-xl font-black text-slate-300" style={{fontFamily:'Nunito,sans-serif'}}>--:--</p>
                  }
                </div>
              )
            })}
          </div>
          {/* Períodos de hora extra */}
          {hasOvertime && entradasAll.slice(1).map((entOT, idx) => {
            const saidaOT = saidasAll[idx + 1]
            return (
              <div key={`ot-${idx}`} className="mt-3 p-3 rounded-2xl border border-violet-200 bg-violet-50">
                <p className="text-[10px] font-black text-violet-600 uppercase tracking-wide mb-2">
                  Hora Extra — Período {idx + 2}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl p-3 bg-emerald-50 border border-transparent">
                    <p className="text-[10px] font-bold text-emerald-600 mb-1">ENTRADA</p>
                    <p className="text-xl font-black text-emerald-700 font-mono">{fmtTime(entOT.recorded_at)}</p>
                  </div>
                  <div className={`rounded-xl p-3 border ${saidaOT ? 'bg-rose-50 border-transparent' : 'bg-slate-50 border-slate-100'}`}>
                    <p className={`text-[10px] font-bold mb-1 ${saidaOT ? 'text-rose-500' : 'text-slate-400'}`}>SAÍDA</p>
                    <p className={`text-xl font-black font-mono ${saidaOT ? 'text-rose-600' : 'text-slate-300'}`}>
                      {saidaOT ? fmtTime(saidaOT.recorded_at) : '--:--'}
                    </p>
                    {saidaOT?.hours_worked && (
                      <p className="text-[10px] text-rose-400 mt-0.5">{fmtH(saidaOT.hours_worked)} total</p>
                    )}
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

export function RHPontoPage({ embedded = false } = {}) {
  const [employees, setEmployees] = useState([])
  const [records,   setRecords]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selDate,   setSelDate]   = useState(new Date().toISOString().split('T')[0])
  const [selEmp,    setSelEmp]    = useState('')

  useEffect(() => { loadEmployees() }, [])
  useEffect(() => { loadRecords() }, [selDate, selEmp])

  async function loadEmployees() {
    const { data } = await supabase.from('system_users')
      .select('id,name,role,job_title,work_start,work_end,lunch_minutes')
      .eq('active', true).order('name')
    setEmployees(data ?? [])
  }

  async function loadRecords() {
    setLoading(true)
    let q = supabase.from('time_records').select('*').eq('date', selDate).order('recorded_at', { ascending: true })
    if (selEmp) q = q.eq('employee_id', selEmp)
    const { data } = await q
    setRecords(data ?? [])
    setLoading(false)
  }

  // Agrupa registros por funcionário
  const grouped = useMemo(() => {
    const empMap = {}
    employees.forEach(e => { empMap[e.id] = { employee: e, records: [] } })
    records.forEach(r => { if (empMap[r.employee_id]) empMap[r.employee_id].records.push(r) })

    if (selEmp) return Object.values(empMap).filter(g => g.employee.id === selEmp)
    // Ordena: quem tem registros primeiro
    return Object.values(empMap).sort((a, b) => b.records.length - a.records.length)
  }, [employees, records, selEmp])

  const hasAnyRecord = grouped.some(g => g.records.length > 0)

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {!embedded && (
        <PageHeader
          title="Registros de Ponto"
          subtitle="Controle de batidas de ponto da equipe"
          actions={
            <button onClick={loadRecords} className="btn-secondary flex items-center gap-1.5 text-xs">
              <RefreshCw size={13} /> Atualizar
            </button>
          }
        />
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <input type="date" className="input w-auto" value={selDate} onChange={e => setSelDate(e.target.value)} />
          <button onClick={() => setSelDate(new Date().toISOString().split('T')[0])}
            className="btn-secondary text-xs px-3 py-2">Hoje</button>
          <button onClick={() => {
            const d = new Date(selDate)
            d.setDate(d.getDate() - 1)
            setSelDate(d.toISOString().split('T')[0])
          }} className="btn-secondary text-xs px-3 py-2">← Anterior</button>
          <button onClick={() => {
            const d = new Date(selDate)
            d.setDate(d.getDate() + 1)
            setSelDate(d.toISOString().split('T')[0])
          }} className="btn-secondary text-xs px-3 py-2">Próximo →</button>
        </div>
        <select className="select w-auto min-w-[180px]" value={selEmp} onChange={e => setSelEmp(e.target.value)}>
          <option value="">Todos os funcionários</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {/* Data selecionada em destaque */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-1 h-10 bg-rose-400 rounded-full" />
        <div>
          <p className="text-lg font-black text-slate-800" style={{fontFamily:'Nunito,sans-serif'}}>
            {new Date(selDate+'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}
          </p>
          <p className="text-xs text-slate-400">
            {records.length} registro(s) · {grouped.filter(g => g.records.length > 0).length} funcionário(s) com ponto
          </p>
        </div>
      </div>

      {/* Cards */}
      {loading ? <LoadingCard /> : !hasAnyRecord && !selEmp ? (
        <EmptyState
          icon={Clock}
          title="Nenhum registro neste dia"
          description="Nenhum funcionário bateu ponto nesta data."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(({ employee, records: recs }) => (
            <EmployeeDayCard key={employee.id} employee={employee} records={recs} />
          ))}
        </div>
      )}
    </div>
  )
}
