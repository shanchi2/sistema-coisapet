import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { useMaterialCategories } from '../hooks/useMaterialCategories'

// Paleta de cores disponíveis para as categorias
const COLOR_OPTIONS = [
  { label: 'Rosa',    value: '#F43F5E' },
  { label: 'Âmbar',  value: '#F59E0B' },
  { label: 'Verde',  value: '#10B981' },
  { label: 'Azul',   value: '#0EA5E9' },
  { label: 'Roxo',   value: '#8B5CF6' },
  { label: 'Índigo', value: '#6366F1' },
  { label: 'Cinza',  value: '#6B7280' },
  { label: 'Laranja',value: '#F97316' },
]

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          className="w-7 h-7 rounded-lg transition-all relative"
          style={{ backgroundColor: c.value }}
          title={c.label}
        >
          {value === c.value && (
            <Check size={14} className="text-white absolute inset-0 m-auto" strokeWidth={3} />
          )}
        </button>
      ))}
    </div>
  )
}

// ─── Formulário inline para criar/editar ──────────────────────────────────
function CategoryForm({ initial, onSave, onCancel, loading }) {
  const [name,  setName]  = useState(initial?.name  ?? '')
  const [color, setColor] = useState(initial?.color ?? '#F59E0B')

  async function handleSave() {
    if (!name.trim()) return
    await onSave({ name: name.trim(), color })
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col gap-3">
      <div>
        <label className="form-label">Nome da categoria</label>
        <input
          className="input"
          placeholder="Ex: MDF, Ferragem, Acrílico..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          autoFocus
        />
      </div>
      <div>
        <label className="form-label">Cor de identificação</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || loading}
          className="btn-primary py-2 text-xs"
        >
          {loading
            ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <><Check size={13} /> Salvar</>
          }
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary py-2 text-xs">
          <X size={13} /> Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Modal principal ───────────────────────────────────────────────────────
export function MaterialCategoriesModal({ open, onClose }) {
  const { categories, loading, create, update, remove } = useMaterialCategories()

  const [showNew,   setShowNew]   = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  async function handleCreate(payload) {
    setSaving(true)
    try { await create(payload); setShowNew(false) }
    catch {}
    finally { setSaving(false) }
  }

  async function handleUpdate(id, payload) {
    setSaving(true)
    try { await update(id, payload); setEditingId(null) }
    catch {}
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setSaving(true)
    try { await remove(deleteTarget.id); setDeleteTarget(null) }
    catch {}
    finally { setSaving(false) }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Categorias de Matéria-Prima"
        subtitle="Organize seus insumos por categoria"
        size="sm"
        footer={
          <button onClick={onClose} className="btn-secondary">Fechar</button>
        }
      >
        {/* Botão nova categoria */}
        {!showNew && (
          <button
            onClick={() => setShowNew(true)}
            className="btn-primary w-full mb-4"
          >
            <Plus size={16} /> Nova categoria
          </button>
        )}

        {/* Formulário de nova categoria */}
        {showNew && (
          <div className="mb-4">
            <CategoryForm
              onSave={handleCreate}
              onCancel={() => setShowNew(false)}
              loading={saving}
            />
          </div>
        )}

        {/* Lista de categorias */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
          </div>
        ) : categories.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8">
            Nenhuma categoria cadastrada ainda.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {categories.map((cat) =>
              editingId === cat.id ? (
                <CategoryForm
                  key={cat.id}
                  initial={cat}
                  onSave={(payload) => handleUpdate(cat.id, payload)}
                  onCancel={() => setEditingId(null)}
                  loading={saving}
                />
              ) : (
                <div
                  key={cat.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-white"
                >
                  {/* Bolinha colorida */}
                  <div
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="flex-1 text-sm font-semibold text-slate-700">
                    {cat.name}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditingId(cat.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(cat)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </Modal>

      {/* Confirmação de exclusão */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={saving}
        title={`Excluir "${deleteTarget?.name}"?`}
        description="Matérias-primas vinculadas a esta categoria não serão excluídas, apenas perderão a categoria."
        confirmLabel="Excluir categoria"
      />
    </>
  )
}
