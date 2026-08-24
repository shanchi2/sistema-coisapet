import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { ClipboardList, ChevronDown, ChevronRight, Search, Calendar, User, Package, RefreshCw } from 'lucide-react'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  const dt = new Date(y, m - 1, d)
  const dow = dt.toLocaleDateString('pt-BR', { weekday: 'long' })
  return `${dow.charAt(0).toUpperCase() + dow.slice(1)}, ${d} de ${MESES[m-1]} de ${y}`
}

export function ProductionEntriesPage() {
  const [entries,    setEntries]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [filterEmp,  setFilterEmp]  = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [openDays,   setOpenDays]   = useState(new Set())

  async function load() {
    setLoading(true)
    let q = supabase
      .from('production_entries')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (dateFrom) q = q.gte('date', dateFrom)
    if (dateTo)   q = q.lte('date', dateTo)

    const { data } = await q.limit(2000)
    setEntries(data || [])

    // Abre o dia mais recente por padrão
    if (data && data.length > 0) {
      setOpenDays(new Set([data[0].date]))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Lista de funcionários únicos para o filtro
  const employees = useMemo(() => {
    const map = new Map()
    entries.forEach(e => map.set(e.employee_id, e.employee_name))
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [entries])

  // Filtra por busca, funcionário
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterEmp && e.employee_id !== filterEmp) return false
      if (search) {
        const q = search.toLowerCase()
        if (!e.product_name.toLowerCase().includes(q) &&
            !e.employee_name.toLowerCase().includes(q) &&
            !(e.notes || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [entries, filterEmp, search])

  // Agrupa por data
  const grouped = useMemo(() => {
    const map = new Map()
    filtered.forEach(e => {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date).push(e)
    })
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  // Stats gerais
  const stats = useMemo(() => ({
    totalItens:  filtered.reduce((s, e) => s + e.quantity, 0),
    totalDias:   grouped.length,
    totalHorist: employees.length,
  }), [filtered, grouped, employees])

  function toggleDay(date) {
    setOpenDays(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }

  // Agrupa os entries de um dia por funcionário
  function groupByEmployee(dayEntries) {
    const map = new Map()
    dayEntries.forEach(e => {
      if (!map.has(e.employee_id)) {
        map.set(e.employee_id, { name: e.employee_name, items: [], total: 0 })
      }
      const emp = map.get(e.employee_id)
      emp.items.push(e)
      emp.total += e.quantity
    })
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
              <ClipboardList size={20} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Produção dos Horistas</h1>
              <p className="text-sm text-slate-500">Lançamentos diários por funcionário</p>
            </div>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <RefreshCw size={14} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Itens produzidos', value: stats.totalItens,  color: 'text-violet-600' },
            { label: 'Dias com registro', value: stats.totalDias,   color: 'text-slate-800'  },
            { label: 'Horistas ativos',   value: stats.totalHorist, color: 'text-emerald-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            {/* Busca */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar produto ou funcionário..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 transition-colors"
              />
            </div>

            {/* Filtro funcionário */}
            <select
              value={filterEmp}
              onChange={e => setFilterEmp(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
            >
              <option value="">Todos os horistas</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          {/* Filtro de data */}
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar size={14} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500">Período:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-400"
            />
            <span className="text-xs text-slate-400">até</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-400"
            />
            <button
              onClick={load}
              className="text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors px-2 py-1.5 rounded-lg hover:bg-violet-50"
            >
              Filtrar
            </button>
            {(dateFrom || dateTo || filterEmp || search) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setFilterEmp(''); setSearch(''); load() }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-50"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Lista agrupada por dia */}
        {loading ? (
          <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
            <RefreshCw size={24} className="animate-spin text-slate-400" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <ClipboardList size={36} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">Nenhum lançamento encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([date, dayEntries]) => {
              const isOpen    = openDays.has(date)
              const dayTotal  = dayEntries.reduce((s, e) => s + e.quantity, 0)
              const byEmployee = groupByEmployee(dayEntries)

              return (
                <div key={date} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  {/* Header do dia */}
                  <button
                    onClick={() => toggleDay(date)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                        <Calendar size={16} strokeWidth={1.5} className="text-violet-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-slate-800">{fmtDate(date)}</p>
                        <p className="text-xs text-slate-400">
                          {byEmployee.length} {byEmployee.length === 1 ? 'horista' : 'horistas'} · {dayTotal} itens produzidos
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-violet-600">{dayTotal} itens</span>
                      {isOpen
                        ? <ChevronDown size={16} className="text-slate-400" />
                        : <ChevronRight size={16} className="text-slate-400" />
                      }
                    </div>
                  </button>

                  {/* Conteúdo expandido — por funcionário */}
                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                      {byEmployee.map(emp => (
                        <div key={emp.name} className="px-5 py-4">
                          {/* Nome do funcionário */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                <User size={13} strokeWidth={1.5} className="text-emerald-600" />
                              </div>
                              <span className="text-sm font-semibold text-slate-700">{emp.name}</span>
                            </div>
                            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              {emp.total} itens
                            </span>
                          </div>

                          {/* Itens do funcionário */}
                          <div className="space-y-2 pl-9">
                            {emp.items.map(item => (
                              <div key={item.id} className="flex items-start gap-2">
                                <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                                  <Package size={11} strokeWidth={1.5} className="text-slate-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                                      ×{item.quantity}
                                    </span>
                                    <span className="text-sm text-slate-700">{item.product_name}</span>
                                  </div>
                                  {item.notes && (
                                    <p className="text-xs text-slate-400 mt-0.5">{item.notes}</p>
                                  )}
                                  <p className="text-[10px] text-slate-300 mt-0.5">
                                    {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
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
            })}
          </div>
        )}
      </div>
    </div>
  )
}
