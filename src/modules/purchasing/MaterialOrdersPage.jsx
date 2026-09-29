import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Package, Plus, Check, Loader2, Trash2, Receipt, ShieldAlert, Search, Truck, X, ClipboardCheck, Flag, Pencil, History,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { useMaterialOrders } from './hooks/useMaterialOrders'
import { useMaterials } from '../materials/hooks/useMaterials'
import { useSheets } from '../materials/hooks/useSheets'
import { useSuppliers } from '../financial/hooks/useSuppliers'
import { BillFormModal } from '../financial/components/BillFormModal'
import { useBills } from '../financial/hooks/useBills'
import { ConferenceReport } from './ConferenceReport'
import { DeliveryEditor, deliveryInfo } from './DeliveryDate'
import { todayISO } from '../../lib/dateBR'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'

// Data/hora sempre no horário de Brasília
function fmtDataHoraBR(iso) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
import { OCC_KIND, OCC_RESOLUTION, isOpenOccurrence } from './occurrenceTracking'
import { OccurrenceTrackingModal, FinalizeOrderModal, OccStatusBadge, OccKindBadge } from './OccurrenceTrackingModal'
import toast from 'react-hot-toast'
import { itemName, itemUnit, isSheetItem, cutName, itemCuts } from './orderItem'

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
  finalizado:{ label: 'Finalizado',                      text: 'text-white',       bg: 'bg-slate-800 border-slate-800' },
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
// editOrder = pedido existente (modo edição) ou null (novo pedido)
// Chave única do item na lista: matéria-prima comum ou chapa (formato+espessura+cor)
function itemKey(it) {
  return it.sheet_format_id ? `s:${it.sheet_format_id}:${it.sheet_thickness_id}:${it.sheet_color_id}` : it.raw_material_id
}

