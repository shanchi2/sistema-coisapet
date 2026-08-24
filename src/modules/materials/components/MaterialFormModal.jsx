import { useState, useEffect } from 'react'
import { Plus, Check } from 'lucide-react'
import { maskCurrency, parseCurrency } from '../../../lib/masks'
import { Modal } from '../../../components/ui/Modal'
import { useMaterialCategories } from '../hooks/useMaterialCategories'
import { useMaterials }          from '../hooks/useMaterials'
import { useSuppliers }          from '../../financial/hooks/useSuppliers'

export const UNITS = [
  { value: 'chapa',   label: 'Chapa'   },
  { value: 'peça',    label: 'Peça'    },
  { value: 'kg',      label: 'Kg'      },
  { value: 'metro',   label: 'Metro'   },
  { value: 'litro',   label: 'Litro'   },
  { value: 'unidade', label: 'Unidade' },
  { value: 'rolo',    label: 'Rolo'    },
]

const EMPTY = {
  name:        '',
  category_id: '',
  unit:        'unidade',
  unit_cost:   '',
  stock_qty:   '',
  stock_min:   '',
  width_cm:    '',
  length_cm:   '',
  notes:       '',
}

// Unidades em que faz sentido perguntar largura/comprimento (chapa, rolo)
const DIMENSIONED_UNITS = ['chapa', 'rolo']

