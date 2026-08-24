import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Plus, Search, Tag, Pencil, Trash2, DollarSign,
  AlertTriangle, Clock, CheckCircle2, Building2,
  Paperclip, BarChart2, FileText, ChevronLeft, ChevronRight,
  ArrowUpDown, Layers, ChevronDown, Calendar, Bell, RotateCcw,
  SlidersHorizontal, X, CreditCard, ChevronUp,
} from 'lucide-react'
import { useBills }              from './hooks/useBills'
import { useSuppliers }          from './hooks/useSuppliers'
import { useExpenseCategories }  from './hooks/useExpenseCategories'
import { BillFormModal }         from './components/BillFormModal'
import { PaymentModal }          from './components/PaymentModal'
import { SupplierFormModal }     from './components/SupplierFormModal'
import { ExpenseCategoriesModal} from './components/ExpenseCategoriesModal'
import { ConfirmDialog }         from '../../components/ui/ConfirmDialog'
import { EmptyState }            from '../../components/ui/EmptyState'

const PAGE_SIZE = 20

// ── Hook: detecta mobile ──────────────────────────────────────────
function useMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

// ── Filtros de período ────────────────────────────────────────────
function getPeriodRange(period) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const fmt = d => d.toISOString().split('T')[0]
  if (period === 'semana') {
    const sun = new Date(today); sun.setDate(today.getDate() - today.getDay())
    const sat = new Date(sun);   sat.setDate(sun.getDate() + 6)
    return { start: fmt(sun), end: fmt(sat) }
  }
  if (period === '15dias') {
    const end = new Date(today); end.setDate(today.getDate() + 14)
    return { start: fmt(today), end: fmt(end) }
  }
  if (period === 'mes') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end   = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { start: fmt(start), end: fmt(end) }
  }
  if (period === 'mes_passado') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end   = new Date(today.getFullYear(), today.getMonth(), 0)
    return { start: fmt(start), end: fmt(end) }
  }
  return null
}

const PERIOD_BUTTONS = [
  { value: 'todos',       label: 'Todos'         },
  { value: 'semana',      label: 'Esta semana'   },
  { value: '15dias',      label: 'Próx. 15 dias' },
  { value: 'mes',         label: 'Este mês'      },
  { value: 'mes_passado', label: 'Mês passado'   },
]

