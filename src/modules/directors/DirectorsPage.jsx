import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, X, Check, Loader2,
  Phone, User, ChevronLeft, ChevronRight, ChevronDown,
  Wrench, CheckCircle, Gift, Zap, Upload, FileText, ExternalLink,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal }    from '../../components/ui/Modal'
import toast        from 'react-hot-toast'

// ── Helpers ──────────────────────────────────────────────────────
function getSession() { try { return JSON.parse(localStorage.getItem('coisapet_session')||'{}') } catch { return {} } }
function fmtC(v) { return v != null ? Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—' }
function calcTotal(items) { return items.reduce((s,i) => s + parseBRL(i.unit_price||0) * Number(i.quantity||1), 0) }

function maskBRL(v) {
  const digits = String(v).replace(/\D/g,'')
  if (!digits) return ''
  const num = parseInt(digits, 10) / 100
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}
function parseBRL(v) {
  return parseFloat(String(v).replace(/\./g,'').replace(',','.')) || 0
}
function waLink(phone) {
  const n = String(phone||'').replace(/\D/g,'')
  return n ? `https://wa.me/55${n}` : null
}

// ── Configurações das colunas Kanban ─────────────────────────────
const COLUMNS = [
  { id:'em_aberto', label:'Em aberto',      color:'#ef4444', bg:'bg-rose-50/60',    Icon: Zap         },
  { id:'parcial',   label:'Pago parcial',   color:'#f59e0b', bg:'bg-amber-50/60',   Icon: ChevronRight},
  { id:'pago',      label:'Pago completo',  color:'#10b981', bg:'bg-emerald-50/60', Icon: CheckCircle },
]

// ── Config pagamento ──────────────────────────────────────────────
const PAY_CFG = {
  em_aberto: { label:'Em aberto',     dot:'bg-rose-500',    badge:'bg-rose-50 text-rose-600'      },
  parcial:   { label:'Pago parcial',  dot:'bg-amber-400',   badge:'bg-amber-50 text-amber-700'    },
  pago:      { label:'Pago completo', dot:'bg-emerald-500', badge:'bg-emerald-50 text-emerald-600' },
}

// Status de produção — aparece como info secundária no card
const PROD_CFG = {
  orc_enviado:  { label:'Orç. Enviado',  Icon: FileText,    color:'#6366f1' },
  orc_aprovado: { label:'Orç. Aprovado', Icon: CheckCircle, color:'#C5904A' },
  produzido:    { label:'Produzido',     Icon: Wrench,      color:'#10b981' },
}

// ── Modal de pedido ───────────────────────────────────────────────
const EMPTY = {
  title:'', client_name:'', client_whatsapp:'', notes:'',
  paid_amount:'', production_status:'orc_enviado', payment_status:'em_aberto',
  attachment_url:'',
}
const EMPTY_ITEM = { name:'', quantity:'1', unit_price:'' }

function OrderModal({ open, onClose, onSave, initial, initialItems, loading }) {
  const [form,  setForm]  = useState(EMPTY)
  const [items, setItems] = useState([{...EMPTY_ITEM}])

  useEffect(() => {
    if (!open) return
    setForm(initial ? {
      title:             initial.title             ?? '',
      client_name:       initial.client_name       ?? '',
      client_whatsapp:   initial.client_whatsapp   ?? '',
      notes:             initial.notes             ?? '',
      paid_amount:       initial.paid_amount       ? maskBRL(Math.round(initial.paid_amount*100)) : '',
      production_status: initial.production_status ?? 'orc_enviado',
      payment_status:    initial.payment_status    ?? 'em_aberto',
      attachment_url:    initial.attachment_url    ?? '',
    } : EMPTY)
    setItems(initialItems?.length ? initialItems.map(i=>({...i, quantity:String(i.quantity), unit_price:maskBRL(Math.round(i.unit_price*100))})) : [{...EMPTY_ITEM}])
  }, [open, initial, initialItems])

  function set(k,v) { setForm(f => ({...f,[k]:v})) }
  function setItem(idx,k,v) { setItems(prev => prev.map((it,i) => i===idx ? {...it,[k]:v} : it)) }
  function addItem() { setItems(prev => [...prev, {...EMPTY_ITEM}]) }
  function removeItem(idx) { setItems(prev => prev.filter((_,i) => i!==idx)) }

  const [uploading, setUploading] = useState(false)

  // Ctrl+V para colar imagem/arquivo
  useEffect(() => {
    if (!open) return
    function onPaste(e) {
      const file = e.clipboardData?.files?.[0]
      if (!file) return
      if (!['image/png','image/jpeg','image/jpg','application/pdf'].includes(file.type)) return
      handleAttachment({ target: { files: [file] } })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open])

  const total    = calcTotal(items)
  const saldo    = total - parseBRL(form.paid_amount||0)
  const canSave  = form.title.trim() && form.client_name.trim() && items.some(i=>i.name.trim())

  async function handleAttachment(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('Máximo 10MB.'); return }
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `decor/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('employee-docs').upload(path, file)
      if (error) throw error
      const { data } = await supabase.storage.from('employee-docs').createSignedUrl(path, 60*60*24*365)
      set('attachment_url', data?.signedUrl || '')
      toast.success('Anexo enviado!')
    } catch(e) { toast.error('Erro no upload: '+e.message) }
    finally { setUploading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} size="md"
      title={initial ? `Editar — ${initial.title}` : 'Novo registro CoisaDecor'}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>Cancelar</button>
          <button onClick={() => onSave(form, items)} className="btn-primary" disabled={loading||!canSave}>
            {loading ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>}
            {initial ? 'Salvar' : 'Criar pedido'}
          </button>
        </>
      }>
      <div className="flex flex-col gap-4">
        {/* Título */}
        <div>
          <label className="form-label">Título do pedido *</label>
          <input className="input" value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Ex: Pedido Ana — Decoração Casamento"/>
        </div>

        {/* Cliente */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Nome do cliente *</label>
            <input className="input" value={form.client_name} onChange={e=>set('client_name',e.target.value)} placeholder="Nome completo"/>
          </div>
          <div>
            <label className="form-label">WhatsApp</label>
            <input className="input" value={form.client_whatsapp} onChange={e=>set('client_whatsapp',e.target.value)} placeholder="(14) 99999-9999"/>
          </div>
        </div>

        {/* Itens do pedido */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="form-label mb-0">Itens do pedido *</label>
            <button type="button" onClick={addItem}
              className="flex items-center gap-1 text-xs font-bold text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors">
              <Plus size={12}/> Adicionar item
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {/* Header */}
            <div className="grid grid-cols-[1fr_60px_90px_28px] gap-2 px-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Produto/Serviço</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide text-center">Qtd</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide text-right">Valor unit.</span>
              <span/>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_60px_90px_28px] gap-2 items-center">
                <input className="input text-sm py-1.5" value={item.name}
                  onChange={e=>setItem(idx,'name',e.target.value)} placeholder="Ex: Mandala 60cm"/>
                <input className="input text-sm py-1.5 text-center" type="number" min="1" value={item.quantity}
                  onChange={e=>setItem(idx,'quantity',e.target.value)} placeholder="1"/>
                <input className="input text-sm py-1.5 text-right" inputMode="numeric" value={item.unit_price}
                  onChange={e=>setItem(idx,'unit_price', maskBRL(e.target.value))} placeholder="0,00"/>
                <button type="button" onClick={()=>removeItem(idx)} disabled={items.length===1}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-400 hover:bg-rose-50 transition-colors disabled:opacity-30">
                  <Trash2 size={13}/>
                </button>
              </div>
            ))}
            {/* Total */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-1">
              <span className="text-xs font-bold text-slate-500">Total do pedido</span>
              <span className="text-base font-black text-slate-800">{fmtC(total)}</span>
            </div>
          </div>
        </div>

        {/* Valor pago */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Valor pago (R$)</label>
            <input className="input" inputMode="numeric" value={form.paid_amount}
              onChange={e=>set('paid_amount', maskBRL(e.target.value))} placeholder="0,00"/>
          </div>
          <div className={`flex flex-col justify-center p-3 rounded-xl ${saldo>0?'bg-rose-50':'bg-emerald-50'}`}>
            <span className="text-[10px] font-bold uppercase tracking-wide mb-0.5 ${saldo>0?'text-rose-400':'text-emerald-400'}">
              {saldo > 0 ? 'Saldo a receber' : 'Quitado'}
            </span>
            <span className={`text-base font-black ${saldo>0?'text-rose-600':'text-emerald-600'}`}>{fmtC(Math.abs(saldo))}</span>
          </div>
        </div>

        {/* Status produção */}
        <div>
          <label className="form-label">Status de produção</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(PROD_CFG).map(([k,v]) => {
              const PIcon = v.Icon
              const active = form.production_status === k
              return (
                <button key={k} type="button" onClick={() => set('production_status', k)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-xs font-semibold transition-all
                    ${active ? 'border-current' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}
                  style={active ? {color:v.color, background:v.color+'12'} : {}}>
                  <PIcon size={14} strokeWidth={1.8}/> {v.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Status pagamento */}
        <div>
          <label className="form-label">Status de pagamento</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(PAY_CFG).map(([k,v]) => (
              <button key={k} type="button" onClick={() => set('payment_status', k)}
                className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-xs font-semibold transition-all
                  ${form.payment_status===k ? v.badge+' border-current' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                <div className={`w-2 h-2 rounded-full ${v.dot} shrink-0`}/>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Observações */}
        <div>
          <label className="form-label">Observações</label>
          <textarea className="textarea resize-none" rows={3} value={form.notes}
            onChange={e=>set('notes',e.target.value)} placeholder="Detalhes do pedido, prazo de entrega, etc..."/>
        </div>

        {/* Anexo */}
        <div>
          <label className="form-label">Anexo (comprovante / orçamento)</label>
          {form.attachment_url ? (
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <FileText size={16} className="text-indigo-400 shrink-0"/>
              <span className="text-xs font-semibold text-slate-600 flex-1 truncate">Arquivo anexado</span>
              <a href={form.attachment_url} target="_blank" rel="noopener"
                className="text-xs font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
                <ExternalLink size={12}/> Ver
              </a>
              <button type="button" onClick={()=>set('attachment_url','')}
                className="text-xs text-slate-400 hover:text-rose-500 ml-1">
                <X size={13}/>
              </button>
            </div>
          ) : (
            <label className={`flex items-center gap-3 p-3 rounded-xl border-2 border-dashed transition-colors cursor-pointer
              ${uploading ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'}`}>
              <Upload size={16} className={uploading ? 'text-indigo-400 animate-pulse' : 'text-slate-400'} strokeWidth={1.5}/>
              <span className="text-sm font-semibold text-slate-500">
                {uploading ? 'Enviando...' : 'Clique ou cole (Ctrl+V) — PDF, JPG ou PNG'}
              </span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={handleAttachment} disabled={uploading}/>
            </label>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Card do Kanban ────────────────────────────────────────────────
function OrderCard({ order, orderItems, onEdit, onDelete, onMove, onView, colIndex, colCount }) {
  const [expanded, setExpanded] = useState(false)
  const pay  = PAY_CFG[order.payment_status] ?? PAY_CFG.em_aberto
  const prod = PROD_CFG[order.production_status]
  const ProdIcon = prod?.Icon
  const wa   = waLink(order.client_whatsapp)
  const canL = colIndex > 0
  const canR = colIndex < colCount - 1
  const items = orderItems || []

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-200 transition-all overflow-hidden">

      {/* ── Cabeçalho sempre visível — clique expande ── */}
      <div className="flex items-center gap-2 px-3 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}>
        {/* Bolinha pagamento */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${pay.dot}`}/>
        {/* Título + cliente */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate leading-tight">{order.title}</p>
          <p className="text-[11px] text-slate-400 truncate">{order.client_name}</p>
        </div>
        {/* Valor total */}
        {order.price > 0 && (
          <span className="text-xs font-bold text-slate-600 shrink-0">{fmtC(order.price)}</span>
        )}
        {/* Seta accordion */}
        <ChevronDown size={14} className={`text-slate-300 shrink-0 transition-transform duration-200 ${expanded?'rotate-180':''}`}/>
      </div>

      {/* ── Conteúdo expandido ── */}
      {expanded && (
        <div className="border-t border-slate-50 flex flex-col gap-3 px-3 pb-3 pt-3">

          {/* Cliente + WhatsApp */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <User size={11} className="text-slate-400"/>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{order.client_name}</p>
              {wa && (
                <a href={wa} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()}
                  className="text-[10px] text-emerald-500 hover:text-emerald-600 font-semibold flex items-center gap-0.5">
                  <Phone size={9}/> {order.client_whatsapp}
                </a>
              )}
            </div>
          </div>

          {/* Itens */}
          {items.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {items.map((it,i) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span className="text-slate-500 truncate mr-2">{it.quantity > 1 ? `${it.quantity}× ` : ''}{it.name}</span>
                  <span className="font-semibold text-slate-600 shrink-0">{fmtC(it.unit_price * it.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-bold text-slate-700 border-t border-slate-100 pt-1 mt-0.5">
                <span>Total</span><span>{fmtC(order.price)}</span>
              </div>
            </div>
          )}

          {/* Financeiro (pago/falta) */}
          {order.payment_status === 'parcial' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-emerald-50 rounded-xl text-center">
                <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wide">Pago</p>
                <p className="text-xs font-black text-emerald-600">{fmtC(order.paid_amount)}</p>
              </div>
              <div className="p-2 bg-rose-50 rounded-xl text-center">
                <p className="text-[9px] font-bold text-rose-400 uppercase tracking-wide">Falta</p>
                <p className="text-xs font-black text-rose-500">{fmtC(Number(order.price)-Number(order.paid_amount||0))}</p>
              </div>
            </div>
          )}

          {/* Status produção + anexo */}
          <div className="flex items-center justify-between gap-2">
            {prod && ProdIcon && (
              <div className="flex items-center gap-1.5 py-1 px-2 rounded-lg bg-slate-50">
                <ProdIcon size={10} strokeWidth={2} style={{color:prod.color}}/>
                <span className="text-[10px] font-semibold" style={{color:prod.color}}>{prod.label}</span>
              </div>
            )}
            {order.attachment_url && (
              <a href={order.attachment_url} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()}
                className="flex items-center gap-1 text-[10px] font-semibold text-indigo-400 hover:text-indigo-600">
                <FileText size={10} strokeWidth={1.5}/> Anexo
              </a>
            )}
          </div>

          {/* Observações */}
          {order.notes && (
            <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-50 rounded-lg px-2 py-1.5">{order.notes}</p>
          )}

          {/* Ações */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-50">
            <div className="flex items-center gap-0.5">
              <button disabled={!canL} onClick={e=>{e.stopPropagation();canL&&onMove(order,COLUMNS[colIndex-1].id)}}
                className={`p-1.5 rounded-lg transition-colors ${canL?'text-slate-400 hover:text-slate-700 hover:bg-slate-100':'text-slate-200 cursor-default'}`}>
                <ChevronLeft size={13}/>
              </button>
              <button disabled={!canR} onClick={e=>{e.stopPropagation();canR&&onMove(order,COLUMNS[colIndex+1].id)}}
                className={`p-1.5 rounded-lg transition-colors ${canR?'text-slate-400 hover:text-slate-700 hover:bg-slate-100':'text-slate-200 cursor-default'}`}>
                <ChevronRight size={13}/>
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={e=>{e.stopPropagation();onView(order)}}
                className="p-1.5 rounded-lg text-slate-300 hover:text-sky-500 hover:bg-sky-50 transition-colors" title="Ver detalhes">
                <ExternalLink size={13}/>
              </button>
              <button onClick={e=>{e.stopPropagation();onEdit(order)}}
                className="p-1.5 rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors">
                <Pencil size={13}/>
              </button>
              <button onClick={e=>{e.stopPropagation();onDelete(order)}}
                className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                <Trash2 size={13}/>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modal de visualização ────────────────────────────────────────
function OrderViewModal({ order, open, onClose, onEdit, onDelete }) {
  if (!order) return null
  const pay  = PAY_CFG[order.payment_status]    ?? PAY_CFG.em_aberto
  const prod = PROD_CFG[order.production_status] ?? Object.values(PROD_CFG)[0]
  const ProdIcon = prod.Icon
  const wa  = waLink(order.client_whatsapp)
  const fmtDt = d => d ? new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}) : '—'
  const saldo = Number(order.price||0) - Number(order.paid_amount||0)
  return (
    <Modal open={open} onClose={onClose} size="md" title={order.title}
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={onClose} className="btn-secondary">Fechar</button>
          <button onClick={()=>{onClose();onDelete(order)}}
            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 transition-colors">
            <Trash2 size={15}/>
          </button>
          <button onClick={()=>{onClose();onEdit(order)}} className="btn-primary flex-1">
            <Pencil size={14}/> Editar registro
          </button>
        </div>
      }>
      <div className="flex flex-col gap-4">
        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
            style={{background:prod.color+'18',color:prod.color}}>
            <ProdIcon size={11} strokeWidth={2}/> {prod.label}
          </span>
          <span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${pay.badge}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${pay.dot}`}/> {pay.label}
          </span>
          {order.quantity > 1 && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-slate-100 text-slate-600">Qtd: {order.quantity}</span>
          )}
        </div>
        {/* Itens */}
        {order._items?.length > 0 && (
          <div className="flex flex-col gap-1 border border-slate-100 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              <span>Produto/Serviço</span><span className="text-center">Qtd</span><span className="text-right">Subtotal</span>
            </div>
            {order._items.map((it,i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 border-t border-slate-50 text-sm">
                <span className="font-semibold text-slate-700">{it.name}</span>
                <span className="text-center text-slate-400">×{it.quantity}</span>
                <span className="text-right font-bold text-slate-700">{fmtC(it.unit_price * it.quantity)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 bg-slate-50 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">Total</span>
              <span className="text-base font-black text-slate-800">{fmtC(order.price)}</span>
            </div>
          </div>
        )}
        {/* Cliente */}
        <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
            <User size={16} className="text-slate-400" strokeWidth={1.5}/>
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Cliente</p>
            <p className="text-sm font-bold text-slate-800">{order.client_name}</p>
            {wa
              ? <a href={wa} target="_blank" rel="noopener"
                  className="text-xs text-emerald-500 hover:text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                  <Phone size={11}/> {order.client_whatsapp}
                </a>
              : order.client_whatsapp && <p className="text-xs text-slate-400">{order.client_whatsapp}</p>
            }
          </div>
        </div>
        {/* Financeiro */}
        {order.price > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Total</p>
              <p className="text-sm font-black text-slate-800">{fmtC(order.price)}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-center">
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide mb-1">Pago</p>
              <p className="text-sm font-black text-emerald-700">{fmtC(order.paid_amount||0)}</p>
            </div>
            <div className={`p-3 rounded-xl text-center ${saldo>0?'bg-rose-50':'bg-slate-50'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${saldo>0?'text-rose-400':'text-slate-400'}`}>Saldo</p>
              <p className={`text-sm font-black ${saldo>0?'text-rose-600':'text-slate-400'}`}>{fmtC(saldo)}</p>
            </div>
          </div>
        )}
        {/* Observações */}
        {order.notes && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Observações</p>
            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-4">{order.notes}</p>
          </div>
        )}
        {/* Anexo */}
        {order.attachment_url && (
          <a href={order.attachment_url} target="_blank" rel="noopener"
            className="flex items-center gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors">
            <FileText size={15} className="text-indigo-400 shrink-0" strokeWidth={1.5}/>
            <span className="text-sm font-semibold text-indigo-600 flex-1">Ver anexo</span>
            <ExternalLink size={13} className="text-indigo-400"/>
          </a>
        )}

        {/* Datas */}
        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100">
          <span>Criado em {fmtDt(order.created_at)}</span>
          {order.updated_at !== order.created_at && <span>Atualizado em {fmtDt(order.updated_at)}</span>}
        </div>
      </div>
    </Modal>
  )
}

// ── Página principal ──────────────────────────────────────────────
export function DirectorsPage() {
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState(null)
  const [delTarget,  setDelTarget]  = useState(null)
  const [viewTarget, setViewTarget] = useState(null)
  const [orderItems, setOrderItems] = useState({}) // cache: {order_id: [items]}

  const load = useCallback(async () => {
    setLoading(true)
    const [ordersRes, itemsRes] = await Promise.all([
      supabase.from('diretoria_orders').select('*').order('created_at',{ascending:false}),
      supabase.from('diretoria_items').select('*').order('created_at',{ascending:true}),
    ])
    const orders = ordersRes.data ?? []
    const items  = itemsRes.data  ?? []
    // Agrupa itens por order_id
    const itemMap = {}
    items.forEach(i => {
      if (!itemMap[i.order_id]) itemMap[i.order_id] = []
      itemMap[i.order_id].push(i)
    })
    setOrders(orders)
    setOrderItems(itemMap)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // KPIs
  const total    = orders.length
  const emAberto = orders.filter(o=>o.payment_status==='em_aberto').length
  const receber  = orders.filter(o=>o.payment_status!=='pago').reduce((s,o)=>s+Number(o.price||0)-Number(o.paid_amount||0),0)

  async function handleSave(form, items) {
    setSaving(true)
    try {
      const uid        = getSession().id
      const validItems = (items||[]).filter(i=>i.name.trim())
      const total      = calcTotal(validItems)
      const payload = {
        title:             form.title.trim(),
        client_name:       form.client_name.trim(),
        client_whatsapp:   form.client_whatsapp || null,
        notes:             form.notes || null,
        price:             total,
        paid_amount:       form.paid_amount ? parseBRL(form.paid_amount) : 0,
        production_status: form.production_status,
        payment_status:    form.payment_status,
        attachment_url:    form.attachment_url || null,
        updated_at:        new Date().toISOString(),
      }
      let orderId = editing?.id
      if (editing) {
        const { error: updErr } = await supabase.from('diretoria_orders').update(payload).eq('id',editing.id)
        if (updErr) throw new Error('Update: ' + updErr.message)
      } else {
        const { data, error: insErr } = await supabase.from('diretoria_orders')
          .insert({...payload, created_by:uid}).select('id').single()
        if (insErr) throw new Error('Insert: ' + insErr.message)
        orderId = data.id
      }
      // Salva itens — deleta antigos e reinsere
      await supabase.from('diretoria_items').delete().eq('order_id', orderId)
      if (validItems.length) {
        await supabase.from('diretoria_items').insert(
          validItems.map(i => ({
            order_id:   orderId,
            name:       i.name.trim(),
            quantity:   parseInt(i.quantity)||1,
            unit_price: parseBRL(i.unit_price),
          }))
        )
      }
      toast.success(editing ? 'Registro atualizado!' : 'Registro criado!')
      setModal(false); setEditing(null); setOrderItems({}); load()
    } catch(e) { toast.error('Erro: '+e.message); console.error(e) }
    finally { setSaving(false) }
  }

  async function handleMove(order, newStatus) {
    const upd = { payment_status: newStatus, updated_at: new Date().toISOString() }
    // Se marcou como pago completo, preenche paid_amount com price
    if (newStatus === 'pago' && order.price) upd.paid_amount = order.price
    await supabase.from('diretoria_orders').update(upd).eq('id', order.id)
    load()
  }

  async function handleDelete(order) {
    await supabase.from('diretoria_orders').delete().eq('id',order.id)
    toast.success('Registro removido.')
    setDelTarget(null); load()
  }

  const byCol = (colId) => orders.filter(o=>o.payment_status===colId)

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
            </svg>
            <h2 style={{fontFamily:'Nunito,sans-serif',fontWeight:900,fontSize:'22px',color:'#1e293b',letterSpacing:'-.5px'}}>
              Diretoria
            </h2>
          </div>
          <p className="text-sm text-slate-400">Gestão pessoal e privada da diretoria</p>
        </div>
        <button onClick={()=>{setEditing(null);setModal(true)}} className="btn-primary flex items-center gap-1.5">
          <Plus size={14}/> Novo registro
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <Zap size={18} className="text-slate-500" strokeWidth={1.5}/>
          </div>
          <div><p className="text-xs font-semibold text-slate-400">Total de pedidos</p><p className="text-2xl font-black text-slate-800">{total}</p></div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
            <Zap size={18} className="text-rose-400" strokeWidth={1.5}/>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">Em aberto</p>
            <p className="text-2xl font-black text-rose-600">{emAberto}</p>
            <p className="text-[10px] text-slate-400">{fmtC(receber)} a receber</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <ChevronRight size={18} className="text-amber-500" strokeWidth={1.5}/>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">Pago parcial</p>
            <p className="text-2xl font-black text-amber-600">{orders.filter(o=>o.payment_status==='parcial').length}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <CheckCircle size={18} className="text-emerald-500" strokeWidth={1.5}/>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">Pago completo</p>
            <p className="text-2xl font-black text-emerald-600">{orders.filter(o=>o.payment_status==='pago').length}</p>
            <p className="text-[10px] text-slate-400">{fmtC(orders.filter(o=>o.payment_status==='pago').reduce((s,o)=>s+Number(o.price||0),0))}</p>
          </div>
        </div>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="card p-12 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-slate-400"/>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {COLUMNS.map((col, colIndex) => {
            const colOrders = byCol(col.id)
            return (
              <div key={col.id} className="flex flex-col gap-3">
                {/* Header da coluna */}
                <div className={`flex items-center justify-between px-4 py-2.5 rounded-2xl ${col.bg}`}
                  style={{border:`1.5px solid ${col.color}22`}}>
                  <div className="flex items-center gap-2">
                    <col.Icon size={14} strokeWidth={1.8} style={{color:col.color}}/>
                    <span className="text-sm font-bold" style={{color:col.color}}>{col.label}</span>
                  </div>
                  <span className="text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center text-white" style={{background:col.color}}>
                    {colOrders.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-3 min-h-[120px]">
                  {colOrders.length === 0 ? (
                    <div className="border-2 border-dashed border-slate-100 rounded-2xl p-8 text-center text-xs text-slate-300 font-semibold">
                      Nenhum pedido
                    </div>
                  ) : colOrders.map(order => (
                    <OrderCard key={order.id} order={order}
                      orderItems={orderItems[order.id]||[]}
                      colIndex={colIndex} colCount={COLUMNS.length}
                      onView={o=>setViewTarget({...o, _items: orderItems[o.id]||[]})}
                      onEdit={o=>{setEditing(o);setModal(true)}}
                      onDelete={o=>setDelTarget(o)}
                      onMove={handleMove}/>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal visualização */}
      <OrderViewModal
        order={viewTarget} open={!!viewTarget}
        onClose={()=>setViewTarget(null)}
        onEdit={o=>{setEditing(o);setModal(true)}}
        onDelete={o=>setDelTarget(o)}/>

      {/* Modal pedido */}
      <OrderModal open={modal} onClose={()=>{setModal(false);setEditing(null)}}
        onSave={handleSave} initial={editing}
        initialItems={editing ? orderItems[editing.id] : null}
        loading={saving}/>

      {/* Confirm delete */}
      {delTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <p className="font-bold text-slate-800 mb-1">Remover pedido?</p>
            <p className="text-sm text-slate-500 mb-1"><strong>{delTarget.title}</strong></p>
            <p className="text-xs text-slate-400 mb-4">Cliente: {delTarget.client_name}</p>
            <div className="flex gap-2">
              <button onClick={()=>setDelTarget(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={()=>handleDelete(delTarget)} className="btn-primary flex-1 bg-rose-500 hover:bg-rose-600">Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}