import { useState } from 'react'
import { CalendarClock, Pencil, Check, X, Loader2 } from 'lucide-react'
import { todayISO } from '../../lib/dateBR'

// Previsão de entrega do pedido de matéria-prima (fase75, 26/09).
// A coluna é `date` pura — compara com o "hoje" de Brasília (dateBR),
// nunca com new Date() (fuso do navegador/UTC).

function daysBetween(fromISO, toISO) {
  const [y1, m1, d1] = fromISO.split('-').map(Number)
  const [y2, m2, d2] = toISO.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export function fmtDateBR(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Situação da entrega — só faz sentido enquanto o pedido não chegou
export function deliveryInfo(expected, status) {
  if (!expected) return null
  const date = fmtDateBR(expected).slice(0, 5)
  if (status !== 'pedido') return { label: `Previsão era ${date}`, tone: 'bg-slate-100 text-slate-500' }
  const diff = daysBetween(todayISO(), expected)
  if (diff < 0)  return { label: `Atrasado ${-diff} dia${diff < -1 ? 's' : ''} (previsto ${date})`, tone: 'bg-rose-100 text-rose-700', late: true }
  if (diff === 0) return { label: `Chega hoje (${date})`, tone: 'bg-amber-100 text-amber-700' }
  if (diff === 1) return { label: `Chega amanhã (${date})`, tone: 'bg-amber-50 text-amber-700' }
  return { label: `Previsão ${date} · em ${diff} dias`, tone: 'bg-sky-50 text-sky-700' }
}

export function DeliveryBadge({ expected, status, className = '' }) {
  const info = deliveryInfo(expected, status)
  if (!info) return null
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${info.tone} ${className}`}>
      <CalendarClock size={12} /> {info.label}
    </span>
  )
}

// Badge + edição inline (lápis → campo de data) no card do pedido
export function DeliveryEditor({ order, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(order.expected_delivery || '')
  const [saving, setSaving]   = useState(false)
  const canEdit = order.status === 'pedido'

  async function save() {
    setSaving(true)
    try { await onSave(order.id, value || null); setEditing(false) }
    catch { /* toast no hook */ }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input type="date" className="input py-1 text-xs w-[140px]" value={value} min={todayISO()}
          onChange={e => setValue(e.target.value)} autoFocus />
        <button onClick={save} disabled={saving} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        </button>
        <button onClick={() => { setEditing(false); setValue(order.expected_delivery || '') }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={13} /></button>
      </span>
    )
  }
  if (!order.expected_delivery) {
    return canEdit ? (
      <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-sky-600 border border-dashed border-slate-200 hover:border-sky-300 rounded-full px-2.5 py-1">
        <CalendarClock size={12} /> Definir previsão de entrega
      </button>
    ) : null
  }
  return (
    <span className="inline-flex items-center gap-1">
      <DeliveryBadge expected={order.expected_delivery} status={order.status} />
      {canEdit && (
        <button onClick={() => setEditing(true)} title="Alterar previsão" className="p-1 rounded-md text-slate-300 hover:text-sky-600"><Pencil size={12} /></button>
      )}
    </span>
  )
}
