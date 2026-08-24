import { useState, useEffect, useMemo } from 'react'
import { Search, Check, Package, X } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { useMaterials } from '../../materials/hooks/useMaterials'
import toast from 'react-hot-toast'

// Modal aberto a partir de um fornecedor — lista TODAS as matérias-primas
// com checkbox, pré-marcando as que já pertencem a esse fornecedor.
// Salvar faz o vínculo em lote, sem precisar abrir material por material.
export function SupplierMaterialsModal({ open, onClose, supplier }) {
  const { materials, loading, refetch, bulkLinkSupplier, bulkUnlinkSupplier } = useMaterials()

  const [checked,  setChecked]  = useState(new Set())
  const [initial,  setInitial]  = useState(new Set())
  const [search,   setSearch]   = useState('')
  const [saving,   setSaving]   = useState(false)

  // Ao abrir, pré-marca os materiais que já têm esse fornecedor entre os deles
  // (um material pode ter vários fornecedores ao mesmo tempo — não é exclusivo)
  useEffect(() => {
    if (!open || !supplier) return
    const mine = new Set(
      materials
        .filter(m => (m.suppliers_rel ?? []).some(sr => sr.supplier_id === supplier.id))
        .map(m => m.id)
    )
    setChecked(new Set(mine))
    setInitial(mine)
    setSearch('')
  }, [open, supplier, materials])

  const filtered = useMemo(() =>
    materials
      .filter(m => m.active)
      .filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
  , [materials, search])

  function toggle(id) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const dirty = useMemo(() => {
    if (checked.size !== initial.size) return true
    for (const id of checked) if (!initial.has(id)) return true
    return false
  }, [checked, initial])

  async function handleSave() {
    setSaving(true)
    try {
      const toLink   = [...checked].filter(id => !initial.has(id))
      const toUnlink = [...initial].filter(id => !checked.has(id))
      await Promise.all([
        bulkLinkSupplier(toLink, supplier.id),
        bulkUnlinkSupplier(toUnlink, supplier.id),
      ])
      await refetch()
      toast.success('Vínculos atualizados!')
      onClose()
    } catch {}
    finally { setSaving(false) }
  }

  if (!supplier) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Vincular materiais — ${supplier.name}`}
      subtitle="Marque as matérias-primas que este fornecedor fornece — um material pode ter vários fornecedores"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving || !dirty}>
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><Check size={15}/> Salvar vínculos</>
            }
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Buscar matéria-prima..."
            value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>

        <p className="text-xs text-slate-400">
          {checked.size} de {materials.filter(m=>m.active).length} materiais marcados
        </p>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Package size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">Nenhum material encontrado</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto pr-1">
            {filtered.map(m => {
              const isChecked = checked.has(m.id)
              const otherSuppliers = (m.suppliers_rel ?? []).filter(sr => sr.supplier_id !== supplier.id)
              return (
                <label key={m.id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors
                    ${isChecked ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                  <input type="checkbox" className="w-4 h-4 accent-rose-500 shrink-0"
                    checked={isChecked} onChange={() => toggle(m.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{m.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {m.category?.name ? `${m.category.name} · ` : ''}{m.unit}
                    </p>
                  </div>
                  {otherSuppliers.length > 0 && (
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-full shrink-0"
                      title={otherSuppliers.map(sr => sr.supplier?.name).join(', ')}>
                      também: {otherSuppliers[0]?.supplier?.name}{otherSuppliers.length > 1 ? ` +${otherSuppliers.length - 1}` : ''}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
