import { useState, useMemo } from 'react'
import {
  Plus, X, Package, ShoppingCart, CheckCircle2, Paperclip, Trash2,
  Calendar, User, DollarSign, MapPin, FileText, Upload, Image as ImageIcon,
  ChevronLeft, ChevronRight, Flame, Eye, EyeOff,
} from 'lucide-react'
import { usePurchaseBoard } from './hooks/usePurchaseBoard'
import { useSuppliers } from '../financial/hooks/useSuppliers'
import { supabase } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/signedUrlCache'
import toast from 'react-hot-toast'

function fmtDT(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDate(d) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtPreco(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return null
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function todayISO() { return new Date().toISOString().slice(0, 10) }

const COLUMNS = [
  { key: 'a_comprar', label: 'A Comprar', icon: Package,       color: '#F43F5E', bg: 'bg-rose-50' },
  { key: 'comprado',  label: 'Comprado',  icon: ShoppingCart,  color: '#F59E0B', bg: 'bg-amber-50' },
  { key: 'entregue',  label: 'Entregue',  icon: CheckCircle2,  color: '#10B981', bg: 'bg-emerald-50' },
]

// ─── Modal: novo item (coluna A Comprar) ───────────────────────────
const UNIT_OPTIONS = ['un', 'kg', 'g', 'l', 'ml', 'pct', 'cx', 'm']

function NewCardModal({ open, onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('un')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onCreate({
        title: title.trim(),
        qty_needed: qty ? parseFloat(qty) : null,
        qty_unit: unit,
        estimated_value: estimatedValue ? parseFloat(estimatedValue) : null,
        priority: urgent ? 'urgente' : 'normal',
        request_notes: notes.trim() || null,
      })
      setTitle(''); setQty(''); setUnit('un'); setEstimatedValue(''); setUrgent(false); setNotes('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-6 flex flex-col gap-4 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>Precisa comprar algo?</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">O que é?</label>
          <input className="input" autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Bebedouros" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Quantidade</label>
            <input type="number" className="input" value={qty} onChange={e => setQty(e.target.value)} placeholder="Ex: 20" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Unidade</label>
            <select className="select" value={unit} onChange={e => setUnit(e.target.value)}>
              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Valor estimado (opcional)</label>
          <input type="number" step="0.01" className="input" value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} placeholder="R$ 0,00 — só uma ideia, ainda não foi comprado" />
        </div>
        <button type="button" onClick={() => setUrgent(u => !u)}
          className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 transition-colors ${urgent ? 'bg-rose-50 border-rose-300' : 'bg-white border-slate-200'}`}>
          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border-2 ${urgent ? 'bg-rose-400 border-rose-400' : 'border-slate-300'}`}>
            {urgent && <Flame size={12} className="text-white" />}
          </div>
          <span className={`text-sm font-semibold ${urgent ? 'text-rose-700' : 'text-slate-500'}`}>Urgente — precisa comprar hoje</span>
        </button>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 block">Observação (opcional)</label>
          <textarea className="textarea w-full" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Algum detalhe importante..." />
        </div>
        <button onClick={handleSave} disabled={!title.trim() || saving} className="btn-primary justify-center disabled:opacity-50">
          {saving ? 'Lançando...' : 'Lançar pra comprar'}
        </button>
      </div>
    </div>
  )
}

// ─── Anexos ─────────────────────────────────────────────────────
function AttachmentRow({ att, onDelete }) {
  const url = useSignedUrl('purchase-attachments', att.file_url)
  const isImage = /\.(jpe?g|png|webp|gif)$/i.test(att.file_name || '')

  return (
    <div className="flex items-center gap-3 py-2">
      {isImage && url
        ? <img src={url} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-100 shrink-0" />
        : <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><FileText size={18} className="text-slate-400" /></div>
      }
      <a href={url || '#'} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-sm text-slate-700 font-medium truncate hover:underline">
        {att.file_name}
      </a>
      <button onClick={() => onDelete(att.id, att.file_url)} className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 shrink-0">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ─── Modal de detalhe do card ───────────────────────────────────
function CardDetailModal({ open, onClose, card, onReload, actions }) {
  const { suppliers } = useSuppliers()
  const [purchaseForm, setPurchaseForm] = useState({ estimated_delivery_date: '', qty_purchased: '', purchase_value: '', purchased_where: '', supplier_id: '', purchase_notes: '' })
  const [deliverForm, setDeliverForm] = useState({ received_at: todayISO(), received_notes: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  if (!open || !card) return null

  async function handleMarkPurchased() {
    setSaving(true)
    try { await actions.markPurchased(card.id, purchaseForm); onReload(); onClose() } finally { setSaving(false) }
  }
  async function handleMarkDelivered() {
    setSaving(true)
    try {
      await actions.markDelivered(card.id, { ...deliverForm, received_at: new Date(deliverForm.received_at + 'T12:00:00').toISOString() })
      onReload(); onClose()
    } finally { setSaving(false) }
  }
  async function handleMoveBack() {
    setSaving(true)
    try { await actions.moveBack(card.id, card.status); onReload(); onClose() } finally { setSaving(false) }
  }
  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try { await actions.uploadAttachment(card.id, file); onReload() } finally { setUploading(false) }
  }
  async function handleDeleteAttachment(id, fileUrl) {
    await actions.deleteAttachment(id, fileUrl)
    onReload()
  }

  const col = COLUMNS.find(c => c.key === card.status)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: col.color + '18', color: col.color }}>{col.label}</span>
            {card.priority === 'urgente' && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-rose-100 text-rose-700"><Flame size={11} /> Urgente</span>
            )}
            {card.status !== 'a_comprar' && (
              <button onClick={handleMoveBack} disabled={saving}
                className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
                <ChevronLeft size={11} /> Voltar etapa
              </button>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="p-5 overflow-y-auto flex flex-col gap-5">
          {/* Info original do pedido */}
          <div>
            <h3 className="text-lg font-bold text-slate-800">{card.title}</h3>
            {card.qty_needed && <p className="text-sm text-slate-500 mt-0.5">Quantidade solicitada: <strong>{card.qty_needed} {card.qty_unit || 'un'}</strong></p>}
            {card.estimated_value != null && <p className="text-sm text-slate-500">Valor estimado: <strong>{fmtPreco(card.estimated_value)}</strong></p>}
            {card.request_notes && <p className="text-sm text-slate-500 mt-1">{card.request_notes}</p>}
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
              <User size={12} /> Lançado por {card.requester?.name || '—'} · {fmtDT(card.requested_at)}
            </p>
          </div>

          {/* Dados da compra (se já comprado) */}
          {card.status !== 'a_comprar' && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex flex-col gap-1.5">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Dados da compra</p>
              {card.supplier?.name && <p className="text-sm text-slate-700 flex items-center gap-1.5"><MapPin size={13} className="text-amber-500" /> {card.supplier.name} <span className="text-xs text-slate-400">(fornecedor cadastrado)</span></p>}
              {!card.supplier?.name && card.purchased_where && <p className="text-sm text-slate-700 flex items-center gap-1.5"><MapPin size={13} className="text-amber-500" /> {card.purchased_where}</p>}
              {card.qty_purchased && <p className="text-sm text-slate-700">Quantidade comprada: <strong>{card.qty_purchased}</strong></p>}
              {card.purchase_value && <p className="text-sm text-slate-700 flex items-center gap-1.5"><DollarSign size={13} className="text-amber-500" /> {fmtPreco(card.purchase_value)}</p>}
              {card.estimated_delivery_date && <p className="text-sm text-slate-700 flex items-center gap-1.5"><Calendar size={13} className="text-amber-500" /> Previsão de entrega: {fmtDate(card.estimated_delivery_date)}</p>}
              {card.purchase_notes && <p className="text-sm text-slate-600 mt-1">{card.purchase_notes}</p>}
              <p className="text-xs text-slate-400 mt-1.5">Comprado por {card.purchaser?.name || '—'} · {fmtDT(card.purchased_at)}</p>
            </div>
          )}

          {/* Dados de recebimento (se já entregue) */}
          {card.status === 'entregue' && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex flex-col gap-1.5">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">Recebimento</p>
              <p className="text-sm text-slate-700">Recebido por <strong>{card.receiver?.name || '—'}</strong> em {fmtDT(card.received_at)}</p>
              {card.received_notes && <p className="text-sm text-slate-600 mt-1">{card.received_notes}</p>}
            </div>
          )}

          {/* Formulário: marcar como Comprado */}
          {card.status === 'a_comprar' && (
            <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Marcar como comprado</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Qtd. comprada</label>
                  <input type="number" className="input text-sm" value={purchaseForm.qty_purchased}
                    onChange={e => setPurchaseForm(f => ({ ...f, qty_purchased: e.target.value }))} placeholder={card.qty_needed || '0'} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Valor (R$)</label>
                  <input type="number" step="0.01" className="input text-sm" value={purchaseForm.purchase_value}
                    onChange={e => setPurchaseForm(f => ({ ...f, purchase_value: e.target.value }))} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Fornecedor (cadastrado)</label>
                <select className="select text-sm" value={purchaseForm.supplier_id}
                  onChange={e => setPurchaseForm(f => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">— Não é um fornecedor cadastrado —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {!purchaseForm.supplier_id && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Ou onde comprou (texto livre)</label>
                  <input className="input text-sm" value={purchaseForm.purchased_where}
                    onChange={e => setPurchaseForm(f => ({ ...f, purchased_where: e.target.value }))} placeholder="Ex: Loja X, Amazon..." />
                </div>
              )}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Previsão de entrega</label>
                <input type="date" className="input text-sm" value={purchaseForm.estimated_delivery_date}
                  onChange={e => setPurchaseForm(f => ({ ...f, estimated_delivery_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Observação</label>
                <textarea className="textarea w-full text-sm" rows={2} value={purchaseForm.purchase_notes}
                  onChange={e => setPurchaseForm(f => ({ ...f, purchase_notes: e.target.value }))} />
              </div>
              <button onClick={handleMarkPurchased} disabled={saving}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50">
                {saving ? 'Salvando...' : 'Marcar como Comprado'}
              </button>
            </div>
          )}

          {/* Formulário: marcar como Entregue */}
          {card.status === 'comprado' && (
            <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Marcar como entregue</p>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Data do recebimento</label>
                <input type="date" className="input text-sm" value={deliverForm.received_at}
                  onChange={e => setDeliverForm(f => ({ ...f, received_at: e.target.value }))} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Observação</label>
                <textarea className="textarea w-full text-sm" rows={2} value={deliverForm.received_notes}
                  onChange={e => setDeliverForm(f => ({ ...f, received_notes: e.target.value }))} placeholder="Chegou tudo certo? Alguma divergência?" />
              </div>
              <button onClick={handleMarkDelivered} disabled={saving}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50">
                {saving ? 'Salvando...' : 'Marcar como Entregue'}
              </button>
            </div>
          )}

          {/* Anexos */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Paperclip size={13} /> Anexos
            </p>
            <div className="divide-y divide-slate-50">
              {(card.attachments || []).map(att => (
                <AttachmentRow key={att.id} att={att} onDelete={handleDeleteAttachment} />
              ))}
              {(!card.attachments || card.attachments.length === 0) && (
                <p className="text-xs text-slate-400 py-2">Nenhum anexo ainda.</p>
              )}
            </div>
            <label className="mt-2 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-3 text-sm font-semibold text-slate-500 cursor-pointer hover:border-rose-300 hover:text-rose-500 transition-colors">
              {uploading ? 'Enviando...' : <><Upload size={15} /> Anexar arquivo (foto, print...)</>}
              <input type="file" className="hidden" onChange={handleFileChange} disabled={uploading} accept="image/*,.pdf" />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Card resumido (dentro da coluna) ──────────────────────────────
function BoardCard({ card, onClick, onMoveBack }) {
  return (
    <div className="w-full bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-1.5 p-3.5">
      <button onClick={onClick} className="w-full text-left flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          {card.priority === 'urgente' && <Flame size={13} className="text-rose-500 shrink-0" />}
          <p className="text-sm font-bold text-slate-800">{card.title}</p>
        </div>
        {card.qty_needed && <p className="text-xs text-slate-400">Qtd: {card.qty_needed} {card.qty_unit || 'un'}</p>}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-slate-400">{card.requester?.name || '—'}</span>
          {card.attachments?.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-slate-400"><Paperclip size={11} /> {card.attachments.length}</span>
          )}
        </div>
      </button>
      <div className="flex items-center gap-1.5 mt-1">
        {card.status !== 'a_comprar' && (
          <button onClick={() => onMoveBack(card)} title="Voltar etapa"
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-[10px] font-bold">
            <ChevronLeft size={12} /> Voltar
          </button>
        )}
        {card.status !== 'entregue' && (
          <button onClick={onClick} title="Avançar etapa"
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-[10px] font-bold">
            Avançar <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export function PurchaseBoardPage() {
  const { cards, loading, createCard, markPurchased, markDelivered, moveBack, uploadAttachment, deleteAttachment, fetchOne, refetch } = usePurchaseBoard()
  const [showNew, setShowNew] = useState(false)
  const [detail, setDetail] = useState(null)
  const [showDelivered, setShowDelivered] = useState(false)

  async function openCard(id) {
    const data = await fetchOne(id)
    setDetail(data)
  }
  async function reloadDetail() {
    if (detail) setDetail(await fetchOne(detail.id))
  }
  async function handleQuickMoveBack(card) {
    await moveBack(card.id, card.status)
  }

  const byColumn = COLUMNS.reduce((acc, c) => {
    acc[c.key] = cards.filter(card => card.status === c.key)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2" style={{ fontFamily: 'Nunito,sans-serif' }}>
            <ShoppingCart size={22} className="text-rose-400" /> Compra da Lousa
          </h1>
          <p className="text-sm text-slate-400">Do "precisa comprar" até chegar na prateleira</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Lançar item
        </button>
      </div>

      <button onClick={() => setShowDelivered(v => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 w-fit">
        {showDelivered ? <EyeOff size={13} /> : <Eye size={13} />}
        {showDelivered ? 'Ocultar entregues' : 'Mostrar entregues'}
      </button>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-7 h-7 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const isDeliveredCol = col.key === 'entregue'
            const collapsed = isDeliveredCol && !showDelivered
            return (
              <div key={col.key} className={`rounded-2xl p-3 ${col.bg}`}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <col.icon size={16} style={{ color: col.color }} />
                  <h3 className="text-sm font-bold" style={{ color: col.color }}>{col.label}</h3>
                  <span className="text-xs font-bold text-slate-400 ml-auto">{byColumn[col.key].length}</span>
                </div>
                {collapsed ? (
                  <button onClick={() => setShowDelivered(true)} className="w-full text-center py-6 text-xs font-semibold text-slate-400 hover:text-slate-600">
                    {byColumn[col.key].length} entregue{byColumn[col.key].length !== 1 ? 's' : ''} oculto{byColumn[col.key].length !== 1 ? 's' : ''} — clique pra ver
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 min-h-[80px]">
                    {byColumn[col.key].length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6">Vazio</p>
                    ) : byColumn[col.key].map(card => (
                      <BoardCard key={card.id} card={card} onClick={() => openCard(card.id)} onMoveBack={handleQuickMoveBack} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <NewCardModal open={showNew} onClose={() => setShowNew(false)} onCreate={createCard} />
      <CardDetailModal
        open={!!detail} onClose={() => setDetail(null)} card={detail}
        onReload={() => { reloadDetail(); refetch() }}
        actions={{ markPurchased, markDelivered, moveBack, uploadAttachment, deleteAttachment }}
      />
    </div>
  )
}
