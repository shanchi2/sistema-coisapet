import { useMemo, useState } from 'react'
import { Boxes, Plus, Search, Pencil, Trash2, ChevronDown, Package, AlertTriangle } from 'lucide-react'
import { useKits } from './hooks/useKits'
import { useProductCategories } from './hooks/useProductCategories'
import { ProductFormModal } from './components/ProductFormModal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { useSignedUrl } from '../../lib/signedUrlCache'

function KitPhoto({ photoUrl }) {
  const url = useSignedUrl('product-photos', photoUrl)
  if (!url) return (
    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
      <Package size={18} className="text-slate-300" />
    </div>
  )
  return <img src={url} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-100" />
}

// Disponibilidade do kit é SEMPRE calculada (nunca armazenada) — mínimo
// entre estoque de cada componente ÷ qty necessária (view kit_availability,
// fase63). Mesmos 3 níveis de cor já usados no resto do sistema.
function AvailabilityBadge({ qty }) {
  if (qty == null) return <span className="badge-neutral">Sem componentes</span>
  const n = Number(qty)
  if (n <= 0) return <span className="badge-danger">Indisponível</span>
  if (n <= 5) return <span className="badge-warn">{n} un. possíveis</span>
  return <span className="badge-ok">{n} un. possíveis</span>
}

function ComponentRow({ item }) {
  const stock = Number(item.component?.stock_qty ?? 0)
  const canMake = item.qty > 0 ? Math.floor(stock / item.qty) : null
  const isBottleneck = canMake != null && canMake <= 5
  return (
    <div className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${isBottleneck ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
      <div className="w-7 h-7 rounded-md bg-white border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
        <KitPhoto photoUrl={item.component?.photo_url} />
      </div>
      <p className="text-sm text-slate-700 truncate flex-1">{item.component?.name || '—'}</p>
      <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5 shrink-0">
        {item.qty}x necessário
      </span>
      <span className={`text-xs font-semibold shrink-0 ${isBottleneck ? 'text-amber-600' : 'text-slate-400'}`}>
        {isBottleneck && <AlertTriangle size={11} className="inline mr-0.5" />}
        {stock} em estoque
      </span>
    </div>
  )
}

function KitCard({ kit, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const items = kit.items || []

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-start gap-3 min-w-0 flex-1 text-left group">
          <KitPhoto photoUrl={kit.photo_url} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-800 group-hover:text-rose-600 transition-colors truncate">{kit.name}</h3>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{kit.sku || 'sem SKU'}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <AvailabilityBadge qty={kit.available_qty} />
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                {items.length} componente{items.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(kit)} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-colors">
            <Pencil size={15} />
          </button>
          <button onClick={() => onDelete(kit)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-slate-100">
          {items.length === 0
            ? <p className="text-xs text-slate-400 text-center py-2">Nenhum componente cadastrado ainda — edite o kit pra adicionar.</p>
            : items.map(i => <ComponentRow key={i.id} item={i} />)}
        </div>
      )}
    </div>
  )
}

export function KitsPage() {
  const { kits, loading, refetch, remove } = useKits()
  const { categories } = useProductCategories()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return kits
    const q = search.toLowerCase()
    return kits.filter(k => k.name.toLowerCase().includes(q) || k.sku?.toLowerCase().includes(q))
  }, [kits, search])

  function openNew() { setEditing(null); setFormOpen(true) }
  function openEdit(k) { setEditing(k); setFormOpen(true) }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try { await remove(deleting.id); setDeleting(null) }
    catch {} finally { setDeleteBusy(false) }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      <div className="page-header">
        <div>
          <h2 className="page-title">Kits</h2>
          <p className="page-subtitle">Produtos compostos por outros produtos (ex: Terrário com Acessórios) — disponibilidade calculada a partir do estoque dos componentes, nunca um número próprio</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={16} /> Novo kit
        </button>
      </div>

      {kits.length > 0 && (
        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Buscar kit por nome ou SKU..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : kits.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum kit cadastrado ainda"
          description='Crie o primeiro kit (ex: "Terrário com Acessórios") e escolha quais produtos compõem ele — o SKU do kit continua sendo o mesmo que já usa no ML/Shopee.'
          action={
            <button onClick={openNew} className="btn-primary">
              <Plus size={16} /> Novo kit
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-slate-400">Nenhum kit bate com a busca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(kit => (
            <KitCard key={kit.id} kit={kit} onEdit={openEdit} onDelete={setDeleting} />
          ))}
        </div>
      )}

      <ProductFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing}
        categories={categories}
        defaultIsKit={true}
        onSaved={() => { setFormOpen(false); refetch() }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Remover kit"
        description={deleting ? `Tem certeza que quer remover o kit "${deleting.name}"? Os produtos componentes continuam existindo normalmente.` : ''}
        confirmLabel="Remover"
        loading={deleteBusy}
      />
    </div>
  )
}
