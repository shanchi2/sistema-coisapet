import { useState, useMemo } from 'react'
import {
  Package, Plus, Check, Loader2, Trash2, Receipt, ShieldAlert,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { useMaterialOrders } from './hooks/useMaterialOrders'
import { useMaterials } from '../materials/hooks/useMaterials'
import { useSuppliers } from '../financial/hooks/useSuppliers'
import { BillFormModal } from '../financial/components/BillFormModal'
import { useBills } from '../financial/hooks/useBills'
import toast from 'react-hot-toast'

function fmtPreco(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtQty(v, unit) {
  const n = Number(v)
  return `${n % 1 === 0 ? n : n.toFixed(3).replace(/\.?0+$/, '')} ${unit || ''}`
}
function orderTotal(order) {
  return (order.items || []).reduce((s, it) => s + (Number(it.unit_price) || 0) * Number(it.qty_ordered), 0)
}

const STATUS_INFO = {
  pedido:    { label: 'Aguardando entrega/conferência', text: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  conferido: { label: 'Conferido',                       text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  cancelado: { label: 'Cancelado',                        text: 'text-slate-500',   bg: 'bg-slate-50 border-slate-200' },
}
function StatusBadge({ status }) {
  const info = STATUS_INFO[status] || STATUS_INFO.pedido
  return <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${info.text} ${info.bg}`}>{info.label}</span>
}

// ─── Novo pedido — escolher matérias-primas/chapas + qtd (mesmo
// padrão de "adicionar insumo" já usado na Ficha Técnica) ───────────
function NewOrderModal({ open, onClose, onSave, materials, suppliers }) {
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes]           = useState('')
  const [items, setItems]           = useState([]) // [{raw_material_id, qty_ordered, unit_price}]
  const [pickId, setPickId]         = useState('')
  const [pickQty, setPickQty]       = useState('')
  const [pickPrice, setPickPrice]   = useState('')
  const [saving, setSaving]         = useState(false)

  const available = materials.filter(m => m.active !== false && !items.some(it => it.raw_material_id === m.id))
  const materialById = id => materials.find(m => m.id === id)

  function addItem() {
    if (!pickId) { toast.error('Escolhe a matéria-prima/chapa.'); return }
    if (!pickQty || Number(pickQty) <= 0) { toast.error('Informa a quantidade.'); return }
    setItems(prev => [...prev, { raw_material_id: pickId, qty_ordered: pickQty, unit_price: pickPrice || null }])
    setPickId(''); setPickQty(''); setPickPrice('')
  }
  function removeItem(id) {
    setItems(prev => prev.filter(it => it.raw_material_id !== id))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ supplier_id: supplierId || null, notes, items })
      setSupplierId(''); setNotes(''); setItems([])
      onClose()
    } catch { /* toast já mostrado no hook */ }
    finally { setSaving(false) }
  }

  const total = items.reduce((s, it) => s + (Number(it.unit_price) || 0) * Number(it.qty_ordered), 0)

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Novo Pedido de Matéria-Prima/Chapas"
      subtitle="Escolha os itens e quantidades — o Financeiro é registrado depois, num passo separado."
      footer={<>
        <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={handleSave} className="btn-primary" disabled={saving || items.length === 0}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Salvando...' : 'Criar pedido'}
        </button>
      </>}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="form-label">Fornecedor (opcional)</label>
          <select className="select" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">Sem fornecedor definido</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col gap-3">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Adicionar item</p>
          {available.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-2">Todas as matérias-primas cadastradas já foram adicionadas.</p>
          ) : (
            <>
              <select className="select bg-white" value={pickId} onChange={e => setPickId(e.target.value)}>
                <option value="">Selecione a matéria-prima ou chapa...</option>
                {available.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.unit}) — Estoque: {Number(m.stock_qty).toLocaleString('pt-BR')}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Quantidade {pickId && <span className="text-slate-400">({materialById(pickId)?.unit})</span>}</label>
                  <input type="number" min="0.001" step="0.001" className="input bg-white" placeholder="Ex: 50"
                    value={pickQty} onChange={e => setPickQty(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Preço unitário (opcional)</label>
                  <input type="number" min="0" step="0.01" className="input bg-white" placeholder="Ex: 12.90"
                    value={pickPrice} onChange={e => setPickPrice(e.target.value)} />
                </div>
              </div>
              <button onClick={addItem} className="btn-primary py-1.5 text-xs self-start"><Plus size={13} /> Adicionar</button>
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex flex-col gap-2">
            {items.map(it => {
              const m = materialById(it.raw_material_id)
              return (
                <div key={it.raw_material_id} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{m?.name}</p>
                    <p className="text-xs text-slate-400">{fmtQty(it.qty_ordered, m?.unit)}{it.unit_price ? ` × ${fmtPreco(it.unit_price)}` : ''}</p>
                  </div>
                  <button onClick={() => removeItem(it.raw_material_id)} className="p-1.5 text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
                </div>
              )
            })}
            <div className="text-right text-sm font-bold text-slate-700 pt-1">Total estimado: {fmtPreco(total)}</div>
          </div>
        )}

        <div>
          <label className="form-label">Observações</label>
          <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional..." />
        </div>
      </div>
    </Modal>
  )
}

// ─── Painel de ocorrências (avarias reportadas pelo João) ───────────
function OccurrenceRow({ occ, order, onResolve }) {
  const item = order.items?.find(i => i.id === occ.order_item_id)
  return (
    <div className="flex items-start gap-2.5 bg-rose-50/60 border border-rose-100 rounded-xl px-3 py-2.5">
      <ShieldAlert size={14} className="text-rose-500 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-rose-700">
          {item?.raw_material?.name || 'Item'}
          {occ.qty_damaged != null && ` — ${fmtQty(occ.qty_damaged, item?.raw_material?.unit)} avariado`}
        </p>
        {occ.description && <p className="text-xs text-slate-500 mt-0.5">{occ.description}</p>}
      </div>
      {occ.status === 'aberto' ? (
        <button onClick={() => onResolve(occ.id)} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 shrink-0">Marcar resolvida</button>
      ) : (
        <span className="text-[11px] text-slate-400 shrink-0">Resolvida</span>
      )}
    </div>
  )
}

// ─── Card de pedido ──────────────────────────────────────────────────
function OrderCard({ order, onRegisterBill, onCancel, onResolveOccurrence }) {
  const [expanded, setExpanded] = useState(false)
  const openOccurrences = (order.occurrences || []).filter(o => o.status === 'aberto')

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <p className="text-sm font-bold text-slate-800">{order.supplier?.name || 'Sem fornecedor definido'}</p>
          <p className="text-xs text-slate-400">
            Pedido por {order.creator?.name || '—'} em {new Date(order.created_at).toLocaleDateString('pt-BR')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {openOccurrences.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">
              <ShieldAlert size={12} /> {openOccurrences.length} ocorrência{openOccurrences.length > 1 ? 's' : ''}
            </span>
          )}
          <StatusBadge status={order.status} />
        </div>
      </div>

      <button onClick={() => setExpanded(e => !e)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-1">
        <Package size={12} /> {order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''} — {expanded ? 'ocultar' : 'ver detalhes'}
      </button>

      {expanded && (
        <div className="flex flex-col gap-1.5 mb-3 mt-2">
          {(order.items || []).map(it => (
            <div key={it.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-slate-700 font-medium">{it.raw_material?.name}</span>
              <span className="text-slate-500">
                {fmtQty(it.qty_ordered, it.raw_material?.unit)}
                {it.qty_received != null && ` · recebido: ${fmtQty(it.qty_received, it.raw_material?.unit)}`}
                {Number(it.qty_damaged) > 0 && <span className="text-rose-500 font-semibold"> · {fmtQty(it.qty_damaged, it.raw_material?.unit)} avariado</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {openOccurrences.length > 0 && expanded && (
        <div className="flex flex-col gap-1.5 mb-3">
          {openOccurrences.map(occ => <OccurrenceRow key={occ.id} occ={occ} order={order} onResolve={onResolveOccurrence} />)}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-slate-50">
        <span className="text-sm font-bold text-slate-700">Total estimado: {fmtPreco(orderTotal(order))}</span>
        <div className="flex items-center gap-2">
          {order.status !== 'cancelado' && !order.bill_id && (
            <button onClick={() => onCancel(order.id)} className="text-xs font-semibold text-slate-400 hover:text-rose-500">Cancelar</button>
          )}
          {order.bill_id ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><Receipt size={13} /> Registrado no Financeiro</span>
          ) : order.status !== 'cancelado' && (
            <button onClick={() => onRegisterBill(order)} className="btn-primary py-1.5 text-xs"><Receipt size={13} /> Registrar no Financeiro</button>
          )}
        </div>
      </div>
      {order.conferred_at && (
        <p className="text-[11px] text-slate-400 mt-2">Conferido por {order.conferrer?.name || '—'} em {new Date(order.conferred_at).toLocaleDateString('pt-BR')}</p>
      )}
    </div>
  )
}

export function MaterialOrdersPage() {
  const { orders, loading, createOrder, linkBill, cancelOrder, resolveOccurrence } = useMaterialOrders()
  const { materials } = useMaterials()
  const { suppliers } = useSuppliers()
  const { create: createBill, addPayment: addBillPayment } = useBills()

  const [modal, setModal]           = useState(false)
  const [billOrder, setBillOrder]   = useState(null)
  const [billSaving, setBillSaving] = useState(false)

  const billPrefill = useMemo(() => {
    if (!billOrder) return null
    const itemsDesc = (billOrder.items || []).map(it => `${it.raw_material?.name} (${fmtQty(it.qty_ordered, it.raw_material?.unit)})`).join(', ')
    return {
      description: `Matéria-prima${billOrder.supplier?.name ? ' — ' + billOrder.supplier.name : ''}`,
      notes: itemsDesc,
    }
  }, [billOrder])

  async function handleSaveBillForOrder(payload) {
    setBillSaving(true)
    try {
      const isArray = Array.isArray(payload)
      const first   = isArray ? payload[0] : payload
      const total   = isArray ? payload.reduce((s, p) => s + Number(p.amount || 0), 0) : payload.amount
      const billIds = await createBill(payload)
      const billId  = Array.isArray(billIds) ? billIds[0] : billIds

      // Mesmo padrão do Compras: conta de parcela única já nasce paga
      // (a compra já aconteceu de verdade); parcelamento fica em aberto normal.
      if (!isArray) {
        try {
          await addBillPayment(billId, { amount: total, paid_at: first.due_date, notes: 'Pago automaticamente — pedido de matéria-prima.' })
        } catch { /* conta já criada, só o pagamento falhou — dá pra pagar manual depois */ }
      }

      await linkBill(billOrder.id, billId)
      setBillOrder(null)
    } catch { /* useBills().create já mostra o toast de erro */ }
    finally { setBillSaving(false) }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Pedidos de Matéria-Prima</h2>
          <p className="page-subtitle">Compras de matéria-prima e chapas, com conferência e Financeiro</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary">
          <Plus size={16} /> Novo pedido
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-300" /></div>
      ) : orders.length === 0 ? (
        <div className="card text-center py-16">
          <Package size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
          <p className="text-slate-400">Nenhum pedido ainda</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map(order => (
            <OrderCard key={order.id} order={order}
              onRegisterBill={setBillOrder} onCancel={cancelOrder} onResolveOccurrence={resolveOccurrence} />
          ))}
        </div>
      )}

      <NewOrderModal open={modal} onClose={() => setModal(false)} onSave={createOrder} materials={materials} suppliers={suppliers} />

      <BillFormModal open={!!billOrder} onClose={() => setBillOrder(null)} onSave={handleSaveBillForOrder}
        loading={billSaving} prefill={billPrefill} />
    </div>
  )
}
