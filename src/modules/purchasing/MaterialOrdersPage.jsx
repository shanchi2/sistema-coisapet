import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Package, Plus, Check, Loader2, Trash2, Receipt, ShieldAlert, Search, Truck, X, ClipboardCheck,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { useMaterialOrders } from './hooks/useMaterialOrders'
import { useMaterials } from '../materials/hooks/useMaterials'
import { useSuppliers } from '../financial/hooks/useSuppliers'
import { BillFormModal } from '../financial/components/BillFormModal'
import { useBills } from '../financial/hooks/useBills'
import { ConferenceReport } from './ConferenceReport'
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

// ─── Fornecedor com busca (digita pra filtrar) ───────────────────────
function SupplierPicker({ suppliers, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const selected = suppliers.find(s => s.id === value)

  const filtered = useMemo(() => {
    const q = normalize(query)
    return suppliers.filter(s => !q || normalize(s.name).includes(q)).slice(0, 50)
  }, [suppliers, query])

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 input bg-rose-50/50 border-rose-200">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 min-w-0"><Truck size={14} className="text-rose-500 shrink-0" /> <span className="truncate">{selected.name}</span></span>
        <button type="button" onClick={() => { onChange(''); setQuery('') }} className="text-slate-400 hover:text-rose-500 shrink-0"><X size={15} /></button>
      </div>
    )
  }
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input className="input pl-9" placeholder="Digite o nome da empresa..." value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 px-3 py-3">Nenhum fornecedor encontrado</p>
          ) : filtered.map(s => (
            <button key={s.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange(s.id); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-rose-50">{s.name}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// Busca sem acento/maiúscula ("petg" acha "PetG", "cortica" acha "Cortiça")
function normalize(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Preço sugerido: o custo cadastrado pra esse fornecedor (material_suppliers)
// ou, se não tiver, o custo geral da matéria-prima. Sempre em reais.
function suggestedPrice(material, supplierId) {
  const link = supplierId && material.suppliers_rel?.find(r => r.supplier_id === supplierId)
  const v = link?.unit_cost ?? material.unit_cost
  return v != null && Number(v) > 0 ? String(Number(v)) : ''
}

// ─── Novo pedido — 1) marca os produtos no catálogo (com busca),
// 2) preenche quantidade/preço direto na lista dos selecionados ──────
function NewOrderModal({ open, onClose, onSave, materials, suppliers }) {
  const [title, setTitle]           = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes]           = useState('')
  const [items, setItems]           = useState([]) // [{raw_material_id, qty_ordered, unit_price}]
  const [search, setSearch]         = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [onlySupplier, setOnlySupplier] = useState(false)
  const [saving, setSaving]         = useState(false)

  const materialById = id => materials.find(m => m.id === id)
  const selectedIds  = useMemo(() => new Set(items.map(it => it.raw_material_id)), [items])
  const active       = useMemo(() => materials.filter(m => m.active !== false), [materials])

  const categories = useMemo(() => {
    const map = new Map()
    active.forEach(m => { if (m.category) map.set(m.category.id, m.category.name) })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [active])

  const supplierHasLinks = supplierId && active.some(m => m.supplier_id === supplierId || m.suppliers_rel?.some(r => r.supplier_id === supplierId))

  const catalog = useMemo(() => {
    const q = normalize(search)
    return active.filter(m => {
      if (q && !normalize(m.name).includes(q)) return false
      if (categoryId && m.category?.id !== categoryId) return false
      if (onlySupplier && supplierId && m.supplier_id !== supplierId && !m.suppliers_rel?.some(r => r.supplier_id === supplierId)) return false
      return true
    })
  }, [active, search, categoryId, onlySupplier, supplierId])

  function toggleMaterial(m) {
    setItems(prev => prev.some(it => it.raw_material_id === m.id)
      ? prev.filter(it => it.raw_material_id !== m.id)
      : [...prev, { raw_material_id: m.id, qty_ordered: '', unit_price: suggestedPrice(m, supplierId) }])
  }
  function updateItem(id, field, value) {
    setItems(prev => prev.map(it => it.raw_material_id === id ? { ...it, [field]: value } : it))
  }
  function removeItem(id) {
    setItems(prev => prev.filter(it => it.raw_material_id !== id))
  }
  // Trocou o fornecedor: preenche o preço dos itens que ainda estão sem preço
  function handleSupplierChange(id) {
    setSupplierId(id)
    if (!id) setOnlySupplier(false)
    setItems(prev => prev.map(it => {
      if (it.unit_price) return it
      const m = materialById(it.raw_material_id)
      return m ? { ...it, unit_price: suggestedPrice(m, id) } : it
    }))
  }

  function reset() {
    setTitle(''); setSupplierId(''); setNotes(''); setItems([]); setSearch(''); setCategoryId(''); setOnlySupplier(false)
  }

  const missingQty = items.filter(it => !(Number(it.qty_ordered) > 0)).length

  async function handleSave() {
    if (missingQty) { toast.error(`Falta a quantidade de ${missingQty} item(ns).`); return }
    setSaving(true)
    try {
      await onSave({ title, supplier_id: supplierId || null, notes, items: items.map(it => ({ ...it, unit_price: it.unit_price || null })) })
      reset()
      onClose()
    } catch { /* toast já mostrado no hook */ }
    finally { setSaving(false) }
  }

  const total = items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.qty_ordered) || 0), 0)

  return (
    <Modal open={open} onClose={onClose} size="wide" title="Novo Pedido de Matéria-Prima/Chapas"
      subtitle="1) Escolha o fornecedor  2) Marque os produtos  3) Preencha as quantidades na lista da direita"
      footer={<>
        <span className="mr-auto text-sm font-bold text-slate-700">
          {items.length} item{items.length !== 1 ? 's' : ''} · Total estimado: {fmtPreco(total)}
        </span>
        <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={handleSave} className="btn-primary" disabled={saving || items.length === 0}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Salvando...' : 'Criar pedido'}
        </button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Nome do pedido</label>
            <input className="input" placeholder={supplierId ? `Ex: Chapas ${suppliers.find(s => s.id === supplierId)?.name || ''} — setembro` : 'Ex: Chapas Duratex — setembro'}
              value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />
            <p className="text-[11px] text-slate-400 mt-1">Vai como descrição da conta ao registrar no Financeiro.</p>
          </div>
          <div>
            <label className="form-label">Fornecedor (opcional)</label>
            <SupplierPicker suppliers={suppliers} value={supplierId} onChange={handleSupplierChange} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Catálogo — busca + marcar */}
          <div className="border border-slate-200 rounded-2xl flex flex-col min-h-0">
            <div className="p-3 border-b border-slate-100 flex flex-col gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input className="input pl-9" placeholder="Buscar produto (ex: petg, cortiça, caixa...)" value={search}
                  onChange={e => setSearch(e.target.value)} autoFocus />
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {categories.length > 0 && (
                  <select className="select py-1.5 text-xs w-auto" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                    <option value="">Todas as categorias</option>
                    {categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                )}
                {supplierHasLinks && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                    <input type="checkbox" className="accent-rose-500" checked={onlySupplier} onChange={e => setOnlySupplier(e.target.checked)} />
                    Só produtos deste fornecedor
                  </label>
                )}
                <span className="ml-auto text-[11px] text-slate-400">{catalog.length} produto{catalog.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[45vh] p-1.5">
              {catalog.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Nenhum produto encontrado</p>
              ) : catalog.map(m => {
                const checked = selectedIds.has(m.id)
                const low = m.stock_min != null && Number(m.stock_qty) <= Number(m.stock_min)
                return (
                  <button key={m.id} type="button" onClick={() => toggleMaterial(m)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition ${checked ? 'bg-rose-50' : 'hover:bg-slate-50'}`}>
                    <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-rose-500 border-rose-500' : 'border-slate-300 bg-white'}`}>
                      {checked && <Check size={13} className="text-white" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm truncate ${checked ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>{m.name}</span>
                      <span className="block text-[11px] text-slate-400 truncate">
                        {m.category?.name ? `${m.category.name} · ` : ''}{m.unit} · estoque <span className={low ? 'text-amber-600 font-semibold' : ''}>{Number(m.stock_qty).toLocaleString('pt-BR')}{low ? ' (baixo)' : ''}</span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selecionados — quantidade e preço já na lista */}
          <div className="border border-slate-200 rounded-2xl flex flex-col min-h-0 bg-slate-50/40">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">Itens do pedido <span className="text-slate-400 font-normal">({items.length})</span></p>
              {items.length > 0 && <button type="button" onClick={() => setItems([])} className="text-[11px] font-semibold text-slate-400 hover:text-rose-500">Limpar</button>}
            </div>
            <div className="overflow-y-auto max-h-[45vh] p-2 flex flex-col gap-2">
              {items.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <Package size={28} strokeWidth={1} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-400">Marque os produtos na lista ao lado — eles aparecem aqui pra você preencher a quantidade.</p>
                </div>
              ) : items.map(it => {
                const m = materialById(it.raw_material_id)
                const sub = (Number(it.unit_price) || 0) * (Number(it.qty_ordered) || 0)
                const noQty = !(Number(it.qty_ordered) > 0)
                return (
                  <div key={it.raw_material_id} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-slate-700 min-w-0 truncate">{m?.name}</p>
                      <button type="button" onClick={() => removeItem(it.raw_material_id)} className="p-1 -m-1 text-slate-300 hover:text-rose-500 shrink-0"><Trash2 size={14} /></button>
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase">Qtd ({m?.unit})</label>
                        <input type="number" min="0.001" step="0.001" inputMode="decimal" placeholder="0"
                          className={`input py-1.5 ${noQty ? 'border-amber-300 bg-amber-50/40' : ''}`}
                          value={it.qty_ordered} onChange={e => updateItem(it.raw_material_id, 'qty_ordered', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase">Preço un. (R$)</label>
                        <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="opcional" className="input py-1.5"
                          value={it.unit_price} onChange={e => updateItem(it.raw_material_id, 'unit_price', e.target.value)} />
                      </div>
                      <div className="text-right pb-2 min-w-[80px]">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Subtotal</p>
                        <p className="text-sm font-bold text-slate-700">{fmtPreco(sub)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

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
          <p className="text-sm font-bold text-slate-800">{order.title || order.supplier?.name || 'Sem fornecedor definido'}</p>
          {order.title && (
            <p className="text-xs text-slate-500 flex items-center gap-1"><Truck size={11} /> {order.supplier?.name || 'Sem fornecedor definido'}</p>
          )}
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
        // Quantidade na frente do nome, lista compacta (pedido do Raphael, 26/09)
        <div className="mb-3 mt-2 bg-slate-50 rounded-xl divide-y divide-slate-100 max-w-3xl">
          {(order.items || []).map(it => (
            <div key={it.id} className="flex items-baseline gap-3 text-xs px-3 py-1.5">
              <span className="w-20 shrink-0 text-right font-bold text-slate-800 tabular-nums">{fmtQty(it.qty_ordered, it.raw_material?.unit)}</span>
              <span className="text-slate-700 min-w-0 flex-1">
                {it.raw_material?.name}
                {it.qty_received != null && <span className="text-slate-400"> · recebido {fmtQty(it.qty_received, it.raw_material?.unit)}</span>}
                {Number(it.qty_damaged) > 0 && <span className="text-rose-500 font-semibold"> · {fmtQty(it.qty_damaged, it.raw_material?.unit)} avariado</span>}
              </span>
              {it.unit_price != null && (
                <span className="shrink-0 text-slate-400 tabular-nums">{fmtPreco(it.unit_price)} un. · <b className="text-slate-600">{fmtPreco(Number(it.unit_price) * Number(it.qty_ordered))}</b></span>
              )}
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
  const { orders, loading, refetch, createOrder, linkBill, cancelOrder, resolveOccurrence } = useMaterialOrders()
  // Aba via URL (?aba=conferencias) — o antigo /relatorio-conferencias redireciona pra cá
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('aba') === 'conferencias' ? 'conferencias' : 'pedidos'
  function changeTab(t) {
    setSearchParams(t === 'conferencias' ? { aba: 'conferencias' } : {}, { replace: true })
    // A aba de conferências pode ter resolvido ocorrência — recarrega os pedidos ao voltar
    if (t === 'pedidos') refetch()
  }
  const pendingCount = orders.filter(o => o.status === 'pedido').length
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
      description:  billOrder.title || `Matéria-prima${billOrder.supplier?.name ? ' — ' + billOrder.supplier.name : ''}`,
      notes:        itemsDesc,
      supplier_id:  billOrder.supplier_id || '',
      amount:       orderTotal(billOrder),
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
        {tab === 'pedidos' && (
          <button onClick={() => setModal(true)} className="btn-primary">
            <Plus size={16} /> Novo pedido
          </button>
        )}
      </div>

      <div className="flex bg-slate-100 rounded-xl p-1 self-start">
        <button onClick={() => changeTab('pedidos')} className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-1.5 transition ${tab === 'pedidos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Package size={15} /> Pedidos
          {pendingCount > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{pendingCount} aguardando</span>}
        </button>
        <button onClick={() => changeTab('conferencias')} className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-1.5 transition ${tab === 'conferencias' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <ClipboardCheck size={15} /> Conferências
        </button>
      </div>

      {tab === 'conferencias' ? (
        <ConferenceReport />
      ) : loading ? (
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