function fmtDayOfWeek(dateStr) {
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  return days[new Date(dateStr + 'T12:00:00').getDay()]
}
function fmtCurrency(v) { return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(d) { if (!d) return '—'; return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') }
function daysUntil(dateStr) {
  const t = new Date(); t.setHours(0,0,0,0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d - t) / 86400000)
}

const SORT_OPTIONS = [
  { value: 'status_due_desc', label: 'Status + Vencimento' },
  { value: 'due_asc',         label: 'Vencimento ↑'        },
  { value: 'due_desc',        label: 'Vencimento ↓'        },
  { value: 'amount_desc',     label: 'Maior valor'         },
  { value: 'amount_asc',      label: 'Menor valor'         },
  { value: 'supplier_asc',    label: 'Fornecedor A→Z'      },
]

function sortBills(bills, sortBy) {
  const s = [...bills]
  switch (sortBy) {
    case 'due_asc':         return s.sort((a, b) => a.due_date.localeCompare(b.due_date))
    case 'due_desc':        return s.sort((a, b) => b.due_date.localeCompare(a.due_date))
    case 'amount_desc':     return s.sort((a, b) => Number(b.amount) - Number(a.amount))
    case 'amount_asc':      return s.sort((a, b) => Number(a.amount) - Number(b.amount))
    case 'supplier_asc':    return s.sort((a, b) => (a.supplier?.name ?? '').localeCompare(b.supplier?.name ?? ''))
    case 'description_asc': return s.sort((a, b) => a.description.localeCompare(b.description))
    default:
      return s.sort((a, b) => {
        const order = { vencido: 0, aberto: 1, parcial: 2, pago: 3, cancelado: 4 }
        const sa = order[a.status] ?? 5, sb = order[b.status] ?? 5
        if (sa !== sb) return sa - sb
        return b.due_date.localeCompare(a.due_date)
      })
  }
}

// ── Status badge ──────────────────────────────────────────────────
const STATUS_MAP = {
  aberto:    { cls: 'badge-info',    label: 'Em aberto'    },
  parcial:   { cls: 'badge-warn',    label: 'Parcial'      },
  pago:      { cls: 'badge-ok',      label: 'Pago'         },
  vencido:   { cls: 'badge-danger',  label: 'Vencido'      },
  cancelado: { cls: 'badge-neutral', label: 'Cancelado'    },
}
function StatusBadge({ status }) {
  const { cls, label } = STATUS_MAP[status] ?? { cls: 'badge-neutral', label: status }
  return <span className={cls}>{label}</span>
}

// ── KPI Card ──────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, bg, color, sub }) {
  return (
    <div className="card flex items-start gap-3 py-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
        <Icon size={20} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
        <p className="font-black text-lg text-slate-800 mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Paginação ─────────────────────────────────────────────────────
function Pagination({ page, totalPages, total, pageSize, onPage }) {
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const end   = Math.min(page * pageSize, total)
  function getPages() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, '...', totalPages]
    if (page >= totalPages - 3) return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '...', page - 1, page, page + 1, '...', totalPages]
  }
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
      <p className="text-xs text-slate-400">
        {start}–{end} de <span className="font-semibold text-slate-600">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <ChevronLeft size={16} />
        </button>
        {getPages().map((p, i) => p === '...'
          ? <span key={`e-${i}`} className="px-1 text-slate-300 text-sm">•••</span>
          : <button key={p} onClick={() => onPage(p)}
              className={`w-8 h-8 rounded-lg text-sm font-semibold transition-all ${p === page ? 'bg-rose-400 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              {p}
            </button>
        )}
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MOBILE: Card de conta
// ════════════════════════════════════════════════════════════════
function BillCard({ bill, onPay, onEdit, onCancel, onDelete, onReactivate, onViewAtt }) {
  const [expanded, setExpanded] = useState(false)
  const days     = daysUntil(bill.due_date)
  const isUrgent = bill.status === 'aberto' && days >= 0 && days <= 7
  const isOver   = bill.status === 'vencido'

  const borderColor = isOver ? '#f43f5e' : isUrgent ? '#f59e0b' : bill.status === 'pago' ? '#10b981' : '#e2e8f0'
  const catColor    = bill.category?.color

  return (
    <div className="rounded-2xl border bg-white overflow-hidden shadow-sm"
      style={{ borderColor, borderLeftWidth: 3 }}>
      {/* Header do card */}
      <div className="px-4 pt-3 pb-2" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 text-sm leading-tight truncate">{bill.description}</p>
            {bill.supplier?.name && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">{bill.supplier.name}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <p className="font-black text-base text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {fmtCurrency(bill.amount)}
            </p>
            <StatusBadge status={bill.status} />
          </div>
        </div>

        {/* Vencimento + categoria */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg ${
            isOver ? 'bg-rose-50 text-rose-500' : isUrgent ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
          }`}>
            <Calendar size={10}/>
            {fmtDayOfWeek(bill.due_date)}, {fmtDate(bill.due_date)}
            {isUrgent && (days===0?' · Hoje!':days===1?' · Amanhã':` · ${days}d`)}
            {isOver && days < 0 && ` · ${Math.abs(days)}d atraso`}
          </span>
          {catColor && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: catColor }}/>
              {bill.category.name}
            </span>
          )}
          {bill.recurrent && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">Recorrente</span>
          )}
        </div>

        {/* Pago parcial */}
        {bill.totalPaid > 0 && (
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${Math.min(100, (bill.totalPaid / bill.amount) * 100)}%` }}/>
            </div>
            <span className="text-xs text-emerald-600 font-semibold shrink-0">
              {fmtCurrency(bill.totalPaid)} pago
            </span>
          </div>
        )}
      </div>

      {/* Ações rápidas */}
      <div className="flex border-t border-slate-100">
        {bill.status !== 'cancelado' && (
          <button onClick={() => onPay(bill)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors ${
              bill.status === 'pago'
                ? 'text-slate-400 hover:bg-slate-50'
                : 'text-emerald-600 hover:bg-emerald-50'
            }`}>
            <CheckCircle2 size={14}/>
            {bill.status === 'pago' ? 'Ver pagamentos' : bill.status === 'parcial' ? 'Continuar pagando' : 'Registrar pagamento'}
          </button>
        )}
        <button onClick={() => onEdit(bill)}
          className="w-10 flex items-center justify-center text-slate-400 hover:text-sky-500 hover:bg-sky-50 border-l border-slate-100 transition-colors">
          <Pencil size={14}/>
        </button>
        {expanded && (
          <>
            {bill.status !== 'cancelado' && bill.status !== 'pago' && (
              <button onClick={() => onCancel(bill)}
                className="w-10 flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-50 border-l border-slate-100 transition-colors">
                <Trash2 size={14}/>
              </button>
            )}
            {bill.status === 'cancelado' && (
              <button onClick={() => onReactivate(bill)}
                className="w-10 flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 border-l border-slate-100 transition-colors">
                <RotateCcw size={14}/>
              </button>
            )}
            {(bill.status === 'cancelado' || bill.status === 'pago') && (
              <button onClick={() => onDelete(bill)}
                className="w-10 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 border-l border-slate-100 transition-colors">
                <Trash2 size={14}/>
              </button>
            )}
          </>
        )}
        <button onClick={() => setExpanded(e => !e)}
          className="w-10 flex items-center justify-center text-slate-300 hover:text-slate-500 border-l border-slate-100 transition-colors">
          {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        </button>
      </div>

      {/* Anexos — expandido */}
      {expanded && ((bill.documents ?? []).length > 0 || (bill.receipts ?? []).length > 0) && (
        <div className="px-4 py-2 border-t border-slate-100 flex gap-3">
          {(bill.documents ?? []).length > 0 && (
            <button onClick={() => onViewAtt(bill.documents[0])}
              className="flex items-center gap-1 text-xs text-amber-500 font-semibold">
              <FileText size={11}/> Boleto
            </button>
          )}
          {(bill.receipts ?? []).length > 0 && (
            <button onClick={() => onViewAtt(bill.receipts[0])}
              className="flex items-center gap-1 text-xs text-sky-500 font-semibold">
              <Paperclip size={11}/> Comprovante
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Mobile: filtros em drawer ──────────────────────────────────────
function MobileFiltersDrawer({ open, onClose, filterStatus, setFilterStatus, filterCat, setFilterCat, sortBy, setSortBy, categories, onApply }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-t-3xl p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Filtros</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18}/></button>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Status</p>
          <div className="flex flex-wrap gap-2">
            {[['','Todos'],['aberto','Em aberto'],['parcial','Parcial'],['vencido','Vencido'],['pago','Pago'],['cancelado','Cancelado']].map(([val, lbl]) => (
              <button key={val} onClick={() => setFilterStatus(val)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filterStatus === val ? 'bg-rose-400 text-white border-rose-400' : 'bg-white text-slate-600 border-slate-200'
                }`}>{lbl}</button>
            ))}
          </div>
        </div>
        {categories.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Categoria</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setFilterCat('')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${!filterCat ? 'bg-rose-400 text-white border-rose-400' : 'bg-white text-slate-600 border-slate-200'}`}>
                Todas
              </button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setFilterCat(c.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${filterCat === c.id ? 'bg-rose-400 text-white border-rose-400' : 'bg-white text-slate-600 border-slate-200'}`}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }}/>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Ordenar por</p>
          <div className="flex flex-col gap-1.5">
            {SORT_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setSortBy(o.value)}
                className={`px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-all ${
                  sortBy === o.value ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}>{o.label}</button>
            ))}
          </div>
        </div>
        <button onClick={() => { onApply(); onClose() }} className="btn-primary py-3 mt-2">
          Aplicar filtros
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// DESKTOP: linha da tabela (sem alteração)
// ════════════════════════════════════════════════════════════════
function BillRow({ bill, onPay, onEdit, onCancel, onDelete, onReactivate, onViewAtt }) {
  const days     = daysUntil(bill.due_date)
  const isUrgent = bill.status === 'aberto' && days >= 0 && days <= 7
  const rowBg    = bill.category?.color ? `${bill.category.color}0D` : undefined
  return (
    <tr style={rowBg ? { backgroundColor: rowBg } : {}}>
      <td><span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md select-all">#{bill.id.slice(0,6).toUpperCase()}</span></td>
      <td>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isUrgent ? 'bg-amber-100 text-amber-600' : bill.status === 'vencido' ? 'bg-rose-100 text-rose-500' : 'bg-slate-100 text-slate-500'}`}>
            {fmtDayOfWeek(bill.due_date)}
          </span>
          <p className={`text-sm font-semibold ${isUrgent ? 'text-amber-600' : bill.status === 'vencido' ? 'text-rose-500' : 'text-slate-700'}`}>{fmtDate(bill.due_date)}</p>
        </div>
        {isUrgent && <p className="text-xs text-amber-500">{days===0?'Vence hoje!':days===1?'Vence amanhã!':'Vence em '+days+'d'}</p>}
        {bill.status === 'vencido' && days < 0 && <p className="text-xs text-rose-400">{Math.abs(days)}d em atraso</p>}
      </td>
      <td>
        <p className="font-semibold text-slate-800">{bill.description}</p>
        {bill.notes && <p className="text-xs text-slate-400 line-clamp-2">{bill.notes}</p>}
        {bill.recurrent && <span className="badge-neutral text-[10px] mt-0.5">Recorrente</span>}
      </td>
      <td className="text-slate-600 text-sm">{bill.supplier?.name ?? <span className="text-slate-300">—</span>}</td>
      <td>
        {bill.category ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bill.category.color }}/>
            <span className="text-slate-600 text-sm">{bill.category.name}</span>
          </span>
        ) : <span className="text-slate-300">—</span>}
      </td>
      <td className="font-semibold text-slate-800">{fmtCurrency(bill.amount)}</td>
      <td>
        {bill.totalPaid > 0 ? (
          <div>
            <p className="text-sm font-semibold text-emerald-600">{fmtCurrency(bill.totalPaid)}</p>
            {bill.remaining > 0 && <p className="text-xs text-slate-400">Falta: {fmtCurrency(bill.remaining)}</p>}
          </div>
        ) : <span className="text-slate-300">—</span>}
      </td>
      <td>
        <div className="flex flex-col gap-1">
          <StatusBadge status={bill.status} />
          {(bill.documents ?? []).length > 0 && (
            <button onClick={() => onViewAtt(bill.documents[0])} className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-600 font-semibold w-fit">
              <FileText size={11}/> Boleto
            </button>
          )}
          {(bill.receipts ?? []).length > 0 && (
            <button onClick={() => onViewAtt(bill.receipts[0])} className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600 font-semibold w-fit">
              <Paperclip size={11}/> Comprovante
            </button>
          )}
        </div>
      </td>
      <td>
        <div className="flex items-center justify-end gap-1">
          {bill.status !== 'cancelado' && (
            <button onClick={() => onPay(bill)}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${bill.status === 'pago' ? 'text-slate-400 bg-slate-50 hover:bg-slate-100' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`}>
              {bill.status === 'pago' ? 'Ver' : bill.status === 'parcial' ? 'Continuar' : 'Pagar'}
            </button>
          )}
          <button onClick={() => onEdit(bill)} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all" title="Editar"><Pencil size={15}/></button>
          {bill.status !== 'cancelado' && bill.status !== 'pago' && (
            <button onClick={() => onCancel(bill)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-all" title="Cancelar"><Trash2 size={15}/></button>
          )}
          {bill.status === 'cancelado' && (
            <button onClick={() => onReactivate(bill)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all" title="Reativar"><RotateCcw size={15}/></button>
          )}
          {(bill.status === 'cancelado' || bill.status === 'pago') && (
            <button onClick={() => onDelete(bill)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all" title="Excluir"><Trash2 size={15}/></button>
          )}
        </div>
      </td>
    </tr>
  )
}

function InstallmentGroupRow({ group, onPay, onEdit, onCancel, onViewAtt }) {
  const [open, setOpen] = useState(false)
  const base     = group[0]
  const baseName = base.description.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim()
  const total    = group.reduce((acc, b) => acc + Number(b.amount), 0)
  const paid     = group.reduce((acc, b) => acc + (b.totalPaid ?? 0), 0)
  const remain   = group.reduce((acc, b) => acc + (b.remaining ?? Number(b.amount)), 0)
  const statuses = [...new Set(group.map(b => b.status))]
  const groupStatus = statuses.every(s => s === 'pago') ? 'pago'
    : statuses.some(s => s === 'vencido') ? 'vencido'
    : statuses.some(s => s === 'parcial') ? 'parcial'
    : 'aberto'
  const groupBg = base.category?.color ? `${base.category.color}0D` : undefined
  return (
    <>
      <tr className="cursor-pointer" style={groupBg ? { backgroundColor: groupBg } : { backgroundColor: '#F0F9FF' }} onClick={() => setOpen(o => !o)}>
        <td/>
        <td><p className="text-xs text-slate-400">{fmtDate(group[0].due_date)} → {fmtDate(group[group.length-1].due_date)}</p></td>
        <td>
          <div className="flex items-center gap-2">
            <ChevronDown size={14} className={`text-sky-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}/>
            <div><p className="font-semibold text-slate-800">{baseName}</p><span className="badge-info text-[10px]">{group.length} parcelas</span></div>
          </div>
        </td>
        <td className="text-slate-600 text-sm">{base.supplier?.name ?? <span className="text-slate-300">—</span>}</td>
        <td>{base.category ? <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: base.category.color }}/><span className="text-slate-600 text-sm">{base.category.name}</span></span> : <span className="text-slate-300">—</span>}</td>
        <td className="font-semibold text-slate-800">{fmtCurrency(total)}</td>
        <td>{paid > 0 ? <div><p className="text-sm font-semibold text-emerald-600">{fmtCurrency(paid)}</p>{remain > 0 && <p className="text-xs text-slate-400">Falta: {fmtCurrency(remain)}</p>}</div> : <span className="text-slate-300">—</span>}</td>
        <td><StatusBadge status={groupStatus}/></td>
        <td><p className="text-xs text-slate-400 text-right">{open ? 'Ocultar' : 'Expandir'}</p></td>
      </tr>
      {open && group.map(bill => (
        <tr key={bill.id} className="border-l-2 border-sky-200" style={{ backgroundColor: '#F8FAFC' }}>
          <td className="pl-4"><span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">#{bill.id.slice(0,6).toUpperCase()}</span></td>
          <td className="pl-2"><p className={`text-sm font-semibold ${bill.status === 'vencido' ? 'text-rose-500' : 'text-slate-700'}`}>{fmtDate(bill.due_date)}</p>{bill.status === 'vencido' && <p className="text-xs text-rose-400">{Math.abs(daysUntil(bill.due_date))}d atraso</p>}</td>
          <td><p className="text-sm font-semibold text-slate-700">{bill.description}</p></td>
          <td/><td/>
          <td className="text-slate-700 font-medium">{fmtCurrency(bill.amount)}</td>
          <td>{bill.totalPaid > 0 ? <p className="text-sm font-semibold text-emerald-600">{fmtCurrency(bill.totalPaid)}</p> : <span className="text-slate-300">—</span>}</td>
          <td><div className="flex flex-col gap-1"><StatusBadge status={bill.status}/>{(bill.documents ?? []).length > 0 && <button onClick={e=>{e.stopPropagation();onViewAtt(bill.documents[0])}} className="flex items-center gap-1 text-xs text-amber-500 font-semibold w-fit"><FileText size={11}/> Boleto</button>}</div></td>
          <td onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-end gap-1">
              {bill.status !== 'cancelado' && (
                <button onClick={() => onPay(bill)} className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${bill.status === 'pago' ? 'text-slate-400 bg-slate-50' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`}>
                  {bill.status === 'pago' ? 'Ver' : bill.status === 'parcial' ? 'Continuar' : 'Pagar'}
                </button>
              )}
              {bill.status !== 'pago' && bill.status !== 'cancelado' && (
                <button onClick={() => onEdit(bill)} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all"><Pencil size={15}/></button>
              )}
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}

function NewBillsToast({ count, onDismiss }) {
  useEffect(() => {
    if (count <= 0) return
    const t = setTimeout(onDismiss, 8000)
    return () => clearTimeout(t)
  }, [count, onDismiss])
  if (count <= 0) return null
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-emerald-400 flex items-center justify-center shrink-0"><Bell size={13} className="text-white"/></div>
      <p className="text-sm font-semibold text-emerald-700 flex-1">{count === 1 ? '🔔 1 nova conta foi adicionada' : `🔔 ${count} novas contas foram adicionadas`}</p>
      <button onClick={onDismiss} className="text-xs text-emerald-500 hover:text-emerald-700 font-semibold underline shrink-0">Dispensar</button>
    </div>
  )
}

// ── Desktop: view agrupada ────────────────────────────────────────
function BillsGroupedDesktop({ paginated, groupInstallments, showPagos, setShowPagos, rowProps, page, totalPages, total, onPage }) {
  const [showCancelados, setShowCancelados] = useState(false)
  const itemAtivos     = paginated.filter(i => i.type === 'group' ? i.group.some(b => !['pago','cancelado'].includes(b.status)) : !['pago','cancelado'].includes(i.bill?.status))
  const itemPagos      = paginated.filter(i => i.type === 'group' ? i.group.every(b => b.status === 'pago') : i.bill?.status === 'pago')
  const itemCancelados = paginated.filter(i => i.type === 'group' ? i.group.every(b => b.status === 'cancelado') : i.bill?.status === 'cancelado')
  const totalPagosVal  = itemPagos.reduce((acc, i) => i.type === 'group' ? acc + i.group.reduce((s,b) => s + Number(b.amount), 0) : acc + Number(i.bill?.amount ?? 0), 0)
  const totalCancelVal = itemCancelados.reduce((acc, i) => i.type === 'group' ? acc + i.group.reduce((s,b) => s + Number(b.amount), 0) : acc + Number(i.bill?.amount ?? 0), 0)

  const renderRows = items => items.map(item =>
    item.type === 'group'
      ? <InstallmentGroupRow key={item.group[0].installment_group_id} group={item.group} {...rowProps}/>
      : <BillRow key={item.bill.id} bill={item.bill} {...rowProps}/>
  )
  const THead = () => (
    <thead><tr><th>#</th><th>Vencimento</th><th>Descrição</th><th>Fornecedor</th><th>Tipo</th><th>Valor total</th><th>Pago</th><th>Status</th><th className="text-right">Ações</th></tr></thead>
  )
  return (
    <div className="flex flex-col gap-4">
      {itemAtivos.length > 0 && <div className="table-wrapper"><table className="table"><THead/><tbody>{renderRows(itemAtivos)}</tbody></table></div>}
      {itemAtivos.length === 0 && itemPagos.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <p className="text-sm font-semibold text-emerald-800">Todas as contas do período estão pagas! 🎉</p>
        </div>
      )}
      {itemPagos.length > 0 && (
        <div className={`rounded-2xl border overflow-hidden ${showPagos ? 'border-emerald-200' : 'border-slate-200'}`}>
          <button onClick={() => setShowPagos(p => !p)} className={`w-full flex items-center justify-between px-5 py-3.5 gap-4 transition-colors ${showPagos ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-all ${showPagos ? 'bg-emerald-500' : 'bg-emerald-100'}`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={showPagos ? '#fff' : '#10b981'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
              <div className="text-left"><p className={`text-sm font-bold ${showPagos ? 'text-emerald-800' : 'text-slate-600'}`}>Contas pagas</p><p className="text-xs text-slate-400">{itemPagos.length} conta(s) · {fmtCurrency(totalPagosVal)}</p></div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${showPagos ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{showPagos ? 'Ocultar' : 'Mostrar'}</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" style={{ transform: showPagos ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </button>
          {showPagos && <div className="border-t border-emerald-100"><table className="table"><THead/><tbody>{renderRows(itemPagos)}</tbody></table></div>}
        </div>
      )}
      {itemCancelados.length > 0 && (
        <div className={`rounded-2xl border overflow-hidden ${showCancelados ? 'border-slate-300' : 'border-slate-100'}`}>
          <button onClick={() => setShowCancelados(p => !p)} className={`w-full flex items-center justify-between px-5 py-3 gap-4 transition-colors ${showCancelados ? 'bg-slate-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${showCancelados ? 'bg-slate-400' : 'bg-slate-200'}`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
              <div className="text-left"><p className="text-sm font-semibold text-slate-500">Cancelados</p><p className="text-xs text-slate-400">{itemCancelados.length} conta(s) · {fmtCurrency(totalCancelVal)}</p></div>
            </div>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" style={{ transform: showCancelados ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {showCancelados && <div className="border-t border-slate-200"><table className="table opacity-60"><THead/><tbody>{renderRows(itemCancelados)}</tbody></table></div>}
        </div>
      )}
      {!groupInstallments && <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={onPage}/>}
    </div>
  )
}

// ── BillsTab principal ────────────────────────────────────────────
function BillsTab({ externalNewBill = false, onExternalNewBillClose }) {
  const { bills, summary, loading, newCount, clearNewCount, create, update, cancel, reactivate, deletePermanently, addPayment, deletePayment, uploadAttachment, removeAttachment, getAttachmentUrl } = useBills()
  const { categories } = useExpenseCategories()
  const isMobile = useMobile()

  const [billForm, setBillForm]     = useState(false)
  const [payModal, setPayModal]     = useState(false)
  const [catModal, setCatModal]     = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editing,  setEditing]      = useState(null)
  const [payTarget, setPayTarget]   = useState(null)
  const [cancelTarget,  setCancelTarget]  = useState(null)
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [reactivateTarget, setReactivateTarget] = useState(null)
  const [showPagos,  setShowPagos]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCat,    setFilterCat]    = useState('')
  const [sortBy,       setSortBy]       = useState('status_due_desc')
  const [groupInstallments, setGroupInstallments] = useState(false)
  const [filterPeriod, setFilterPeriod] = useState('semana')

  useEffect(() => {
    if (externalNewBill) { setEditing(null); setBillForm(true); onExternalNewBillClose?.() }
  }, [externalNewBill])

  const filtered = useMemo(() => {
    const periodRange = getPeriodRange(filterPeriod)
    const base = bills.filter(b => {
      if (search && !b.description.toLowerCase().includes(search.toLowerCase()) && !b.supplier?.name?.toLowerCase().includes(search.toLowerCase())) return false
      if (filterStatus && b.status !== filterStatus) return false
      if (filterCat    && b.category_id !== filterCat) return false
      if (periodRange && (b.due_date < periodRange.start || b.due_date > periodRange.end)) return false
      return true
    })
    return sortBills(base, sortBy)
  }, [bills, search, filterStatus, filterCat, sortBy, filterPeriod])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(b => ({ type: 'single', bill: b }))

  async function handleSaveBill(payload) {
    setSaving(true)
    try { editing ? await update(editing.id, payload) : await create(payload); setBillForm(false) }
    catch {} finally { setSaving(false) }
  }
  async function handleReactivate() {
    setSaving(true)
    try { await reactivate(reactivateTarget); setReactivateTarget(null) }
    catch {} finally { setSaving(false) }
  }
  async function handleDeletePermanently() {
    setSaving(true)
    try { await deletePermanently(deleteTarget); setDeleteTarget(null) }
    catch {} finally { setSaving(false) }
  }
  async function handleCancel() {
    setSaving(true)
    try { await cancel(cancelTarget.id); setCancelTarget(null) }
    catch {} finally { setSaving(false) }
  }
  async function handleViewAtt(att) {
    const url = await getAttachmentUrl(att.storage_path)
    if (url) window.open(url, '_blank')
  }

  const rowProps = {
    onPay:        b => { setPayTarget(b); setPayModal(true) },
    onEdit:       b => { setEditing(b); setBillForm(true) },
    onCancel:     b => setCancelTarget(b),
    onDelete:     b => setDeleteTarget(b),
    onReactivate: b => setReactivateTarget(b),
    onViewAtt:    handleViewAtt,
  }

  const activeFilterCount = [filterStatus, filterCat, sortBy !== 'status_due_desc' ? sortBy : ''].filter(Boolean).length

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign}    label="Total pendente"  value={fmtCurrency(summary?.total_pending)}   bg="bg-sky-50"     color="text-sky-500"/>
        <KpiCard icon={AlertTriangle} label="Em atraso"       value={fmtCurrency(summary?.total_overdue)}   bg="bg-rose-50"    color="text-rose-400" sub={`${summary?.count_overdue ?? 0} conta(s)`}/>
        <KpiCard icon={Clock}         label="Vence em 7 dias" value={fmtCurrency(summary?.due_next_7days)}  bg="bg-amber-50"   color="text-amber-500"/>
        <KpiCard icon={CheckCircle2}  label="Pago este mês"   value={fmtCurrency(summary?.paid_this_month)} bg="bg-emerald-50" color="text-emerald-500"/>
      </div>

      <NewBillsToast count={newCount} onDismiss={clearNewCount}/>

      {/* Filtro de período — scroll horizontal no mobile */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {PERIOD_BUTTONS.map(pb => (
          <button key={pb.value} onClick={() => { setFilterPeriod(pb.value); setPage(1) }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all shrink-0 ${
              filterPeriod === pb.value ? 'bg-rose-400 text-white border-rose-400' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}>{pb.label}</button>
        ))}
      </div>

      {/* Barra de busca + filtros */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input className="input pl-8" placeholder={isMobile ? 'Buscar...' : 'Buscar por descrição ou fornecedor...'}
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}/>
        </div>

        {/* Mobile: botão filtros */}
        {isMobile ? (
          <button onClick={() => setFiltersOpen(true)}
            className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
              activeFilterCount > 0 ? 'bg-rose-400 text-white border-rose-400' : 'bg-white text-slate-600 border-slate-200'
            }`}>
            <SlidersHorizontal size={15}/>
            {activeFilterCount > 0 && <span className="text-xs font-bold">{activeFilterCount}</span>}
          </button>
        ) : (
          <>
            <select className="select w-auto min-w-[130px]" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
              <option value="">Todos os status</option>
              <option value="aberto">Em aberto</option>
              <option value="parcial">Pago parcial</option>
              <option value="vencido">Vencido</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <select className="select w-auto min-w-[150px]" value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1) }}>
              <option value="">Todos os tipos</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex items-center gap-1.5">
              <ArrowUpDown size={14} className="text-slate-400 shrink-0"/>
              <select className="select w-auto min-w-[190px]" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1) }}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <button onClick={() => setGroupInstallments(g => !g)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${groupInstallments ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              <Layers size={14}/> {groupInstallments ? 'Agrupado' : 'Agrupar'}
            </button>
            <button onClick={() => setCatModal(true)} className="btn-secondary py-2 text-sm"><Tag size={14}/> Tipos</button>
          </>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="card flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin"/>
            <p className="text-sm text-slate-400">Carregando contas...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={DollarSign}
            title={bills.length === 0 ? 'Nenhuma conta cadastrada' : 'Nenhum resultado'}
            description={bills.length === 0 ? 'Cadastre as contas a pagar.' : 'Ajuste os filtros.'}
            action={bills.length === 0 && <button onClick={() => setBillForm(true)} className="btn-primary"><Plus size={16}/> Cadastrar primeira conta</button>}/>
        </div>
      ) : isMobile ? (
        /* ── MOBILE: cards ─────────────────────────────────────── */
        <div className="flex flex-col gap-3 pb-24">
          {/* Ativos */}
          {paginated
            .filter(i => !['pago','cancelado'].includes(i.bill?.status))
            .map(i => <BillCard key={i.bill.id} bill={i.bill} {...rowProps}/>)
          }
          {/* Pagos accordion */}
          {paginated.filter(i => i.bill?.status === 'pago').length > 0 && (
            <div className="rounded-2xl border border-emerald-200 overflow-hidden">
              <button onClick={() => setShowPagos(p => !p)}
                className={`w-full flex items-center justify-between px-4 py-3 gap-4 transition-colors ${showPagos ? 'bg-emerald-50' : 'bg-white'}`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0"/>
                  <div className="text-left">
                    <p className="text-sm font-bold text-emerald-700">Contas pagas</p>
                    <p className="text-xs text-slate-400">{paginated.filter(i => i.bill?.status === 'pago').length} conta(s)</p>
                  </div>
                </div>
                {showPagos ? <ChevronUp size={15} className="text-slate-400"/> : <ChevronDown size={15} className="text-slate-400"/>}
              </button>
              {showPagos && (
                <div className="border-t border-emerald-100 p-3 flex flex-col gap-2">
                  {paginated.filter(i => i.bill?.status === 'pago').map(i => <BillCard key={i.bill.id} bill={i.bill} {...rowProps}/>)}
                </div>
              )}
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage}/>
        </div>
      ) : (
        /* ── DESKTOP: tabela ───────────────────────────────────── */
        <BillsGroupedDesktop
          paginated={paginated} groupInstallments={groupInstallments}
          showPagos={showPagos} setShowPagos={setShowPagos}
          rowProps={rowProps} page={page} totalPages={totalPages}
          total={filtered.length} onPage={setPage}/>
      )}

      {/* Mobile: FAB tipos */}
      {isMobile && (
        <button onClick={() => setCatModal(true)}
          className="fixed bottom-6 left-4 z-30 flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-full shadow-lg text-sm font-semibold text-slate-600">
          <Tag size={15}/> Tipos
        </button>
      )}

      {/* Drawer de filtros mobile */}
      <MobileFiltersDrawer
        open={filtersOpen} onClose={() => setFiltersOpen(false)}
        filterStatus={filterStatus} setFilterStatus={setFilterStatus}
        filterCat={filterCat} setFilterCat={setFilterCat}
        sortBy={sortBy} setSortBy={setSortBy}
        categories={categories} onApply={() => setPage(1)}/>

      {/* Modais */}
      <BillFormModal open={billForm} onClose={() => setBillForm(false)} onSave={handleSaveBill} initial={editing} loading={saving}/>
      <PaymentModal open={payModal} onClose={() => { setPayModal(false); setPayTarget(null) }} bill={payTarget}
        onAddPayment={addPayment} onDeletePayment={deletePayment} onUpload={uploadAttachment}
        onRemoveAttachment={removeAttachment} onGetUrl={getAttachmentUrl}/>
      <ExpenseCategoriesModal open={catModal} onClose={() => setCatModal(false)}/>
      <ConfirmDialog open={!!reactivateTarget} onClose={() => setReactivateTarget(null)} onConfirm={handleReactivate} loading={saving}
        title={`Reativar "${reactivateTarget?.description}"?`}
        description="A conta voltará para Em aberto. Os pagamentos anteriores serão mantidos." confirmLabel="Reativar conta"/>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeletePermanently} loading={saving}
        title={`Excluir "${deleteTarget?.description}" permanentemente?`}
        description="Esta ação não pode ser desfeita. A conta e todos os pagamentos serão removidos." confirmLabel="Excluir permanentemente"/>
      <ConfirmDialog open={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleCancel} loading={saving}
        title={`Cancelar "${cancelTarget?.description}"?`}
        description="A conta será marcada como cancelada." confirmLabel="Cancelar conta"/>
    </div>
  )
}

// ── Fornecedores ──────────────────────────────────────────────────
function SuppliersTab() {
  const { suppliers, loading, create, update, remove } = useSuppliers()
  const [form, setForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [del, setDel] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const isMobile = useMobile()
  const filtered = useMemo(() => suppliers.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase())), [suppliers, search])

  async function handleSave(p) {
    setSaving(true)
    try { editing ? await update(editing.id, p) : await create(p); setForm(false) }
    catch {} finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input className="input pl-8" placeholder="Buscar fornecedor..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <button onClick={() => { setEditing(null); setForm(true) }} className="btn-primary flex items-center gap-1.5">
          <Plus size={16}/> {!isMobile && 'Novo fornecedor'}
        </button>
      </div>
      {loading ? (
        <div className="card flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin"/></div>
      ) : filtered.length === 0 ? (
        <div className="card"><EmptyState icon={Building2} title="Nenhum fornecedor cadastrado" description="Cadastre os fornecedores." action={<button onClick={() => setForm(true)} className="btn-primary"><Plus size={16}/> Cadastrar</button>}/></div>
      ) : isMobile ? (
        /* Mobile: cards de fornecedor */
        <div className="flex flex-col gap-2">
          {filtered.map(s => (
            <div key={s.id} className="card flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Building2 size={18} className="text-slate-400"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 truncate">{s.name}</p>
                {s.cnpj && <p className="text-xs text-slate-400 font-mono">{s.cnpj}</p>}
                {(s.phone || s.email) && <p className="text-xs text-slate-400 truncate">{s.phone ?? s.email}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => { setEditing(s); setForm(true) }} className="p-2 rounded-xl text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all"><Pencil size={15}/></button>
                <button onClick={() => setDel(s)} className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"><Trash2 size={15}/></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Nome</th><th>CNPJ</th><th>Telefone</th><th>E-mail</th><th className="text-right">Ações</th></tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td className="font-semibold text-slate-800">{s.name}</td>
                  <td className="text-slate-500 text-sm font-mono">{s.cnpj ?? '—'}</td>
                  <td className="text-slate-500 text-sm">{s.phone ?? '—'}</td>
                  <td className="text-slate-500 text-sm">{s.email ?? '—'}</td>
                  <td><div className="flex justify-end gap-1">
                    <button onClick={() => { setEditing(s); setForm(true) }} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all"><Pencil size={15}/></button>
                    <button onClick={() => setDel(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"><Trash2 size={15}/></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SupplierFormModal open={form} onClose={() => setForm(false)} onSave={handleSave} initial={editing} loading={saving}/>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)}
        onConfirm={async () => { setSaving(true); try { await remove(del.id); setDel(null) } catch {} finally { setSaving(false) } }}
        loading={saving} title={`Remover "${del?.name}"?`} description="O fornecedor será desativado." confirmLabel="Remover"/>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
const TABS = [
  { id: 'bills',     label: 'Contas a Pagar', icon: CreditCard  },
  { id: 'suppliers', label: 'Fornecedores',   icon: Building2   },
]

export function FinancialPage() {
  const [activeTab,   setActiveTab]   = useState('bills')
  const [newBillOpen, setNewBillOpen] = useState(false)
  const isMobile = useMobile()

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Financeiro</h2>
          <p className="page-subtitle">Contas a pagar e fornecedores</p>
        </div>
        <div className="flex items-center gap-2">
          {!isMobile && (
            <a href="/relatorios" className="btn-secondary"
              onClick={e => { e.preventDefault(); window.history.pushState({}, '', import.meta.env.PROD ? '/sistema/relatorios' : '/relatorios'); window.dispatchEvent(new PopStateEvent('popstate')) }}>
              <BarChart2 size={16}/> Ver relatórios
            </a>
          )}
          <button onClick={() => setNewBillOpen(true)} className="btn-primary">
            <Plus size={16}/> {isMobile ? 'Nova conta' : 'Nova conta'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === id ? 'bg-white text-slate-800 shadow-card' : 'text-slate-500 hover:text-slate-700'}`}
            style={{ fontFamily: 'Nunito, sans-serif' }}>
            <Icon size={16}/> {label}
          </button>
        ))}
      </div>

      {activeTab === 'bills'     && <BillsTab externalNewBill={newBillOpen} onExternalNewBillClose={() => setNewBillOpen(false)}/>}
      {activeTab === 'suppliers' && <SuppliersTab/>}
    </div>
  )
}