function OrderFormModal({ open, onClose, onSave, materials, suppliers, editOrder, sheets, lastSheetPrice }) {
  const [title, setTitle]           = useState('')
  const [expected, setExpected]     = useState('') // previsão de entrega (YYYY-MM-DD)
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes]           = useState('')
  const [items, setItems]           = useState([]) // [{key, raw_material_id | sheet_format_id+thickness+color, qty_ordered, unit_price}]
  const [catalogTab, setCatalogTab] = useState('chapas') // chapas | materias
  const [pickFormat, setPickFormat] = useState('')
  const [pickThickness, setPickThickness] = useState('')
  const [pickColor, setPickColor]   = useState('')
  const [search, setSearch]         = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [onlySupplier, setOnlySupplier] = useState(false)
  const [saving, setSaving]         = useState(false)
  // Depois da conferência os itens ficam travados (estoque já entrou)
  const itemsLocked = !!editOrder && editOrder.status !== 'pedido'

  const wasEditing = useRef(false)
  // Abriu em modo edição → carrega o pedido; abriu pra novo depois de
  // editar → limpa (senão sobraria o pedido editado no formulário)
  useEffect(() => {
    if (!open) return
    if (editOrder) {
      setTitle(editOrder.title || '')
      setExpected(editOrder.expected_delivery || '')
      setSupplierId(editOrder.supplier_id || '')
      setNotes(editOrder.notes || '')
      setItems((editOrder.items || []).map(it => ({
        id: it.id, key: itemKey(it), raw_material_id: it.raw_material_id,
        sheet_format_id: it.sheet_format_id, sheet_thickness_id: it.sheet_thickness_id, sheet_color_id: it.sheet_color_id,
        qty_ordered: String(Number(it.qty_ordered)), unit_price: it.unit_price != null ? String(Number(it.unit_price)) : '',
      })))
      setSearch(''); setCategoryId(''); setOnlySupplier(false)
    } else if (wasEditing.current) {
      reset()
    }
    wasEditing.current = !!editOrder
  }, [open, editOrder]) // eslint-disable-line react-hooks/exhaustive-deps

  const materialById = id => materials.find(m => m.id === id)
  const selectedIds  = useMemo(() => new Set(items.map(it => it.raw_material_id).filter(Boolean)), [items])
  // Sub-chapas de MDF não aparecem aqui: compra-se a CHAPA (aba "Chapas de MDF"),
  // e a conferência é que transforma em sub-chapas no estoque.
  const active       = useMemo(() => materials.filter(m => m.active !== false && !m.sheet_cut_id), [materials])
  const activeFormats = useMemo(() => (sheets?.formats ?? []).filter(f => f.active !== false), [sheets])
  const activeThicks  = useMemo(() => (sheets?.thicknesses ?? []).filter(t => t.active !== false), [sheets])
  const activeColors  = useMemo(() => (sheets?.colors ?? []).filter(c => c.active !== false), [sheets])
  const sheetName = it => [
    sheets?.formats?.find(f => f.id === it.sheet_format_id)?.name,
    sheets?.thicknesses?.find(t => t.id === it.sheet_thickness_id)?.name,
    sheets?.colors?.find(c => c.id === it.sheet_color_id)?.name,
  ].filter(Boolean).join(' · ')

  function addSheet() {
    if (!pickFormat || !pickThickness || !pickColor) { toast.error('Escolha a chapa, a espessura e a cor.'); return }
    const it = { sheet_format_id: pickFormat, sheet_thickness_id: pickThickness, sheet_color_id: pickColor }
    const key = itemKey(it)
    if (items.some(x => x.key === key)) { toast.error('Essa chapa já está no pedido — ajuste a quantidade na lista.'); return }
    setItems(prev => [...prev, { ...it, key, qty_ordered: '', unit_price: lastSheetPrice?.(key) ?? '' }])
    setPickColor('') // mantém chapa/espessura: normalmente o César pede várias cores da mesma
  }

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
      : [...prev, { key: m.id, raw_material_id: m.id, qty_ordered: '', unit_price: suggestedPrice(m, supplierId) }])
  }
  function updateItem(key, field, value) {
    setItems(prev => prev.map(it => it.key === key ? { ...it, [field]: value } : it))
  }
  function removeItem(key) {
    setItems(prev => prev.filter(it => it.key !== key))
  }
  // Trocou o fornecedor: preenche o preço dos itens que ainda estão sem preço
  function handleSupplierChange(id) {
    setSupplierId(id)
    if (!id) setOnlySupplier(false)
    setItems(prev => prev.map(it => {
      if (it.unit_price || !it.raw_material_id) return it
      const m = materialById(it.raw_material_id)
      return m ? { ...it, unit_price: suggestedPrice(m, id) } : it
    }))
  }

  function reset() {
    setTitle(''); setExpected(''); setSupplierId(''); setNotes(''); setItems([]); setSearch(''); setCategoryId(''); setOnlySupplier(false)
    setPickFormat(''); setPickThickness(''); setPickColor('')
  }

  const missingQty = items.filter(it => !(Number(it.qty_ordered) > 0)).length

  async function handleSave() {
    if (missingQty) { toast.error(`Falta a quantidade de ${missingQty} item(ns).`); return }
    setSaving(true)
    try {
      await onSave({ title, expected_delivery: expected || null, supplier_id: supplierId || null, notes, items: items.map(it => ({ ...it, unit_price: it.unit_price || null })) })
      if (!editOrder) reset()
      onClose()
    } catch { /* toast já mostrado no hook */ }
    finally { setSaving(false) }
  }

  const total = items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.qty_ordered) || 0), 0)

  return (
    <Modal open={open} onClose={onClose} size="wide"
      title={editOrder ? `Editar pedido — ${editOrder.title || editOrder.supplier?.name || 'sem nome'}` : 'Novo Pedido de Matéria-Prima/Chapas'}
      subtitle={itemsLocked
        ? 'Pedido já conferido: dá pra corrigir nome, fornecedor, previsão e observações — os itens ficam travados (o estoque já entrou).'
        : '1) Escolha o fornecedor  2) Marque os produtos  3) Preencha as quantidades na lista da direita'}
      footer={<>
        <span className="mr-auto text-sm font-bold text-slate-700">
          {items.length} item{items.length !== 1 ? 's' : ''} · Total estimado: {fmtPreco(total)}
        </span>
        <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={handleSave} className="btn-primary" disabled={saving || items.length === 0}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Salvando...' : editOrder ? 'Salvar alterações' : 'Criar pedido'}
        </button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_170px] gap-4">
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
          <div>
            <label className="form-label">Previsão de entrega</label>
            <input type="date" className="input" value={expected} min={editOrder ? undefined : todayISO()} onChange={e => setExpected(e.target.value)} />
            <p className="text-[11px] text-slate-400 mt-1">Opcional — dá pra definir depois.</p>
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-4 ${itemsLocked ? '' : 'lg:grid-cols-2'}`}>
          {/* Catálogo — busca + marcar */}
          <div className={`border border-slate-200 rounded-2xl flex flex-col min-h-0 ${itemsLocked ? 'hidden' : ''}`}>
            <div className="flex bg-slate-100 rounded-t-2xl p-1 gap-1">
              <button type="button" onClick={() => setCatalogTab('chapas')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${catalogTab === 'chapas' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Chapas de MDF</button>
              <button type="button" onClick={() => setCatalogTab('materias')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${catalogTab === 'materias' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Outras matérias-primas</button>
            </div>

            {catalogTab === 'chapas' ? (
              <div className="p-3 flex flex-col gap-3 overflow-y-auto max-h-[52vh]">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">1. Chapa</p>
                  <div className="flex flex-col gap-1.5">
                    {activeFormats.map(f => {
                      const sel = pickFormat === f.id
                      const pieces = (f.cuts || []).reduce((s, c) => s + Number(c.qty_per_sheet || 0), 0)
                      return (
                        <button key={f.id} type="button" onClick={() => setPickFormat(f.id)}
                          className={`w-full text-left rounded-xl border-2 px-3 py-2 transition ${sel ? 'border-amber-400 bg-amber-50' : 'border-slate-100 hover:border-slate-200'}`}>
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-bold text-slate-800">{f.name}</span>
                            <span className="text-[11px] text-slate-400 shrink-0">{Number(f.width_mm || 0)}×{Number(f.length_mm || 0)} mm</span>
                          </span>
                          <span className="block text-[11px] text-slate-500 truncate">
                            rende {pieces} sub-chapa{pieces !== 1 ? 's' : ''}: {(f.cuts || []).map(c => `${c.qty_per_sheet}× ${c.name}`).join(', ')}
                          </span>
                          {/confirmar/i.test(f.notes || '') && <span className="block text-[10px] text-amber-600 font-semibold">⚠ {f.notes}</span>}
                        </button>
                      )
                    })}
                    {activeFormats.length === 0 && <p className="text-xs text-slate-400">Nenhuma chapa cadastrada — cadastre em Matéria-Prima → Chapas de MDF.</p>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">2. Espessura</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeThicks.map(t => (
                      <button key={t.id} type="button" onClick={() => setPickThickness(t.id)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full border ${pickThickness === t.id ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{t.name}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">3. Cor</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeColors.map(c => (
                      <button key={c.id} type="button" onClick={() => setPickColor(c.id)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${pickColor === c.id ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{c.name}</button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={addSheet} disabled={!pickFormat || !pickThickness || !pickColor}
                  className="btn-primary justify-center py-2 text-sm"><Plus size={14} /> Adicionar ao pedido</button>
                <p className="text-[11px] text-slate-400 -mt-1">Espessura e chapa ficam selecionadas — dá pra ir trocando só a cor e adicionando.</p>
              </div>
            ) : (<>
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
            </>)}
          </div>

          {/* Selecionados — quantidade e preço já na lista */}
          <div className="border border-slate-200 rounded-2xl flex flex-col min-h-0 bg-slate-50/40">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">Itens do pedido <span className="text-slate-400 font-normal">({items.length})</span></p>
              {items.length > 0 && !itemsLocked && <button type="button" onClick={() => setItems([])} className="text-[11px] font-semibold text-slate-400 hover:text-rose-500">Limpar</button>}
            </div>
            <div className="overflow-y-auto max-h-[45vh] p-2 flex flex-col gap-2">
              {items.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <Package size={28} strokeWidth={1} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-400">Marque os produtos na lista ao lado — eles aparecem aqui pra você preencher a quantidade.</p>
                </div>
              ) : items.map(it => {
                const isSheet = !!it.sheet_format_id
                const m = isSheet ? null : materialById(it.raw_material_id)
                const fmt = isSheet ? sheets?.formats?.find(f => f.id === it.sheet_format_id) : null
                const pieces = fmt ? (fmt.cuts || []).reduce((s, c) => s + Number(c.qty_per_sheet || 0), 0) : 0
                const sub = (Number(it.unit_price) || 0) * (Number(it.qty_ordered) || 0)
                const noQty = !(Number(it.qty_ordered) > 0)
                return (
                  <div key={it.key} className={`bg-white border rounded-xl px-3 py-2.5 ${isSheet ? 'border-amber-200' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{isSheet ? sheetName(it) : m?.name}</p>
                        {isSheet && <p className="text-[11px] text-amber-700">cada chapa = {pieces} sub-chapa{pieces !== 1 ? 's' : ''} no estoque{Number(it.qty_ordered) > 0 ? ` → ${pieces * Number(it.qty_ordered)} no total` : ''}</p>}
                      </div>
                      {!itemsLocked && <button type="button" onClick={() => removeItem(it.key)} className="p-1 -m-1 text-slate-300 hover:text-rose-500 shrink-0"><Trash2 size={14} /></button>}
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase">Qtd ({isSheet ? 'chapas' : m?.unit})</label>
                        <input type="number" min={isSheet ? 1 : 0.001} step={isSheet ? 1 : 0.001} inputMode="decimal" placeholder="0"
                          disabled={itemsLocked} className={`input py-1.5 ${noQty ? 'border-amber-300 bg-amber-50/40' : ''}`}
                          value={it.qty_ordered} onChange={e => updateItem(it.key, 'qty_ordered', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase">Preço {isSheet ? 'da chapa' : 'un.'} (R$)</label>
                        <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="opcional" className="input py-1.5" disabled={itemsLocked}
                          value={it.unit_price} onChange={e => updateItem(it.key, 'unit_price', e.target.value)} />
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

// ─── Ocorrências (avaria / falta / excesso) — clique abre o acompanhamento ──
function OccurrenceRow({ occ, order, onTrack }) {
  const item = order.items?.find(i => i.id === occ.order_item_id)
  const open = isOpenOccurrence(occ)
  const qty = occ.qty_affected ?? occ.qty_damaged
  return (
    <button type="button" onClick={() => onTrack(occ, order)}
      className={`w-full text-left flex items-start gap-2.5 rounded-xl px-3 py-2.5 border transition hover:shadow-sm ${open ? 'bg-rose-50/60 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
      <ShieldAlert size={14} className={`shrink-0 mt-0.5 ${open ? 'text-rose-500' : 'text-slate-400'}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold flex items-center gap-1.5 flex-wrap ${open ? 'text-rose-700' : 'text-slate-600'}`}>
          <OccKindBadge kind={occ.kind} />
          {itemName(item)}{occ.sheet_cut_id && <span className="font-normal"> · {cutName(item, occ.sheet_cut_id)}</span>}
          {qty != null && <span className="font-normal">— {fmtQty(qty, itemUnit(item))} {OCC_KIND[occ.kind]?.verb || 'avariado'}</span>}
        </p>
        {occ.status === 'resolvido'
          ? <p className="text-[11px] text-emerald-700 mt-0.5">Solução: {OCC_RESOLUTION[occ.resolution] || '—'}{occ.resolution_notes ? ` — ${occ.resolution_notes}` : ''}</p>
          : occ.description && <p className="text-xs text-slate-500 mt-0.5">{occ.description}</p>}
      </div>
      <span className="flex flex-col items-end gap-1 shrink-0">
        <OccStatusBadge status={occ.status} />
        <span className="text-[10px] font-semibold text-violet-600">Acompanhar →</span>
      </span>
    </button>
  )
}

// ─── Card de pedido ──────────────────────────────────────────────────
function OrderCard({ order, onRegisterBill, onCancel, onTrack, onFinalize, onSetDelivery, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const occurrences = order.occurrences || []
  const openOccurrences = occurrences.filter(isOpenOccurrence)

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
          <div className="mt-1.5">
            <DeliveryEditor order={order} onSave={onSetDelivery} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {openOccurrences.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">
              <ShieldAlert size={12} /> {openOccurrences.length} ocorrência{openOccurrences.length > 1 ? 's' : ''} pendente{openOccurrences.length > 1 ? 's' : ''}
            </span>
          )}
          <StatusBadge status={order.status} />
        </div>
      </div>

      <button onClick={() => setExpanded(e => !e)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-1">
        <Package size={12} /> {order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''} — {expanded ? 'ocultar' : 'ver detalhes'}
      </button>

      {expanded && (
        // Quantidade na frente do nome, lista compacta (pedido do Raphael, 25/09)
        <div className="mb-3 mt-2 bg-slate-50 rounded-xl divide-y divide-slate-100 max-w-3xl">
          {(order.items || []).map(it => (
            <div key={it.id} className="flex items-baseline gap-3 text-xs px-3 py-1.5">
              <span className="w-20 shrink-0 text-right font-bold text-slate-800 tabular-nums">{fmtQty(it.qty_ordered, itemUnit(it))}</span>
              <span className="text-slate-700 min-w-0 flex-1">
                {itemName(it)}
                {it.qty_received != null && <span className="text-slate-400"> · recebido {fmtQty(it.qty_received, itemUnit(it))}</span>}
                {Number(it.qty_damaged) > 0 && <span className="text-rose-500 font-semibold"> · {fmtQty(it.qty_damaged, isSheetItem(it) ? 'sub-chapa(s)' : itemUnit(it))} avariado</span>}
              </span>
              {it.unit_price != null && (
                <span className="shrink-0 text-slate-400 tabular-nums">{fmtPreco(it.unit_price)} un. · <b className="text-slate-600">{fmtPreco(Number(it.unit_price) * Number(it.qty_ordered))}</b></span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ocorrências pendentes sempre visíveis; resolvidas só no detalhe */}
      {(openOccurrences.length > 0 || (expanded && occurrences.length > 0)) && (
        <div className="flex flex-col gap-1.5 mb-3 max-w-3xl">
          {(expanded ? occurrences : openOccurrences).map(occ => <OccurrenceRow key={occ.id} occ={occ} order={order} onTrack={onTrack} />)}
        </div>
      )}

      {order.status === 'finalizado' && (
        <div className="mb-3 max-w-3xl bg-slate-800 text-white rounded-xl px-3 py-2.5">
          <p className="text-[11px] font-bold flex items-center gap-1.5"><Flag size={12} /> Finalizado {order.closer?.name ? `por ${order.closer.name} ` : ''}em {new Date(order.closed_at).toLocaleDateString('pt-BR')}</p>
          {order.closing_notes && <p className="text-xs text-slate-200 mt-0.5 whitespace-pre-line">{order.closing_notes}</p>}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-slate-50">
        <span className="text-sm font-bold text-slate-700">Total estimado: {fmtPreco(orderTotal(order))}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => onEdit(order)} title="Editar pedido" className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50"><Pencil size={14} /></button>
          {['pedido', 'cancelado'].includes(order.status) && (
            <button onClick={() => onDelete(order)} title="Excluir pedido" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={14} /></button>
          )}
          {order.status === 'conferido' && openOccurrences.length === 0 && (
            <button onClick={() => onFinalize(order)} className="btn-secondary py-1.5 text-xs"><Flag size={13} /> Finalizar pedido</button>
          )}
          {/* Só dá pra cancelar antes da conferência — depois o estoque já entrou */}
          {order.status === 'pedido' && !order.bill_id && (
            <button onClick={() => onCancel(order.id)} className="text-xs font-semibold text-slate-400 hover:text-rose-500">Cancelar</button>
          )}
          {order.bill_id ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><Receipt size={13} /> Registrado no Financeiro</span>
          ) : order.status !== 'cancelado' && (
            <button onClick={() => onRegisterBill(order)} className="btn-primary py-1.5 text-xs"><Receipt size={13} /> Registrar no Financeiro</button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-2 text-[11px] text-slate-400">
        {order.conferred_at && <span>Conferido por {order.conferrer?.name || '—'} em {new Date(order.conferred_at).toLocaleDateString('pt-BR')}</span>}
        {/* "Última atualização" — só aparece se o pedido mudou depois de criado */}
        {order.updated_at && new Date(order.updated_at) - new Date(order.created_at) > 60000 && (
          <span className="flex items-center gap-1"><History size={11} /> Última atualização {fmtDataHoraBR(order.updated_at)}{order.updater?.name ? ` por ${order.updater.name}` : ''}</span>
        )}
      </div>
    </div>
  )
}

export function MaterialOrdersPage() {
  const { orders, loading, refetch, createOrder, updateOrder, deleteOrder, linkBill, cancelOrder, setExpectedDelivery } = useMaterialOrders()
  const [editing, setEditing]   = useState(null) // pedido em edição (modal reaproveitado do "novo")
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  async function handleDelete() {
    setDeleteBusy(true)
    try { await deleteOrder(deleting); setDeleting(null) } catch { /* toast no hook */ }
    finally { setDeleteBusy(false) }
  }
  const [tracking, setTracking]     = useState(null) // { occ, order }
  const [finalizing, setFinalizing] = useState(null)
  // Aba via URL (?aba=conferencias) — o antigo /relatorio-conferencias redireciona pra cá
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('aba') === 'conferencias' ? 'conferencias' : 'pedidos'
  function changeTab(t) {
    setSearchParams(t === 'conferencias' ? { aba: 'conferencias' } : {}, { replace: true })
    // A aba de conferências pode ter resolvido ocorrência — recarrega os pedidos ao voltar
    if (t === 'pedidos') refetch()
  }
  const pendingCount = orders.filter(o => o.status === 'pedido').length
  const lateCount = orders.filter(o => deliveryInfo(o.expected_delivery, o.status)?.late).length
  const { materials } = useMaterials()
  const sheets = useSheets()
  // Último preço pago por chapa (formato+espessura+cor) — sugere no pedido novo
  const lastSheetPrice = useMemo(() => {
    const map = new Map()
    ;[...orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(o => (o.items || []).forEach(it => {
      if (it.sheet_format_id && it.unit_price != null) map.set(`s:${it.sheet_format_id}:${it.sheet_thickness_id}:${it.sheet_color_id}`, String(Number(it.unit_price)))
    }))
    return key => map.get(key)
  }, [orders])
  const { suppliers } = useSuppliers()
  const { create: createBill } = useBills()

  const [modal, setModal]           = useState(false)
  const [billOrder, setBillOrder]   = useState(null)
  const [billSaving, setBillSaving] = useState(false)

  const billPrefill = useMemo(() => {
    if (!billOrder) return null
    const itemsDesc = (billOrder.items || []).map(it => `${itemName(it)} (${fmtQty(it.qty_ordered, itemUnit(it))})`).join(', ')
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
      const billIds = await createBill(payload)
      const billId  = Array.isArray(billIds) ? billIds[0] : billIds

      // A conta nasce EM ABERTO (29/09). Antes, parcela única já nascia
      // "paga" (copiado do Compras) — mas pedido de matéria-prima é quase
      // sempre boleto/PIX a vencer: a conta "ROLAMENTO - PEDIDO 35" (boleto
      // pra 30/09) apareceu como paga sem ninguém ter pago. O pagamento é
      // dado no Financeiro quando acontecer de verdade.
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
          <button onClick={() => { setEditing(null); setModal(true) }} className="btn-primary">
            <Plus size={16} /> Novo pedido
          </button>
        )}
      </div>

      <div className="flex bg-slate-100 rounded-xl p-1 self-start">
        <button onClick={() => changeTab('pedidos')} className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-1.5 transition ${tab === 'pedidos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Package size={15} /> Pedidos
          {pendingCount > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{pendingCount} aguardando</span>}
          {lateCount > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white">{lateCount} atrasado{lateCount > 1 ? 's' : ''}</span>}
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
              onRegisterBill={setBillOrder} onCancel={cancelOrder}
              onTrack={(occ, order) => setTracking({ occ, order })} onFinalize={setFinalizing}
              onSetDelivery={setExpectedDelivery}
              onEdit={o => { setEditing(o); setModal(true) }} onDelete={setDeleting} />
          ))}
        </div>
      )}

      {tracking && (
        <OccurrenceTrackingModal occurrence={tracking.occ} order={tracking.order}
          item={tracking.order.items?.find(i => i.id === tracking.occ.order_item_id)}
          onClose={() => setTracking(null)} onChanged={refetch} />
      )}
      <FinalizeOrderModal order={finalizing} onClose={() => setFinalizing(null)} onDone={refetch} />

      <OrderFormModal open={modal} onClose={() => { setModal(false); setEditing(null) }}
        onSave={payload => editing ? updateOrder(editing, payload) : createOrder(payload)}
        editOrder={editing} materials={materials} suppliers={suppliers} sheets={sheets} lastSheetPrice={lastSheetPrice} />

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} loading={deleteBusy}
        title="Excluir pedido?" confirmLabel="Excluir"
        description={deleting ? `"${deleting.title || deleting.supplier?.name || 'Pedido'}" e seus ${deleting.items?.length || 0} item(ns) serão apagados de vez.${deleting.bill_id ? ' ATENÇÃO: a conta já registrada no Financeiro NÃO é apagada — confira e exclua lá se for o caso.' : ''}` : ''} />

      <BillFormModal open={!!billOrder} onClose={() => setBillOrder(null)} onSave={handleSaveBillForOrder}
        loading={billSaving} prefill={billPrefill} />
    </div>
  )
}
