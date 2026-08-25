import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingBag, Upload, Package, User, MapPin, Plus,
  ChevronDown, ChevronUp, ChevronRight, Search, X, Check,
  Truck, CheckCircle2, Clock, AlertCircle, FileText,
  RefreshCw, ExternalLink, History, Filter, Pencil, Trash2, XCircle,
  Radio, PackageX, PackageSearch, PackageCheck,
} from 'lucide-react'
import { useOrders, fetchImportEvents, checkBatchBeforeDelete, deleteBatchOrders } from './hooks/useOrders'
import { FeiraCombinadaModal } from './FeiraCombinadaModal'
import { MercadoLivreConnect } from './MercadoLivreConnect'
import toast from 'react-hot-toast'
import { OrdersReportsTab } from './OrdersReportsTab'
import { useProducts }  from '../products/hooks/useProducts'
import { EmptyState }   from '../../components/ui/EmptyState'
import { useAuth }      from '../../contexts/AuthContext'

// ─── Helpers ─────────────────────────────────────────────────────
function fmtPreco(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function fmtTimeOnly(d) {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Chave de dia pro Histórico — respeita o corte real do ML (11h de
// Brasília, não meia-noite): pedido sincronizado às 23h já conta pro
// "dia" seguinte, mesma regra usada pra decidir o lote (useOrders.js /
// ml-process-webhook). Shopee e manual continuam pelo dia de calendário puro.
function pickDayKey(dateStr, source) {
  const d = new Date(dateStr)
  if (source === 'ml' && d.getHours() >= 11) d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayGroupLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const dOnly = new Date(d); dOnly.setHours(0, 0, 0, 0)
  if (dOnly.getTime() === today.getTime()) return 'Hoje'
  if (dOnly.getTime() === yesterday.getTime()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

function getStatusCfg(estado) {
  const e = (estado || '').toLowerCase()
  if (e.includes('cancelad'))     return { label: 'Cancelado',   cls: 'bg-red-50 text-red-700 border border-red-200', icon: XCircle }
  if (e.includes('entregue'))     return { label: 'Entregue',    cls: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 }
  if (e.includes('a caminho'))    return { label: 'A caminho',   cls: 'bg-sky-50 text-sky-700',         icon: Truck }
  if (e.includes('processando'))  return { label: 'Processando', cls: 'bg-amber-50 text-amber-700',     icon: RefreshCw }
  if (e.includes('pacote'))       return { label: 'Pacote',      cls: 'bg-purple-50 text-purple-700',   icon: Package }
  if (e.includes('nf-e'))         return { label: 'Emitir NF-e', cls: 'bg-orange-50 text-orange-700',   icon: FileText }
  if (e.includes('enviar'))       return { label: 'Ag. envio',   cls: 'bg-slate-100 text-slate-600',    icon: Clock }
  if (e === 'manual')             return { label: 'Manual',      cls: 'bg-slate-100 text-slate-600',    icon: Package }
  return { label: estado || '—', cls: 'bg-slate-100 text-slate-500', icon: Clock }
}

function StatusBadge({ estado }) {
  const { label, cls, icon: Icon } = getStatusCfg(estado)
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${cls}`}>
      <Icon size={10} />{label}
    </span>
  )
}

// ─── Modal: Pedido manual ─────────────────────────────────────────
function ManualOrderModal({ open, onClose, onSave, onDelete, products, initialData }) {
  const isEditing = !!initialData
  const [comprador,   setComprador]   = useState('')
  const [notes,       setNotes]       = useState('')
  const [items,       setItems]       = useState([])
  const [search,      setSearch]      = useState('')
  const [totalValue,  setTotalValue]  = useState('')
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)

  useEffect(() => {
    if (!open) return
    if (initialData) {
      setComprador(initialData.comprador || '')
      setNotes(initialData.notes || initialData.observacoes || '')
      setTotalValue(initialData.total_value
        ? Number(initialData.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '')
      // Mapeia os items do pedido para o formato do modal
      setItems((initialData.items || []).map(it => ({
        product_id: it.product_id || it.id || Math.random().toString(36),
        titulo:     it.titulo,
        sku:        it.sku || '',
        qty:        it.qty || 1,
        _item_id:   it.id, // id real do order_item para update
      })))
    } else {
      setComprador(''); setItems([]); setNotes(''); setTotalValue('')
    }
    setSearch('')
  }, [open, initialData])

  const filtered = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return products.filter(p => p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q))
  }, [products, search])

  function addProduct(p) {
    const ex = items.find(i => i.product_id === p.id)
    if (ex) setItems(prev => prev.map(i => i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i))
    else    setItems(prev => [...prev, { product_id: p.id, titulo: p.name, sku: p.sku, qty: 1 }])
    setSearch('')
  }

  async function handleSave() {
    if (!comprador.trim() || items.length === 0) return
    setSaving(true)
    const tv = totalValue
      ? parseFloat(totalValue.replace(/\./g, '').replace(',', '.'))
      : null
    try { await onSave({ comprador: comprador.trim(), items, notes, total_value: tv }); onClose() }
    catch {} finally { setSaving(false) }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] border border-slate-100">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 style={{ fontFamily:'Nunito,sans-serif', fontWeight:700, fontSize:'18px' }} className="text-slate-800">
            {isEditing ? 'Editar Pedido Manual' : 'Novo Pedido Manual'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 transition-all">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          <div>
            <label className="form-label">Nome do comprador *</label>
            <input className="input" placeholder="Ex: João da Silva" value={comprador} onChange={e => setComprador(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Buscar produto</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-8" placeholder="Buscar por nome ou SKU..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {filtered.length > 0 && (
              <div className="border border-slate-200 rounded-xl mt-1 shadow-sm max-h-56 overflow-y-auto">
                {filtered.map(p => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate" title={p.name}>{p.name}</p>
                      <p className="text-xs text-slate-400 font-mono">
                        {p.sku || ''}
                        {p.sku && p.notes ? ' | ' : ''}
                        {p.notes || ''}
                      </p>
                    </div>
                    <Plus size={16} className="text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
          {items.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {items.map((it, i) => (
                <div key={it.product_id} className={`flex items-center gap-3 px-4 py-3 ${i < items.length-1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{it.titulo}</p>
                    {it.sku && <p className="text-xs text-slate-400 font-mono">{it.sku}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setItems(prev => prev.map(x => x.product_id===it.product_id ? {...x,qty:Math.max(1,x.qty-1)} : x))}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600">−</button>
                    <span className="w-8 text-center text-sm font-bold text-slate-700">{it.qty}</span>
                    <button onClick={() => setItems(prev => prev.map(x => x.product_id===it.product_id ? {...x,qty:x.qty+1} : x))}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600">+</button>
                  </div>
                  <button onClick={() => setItems(prev => prev.filter(x => x.product_id !== it.product_id))}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="form-label">
              Valor total do pedido (R$)
              <span className="ml-1 text-[10px] font-normal text-slate-400">(opcional — independente dos itens listados)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">R$</span>
              <input
                className="input pl-9"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={totalValue}
                onChange={e => {
                  // Máscara automática: digita só números, formata como R$ brasileiro
                  const digits = e.target.value.replace(/\D/g, '')
                  if (!digits) { setTotalValue(''); return }
                  const num = parseInt(digits, 10) / 100
                  setTotalValue(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
                }}
              />
            </div>
          </div>
          <div>
            <label className="form-label">Observações (opcional)</label>
            <textarea className="textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Urgente, cliente especial, canal de venda..." />
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 flex items-center justify-between gap-2">
          {isEditing ? (
            <button onClick={async () => {
              if (!confirm('Excluir este pedido? Esta ação não pode ser desfeita.')) return
              setDeleting(true)
              try { await onDelete(initialData.id); onClose() }
              catch {} finally { setDeleting(false) }
            }} className="text-xs text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1.5" disabled={deleting}>
              <Trash2 size={13}/> {deleting ? 'Excluindo...' : 'Excluir pedido'}
            </button>
          ) : <div/>}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
            <button onClick={handleSave} className="btn-primary"
              disabled={saving || !comprador.trim() || items.length === 0}>
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Check size={15}/> {isEditing ? 'Salvar alterações' : 'Criar pedido'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Estilo por plataforma (cores usadas em toda a lista de pedidos) ─
function platformStyle(source) {
  if (source === 'ml') return {
    label: '🛒 Mercado Livre',
    emoji:  '🛒',
    border: 'border-l-4 border-l-amber-400',
    badge:  'bg-amber-100 text-amber-800',
    icon:   'bg-amber-100 text-amber-700',
    wash:   'bg-amber-50/40',
  }
  if (source === 'shopee') return {
    label: '🛍️ Shopee',
    emoji:  '🛍️',
    border: 'border-l-4 border-l-orange-500',
    badge:  'bg-orange-100 text-orange-700',
    icon:   'bg-orange-100 text-orange-600',
    wash:   'bg-orange-50/40',
  }
  return {
    label: '✍️ Manual',
    emoji:  '✍️',
    border: 'border-l-4 border-l-slate-600',
    badge:  'bg-slate-200 text-slate-700',
    icon:   'bg-slate-200 text-slate-700',
    wash:   '',
  }
}

// ─── Card de pedido ───────────────────────────────────────────────
function OrderCard({ order, idx, onEdit, canSeeValues, isNew }) {
  const [open, setOpen] = useState(false)
  const items       = order.items ?? []
  const totalUnits  = items.reduce((a, it) => a + (it.qty || 1), 0)
  const ps          = platformStyle(order.source)
  const isManual    = order.source === 'manual'
  const isCancelled = (order.status_ml || '').toLowerCase().includes('cancelad')
  const isFull      = !!order.is_full

  return (
    <div className={`card overflow-hidden transition-all hover:shadow-md ${isCancelled ? 'border-l-4 border-l-red-500 bg-red-50/30' : isFull ? 'border-l-4 border-l-indigo-400 bg-indigo-50/30' : `${ps.border} ${ps.wash}`} ${isNew ? 'ring-2 ring-emerald-300 ring-offset-2' : ''}`}
      style={isNew ? { animation: 'order-pop .5s ease' } : undefined}>
      <style>{`@keyframes order-pop { 0% { transform: scale(.98); } 40% { transform: scale(1.008); } 100% { transform: scale(1); } }`}</style>
      {!isCancelled && isFull && (
        <div className="-mt-5 -mx-5 mb-3 flex items-center gap-2 bg-indigo-100 text-indigo-800 text-xs font-bold px-5 py-2" title="Estoque e despacho ficam com o Mercado Livre — não entra em nenhum picklist">
          📫 Pedido Full — o Mercado Livre separa e despacha sozinho, não entra em nenhum picklist
        </div>
      )}
      <div className="flex items-center gap-4 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base ${isCancelled ? 'bg-red-100 text-red-600' : isFull ? 'bg-indigo-100 text-indigo-600' : ps.icon}`}>
          {isCancelled ? <XCircle size={16}/> : isFull ? '📫' : ps.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ps.badge}`}>{ps.label}</span>
            {isNew && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white flex items-center gap-1">
                <Radio size={9}/> Novo agora
              </span>
            )}
            <span className="text-sm font-bold text-slate-800">{order.comprador || 'Comprador não identificado'}</span>
            {order.is_pacote && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">📦 Pacote</span>}
            <StatusBadge estado={order.status_ml || order.source} />
            {isCancelled && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">🚫 Não entra no picklist</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {order.num_venda && <span className="text-xs text-slate-400 font-mono">#{order.num_venda.slice(-8)}</span>}
            <span className="text-xs text-slate-400">{fmtDateTime(order.data_venda)}</span>
            {order.cidade && <span className="text-xs text-slate-400 flex items-center gap-1"><MapPin size={10}/>{order.cidade}, {order.estado_uf}</span>}
          </div>
        </div>
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-sm font-bold text-slate-700">{totalUnits} {totalUnits===1?'item':'itens'}</p>
          {canSeeValues && (order.total_value > 0
            ? <p className="text-xs font-semibold text-emerald-600">{fmtPreco(order.total_value)}</p>
            : order.total_brl > 0
              ? <p className="text-xs text-slate-400">{fmtPreco(order.total_brl)}</p>
              : null
          )}
        </div>
        {isManual && (
          <button
            onClick={e => { e.stopPropagation(); onEdit(order) }}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-violet-500 transition-colors shrink-0"
            title="Editar pedido">
            <Pencil size={14}/>
          </button>
        )}
        {open ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
      </div>

      {open && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Itens do pedido</p>
            </div>
            <div className="max-h-56 overflow-y-auto">
            {items.map((it, j) => (
              <div key={j} className={`flex items-center gap-3 px-4 py-3 ${j < items.length-1 ? 'border-b border-slate-50' : ''}`}>
                <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0 text-sm">📦</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 leading-tight">{it.titulo}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {it.sku && <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{it.sku}</span>}
                    {it.variacao && <span className="text-[10px] text-slate-400">{it.variacao.replace(/^[^:]+:\s*/, '')}</span>}
                    {it.sku_encontrado === false && (
                      <span className="flex items-center gap-1 text-[10px] font-bold bg-red-50 text-red-600 px-1.5 py-0.5 rounded" title="Este SKU não foi encontrado no sistema — confira o cadastro do produto">
                        <AlertCircle size={10}/> SKU não encontrado
                      </span>
                    )}
                  </div>
                  {it.obs_item && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1 inline-block">
                      ⚠ {it.obs_item}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-700">{it.qty}x</p>
                  {it.preco_unit > 0 && <p className="text-xs text-slate-400">{fmtPreco(it.preco_unit)}</p>}
                </div>
              </div>
            ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {order.comprador && (
              <div className="flex items-start gap-2 bg-slate-50 rounded-xl px-4 py-3">
                <User size={14} className="text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400 font-semibold mb-0.5">Comprador</p>
                  <p className="text-sm font-semibold text-slate-700">{order.comprador}</p>
                  {order.cidade && <p className="text-xs text-slate-400">{order.cidade}, {order.estado_uf}{order.cep ? ` — ${order.cep}` : ''}</p>}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {order.status_desc && order.status_desc.trim() && (
                <div className="flex items-start gap-2 bg-sky-50 rounded-xl px-4 py-3">
                  <Truck size={14} className="text-sky-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-sky-700">{order.status_desc}</p>
                </div>
              )}
              {order.num_venda && order.source === 'ml' && (
                <a href={`https://www.mercadolivre.com.br/vendas/${order.num_venda}`} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs font-bold text-blue-700 bg-yellow-400 px-3 py-2 rounded-xl hover:bg-yellow-300 transition-colors"
                  onClick={e => e.stopPropagation()}>
                  <ExternalLink size={12}/> Ver no Mercado Livre
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export function OrdersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canSeeValues = user?.role === 'admin'
  const { orders, batches, loading, importing, newOrderIds, live, fetchOrders, fetchBatches, importAuto, createManualOrder } = useOrders()
  const [importEvents, setImportEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [openDays, setOpenDays] = useState(() => {
    const now = new Date()
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return new Set([todayKey])
  })
  function toggleDay(dayKey) {
    setOpenDays(prev => {
      const next = new Set(prev)
      next.has(dayKey) ? next.delete(dayKey) : next.add(dayKey)
      return next
    })
  }
  const [feiraModal, setFeiraModal] = useState(null) // { targetDate, batchIds, dayLabel } ou null
  const [deleteModal, setDeleteModal] = useState(null) // { batchId, source, filename } ou null
  const [deleteInfo, setDeleteInfo] = useState(null) // resultado de checkBatchBeforeDelete
  const [deleting, setDeleting] = useState(false)

  async function openDeleteModal(batchId, source, filename) {
    setDeleteModal({ batchId, source, filename })
    setDeleteInfo(null)
    try {
      const info = await checkBatchBeforeDelete(batchId)
      setDeleteInfo(info)
    } catch (err) {
      toast.error('Erro ao verificar o lote: ' + err.message)
      setDeleteModal(null)
    }
  }

  async function confirmDeleteBatch() {
    if (!deleteModal) return
    setDeleting(true)
    try {
      const result = await deleteBatchOrders(deleteModal.batchId)
      toast.success(`${result.deletedCount} pedido(s) apagado(s). Diretores foram avisados.`)
      setDeleteModal(null)
      await fetchBatches()
      const events = await fetchImportEvents()
      setImportEvents(events)
    } catch (err) {
      toast.error('Erro ao apagar: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  // Lotes de ANTES da tabela import_events existir não têm evento registrado
  // — reconstrói um evento "sintético" a partir do próprio lote, pra eles
  // não sumirem do histórico.
  const allImportEvents = useMemo(() => {
    const eventedBatchIds = new Set(importEvents.map(ev => ev.batch_id))
    const legacyEvents = batches
      .filter(b => !eventedBatchIds.has(b.id))
      .map(b => ({
        id: `legacy-${b.id}`, batch_id: b.id, source: b.source,
        filename: b.filename, imported_at: b.imported_at,
        total_orders_file: b.total_orders, new_orders_count: null,
        total_items_file: b.total_items,
      }))
    return [...importEvents, ...legacyEvents]
  }, [importEvents, batches])
  const { products } = useProducts()
  const [manualOpen,    setManualOpen]    = useState(false)
  const [editOpen,      setEditOpen]      = useState(false)
  const [editingOrder,  setEditingOrder]  = useState(null)
  const [view,          setView]          = useState('orders')

  useEffect(() => {
    if (view === 'history') {
      setLoadingEvents(true)
      fetchImportEvents().then(setImportEvents).finally(() => setLoadingEvents(false))
    }
  }, [view])

  const [search,        setSearch]        = useState('')
  const [filterSrc,     setFilterSrc]     = useState('')
  const [filterAtt,     setFilterAtt]     = useState('') // '' | 'cancelado' | 'sem_sku' | 'pendente'
  const fileRef = useRef()

  useEffect(() => { fetchOrders(); fetchBatches() }, [])

  const [duplicateInfo, setDuplicateInfo] = useState(null) // { existingBatch, file }

  async function handleFile(file) {
    if (!file) return
    const result = await importAuto(file)
    if (result?.duplicate) {
      setDuplicateInfo({ existingBatch: result.existingBatch, file })
    }
  }

  async function confirmForceImport() {
    if (!duplicateInfo) return
    const file = duplicateInfo.file
    setDuplicateInfo(null)
    await importAuto(file, { force: true })
  }

  const isCancelledOrder = o => (o.status_ml || '').toLowerCase().includes('cancelad')
  const isFullOrder      = o => !!o.is_full
  const isSemSkuOrder    = o => (o.items || []).some(it => it.sku_encontrado === false)
  // Full nunca é "pendente de separar" — a CoisaPet não separa esse pedido,
  // o ML despacha sozinho (ver supabase/fase17-pedidos-full.sql)
  const isPendenteOrder  = o => !isCancelledOrder(o) && !isFullOrder(o) && (o.items || []).length > 0 && (o.items || []).some(it => !it.picked)

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (filterSrc && o.source !== filterSrc) return false
      if (filterAtt === 'cancelado' && !isCancelledOrder(o)) return false
      if (filterAtt === 'full'      && !isFullOrder(o))      return false
      if (filterAtt === 'sem_sku'   && !isSemSkuOrder(o))    return false
      if (filterAtt === 'pendente'  && !isPendenteOrder(o))  return false
      if (search) {
        const q = search.toLowerCase()
        const ok = (o.comprador||'').toLowerCase().includes(q)
          || (o.num_venda||'').includes(q)
          || (o.items||[]).some(it => (it.titulo||'').toLowerCase().includes(q) || (it.sku||'').toLowerCase().includes(q))
        if (!ok) return false
      }
      return true
    })
  }, [orders, search, filterSrc, filterAtt])

  const attentionCounts = useMemo(() => ({
    cancelado: orders.filter(isCancelledOrder).length,
    full:      orders.filter(isFullOrder).length,
    sem_sku:   orders.filter(isSemSkuOrder).length,
    pendente:  orders.filter(isPendenteOrder).length,
  }), [orders])

  const hasActiveFilter = !!(search || filterSrc || filterAtt)

  // KPIs sempre refletem o recorte atual (filtro de plataforma + busca)
  const totalUnits = filtered.reduce((a, o) => a + (o.items||[]).reduce((b, it) => b + (it.qty||1), 0), 0)

  // ── Paginação client-side ─────────────────────────────────────────
  const PAGE_SIZE = 10
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [search, filterSrc, filterAtt])
  const pageCount  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe   = Math.min(page, pageCount)
  const paginated  = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  const platformCounts = {
    ml:     orders.filter(o => o.source === 'ml').length,
    shopee: orders.filter(o => o.source === 'shopee').length,
    manual: orders.filter(o => o.source === 'manual').length,
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="page-title">Pedidos</h2>
            {live && (
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full" title="A lista atualiza sozinha quando chega um pedido novo">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Ao vivo
              </span>
            )}
          </div>
          <p className="page-subtitle">Histórico de pedidos importados e manuais</p>
        </div>
        <div className="flex items-center gap-2">
          {canSeeValues && <MercadoLivreConnect />}
          <button onClick={() => setManualOpen(true)} className="btn-secondary">
            <Plus size={16}/> Pedido manual
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="btn-primary">
            {importing
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Importando...</>
              : <><Upload size={16}/> Importar pedidos</>
            }
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { handleFile(e.target.files[0]); e.target.value = '' }} />
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        {[
          ['orders','📋 Pedidos'],
          ...(canSeeValues ? [['reports','📊 Relatórios']] : []),
          ['history','🕐 Histórico de importações'],
        ].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${view===v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            style={{ fontFamily:'Nunito,sans-serif' }}>
            {label}
          </button>
        ))}
      </div>

      {view === 'reports' && canSeeValues ? (
        <OrdersReportsTab />
      ) : view === 'orders' ? (
        <>
          {/* Alerta de SKUs não encontrados */}
          {(() => {
            const semSku = orders.flatMap(o => (o.items||[]).filter(it => it.sku_encontrado === false))
            if (semSku.length === 0) return null
            return (
              <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <AlertCircle size={18} className="text-red-500 shrink-0" />
                <p className="text-sm text-red-700">
                  <strong>{semSku.length}</strong> item(ns) importado(s) com SKU que não bate com nenhum produto do sistema.
                  Abra o pedido correspondente pra conferir o cadastro.
                </p>
              </div>
            )
          })()}

          {/* KPIs */}
          {orders.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="card py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-xl">🛒</div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                    Pedidos{hasActiveFilter && <span className="text-[9px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-full">filtrado</span>}
                  </p>
                  <p className="text-2xl font-black text-slate-800" style={{ fontFamily:'Nunito,sans-serif' }}>{filtered.length}</p>
                </div>
              </div>
              <div className="card py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                  <Package size={20} className="text-rose-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold">Itens</p>
                  <p className="text-2xl font-black text-slate-800" style={{ fontFamily:'Nunito,sans-serif' }}>{totalUnits}</p>
                </div>
              </div>
              <div className="card py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                  <Truck size={18} className="text-sky-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold">A caminho</p>
                  <p className="text-2xl font-black text-slate-800" style={{ fontFamily:'Nunito,sans-serif' }}>
                    {filtered.filter(o => (o.status_ml||'').toLowerCase().includes('caminho')).length}
                  </p>
                </div>
              </div>
              <div className="card py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold">Entregues</p>
                  <p className="text-2xl font-black text-slate-800" style={{ fontFamily:'Nunito,sans-serif' }}>
                    {filtered.filter(o => (o.status_ml||'').toLowerCase().includes('entregue')).length}
                  </p>
                </div>
              </div>
              {canSeeValues && orders.some(o => o.total_value > 0) && (
                <div className="card py-4 flex items-center gap-3 col-span-2 lg:col-span-1">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 text-xl">💰</div>
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">Faturamento declarado</p>
                    <p className="text-lg font-black text-emerald-700" style={{ fontFamily:'Nunito,sans-serif' }}>
                      {fmtPreco(filtered.reduce((a, o) => a + (parseFloat(o.total_value) || 0), 0))}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Filtros */}
          {orders.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-8" placeholder="Buscar por comprador, nº pedido ou produto..."
                    value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                  {[
                    { key: '',       label: 'Todas',       count: orders.length },
                    { key: 'ml',     label: '🛒 ML',        count: platformCounts.ml },
                    { key: 'shopee', label: '🛍️ Shopee',    count: platformCounts.shopee },
                    { key: 'manual', label: '✍️ Manual',    count: platformCounts.manual },
                  ].map(opt => (
                    <button key={opt.key || 'all'} onClick={() => setFilterSrc(opt.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        filterSrc === opt.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}>
                      {opt.label}
                      <span className={`text-[10px] px-1.5 rounded-full ${filterSrc === opt.key ? 'bg-slate-100 text-slate-500' : 'bg-white/60 text-slate-400'}`}>
                        {opt.count}
                      </span>
                    </button>
                  ))}
                </div>
                {hasActiveFilter && (
                  <button onClick={() => { setSearch(''); setFilterSrc(''); setFilterAtt('') }}
                    className="text-xs text-rose-500 font-semibold shrink-0">Limpar filtros</button>
                )}
              </div>

              {/* Filtro por atenção — o que precisa de ação, não só quantidade */}
              {(attentionCounts.cancelado + attentionCounts.full + attentionCounts.sem_sku + attentionCounts.pendente) > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Precisa de atenção:</span>
                  {[
                    { key: 'cancelado', label: 'Cancelados',       count: attentionCounts.cancelado, icon: XCircle,        cls: 'bg-red-50 text-red-700 border-red-100' },
                    { key: 'full',      label: 'Full (ML despacha)', count: attentionCounts.full,     icon: PackageCheck,   cls: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
                    { key: 'sem_sku',   label: 'Sem SKU',          count: attentionCounts.sem_sku,    icon: PackageSearch,  cls: 'bg-amber-50 text-amber-700 border-amber-100' },
                    { key: 'pendente',  label: 'Não separado',     count: attentionCounts.pendente,   icon: PackageX,       cls: 'bg-sky-50 text-sky-700 border-sky-100' },
                  ].filter(opt => opt.count > 0).map(opt => (
                    <button key={opt.key} onClick={() => setFilterAtt(prev => prev === opt.key ? '' : opt.key)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                        filterAtt === opt.key ? opt.cls : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}>
                      <opt.icon size={11}/> {opt.label} <span className="opacity-70">{opt.count}</span>
                    </button>
                  ))}
                </div>
              )}

              <p className="text-xs text-slate-400">
                {filtered.length} pedido(s) encontrado(s)
                {pageCount > 1 && <> — página {pageSafe} de {pageCount}</>}
              </p>
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <div className="card flex justify-center py-16">
              <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div
              className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all border-slate-200 hover:border-yellow-400 hover:bg-yellow-50 bg-slate-50"
              onClick={() => fileRef.current?.click()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
              onDragOver={e => e.preventDefault()}
            >
              <div className="w-16 h-16 bg-yellow-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Upload size={28} className="text-blue-900" />
              </div>
              <p className="text-base font-bold text-slate-700 mb-1">Importar relatório do Mercado Livre ou Shopee</p>
              <p className="text-sm text-slate-400 mb-4">Clique ou arraste o arquivo .xlsx exportado do painel do ML ou da Shopee — a plataforma é detectada automaticamente</p>
              <p className="text-xs text-slate-400">Ou use "+ Pedido manual" para lançar manualmente</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {paginated.map((order, idx) => (
                  <OrderCard key={order.id} order={order} idx={(pageSafe - 1) * PAGE_SIZE + idx}
                    onEdit={o => { setEditingOrder(o); setEditOpen(true) }} canSeeValues={canSeeValues}
                    isNew={newOrderIds.has(order.id)} />
                ))}
              </div>

              {/* Paginação */}
              {pageCount > 1 && (
                <div className="flex items-center justify-center gap-1.5 pt-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={pageSafe === 1}
                    className="w-8 h-8 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >‹</button>

                  {Array.from({ length: pageCount }, (_, i) => i + 1)
                    .filter(n => n === 1 || n === pageCount || Math.abs(n - pageSafe) <= 1)
                    .reduce((acc, n) => {
                      if (acc.length > 0 && n - acc[acc.length - 1] > 1) acc.push('…')
                      acc.push(n)
                      return acc
                    }, [])
                    .map((n, i) => n === '…' ? (
                      <span key={`gap-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-slate-300">…</span>
                    ) : (
                      <button key={n} onClick={() => setPage(n)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                          n === pageSafe ? 'bg-rose-400 text-white' : 'text-slate-500 hover:bg-slate-100'
                        }`}>
                        {n}
                      </button>
                    ))}

                  <button
                    onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                    disabled={pageSafe === pageCount}
                    className="w-8 h-8 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >›</button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        /* Histórico de importações — agrupado por dia */
        <div className="flex flex-col gap-5">
          {!loadingEvents && allImportEvents.length > 0 && (
            <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-800">
                <strong>Sem risco de duplicar:</strong> o mesmo pedido nunca cria dois registros, venha ele pela API ou pelo <code className="bg-white/60 px-1 rounded">.xlsx</code> — o sistema reconhece pelo número de venda e só atualiza (nunca duplica). Abaixo, <span className="font-bold">🔄 Automático</span> = veio pela API, <span className="font-bold">📄 Arquivo</span> = importado manualmente.
              </p>
            </div>
          )}
          {loadingEvents ? (
            <div className="card flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" />
            </div>
          ) : allImportEvents.length === 0 ? (
            <div className="card">
              <EmptyState icon={History} title="Nenhuma importação ainda" description="Importe um arquivo do ML ou Shopee para ver o histórico." />
            </div>
          ) : (
            (() => {
              // Agrupa os eventos por dia — ML respeita o corte das 11h,
              // então um mesmo lote pode ter uploads "de madrugada" que
              // ainda contam pro dia anterior
              const dayMap = {}
              allImportEvents.forEach(ev => {
                const dayKey = pickDayKey(ev.imported_at, ev.source)
                if (!dayMap[dayKey]) dayMap[dayKey] = []
                dayMap[dayKey].push(ev)
              })
              const days = Object.keys(dayMap).sort((a, b) => b.localeCompare(a))

              return days.map(dayKey => {
                const dayEvents = dayMap[dayKey]
                // Dentro do dia, agrupa por fonte (ml/shopee/manual) — cada
                // fonte compartilha o mesmo lote no dia
                const bySource = {}
                dayEvents.forEach(ev => {
                  if (!bySource[ev.source]) bySource[ev.source] = []
                  bySource[ev.source].push(ev)
                })
                const isOpen = openDays.has(dayKey)

                return (
                  <div key={dayKey} className="border-2 border-slate-100 rounded-2xl overflow-hidden">
                    <div className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-50 transition-colors">
                      <button onClick={() => toggleDay(dayKey)} className="flex-1 flex items-center gap-3 text-left">
                        <p className="text-sm font-black text-slate-500 uppercase tracking-wide">
                          {dayGroupLabel(dayKey)}
                        </p>
                      </button>
                      <div className="flex items-center gap-3">
                        {(bySource.ml || bySource.shopee) && (
                          <button onClick={() => setFeiraModal({
                            targetDate: dayKey,
                            batchIds: [bySource.ml?.[0]?.batch_id, bySource.shopee?.[0]?.batch_id].filter(Boolean),
                            dayLabel: dayGroupLabel(dayKey),
                          })}
                            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors">
                            🛒 Feira Combinada
                          </button>
                        )}
                        <span className="text-xs text-slate-400">
                          {dayEvents.length} upload{dayEvents.length !== 1 ? 's' : ''} · {Object.keys(bySource).length} plataforma{Object.keys(bySource).length !== 1 ? 's' : ''}
                        </span>
                        <button onClick={() => toggleDay(dayKey)}>
                          {isOpen
                            ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
                            : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                    <div className="flex flex-col gap-4 px-4 pb-4">

                    {Object.entries(bySource).map(([source, events]) => {
                      // Ordena do mais antigo pro mais novo (linha do tempo)
                      const sorted = [...events].sort((a, b) => new Date(a.imported_at) - new Date(b.imported_at))
                      const b = batches.find(bt => bt.id === sorted[0].batch_id)
                      const totalNovos = sorted.reduce((s, e) => s + (e.new_orders_count || 0), 0)
                      const ps = platformStyle(source)

                      // Raio-x real do lote (não só a contagem bruta) — calculado em
                      // cima dos pedidos já carregados (os 200 mais recentes). Pra
                      // lote muito antigo, fora dessa janela, stats fica null e a
                      // tela cai de volta pro resumo simples.
                      const batchOrders = orders.filter(o => o.batch_id === b?.id)
                      const stats = b && batchOrders.length > 0 ? {
                        total:      batchOrders.length,
                        cancelado:  batchOrders.filter(isCancelledOrder).length,
                        full:       batchOrders.filter(isFullOrder).length,
                        semSku:     batchOrders.filter(isSemSkuOrder).length,
                      } : null
                      const picklistReady = stats ? stats.total - stats.cancelado - stats.full : null

                      return (
                        <div key={source} className="bg-slate-50/70 rounded-xl p-3.5 flex flex-col gap-3">
                          {/* Cabeçalho da fonte — totais atuais + ações */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base ${ps.icon}`}>
                              {ps.emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-700">
                                {source==='ml' ? 'Mercado Livre' : source==='shopee' ? 'Shopee' : 'Manual'}
                              </p>
                              <p className="text-xs text-slate-400">
                                {b?.total_orders ?? '—'} pedido(s) no total · {b?.total_items ?? '—'} item(ns) · {sorted.length} upload{sorted.length !== 1 ? 's' : ''} hoje
                              </p>
                            </div>
                            {b && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <button onClick={() => { setView('orders'); fetchOrders({ batchId: b.id }) }}
                                  className="btn-secondary text-xs py-1.5">
                                  Ver pedidos
                                </button>
                                {source !== 'manual' && (
                                  <>
                                    <button onClick={() => navigate(`/pick-list?batch=${b.id}`)}
                                      className="btn-primary text-xs py-1.5">
                                      🖨️ Gerar Picklist
                                    </button>
                                    <button onClick={() => navigate(`/pick-list/virtual?batch=${b.id}`)}
                                      className="text-xs py-1.5 px-3 rounded-xl font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors">
                                      📱 Picklist Virtual
                                    </button>
                                    <button onClick={() => window.open(`${import.meta.env.PROD ? '/sistema' : ''}/expedicao?batch=${b.id}`, '_blank')}
                                      className="text-xs py-1.5 px-3 rounded-xl font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors">
                                      📦 Expedição
                                    </button>
                                  </>
                                )}
                                <button onClick={() => openDeleteModal(b.id, source, sorted[sorted.length - 1]?.filename)}
                                  title="Apagar todos os pedidos deste lote"
                                  className="text-xs py-1.5 px-2.5 rounded-xl font-semibold text-rose-500 bg-rose-50 hover:bg-rose-100 transition-colors flex items-center gap-1">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Raio-x do lote — o que realmente vai pro picklist, não só o total */}
                          {stats && (
                            <div className="flex flex-wrap gap-1.5">
                              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 size={10}/> {picklistReady} vão pro picklist
                              </span>
                              {stats.cancelado > 0 && (
                                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-100 text-red-700 flex items-center gap-1">
                                  <XCircle size={10}/> {stats.cancelado} cancelado{stats.cancelado !== 1 ? 's' : ''}
                                </span>
                              )}
                              {stats.full > 0 && (
                                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-100 text-indigo-700 flex items-center gap-1">
                                  📫 {stats.full} Full
                                </span>
                              )}
                              {stats.semSku > 0 && (
                                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-700 flex items-center gap-1">
                                  <AlertCircle size={10}/> {stats.semSku} sem SKU
                                </span>
                              )}
                            </div>
                          )}

                          {/* Trilha de uploads — cada vez que o pedido entrou, seja pela
                              API (automático) ou por arquivo .xlsx (manual). Distinguir
                              os dois aqui é o que deixa visível que um não some/duplica
                              o outro — os dois convergem no MESMO pedido (upsert por
                              número de venda), nunca criam um segundo registro. */}
                          <div className="flex flex-col gap-1.5 pl-1">
                            {sorted.map((ev, idx) => {
                              const isApi = ev.filename?.startsWith('API ')
                              return (
                              <div key={ev.id} className="flex items-center gap-2.5 text-xs">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isApi ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                                <span className="font-mono text-slate-400 shrink-0">{fmtTimeOnly(ev.imported_at)}</span>
                                {isApi ? (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 shrink-0">🔄 Automático</span>
                                ) : (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">📄 Arquivo</span>
                                )}
                                <span className="text-slate-600 truncate flex-1 min-w-0">{ev.filename || 'Pedido manual'}</span>
                                <span className="text-slate-400 shrink-0">
                                  {ev.total_orders_file} pedido(s)
                                  {idx > 0 && ev.new_orders_count != null && (
                                    <span className="text-emerald-600 font-semibold"> ({ev.new_orders_count} novo{ev.new_orders_count !== 1 ? 's' : ''})</span>
                                  )}
                                  {' · '}{ev.total_items_file} item(ns)
                                </span>
                              </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    </div>
                    )}
                  </div>
                )
              })
            })()
          )}
        </div>
      )}

      <ManualOrderModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSave={createManualOrder}
        products={products.filter(p => p.active)}
      />

      {/* Modal de edição de pedido manual */}
      <ManualOrderModal
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditingOrder(null) }}
        onSave={async (payload) => {
          if (!editingOrder) return
          // Atualiza comprador, notes e total_value do pedido
          const { supabase } = await import('../../lib/supabase')
          await supabase.from('orders').update({
            comprador:   payload.comprador,
            notes:       payload.notes || null,
            total_value: payload.total_value || null,
          }).eq('id', editingOrder.id)

          // Remove todos os items atuais e reinsere
          await supabase.from('order_items').delete().eq('order_id', editingOrder.id)
          if (payload.items.length > 0) {
            await supabase.from('order_items').insert(
              payload.items.map(it => ({
                order_id:   editingOrder.id,
                titulo:     it.titulo,
                sku:        it.sku || null,
                qty:        it.qty,
                product_id: it.product_id || null,
              }))
            )
          }
          await fetchOrders()
          setEditOpen(false)
          setEditingOrder(null)
        }}
        onDelete={async (orderId) => {
          const { supabase } = await import('../../lib/supabase')
          await supabase.from('order_items').delete().eq('order_id', orderId)
          await supabase.from('orders').delete().eq('id', orderId)
          await fetchOrders()
        }}
        initialData={editingOrder}
        products={products.filter(p => p.active)}
      />

      {/* Modal: arquivo já importado antes */}
      {duplicateInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDuplicateInfo(null)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <AlertCircle size={22} className="text-amber-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800" style={{ fontFamily:'Nunito,sans-serif' }}>Esse arquivo já foi importado</h3>
                <p className="text-xs text-slate-400">Confira antes de importar de novo</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm">
              <p className="font-semibold text-slate-700 truncate">{duplicateInfo.existingBatch.filename}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Importado em {fmtDateTime(duplicateInfo.existingBatch.imported_at)} — {duplicateInfo.existingBatch.total_orders} pedido(s), {duplicateInfo.existingBatch.total_items} item(ns)
              </p>
            </div>

            <p className="text-xs text-slate-500">
              Se importar mesmo assim, os pedidos serão apenas atualizados (não duplicam), mas <strong>o lote de produção não será recriado</strong> — ele já foi gerado na primeira vez.
            </p>

            <div className="flex flex-col gap-2 mt-1">
              <button
                onClick={() => { setDuplicateInfo(null); navigate(`/pick-list?batch=${duplicateInfo.existingBatch.id}`) }}
                className="btn-secondary w-full text-sm justify-center"
              >
                🖨️ Gerar Picklist desse lote
              </button>
              <div className="flex gap-2">
                <button onClick={() => setDuplicateInfo(null)} className="btn-secondary flex-1 text-sm justify-center">
                  Cancelar
                </button>
                <button onClick={confirmForceImport} className="flex-1 text-sm justify-center py-2.5 rounded-xl font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors">
                  Importar mesmo assim
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {feiraModal && (
        <FeiraCombinadaModal
          open={!!feiraModal}
          onClose={() => setFeiraModal(null)}
          batchIds={feiraModal.batchIds}
          targetDate={feiraModal.targetDate}
          dayLabel={feiraModal.dayLabel}
        />
      )}

      {/* Confirmar apagar lote inteiro */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !deleting && setDeleteModal(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl border border-rose-200 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertCircle size={20} className="text-rose-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>Apagar todos os pedidos?</h3>
                <p className="text-xs text-slate-400">
                  {deleteModal.source === 'ml' ? 'Mercado Livre' : deleteModal.source === 'shopee' ? 'Shopee' : deleteModal.source} · {deleteModal.filename || '—'}
                </p>
              </div>
            </div>

            {deleteInfo === null ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="bg-slate-50 rounded-xl p-3.5 flex flex-col gap-1.5 text-sm">
                  <p className="text-slate-700">
                    Vai apagar <strong>{deleteInfo.orderCount} pedido(s)</strong> e <strong>{deleteInfo.itemCount} item(ns)</strong> desse lote — pra sempre, sem volta.
                  </p>
                  {deleteInfo.pickedCount > 0 && (
                    <p className="text-rose-600 font-bold mt-1">
                      ⚠️ {deleteInfo.pickedCount} item(ns) já foram separados! Apagar vai perder esse trabalho.
                    </p>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Os diretores serão avisados (sino + e-mail) de que isso foi apagado, e por quem.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteModal(null)} disabled={deleting}
                    className="btn-secondary flex-1 text-sm justify-center">
                    Cancelar
                  </button>
                  <button onClick={confirmDeleteBatch} disabled={deleting || deleteInfo.orderCount === 0}
                    className="flex-1 text-sm justify-center py-2.5 rounded-xl font-semibold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 transition-colors">
                    {deleting ? 'Apagando...' : `Apagar ${deleteInfo.orderCount} pedido(s)`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
