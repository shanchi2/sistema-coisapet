import { useState, useMemo } from 'react'
import {
  BarChart2, TrendingDown, TrendingUp, Calendar,
  Download, Filter, ChevronDown, AlertTriangle,
  CheckCircle2, Clock, DollarSign,
} from 'lucide-react'
import { useBills }             from '../financial/hooks/useBills'
import { useExpenseCategories } from '../financial/hooks/useExpenseCategories'
import { useSuppliers }         from '../financial/hooks/useSuppliers'

// ─── Helpers ────────────────────────────────────────────────────
function fmtCurrency(v) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}
function monthLabel(yyyy_mm) {
  const [y, m] = yyyy_mm.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

// Períodos pré-definidos
function getPeriods() {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth()

  const fmt = d => d.toISOString().split('T')[0]

  return [
    {
      label: 'Este mês',
      start: fmt(new Date(year, month, 1)),
      end:   fmt(new Date(year, month + 1, 0)),
    },
    {
      label: 'Mês passado',
      start: fmt(new Date(year, month - 1, 1)),
      end:   fmt(new Date(year, month, 0)),
    },
    {
      label: 'Últimos 3 meses',
      start: fmt(new Date(year, month - 2, 1)),
      end:   fmt(new Date(year, month + 1, 0)),
    },
    {
      label: 'Últimos 6 meses',
      start: fmt(new Date(year, month - 5, 1)),
      end:   fmt(new Date(year, month + 1, 0)),
    },
    {
      label: 'Este ano',
      start: fmt(new Date(year, 0, 1)),
      end:   fmt(new Date(year, 11, 31)),
    },
    { label: 'Personalizado', start: '', end: '' },
  ]
}

// ─── Barra de progresso ──────────────────────────────────────────
function BarRow({ label, value, maxValue, color = '#F43F5E', pct, extra }) {
  const width = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">{label}</span>
        <div className="text-right">
          <span className="text-sm font-bold text-slate-800">{fmtCurrency(value)}</span>
          {pct !== undefined && <span className="text-xs text-slate-400 ml-1.5">{pct.toFixed(1)}%</span>}
          {extra && <span className="text-xs text-slate-400 ml-1.5">{extra}</span>}
        </div>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// ─── Card KPI ────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, bg, color }) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
        <Icon size={20} className={color} />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="font-display font-black text-xl text-slate-800 mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Seção com título colapsável ─────────────────────────────────
function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="font-display font-bold text-base text-slate-800"
            style={{ fontFamily: 'Nunito, sans-serif' }}>
          {title}
        </h3>
        <ChevronDown size={18} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-5">{children}</div>}
    </div>
  )
}

