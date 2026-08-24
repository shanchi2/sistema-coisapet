import { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X, AlertTriangle, Package, FlaskConical } from 'lucide-react'
import { Modal }               from '../../../components/ui/Modal'
import { ConfirmDialog }       from '../../../components/ui/ConfirmDialog'
import { useBillOfMaterials }  from '../hooks/useBillOfMaterials'
import { useMaterials }        from '../../materials/hooks/useMaterials'

function fmtCurrency(v) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtQty(v, unit) {
  const n = Number(v)
  return `${n % 1 === 0 ? n : n.toFixed(3).replace(/\.?0+$/, '')} ${unit}`
}

// ─── Linha de item da ficha técnica ──────────────────────────────
function BomRow({ item, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [qty,     setQty]     = useState(String(item.qty_required))
  const [notes,   setNotes]   = useState(item.notes ?? '')
  const [saving,  setSaving]  = useState(false)
  const [delOpen, setDelOpen] = useState(false)

  const stock      = Number(item.raw_material?.stock_qty ?? 0)
  const qtyReq     = Number(item.qty_required)
  const canProduce = qtyReq > 0 ? Math.floor(stock / qtyReq) : '∞'
  const isLow      = typeof canProduce === 'number' && canProduce <= 5

  async function handleSave() {
    if (!qty || Number(qty) <= 0) return
    setSaving(true)
    try { await onUpdate(item.id, qty, notes); setEditing(false) }
    catch {} finally { setSaving(false) }
  }

  return (
    <>
      <div className="border border-slate-100 rounded-xl p-4 bg-white">
        {editing ? (
          /* Modo edição */
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <FlaskConical size={14} className="text-amber-500" />
              </div>
              <p className="font-semibold text-slate-800 text-sm">
                {item.raw_material?.name}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Quantidade por unidade</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0.001" step="0.001"
                    className="input"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    autoFocus
                  />
                  <span className="text-xs text-slate-400 shrink-0">
                    {item.raw_material?.unit}
                  </span>
                </div>
              </div>
              <div>
                <label className="form-label">Observação</label>
                <input className="input" placeholder="Opcional..."
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={!qty || Number(qty) <= 0 || saving}
                className="btn-primary py-1.5 text-xs">
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Check size={13} /> Salvar</>
                }
              </button>
              <button onClick={() => { setEditing(false); setQty(String(item.qty_required)); setNotes(item.notes ?? '') }}
                className="btn-secondary py-1.5 text-xs">
                <X size={13} /> Cancelar
              </button>
            </div>
          </div>
        ) : (
          /* Modo visualização */
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <FlaskConical size={14} className="text-amber-500" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 text-sm">{item.raw_material?.name}</p>
              <div className="flex items-center gap-3 mt-0.5">
                {/* Quantidade necessária */}
                <span className="text-xs text-slate-500">
                  <span className="font-bold text-slate-700">
                    {fmtQty(item.qty_required, item.raw_material?.unit ?? '')}
                  </span> por unidade
                </span>
                {/* Em estoque */}
                <span className="text-xs text-slate-400">
                  Estoque: {fmtQty(item.raw_material?.stock_qty ?? 0, item.raw_material?.unit ?? '')}
                </span>
              </div>
              {item.notes && (
                <p className="text-xs text-slate-400 mt-0.5 italic">{item.notes}</p>
              )}
            </div>

            {/* Capacidade: quantas unidades dá para fazer */}
            <div className={`text-right shrink-0 px-3 py-1.5 rounded-xl ${
              isLow ? 'bg-rose-50' : 'bg-emerald-50'
            }`}>
              <p className={`text-xs font-semibold ${isLow ? 'text-rose-500' : 'text-emerald-600'}`}>
                {isLow && <AlertTriangle size={11} className="inline mr-0.5" />}
                Dá para {canProduce}
              </p>
              <p className="text-[10px] text-slate-400">unid. c/ estoque atual</p>
            </div>

            {/* Ações */}
            <div className="flex gap-1 shrink-0">
              <button onClick={() => setEditing(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all">
                <Pencil size={14} />
              </button>
              <button onClick={() => setDelOpen(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={async () => { await onRemove(item.id); setDelOpen(false) }}
        title={`Remover "${item.raw_material?.name}" da ficha?`}
        description="O insumo será removido da composição deste produto."
        confirmLabel="Remover"
      />
    </>
  )
}

// ─── Formulário de novo item ──────────────────────────────────────
function AddItemForm({ materials, existingIds, onAdd, onCancel }) {
  const [materialId, setMaterialId] = useState('')
  const [qty,        setQty]        = useState('')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  // Filtra matérias-primas já adicionadas
  const available = materials.filter(m => !existingIds.includes(m.id))

  // Quando seleciona o material, foca no campo de quantidade
  const selected = materials.find(m => m.id === materialId)

  async function handleAdd() {
    if (!materialId) { setError('Selecione um insumo.'); return }
    if (!qty || Number(qty) <= 0) { setError('Informe a quantidade.'); return }
    setError('')
    setSaving(true)
    try { await onAdd(materialId, qty, notes); }
    catch {}
    finally { setSaving(false) }
  }

  return (
    <div className="border-2 border-dashed border-rose-200 rounded-xl p-4 bg-rose-50/50 flex flex-col gap-3">
      <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
        Adicionar insumo
      </p>

      {available.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-2">
          Todos os insumos cadastrados já foram adicionados.
        </p>
      ) : (
        <>
          {/* Select de matéria-prima */}
          <div>
            <label className="form-label">Insumo *</label>
            <select className="select bg-white" value={materialId}
              onChange={e => { setMaterialId(e.target.value); setError('') }}>
              <option value="">Selecione a matéria-prima...</option>
              {available.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit}) — Estoque: {Number(m.stock_qty).toLocaleString('pt-BR')}
                </option>
              ))}
            </select>
          </div>

          {/* Quantidade + observação */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">
                Quantidade por unidade *
                {selected && <span className="text-slate-400 ml-1">({selected.unit})</span>}
              </label>
              <input
                type="number" min="0.001" step="0.001"
                className="input bg-white"
                placeholder={`Ex: 2.5`}
                value={qty}
                onChange={e => { setQty(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div>
              <label className="form-label">Observação</label>
              <input className="input bg-white" placeholder="Opcional..."
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-xs text-rose-500">{error}</p>}

          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="btn-primary py-2 text-xs">
              {saving
                ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><Plus size={13} /> Adicionar</>
              }
            </button>
            <button onClick={onCancel} className="btn-secondary py-2 text-xs">
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Modal principal ──────────────────────────────────────────────
export function BillOfMaterialsModal({ open, onClose, product }) {
  const { items, loading, canProduce, addItem, updateItem, removeItem } =
    useBillOfMaterials(product?.id)
  const { materials } = useMaterials()

  const [showAdd, setShowAdd] = useState(false)

  const existingIds = items.map(i => i.raw_material_id)

  // Custo total estimado por unidade
  const totalCost = items.reduce((acc, item) => {
    const unitCost = Number(item.raw_material?.unit_cost ?? 0)
    const qty      = Number(item.qty_required)
    return acc + unitCost * qty
  }, 0)

  async function handleAdd(materialId, qty, notes) {
    await addItem(materialId, qty, notes)
    setShowAdd(false)
  }

  if (!product) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ficha Técnica"
      subtitle={product.name}
      size="lg"
      footer={
        <button onClick={onClose} className="btn-secondary">Fechar</button>
      }
    >
      <div className="flex flex-col gap-4">

        {/* ── Resumo do produto ── */}
        <div className="grid grid-cols-3 gap-3">
          {/* Capacidade produtiva */}
          <div className={`rounded-xl p-3 border ${
            canProduce === null ? 'bg-slate-50 border-slate-100'
            : canProduce === 0  ? 'bg-rose-50 border-rose-100'
            : canProduce <= 5   ? 'bg-amber-50 border-amber-100'
            : 'bg-emerald-50 border-emerald-100'
          }`}>
            <p className="text-xs font-semibold text-slate-400 mb-0.5">Produção possível</p>
            <p className={`font-display font-black text-2xl ${
              canProduce === null ? 'text-slate-400'
              : canProduce === 0  ? 'text-rose-500'
              : canProduce <= 5   ? 'text-amber-600'
              : 'text-emerald-600'
            }`} style={{ fontFamily: 'Nunito, sans-serif' }}>
              {canProduce === null ? '—' : canProduce}
            </p>
            <p className="text-[10px] text-slate-400">
              {canProduce === null
                ? 'Sem ficha técnica'
                : canProduce === 0
                ? 'Estoque insuficiente'
                : 'unidades com estoque atual'
              }
            </p>
          </div>

          {/* Custo estimado */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-xs font-semibold text-slate-400 mb-0.5">Custo de produção</p>
            <p className="font-display font-black text-2xl text-slate-800"
               style={{ fontFamily: 'Nunito, sans-serif' }}>
              {fmtCurrency(totalCost)}
            </p>
            <p className="text-[10px] text-slate-400">por unidade (com base nos custos)</p>
          </div>

          {/* Margem estimada */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-xs font-semibold text-slate-400 mb-0.5">Margem estimada</p>
            <p className={`font-display font-black text-2xl ${
              product.sale_price > totalCost ? 'text-emerald-600' : 'text-rose-500'
            }`} style={{ fontFamily: 'Nunito, sans-serif' }}>
              {totalCost > 0 && product.sale_price > 0
                ? `${(((product.sale_price - totalCost) / product.sale_price) * 100).toFixed(0)}%`
                : '—'
              }
            </p>
            <p className="text-[10px] text-slate-400">
              Venda: {fmtCurrency(product.sale_price)} / Custo: {fmtCurrency(totalCost)}
            </p>
          </div>
        </div>

        {/* ── Itens da ficha ── */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Composição — {items.length} insumo(s)
              </p>
              {!showAdd && (
                <button onClick={() => setShowAdd(true)} className="btn-primary py-1.5 text-xs">
                  <Plus size={14} /> Adicionar insumo
                </button>
              )}
            </div>

            {/* Formulário de adição */}
            {showAdd && (
              <AddItemForm
                materials={materials.filter(m => m.active !== false)}
                existingIds={existingIds}
                onAdd={handleAdd}
                onCancel={() => setShowAdd(false)}
              />
            )}

            {/* Lista de itens */}
            {items.length === 0 && !showAdd ? (
              <div className="flex flex-col items-center py-10 text-center gap-3">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <Package size={24} className="text-slate-400" />
                </div>
                <p className="font-semibold text-slate-600 text-sm">Ficha técnica vazia</p>
                <p className="text-xs text-slate-400 max-w-xs">
                  Adicione os insumos necessários para fabricar 1 unidade de{' '}
                  <strong>{product.name}</strong>.
                </p>
                <button onClick={() => setShowAdd(true)} className="btn-primary mt-1">
                  <Plus size={16} /> Adicionar primeiro insumo
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map(item => (
                  <BomRow
                    key={item.id}
                    item={item}
                    onUpdate={updateItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </Modal>
  )
}