export function MaterialFormModal({ open, onClose, onSave, initial = null, loading = false }) {
  const { categories }              = useMaterialCategories()
  const { suppliers, create: addSupplier } = useSuppliers()
  const { linkSupplier, unlinkSupplier }   = useMaterials()

  const [form,   setForm]   = useState(EMPTY)
  const [errors, setErrors] = useState({})

  // Fornecedores vinculados a este material — N:N, pode ter vários.
  // Toggle é imediato (grava direto no banco) quando editando, já que
  // o material já existe e tem id pra vincular.
  const [linkedSupplierIds, setLinkedSupplierIds] = useState(new Set())
  const [togglingSupplier,  setTogglingSupplier]  = useState(null)

  // Estado para cadastrar novo fornecedor inline
  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [savingSupplier,  setSavingSupplier]  = useState(false)

  useEffect(() => {
    if (open) {
      setErrors({})
      setShowNewSupplier(false)
      setNewSupplierName('')
      setLinkedSupplierIds(new Set((initial?.suppliers_rel ?? []).map(sr => sr.supplier_id)))
      setForm(initial ? {
        name:        initial.name        ?? '',
        category_id: initial.category_id ?? '',
        unit:        initial.unit        ?? 'unidade',
        unit_cost:   initial.unit_cost   ?? '',
        stock_qty:   initial.stock_qty   ?? '',
        stock_min:   initial.stock_min   ?? '',
        width_cm:    initial.width_cm    ?? '',
        length_cm:   initial.length_cm   ?? '',
        notes:       initial.notes       ?? '',
      } : EMPTY)
    }
  }, [open, initial])

  // Alterna um fornecedor pra este material — grava na hora, já que
  // (em modo edição) o material já tem id
  async function toggleSupplier(supplierId) {
    if (!initial?.id) return
    setTogglingSupplier(supplierId)
    try {
      if (linkedSupplierIds.has(supplierId)) {
        await unlinkSupplier(initial.id, supplierId)
        setLinkedSupplierIds(prev => { const n = new Set(prev); n.delete(supplierId); return n })
      } else {
        await linkSupplier(initial.id, supplierId)
        setLinkedSupplierIds(prev => new Set(prev).add(supplierId))
      }
    } catch {}
    finally { setTogglingSupplier(null) }
  }

  function set(field, value) {
    setForm(p => ({ ...p, [field]: value }))
    setErrors(p => ({ ...p, [field]: undefined }))
  }

  // m² ao vivo, só pra mostrar na tela — quem calcula "de verdade" e
  // salva é o banco (generated column), isso aqui é só preview
  const isDimensioned = DIMENSIONED_UNITS.includes(form.unit)
  const liveAreaM2 = isDimensioned && form.width_cm && form.length_cm
    ? (Number(form.width_cm) / 100) * (Number(form.length_cm) / 100)
    : null

  // Cadastra fornecedor inline e já seleciona
  async function handleAddSupplier() {
    if (!newSupplierName.trim()) return
    setSavingSupplier(true)
    try {
      // useSuppliers.create retorna void, precisamos buscar o novo ID
      await addSupplier({ name: newSupplierName.trim() })
      // Após criar, o hook recarrega a lista — aguarda e seleciona pelo nome
      setShowNewSupplier(false)
      setNewSupplierName('')
      // O select vai mostrar o novo fornecedor na lista atualizada
    } catch {}
    finally { setSavingSupplier(false) }
  }

  function validate() {
    const e = {}
    if (!form.name.trim())  e.name = 'Nome é obrigatório.'
    if (!form.unit)         e.unit = 'Selecione a unidade.'
    if (form.unit_cost === '')       e.unit_cost = 'Informe o custo unitário.'
    if (Number(form.unit_cost) < 0) e.unit_cost = 'Custo não pode ser negativo.'
    if (form.stock_qty === '' && !initial) e.stock_qty = 'Informe o estoque inicial.'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const e2 = validate()
    if (Object.keys(e2).length) { setErrors(e2); return }

    await onSave({
      name:        form.name.trim(),
      category_id: form.category_id || null,
      unit:        form.unit,
      unit_cost:   parseCurrency(form.unit_cost) || 0,
      stock_qty:   initial ? undefined : Number(form.stock_qty) || 0,
      stock_min:   Number(form.stock_min) || 0,
      // Fornecedores agora são N:N (material_suppliers), não vão mais nesse payload —
      // o toggle já grava direto no banco via toggleSupplier()
      // Só salva dimensão se a unidade for chapa/rolo — se o usuário trocar
      // pra outra unidade, limpa (não faz sentido "largura" de um "kg")
      width_cm:    isDimensioned ? (Number(form.width_cm)  || null) : null,
      length_cm:   isDimensioned ? (Number(form.length_cm) || null) : null,
      notes:       form.notes.trim() || null,
    })
  }

  const isEditing = !!initial

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar Matéria-Prima' : 'Nova Matéria-Prima'}
      subtitle={isEditing ? `Editando: ${initial?.name}` : 'Preencha os dados do novo insumo'}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancelar
          </button>
          <button form="material-form" type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : isEditing ? 'Salvar alterações' : 'Cadastrar'
            }
          </button>
        </>
      }
    >
      <form id="material-form" onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Nome */}
        <div>
          <label className="form-label">Nome *</label>
          <input
            className={`input ${errors.name ? 'border-rose-400' : ''}`}
            placeholder="Ex: Chapa MDF 15mm"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
          {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
        </div>

        {/* Categoria + Unidade */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Categoria</label>
            <select className="select" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Unidade *</label>
            <select className={`select ${errors.unit ? 'border-rose-400' : ''}`}
              value={form.unit} onChange={e => set('unit', e.target.value)}>
              {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
            {errors.unit && <p className="text-xs text-rose-500 mt-1">{errors.unit}</p>}
          </div>
        </div>

        {/* Dimensões — só aparece pra Chapa e Rolo */}
        {isDimensioned && (
          <div className="p-3 bg-sky-50/60 border border-sky-100 rounded-xl flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Largura (cm)</label>
                <input type="number" min="0" step="0.1" className="input"
                  placeholder="Ex: 120"
                  value={form.width_cm} onChange={e => set('width_cm', e.target.value)}/>
              </div>
              <div>
                <label className="form-label">Comprimento (cm)</label>
                <input type="number" min="0" step="0.1" className="input"
                  placeholder="Ex: 230"
                  value={form.length_cm} onChange={e => set('length_cm', e.target.value)}/>
              </div>
            </div>
            {liveAreaM2 !== null ? (
              <p className="text-xs font-semibold text-sky-600 bg-white border border-sky-200 rounded-lg px-3 py-2">
                📐 Área por {form.unit}: <strong>{liveAreaM2.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:4})} m²</strong>
              </p>
            ) : (
              <p className="text-xs text-slate-400">Preencha largura e comprimento pra calcular o m² automaticamente.</p>
            )}
          </div>
        )}

        {/* Custo unitário */}
        <div>
          <label className="form-label">Custo por unidade (R$) *</label>
          <input
            className={`input ${errors.unit_cost ? 'border-rose-400' : ''}`}
            placeholder="R$ 0,00"
            value={form.unit_cost}
            onChange={e => set('unit_cost', maskCurrency(e.target.value))}
            inputMode="numeric"
          />
          {errors.unit_cost && <p className="text-xs text-rose-500 mt-1">{errors.unit_cost}</p>}
        </div>

        {/* Estoque inicial + mínimo */}
        <div className="grid grid-cols-2 gap-3">
          {!isEditing && (
            <div>
              <label className="form-label">Estoque inicial *</label>
              <input
                type="number" min="0" step="0.001"
                className={`input ${errors.stock_qty ? 'border-rose-400' : ''}`}
                placeholder="0"
                value={form.stock_qty}
                onChange={e => set('stock_qty', e.target.value)}
              />
              {errors.stock_qty && <p className="text-xs text-rose-500 mt-1">{errors.stock_qty}</p>}
            </div>
          )}
          {isEditing && (
            <div className="col-span-2">
              <p className="text-xs text-slate-400 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
                💡 Para ajustar o estoque, use o botão <strong>Movimentação</strong> na listagem.
              </p>
            </div>
          )}
          <div className={isEditing ? 'col-span-2' : ''}>
            <label className="form-label">Estoque mínimo</label>
            <input
              type="number" min="0" step="0.001"
              className="input"
              placeholder="0"
              value={form.stock_min}
              onChange={e => set('stock_min', e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1">Alerta quando o estoque ficar abaixo deste valor.</p>
          </div>
        </div>

        {/* ── Fornecedores — N:N, um material pode ter vários ── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="form-label mb-0">Fornecedores</label>
            {!showNewSupplier && (
              <button
                type="button"
                onClick={() => setShowNewSupplier(true)}
                className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600 font-semibold transition-colors"
              >
                <Plus size={12} /> Cadastrar novo
              </button>
            )}
          </div>

          {/* Campo inline para novo fornecedor */}
          {showNewSupplier ? (
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Nome do novo fornecedor"
                value={newSupplierName}
                onChange={e => setNewSupplierName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddSupplier())}
                autoFocus
              />
              <button
                type="button"
                onClick={handleAddSupplier}
                disabled={!newSupplierName.trim() || savingSupplier}
                className="btn-primary px-3 py-2 text-xs shrink-0"
              >
                {savingSupplier
                  ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : 'Salvar'
                }
              </button>
              <button
                type="button"
                onClick={() => { setShowNewSupplier(false); setNewSupplierName('') }}
                className="btn-secondary px-3 py-2 text-xs shrink-0"
              >
                Cancelar
              </button>
            </div>
          ) : !isEditing ? (
            // Material novo ainda não tem id — vincular fornecedor só depois de salvar
            <p className="text-xs text-slate-400 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
              💡 Salve o material primeiro — depois você volta aqui (ou na tela de Fornecedores) pra vincular quem fornece.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto border border-slate-100 rounded-xl p-2">
              {suppliers.map(s => {
                const isLinked = linkedSupplierIds.has(s.id)
                const isBusy = togglingSupplier === s.id
                return (
                  <button key={s.id} type="button" disabled={isBusy}
                    onClick={() => toggleSupplier(s.id)}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-semibold text-left transition-colors
                      ${isLinked ? 'bg-rose-50 text-rose-600' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <span className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center
                      ${isLinked ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>
                      {isBusy
                        ? <div className="w-2.5 h-2.5 border-2 border-white/40 border-t-white rounded-full animate-spin"/>
                        : isLinked && <Check size={11} className="text-white"/>
                      }
                    </span>
                    {s.name}
                  </button>
                )
              })}
            </div>
          )}

          {suppliers.length === 0 && !showNewSupplier && (
            <p className="text-xs text-slate-400 mt-1">
              Nenhum fornecedor cadastrado ainda.{' '}
              <button type="button" onClick={() => setShowNewSupplier(true)}
                className="text-rose-500 hover:underline font-semibold">
                Cadastre o primeiro
              </button>
            </p>
          )}
        </div>

        {/* Observações */}
        <div>
          <label className="form-label">Observações</label>
          <textarea
            className="textarea" rows={3}
            placeholder="Anotações internas sobre este material..."
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

      </form>
    </Modal>
  )
}