// ─── Exportação CSV ──────────────────────────────────────────────
function exportCSV(rows, filename) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';')),
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Página principal ─────────────────────────────────────────────
export function ReportsPage() {
  const { bills }      = useBills()
  const { categories } = useExpenseCategories()
  const { suppliers }  = useSuppliers()

  const PERIODS = getPeriods()
  const [periodIdx,    setPeriodIdx]    = useState(0)
  const [customStart,  setCustomStart]  = useState('')
  const [customEnd,    setCustomEnd]    = useState('')
  const [filterCat,    setFilterCat]    = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [activeTab,    setActiveTab]    = useState('overview')

  // Período ativo
  const period = PERIODS[periodIdx]
  const start  = period.label === 'Personalizado' ? customStart : period.start
  const end    = period.label === 'Personalizado' ? customEnd   : period.end

  // ── Contas filtradas pelo período e filtros adicionais ────────
  const filteredBills = useMemo(() => {
    return bills.filter(b => {
      if (start && b.due_date < start) return false
      if (end   && b.due_date > end)   return false
      if (filterCat    && b.category_id !== filterCat)   return false
      if (filterStatus && b.status      !== filterStatus) return false
      return true
    })
  }, [bills, start, end, filterCat, filterStatus])

  // ── Pagamentos filtrados pelo período (data de pagamento) ─────
  const filteredPayments = useMemo(() => {
    return bills.flatMap(b =>
      (b.payments ?? [])
        .filter(p => {
          if (start && p.paid_at < start) return false
          if (end   && p.paid_at > end)   return false
          return true
        })
        .map(p => ({ ...p, bill: b }))
    )
  }, [bills, start, end])

  // ── KPIs do período ──────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalPaid    = filteredPayments.reduce((acc, p) => acc + Number(p.amount), 0)
    const totalPending = filteredBills
      .filter(b => ['aberto','parcial','vencido'].includes(b.status))
      .reduce((acc, b) => acc + b.remaining, 0)
    const totalOverdue = filteredBills
      .filter(b => b.status === 'vencido')
      .reduce((acc, b) => acc + b.remaining, 0)
    const countOpen    = filteredBills.filter(b => b.status === 'aberto').length
    const countOverdue = filteredBills.filter(b => b.status === 'vencido').length
    const countPaid    = filteredBills.filter(b => b.status === 'pago').length
    return { totalPaid, totalPending, totalOverdue, countOpen, countOverdue, countPaid }
  }, [filteredBills, filteredPayments])

  // ── Despesas por categoria ────────────────────────────────────
  const byCategory = useMemo(() => {
    const map = {}
    filteredPayments.forEach(p => {
      const key   = p.bill.category?.name ?? 'Sem categoria'
      const color = p.bill.category?.color ?? '#94A3B8'
      if (!map[key]) map[key] = { value: 0, color, count: 0 }
      map[key].value += Number(p.amount)
      map[key].count++
    })
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.value - a.value)
  }, [filteredPayments])

  const totalByCategory = byCategory.reduce((acc, c) => acc + c.value, 0)

  // ── Despesas por fornecedor ───────────────────────────────────
  const bySupplier = useMemo(() => {
    const map = {}
    filteredPayments.forEach(p => {
      const key = p.bill.supplier?.name ?? 'Sem fornecedor'
      map[key] = (map[key] ?? 0) + Number(p.amount)
    })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [filteredPayments])

  const maxSupplier = bySupplier[0]?.value ?? 0

  // ── Fluxo mensal ─────────────────────────────────────────────
  const byMonth = useMemo(() => {
    const map = {}
    filteredPayments.forEach(p => {
      const key = p.paid_at?.slice(0, 7)
      if (!key) return
      map[key] = (map[key] ?? 0) + Number(p.amount)
    })
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, value]) => ({ month, value }))
  }, [filteredPayments])

  const maxMonth = Math.max(...byMonth.map(m => m.value), 1)

  // ── Contas a vencer (próximos 30 dias) ───────────────────────
  const upcoming = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const d30   = new Date(); d30.setDate(d30.getDate() + 30)
    const d30s  = d30.toISOString().split('T')[0]
    return bills
      .filter(b => ['aberto','parcial','vencido'].includes(b.status))
      .filter(b => b.due_date <= d30s)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
  }, [bills])

  const upcomingTotal = upcoming.reduce((acc, b) => acc + b.remaining, 0)

  // ── Por Empresa (fornecedor) — status breakdown ─────────────────
  const bySupplierFull = useMemo(() => {
    const map = {}
    filteredBills.forEach(b => {
      const key = b.supplier?.name ?? 'Sem fornecedor'
      if (!map[key]) map[key] = { name: key, pago: 0, vencido: 0, aberto: 0, parcial: 0, total: 0, count: 0 }
      const val = Number(b.amount)
      map[key].total += val
      map[key].count++
      if (b.status === 'pago')        map[key].pago    += val
      else if (b.status === 'vencido') map[key].vencido += Number(b.remaining ?? val)
      else if (b.status === 'parcial') map[key].parcial += Number(b.remaining ?? val)
      else                             map[key].aberto  += val
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [filteredBills])

  // ── Por Tipo/Categoria — status breakdown ─────────────────────
  const byCategoryFull = useMemo(() => {
    const map = {}
    filteredBills.forEach(b => {
      const key   = b.category?.name ?? 'Sem categoria'
      const color = b.category?.color ?? '#94A3B8'
      if (!map[key]) map[key] = { name: key, color, pago: 0, vencido: 0, aberto: 0, parcial: 0, total: 0, count: 0 }
      const val = Number(b.amount)
      map[key].total += val
      map[key].count++
      if (b.status === 'pago')         map[key].pago    += val
      else if (b.status === 'vencido') map[key].vencido += Number(b.remaining ?? val)
      else if (b.status === 'parcial') map[key].parcial += Number(b.remaining ?? val)
      else                             map[key].aberto  += val
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [filteredBills])

  // ── Extrato de pagamentos (para exportação) ───────────────────
  function handleExportPayments() {
    const rows = filteredPayments.map(p => ({
      'Data Pagamento': fmtDate(p.paid_at),
      'Descrição':      p.bill.description,
      'Fornecedor':     p.bill.supplier?.name ?? '',
      'Categoria':      p.bill.category?.name ?? '',
      'Valor Pago (R$)': Number(p.amount).toFixed(2).replace('.', ','),
      'Observação':     p.notes ?? '',
    }))
    exportCSV(rows, `coisapet-pagamentos-${start ?? 'todos'}.csv`)
  }

  function handleExportBills() {
    const rows = filteredBills.map(b => ({
      'Descrição':       b.description,
      'Fornecedor':      b.supplier?.name ?? '',
      'Categoria':       b.category?.name ?? '',
      'Vencimento':      fmtDate(b.due_date),
      'Valor Total (R$)': Number(b.amount).toFixed(2).replace('.', ','),
      'Total Pago (R$)': Number(b.totalPaid ?? 0).toFixed(2).replace('.', ','),
      'Restante (R$)':   Number(b.remaining ?? b.amount).toFixed(2).replace('.', ','),
      'Status':          b.status,
    }))
    exportCSV(rows, `coisapet-contas-${start ?? 'todos'}.csv`)
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Relatórios Financeiros</h2>
          <p className="page-subtitle">Análise de despesas, pagamentos e previsões</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportPayments} className="btn-secondary">
            <Download size={16} /> Exportar pagamentos
          </button>
          <button onClick={handleExportBills} className="btn-secondary">
            <Download size={16} /> Exportar contas
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        {[
          { id: 'overview', label: '📊 Visão geral' },
          { id: 'empresa',  label: '🏢 Por empresa' },
          { id: 'tipo',     label: '🏷️ Por tipo' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === t.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ABA: VISÃO GERAL */}
      {activeTab === 'overview' && (
        <>
          {/* Filtros de período */}
          <div className="card p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="form-label">Período</label>
              <div className="flex flex-wrap gap-2">
                {PERIODS.map((p, i) => (
                  <button
                    key={p.label}
                    onClick={() => setPeriodIdx(i)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      periodIdx === i
                        ? 'bg-rose-400 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Datas personalizadas */}
            {period.label === 'Personalizado' && (
              <div className="flex items-center gap-2">
                <div>
                  <label className="form-label">De</label>
                  <input type="date" className="input w-auto" value={customStart}
                    onChange={e => setCustomStart(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Até</label>
                  <input type="date" className="input w-auto" value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)} />
                </div>
              </div>
            )}

            {/* Filtros adicionais */}
            <div className="flex gap-2 ml-auto">
              <div>
                <label className="form-label">Categoria</label>
                <select className="select w-auto" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                  <option value="">Todas</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select className="select w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="aberto">Em aberto</option>
                  <option value="parcial">Pago parcial</option>
                  <option value="vencido">Vencido</option>
                  <option value="pago">Pago</option>
                </select>
              </div>
            </div>
          </div>

          {/* KPIs do período */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={TrendingDown} label="Pago no período"   value={fmtCurrency(kpis.totalPaid)}    bg="bg-emerald-50" color="text-emerald-500"
              sub={`${filteredPayments.length} pagamento(s)`} />
            <KpiCard icon={TrendingUp}   label="Pendente"          value={fmtCurrency(kpis.totalPending)} bg="bg-sky-50"     color="text-sky-500"
              sub={`${kpis.countOpen} em aberto`} />
            <KpiCard icon={AlertTriangle} label="Em atraso"         value={fmtCurrency(kpis.totalOverdue)} bg="bg-rose-50"    color="text-rose-400"
              sub={`${kpis.countOverdue} conta(s)`} />
            <KpiCard icon={CheckCircle2}  label="Contas quitadas"   value={kpis.countPaid}                 bg="bg-amber-50"   color="text-amber-500"
              sub={`no período selecionado`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Despesas por categoria */}
            <Section title="Despesas por tipo de despesa">
              {byCategory.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Nenhum pagamento no período.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {byCategory.map(cat => (
                    <BarRow
                      key={cat.name}
                      label={
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          {cat.name}
                        </span>
                      }
                      value={cat.value}
                      maxValue={totalByCategory}
                      color={cat.color}
                      pct={totalByCategory > 0 ? (cat.value / totalByCategory) * 100 : 0}
                      extra={`${cat.count} pgto(s)`}
                    />
                  ))}
                  <div className="pt-2 border-t border-slate-100 flex justify-between text-sm font-semibold text-slate-700">
                    <span>Total</span>
                    <span>{fmtCurrency(totalByCategory)}</span>
                  </div>
                </div>
              )}
            </Section>

            {/* Despesas por fornecedor */}
            <Section title="Maiores fornecedores">
              {bySupplier.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Nenhum pagamento no período.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {bySupplier.map((s, i) => (
                    <BarRow
                      key={s.name}
                      label={
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-400 w-4">{i + 1}.</span>
                          {s.name}
                        </span>
                      }
                      value={s.value}
                      maxValue={maxSupplier}
                      color="#0EA5E9"
                      pct={kpis.totalPaid > 0 ? (s.value / kpis.totalPaid) * 100 : 0}
                    />
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* Evolução mensal */}
          <Section title="Pagamentos por mês">
            {byMonth.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Nenhum pagamento no período.</p>
            ) : (
              <div className="flex items-end gap-3 overflow-x-auto pb-2">
                {byMonth.map(({ month, value }) => {
                  const heightPct = maxMonth > 0 ? (value / maxMonth) * 100 : 0
                  return (
                    <div key={month} className="flex flex-col items-center gap-2 min-w-[80px]">
                      <p className="text-xs font-bold text-slate-600">{fmtCurrency(value)}</p>
                      <div className="w-full bg-slate-100 rounded-xl relative overflow-hidden" style={{ height: '120px' }}>
                        <div
                          className="absolute bottom-0 w-full rounded-xl bg-rose-400 transition-all duration-500"
                          style={{ height: `${Math.max(heightPct, 4)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 text-center capitalize leading-tight">
                        {monthLabel(month)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Previsão de pagamentos — próximos 30 dias */}
          <Section title={`Contas a vencer — próximos 30 dias (${fmtCurrency(upcomingTotal)})`}>
            {upcoming.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-emerald-600 font-semibold text-sm">
                  Nenhuma conta vencendo nos próximos 30 dias ✓
                </p>
              </div>
            ) : (
              <div className="table-wrapper" style={{ boxShadow: 'none', border: '1px solid #F1F5F9' }}>
                <table className="table" style={{ minWidth: '500px' }}>
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Fornecedor</th>
                      <th>Vencimento</th>
                      <th>Restante</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map(b => {
                      const days = Math.ceil((new Date(b.due_date + 'T12:00:00') - new Date()) / 86400000)
                      const isUrgent = days <= 7
                      return (
                        <tr key={b.id}>
                          <td>
                            <p className="font-semibold text-slate-800 text-sm">{b.description}</p>
                          </td>
                          <td className="text-slate-500 text-sm">{b.supplier?.name ?? '—'}</td>
                          <td>
                            <p className={`text-sm font-semibold ${isUrgent ? 'text-rose-500' : 'text-amber-600'}`}>
                              {fmtDate(b.due_date)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {days < 0 ? `${Math.abs(days)}d em atraso` : days === 0 ? 'Hoje!' : `em ${days}d`}
                            </p>
                          </td>
                          <td className={`font-semibold ${isUrgent ? 'text-rose-500' : 'text-slate-700'}`}>
                            {fmtCurrency(b.remaining)}
                          </td>
                          <td>
                            <span className={b.status === 'vencido' ? 'badge-danger' : b.status === 'parcial' ? 'badge-warn' : 'badge-info'}>
                              {b.status === 'vencido' ? 'Vencido' : b.status === 'parcial' ? 'Parcial' : 'Em aberto'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Extrato completo do período */}
          <Section title="Extrato de pagamentos do período" defaultOpen={false}>
            {filteredPayments.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Nenhum pagamento no período selecionado.</p>
            ) : (
              <>
                <div className="flex justify-end mb-3">
                  <button onClick={handleExportPayments} className="btn-secondary text-xs py-1.5">
                    <Download size={14} /> Baixar CSV
                  </button>
                </div>
                <div className="table-wrapper" style={{ boxShadow: 'none', border: '1px solid #F1F5F9' }}>
                  <table className="table" style={{ minWidth: '600px' }}>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Fornecedor</th>
                        <th>Categoria</th>
                        <th>Valor pago</th>
                        <th>Observação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments
                        .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
                        .map(p => (
                          <tr key={p.id}>
                            <td className="text-slate-500 text-sm whitespace-nowrap">{fmtDate(p.paid_at)}</td>
                            <td>
                              <p className="font-semibold text-slate-800 text-sm">{p.bill.description}</p>
                            </td>
                            <td className="text-slate-500 text-sm">{p.bill.supplier?.name ?? '—'}</td>
                            <td>
                              {p.bill.category ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.bill.category.color }} />
                                  <span className="text-slate-600 text-sm">{p.bill.category.name}</span>
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="font-semibold text-emerald-600">{fmtCurrency(p.amount)}</td>
                            <td className="text-slate-400 text-sm">{p.notes ?? '—'}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-sm font-bold text-slate-600 text-right border-t border-slate-100">
                          Total do período
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-600 border-t border-slate-100">
                          {fmtCurrency(filteredPayments.reduce((acc, p) => acc + Number(p.amount), 0))}
                        </td>
                        <td className="border-t border-slate-100" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </Section>
        </>
      )}

      {/* ABA: POR EMPRESA */}
      {activeTab === 'empresa' && (
        <div className="flex flex-col gap-5">
          {/* Resumo rápido */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Empresas', value: bySupplierFull.length, color: 'text-slate-700', bg: 'bg-slate-50' },
              { label: 'Total comprometido', value: fmtCurrency(bySupplierFull.reduce((a,s)=>a+s.total,0)), color: 'text-slate-700', bg: 'bg-slate-50' },
              { label: 'Total em atraso', value: fmtCurrency(bySupplierFull.reduce((a,s)=>a+s.vencido,0)), color: 'text-rose-600', bg: 'bg-rose-50' },
            ].map(k => (
              <div key={k.label} className={`${k.bg} rounded-2xl p-4 border border-slate-100`}>
                <p className="text-xs text-slate-400 mb-1">{k.label}</p>
                <p className={`text-lg font-black ${k.color}`} style={{fontFamily:'Nunito,sans-serif'}}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Tabela por empresa */}
          <div>
            <p className="text-sm font-bold text-slate-700 mb-3">Breakdown por empresa</p>
            <div className="table-wrapper" style={{boxShadow:'none',border:'1px solid #F1F5F9'}}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Pago</th>
                    <th className="text-right">A vencer</th>
                    <th className="text-right text-amber-500">Parcial</th>
                    <th className="text-right text-rose-500">Vencido</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {bySupplierFull.map(s => {
                    const pctPago = s.total > 0 ? (s.pago / s.total) * 100 : 0
                    return (
                      <tr key={s.name}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-[10px] font-black text-slate-500">
                              {s.name.slice(0,2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
                              <p className="text-[10px] text-slate-400">{s.count} {s.count===1?'conta':'contas'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-right font-bold text-slate-700">{fmtCurrency(s.total)}</td>
                        <td className="text-right font-semibold text-emerald-600">{s.pago > 0 ? fmtCurrency(s.pago) : <span className="text-slate-300">—</span>}</td>
                        <td className="text-right text-slate-500">{s.aberto > 0 ? fmtCurrency(s.aberto) : <span className="text-slate-300">—</span>}</td>
                        <td className="text-right text-amber-500">{s.parcial > 0 ? fmtCurrency(s.parcial) : <span className="text-slate-300">—</span>}</td>
                        <td className="text-right text-rose-500 font-semibold">{s.vencido > 0 ? fmtCurrency(s.vencido) : <span className="text-slate-300">—</span>}</td>
                        <td>
                          <div className="w-full min-w-[80px]">
                            <div className="flex items-center gap-1 mb-1">
                              <span className="text-[10px] text-slate-400">{pctPago.toFixed(0)}% pago</span>
                              {s.vencido > 0 && <span className="text-[10px] font-bold text-rose-500">⚠ atrasado</span>}
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-400 transition-all" style={{width:`${Math.min(pctPago,100)}%`}}/>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td>Total geral</td>
                    <td className="text-right">{fmtCurrency(bySupplierFull.reduce((a,s)=>a+s.total,0))}</td>
                    <td className="text-right text-emerald-600">{fmtCurrency(bySupplierFull.reduce((a,s)=>a+s.pago,0))}</td>
                    <td className="text-right">{fmtCurrency(bySupplierFull.reduce((a,s)=>a+s.aberto,0))}</td>
                    <td className="text-right text-amber-500">{fmtCurrency(bySupplierFull.reduce((a,s)=>a+s.parcial,0))}</td>
                    <td className="text-right text-rose-500">{fmtCurrency(bySupplierFull.reduce((a,s)=>a+s.vencido,0))}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA: POR TIPO */}
      {activeTab === 'tipo' && (
        <div className="flex flex-col gap-5">
          {/* Resumo rápido */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Categorias', value: byCategoryFull.length, color: 'text-slate-700', bg: 'bg-slate-50' },
              { label: 'Total comprometido', value: fmtCurrency(byCategoryFull.reduce((a,s)=>a+s.total,0)), color: 'text-slate-700', bg: 'bg-slate-50' },
              { label: 'Total em atraso', value: fmtCurrency(byCategoryFull.reduce((a,s)=>a+s.vencido,0)), color: 'text-rose-600', bg: 'bg-rose-50' },
            ].map(k => (
              <div key={k.label} className={`${k.bg} rounded-2xl p-4 border border-slate-100`}>
                <p className="text-xs text-slate-400 mb-1">{k.label}</p>
                <p className={`text-lg font-black ${k.color}`} style={{fontFamily:'Nunito,sans-serif'}}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Gráfico de barras por tipo */}
          <div className="card">
            <p className="text-sm font-bold text-slate-700 mb-4">Distribuição por categoria</p>
            <div className="flex flex-col gap-4">
              {byCategoryFull.map(cat => {
                const total = byCategoryFull.reduce((a,c)=>a+c.total,0)
                return (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:cat.color}}/>
                        <span className="text-sm font-semibold text-slate-700">{cat.name}</span>
                        <span className="text-xs text-slate-400">{cat.count} {cat.count===1?'conta':'contas'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {cat.vencido>0 && <span className="text-xs font-bold text-rose-500">⚠ {fmtCurrency(cat.vencido)} atrasado</span>}
                        <span className="text-sm font-bold text-slate-700">{fmtCurrency(cat.total)}</span>
                        <span className="text-xs text-slate-400 w-10 text-right">{total>0?((cat.total/total)*100).toFixed(1):0}%</span>
                      </div>
                    </div>
                    {/* Barra empilhada pago/pendente/vencido */}
                    <div className="h-5 bg-slate-100 rounded-full overflow-hidden flex">
                      {cat.pago    > 0 && <div className="h-full bg-emerald-400 transition-all" style={{width:`${(cat.pago/cat.total)*100}%`}} title={`Pago: ${fmtCurrency(cat.pago)}`}/>}
                      {cat.parcial > 0 && <div className="h-full bg-amber-300 transition-all"  style={{width:`${(cat.parcial/cat.total)*100}%`}} title={`Parcial: ${fmtCurrency(cat.parcial)}`}/>}
                      {cat.aberto  > 0 && <div className="h-full bg-sky-300 transition-all"    style={{width:`${(cat.aberto/cat.total)*100}%`}} title={`A vencer: ${fmtCurrency(cat.aberto)}`}/>}
                      {cat.vencido > 0 && <div className="h-full bg-rose-400 transition-all"   style={{width:`${(cat.vencido/cat.total)*100}%`}} title={`Vencido: ${fmtCurrency(cat.vencido)}`}/>}
                    </div>
                    <div className="flex gap-3 mt-1.5 flex-wrap">
                      {cat.pago    > 0 && <span className="text-[10px] font-semibold text-emerald-600">● {fmtCurrency(cat.pago)} pago</span>}
                      {cat.aberto  > 0 && <span className="text-[10px] font-semibold text-sky-500">● {fmtCurrency(cat.aberto)} a vencer</span>}
                      {cat.parcial > 0 && <span className="text-[10px] font-semibold text-amber-500">● {fmtCurrency(cat.parcial)} parcial</span>}
                      {cat.vencido > 0 && <span className="text-[10px] font-semibold text-rose-500">● {fmtCurrency(cat.vencido)} vencido</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tabela detalhada por tipo */}
          <div>
            <p className="text-sm font-bold text-slate-700 mb-3">Tabela detalhada</p>
            <div className="table-wrapper" style={{boxShadow:'none',border:'1px solid #F1F5F9'}}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo / Categoria</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Pago</th>
                    <th className="text-right">A vencer</th>
                    <th className="text-right text-amber-500">Parcial</th>
                    <th className="text-right text-rose-500">Vencido</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategoryFull.map(cat => (
                    <tr key={cat.name}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{backgroundColor:cat.color}}/>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{cat.name}</p>
                            <p className="text-[10px] text-slate-400">{cat.count} {cat.count===1?'conta':'contas'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-right font-bold text-slate-700">{fmtCurrency(cat.total)}</td>
                      <td className="text-right font-semibold text-emerald-600">{cat.pago>0?fmtCurrency(cat.pago):<span className="text-slate-300">—</span>}</td>
                      <td className="text-right text-slate-500">{cat.aberto>0?fmtCurrency(cat.aberto):<span className="text-slate-300">—</span>}</td>
                      <td className="text-right text-amber-500">{cat.parcial>0?fmtCurrency(cat.parcial):<span className="text-slate-300">—</span>}</td>
                      <td className="text-right text-rose-500 font-semibold">{cat.vencido>0?fmtCurrency(cat.vencido):<span className="text-slate-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td>Total geral</td>
                    <td className="text-right">{fmtCurrency(byCategoryFull.reduce((a,c)=>a+c.total,0))}</td>
                    <td className="text-right text-emerald-600">{fmtCurrency(byCategoryFull.reduce((a,c)=>a+c.pago,0))}</td>
                    <td className="text-right">{fmtCurrency(byCategoryFull.reduce((a,c)=>a+c.aberto,0))}</td>
                    <td className="text-right text-amber-500">{fmtCurrency(byCategoryFull.reduce((a,c)=>a+c.parcial,0))}</td>
                    <td className="text-right text-rose-500">{fmtCurrency(byCategoryFull.reduce((a,c)=>a+c.vencido,0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}