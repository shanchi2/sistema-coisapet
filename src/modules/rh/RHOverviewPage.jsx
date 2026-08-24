import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Clock, Calendar, FileText, AlertTriangle, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtTime, fmtDate, Avatar, Badge, PageHeader, LoadingCard } from './rhHelpers'

function KpiCard({ icon: Icon, label, value, sub, color, onClick }) {
  const colors = {
    rose:    'bg-rose-50 text-rose-500',
    emerald: 'bg-emerald-50 text-emerald-500',
    amber:   'bg-amber-50 text-amber-500',
    sky:     'bg-sky-50 text-sky-500',
  }
  return (
    <div onClick={onClick} className={`card flex items-center gap-4 py-5 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${colors[color]||colors.rose}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-xs text-slate-400 font-semibold">{label}</p>
        <p className="text-3xl font-black text-slate-800" style={{ fontFamily:'Nunito,sans-serif', lineHeight:1.1 }}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export function RHOverviewPage() {
  const navigate = useNavigate()
  const [employees, setEmployees] = useState([])
  const [presence,  setPresence]  = useState([])
  const [vacPending,setVacPending]= useState(0)
  const [certs30,   setCerts30]   = useState(0)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [empR, recR, vacR, cerR] = await Promise.all([
      supabase.from('system_users').select('id,name,role,job_title,active').eq('active',true).order('name'),
      supabase.from('time_records').select('employee_id,punch_type,recorded_at').eq('date',today).order('recorded_at',{ascending:true}),
      supabase.from('vacation_requests').select('id',{count:'exact'}).eq('status','pendente'),
      supabase.from('medical_certificates').select('id',{count:'exact'}).gte('created_at', new Date(Date.now()-30*86400000).toISOString()),
    ])

    const emps = empR.data ?? []
    const recs  = recR.data ?? []

    // Calcula status de cada funcionário hoje
    const statusMap = {}
    recs.forEach(r => { statusMap[r.employee_id] = r })

    const presenceData = emps.map(e => ({
      ...e,
      lastPunch: statusMap[e.id] || null,
    }))

    setEmployees(emps)
    setPresence(presenceData)
    setVacPending(vacR.count ?? 0)
    setCerts30(cerR.count ?? 0)
    setLoading(false)
  }

  const PUNCH_STATUS = {
    entrada:      { label: 'No trabalho',   dot: 'bg-emerald-400', cls: 'bg-emerald-50 text-emerald-700' },
    saida_almoco: { label: 'Almoço',        dot: 'bg-amber-400',   cls: 'bg-amber-50 text-amber-700'    },
    volta_almoco: { label: 'No trabalho',   dot: 'bg-emerald-400', cls: 'bg-emerald-50 text-emerald-700' },
    saida:        { label: 'Saiu',          dot: 'bg-slate-300',   cls: 'bg-slate-100 text-slate-500'   },
  }

  const presentNow = presence.filter(e => e.lastPunch && ['entrada','volta_almoco'].includes(e.lastPunch.punch_type)).length

  if (loading) return <LoadingCard />

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <PageHeader title="Recursos Humanos" subtitle="Visão geral da equipe hoje" />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Users}    label="Funcionários" value={employees.length} color="rose" />
        <KpiCard icon={Clock}    label="Presentes agora" value={presentNow}   color="emerald" />
        <KpiCard icon={Calendar} label="Férias pendentes" value={vacPending}  color="amber"
          onClick={() => navigate('/rh/ferias')} />
        <KpiCard icon={FileText} label="Atestados (30d)" value={certs30}     color="sky" />
      </div>

      {/* Alerta férias pendentes */}
      {vacPending > 0 && (
        <div className="card border-l-4 border-amber-400 bg-amber-50/40 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0" />
            <p className="text-sm font-semibold text-amber-800">
              {vacPending} solicitação(ões) de férias aguardando sua aprovação
            </p>
          </div>
          <button onClick={() => navigate('/rh/ferias')}
            className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-xl transition-colors shrink-0">
            Revisar →
          </button>
        </div>
      )}

      {/* Presença hoje */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-slate-800">Situação atual da equipe</h3>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">
              {new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}
            </p>
          </div>
          <button onClick={() => navigate('/rh/ponto')}
            className="text-xs font-semibold text-rose-500 hover:text-rose-600">
            Ver registros →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {presence.map(e => {
            const ps = e.lastPunch ? PUNCH_STATUS[e.lastPunch.punch_type] : null
            return (
              <div key={e.id} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-colors">
                <div className="relative">
                  <Avatar name={e.name} />
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${ps ? ps.dot : 'bg-slate-200'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{e.name}</p>
                  <p className="text-xs text-slate-400 truncate">{e.job_title || e.role}</p>
                </div>
                <div className="shrink-0 text-right">
                  {ps
                    ? <>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ps.cls}`}>{ps.label}</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">{fmtTime(e.lastPunch.recorded_at)}</p>
                      </>
                    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Ausente</span>
                  }
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
