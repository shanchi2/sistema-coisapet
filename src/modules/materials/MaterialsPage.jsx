import { useState, useMemo } from 'react'
import { Plus, Search, Tag, Pencil, Trash2, Package, TrendingUp, AlertTriangle, PackagePlus } from 'lucide-react'
import { useMaterials }             from './hooks/useMaterials'
import { useMaterialCategories }    from './hooks/useMaterialCategories'
import { MaterialFormModal }        from './components/MaterialFormModal'
import { MaterialCategoriesModal }  from './components/MaterialCategoriesModal'
import { ConfirmDialog }            from '../../components/ui/ConfirmDialog'
import { EmptyState }               from '../../components/ui/EmptyState'

// ─── Utilitários ──────────────────────────────────────────────────
function stockStatus(qty, min) {
  if (qty <= 0)          return 'empty'
  if (qty <= min)        return 'danger'
  if (qty <= min * 1.5)  return 'warn'
  return 'ok'
}
const STATUS_BADGE = {
  ok:     <span className="badge-ok">OK</span>,
  warn:   <span className="badge-warn">Baixo</span>,
  danger: <span className="badge-danger">Crítico</span>,
  empty:  <span className="badge-danger">Zerado</span>,
}
function formatCurrency(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Modal rápido de estoque ──────────────────────────────────────
function QuickStockModal({ material, open, onClose, onSave }) {
  const [qty,    setQty]    = useState(material ? String(Number(material.stock_qty)) : '0')
  const [saving, setSaving] = useState(false)

  // Reseta quando abre com novo material
  if (!open) return null

  async function handleSave() {
    const parsed = parseFloat(qty)
    if (isNaN(parsed) || parsed < 0) return
    setSaving(true)
    try { await onSave(material.id, parsed); onClose() }
    catch {}
    finally { setSaving(false) }
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') onClose()
  }

  const diff = parseFloat(qty) - Number(material.stock_qty)
  const diffLabel = isNaN(diff) ? null
    : diff > 0 ? `+${diff.toLocaleString('pt-BR')} ${material.unit}`
    : diff < 0 ? `${diff.toLocaleString('pt-BR')} ${material.unit}`
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div>
          <h3 className="font-bold text-slate-800 text-base">Ajustar estoque</h3>
          <p className="text-sm text-slate-400 mt-0.5">{material.name}</p>
        </div>

        <div>
          <label className="form-label">Quantidade atual em estoque</label>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="number"
              min="0"
              step="1"
              className="input flex-1 text-lg font-bold text-center"
              value={qty}
              onChange={e => setQty(e.target.value)}
              onKeyDown={handleKey}
            />
            <span className="text-sm font-semibold text-slate-500 w-12 shrink-0">{material.unit}</span>
          </div>
          {/* Diff visual */}
          {diffLabel && (
            <p className={`text-xs font-bold mt-1.5 text-center ${diff > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {diff > 0 ? '▲' : '▼'} {diffLabel} em relação ao estoque atual ({Number(material.stock_qty).toLocaleString('pt-BR')} {material.unit})
            </p>
          )}
          {!diffLabel && (
            <p className="text-xs text-slate-400 mt-1.5 text-center">
              Estoque atual: {Number(material.stock_qty).toLocaleString('pt-BR')} {material.unit}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"/>
              : 'Confirmar'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card de estatística ──────────────────────────────────────────
function StatCard({ icon: Icon, label, value, bg, color }) {
  return (
    <div className="card flex items-center gap-4 py-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
        <Icon size={20} className={color} />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="font-display font-black text-xl text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {value}
        </p>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export function MaterialsPage() {
  const { materials, loading, create, update, remove, refetch } = useMaterials()
  const { categories } = useMaterialCategories()

  const [formOpen,       setFormOpen]       = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [editing,        setEditing]        = useState(null)
  const [deleteTarget,   setDeleteTarget]   = useState(null)
  const [stockTarget,    setStockTarget]    = useState(null)  // ← modal de estoque
  const [saving,         setSaving]         = useState(false)
  const [search,         setSearch]         = useState('')
  const [filterCat,      setFilterCat]      = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')

  const filtered = useMemo(() => {
    return materials
      .filter((m) => m.active)
      .filter((m) => !search
        || m.name.toLowerCase().includes(search.toLowerCase())
        || m.supplier?.toLowerCase().includes(search.toLowerCase())
        || (m.suppliers_rel ?? []).some(sr => sr.supplier?.name?.toLowerCase().includes(search.toLowerCase()))
      )
      .filter((m) => !filterCat   || m.category_id === filterCat)
      .filter((m) => {
        if (!filterStatus) return true
        const s = stockStatus(m.stock_qty, m.stock_min)
        if (filterStatus === 'alert') return s === 'warn' || s === 'danger' || s === 'empty'
        return s === filterStatus
      })
  }, [materials, search, filterCat, filterStatus])

  const stats = useMemo(() => {
    const active = materials.filter((m) => m.active)
    const alerts = active.filter((m) => {
      const s = stockStatus(m.stock_qty, m.stock_min)
      return s === 'warn' || s === 'danger' || s === 'empty'
    })
    return { total: active.length, alerts: alerts.length }
  }, [materials])

  function openNew()      { setEditing(null); setFormOpen(true) }
  function openEdit(mat)  { setEditing(mat);  setFormOpen(true) }

  async function handleSave(payload) {
    setSaving(true)
    try {
      if (editing) await update(editing.id, payload)
      else         await create(payload)
      setFormOpen(false)
    } catch {}
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setSaving(true)
    try { await remove(deleteTarget.id); setDeleteTarget(null) }
    catch {}
    finally { setSaving(false) }
  }

  // Atualiza só o stock_qty
  async function handleStockUpdate(id, newQty) {
    await update(id, { stock_qty: newQty })
    setStockTarget(null)
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      <div className="page-header">
        <div>
          <h2 className="page-title">Matéria-Prima</h2>
          <p className="page-subtitle">Controle de insumos e estoque</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCategoriesOpen(true)} className="btn-secondary">
            <Tag size={16} /> Categorias
          </button>
          <button onClick={openNew} className="btn-primary">
            <Plus size={16} /> Nova matéria-prima
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Package}       label="Tipos cadastrados" value={stats.total}   bg="bg-sky-50"   color="text-sky-500" />
        <StatCard icon={AlertTriangle} label="Alertas de estoque" value={stats.alerts} bg="bg-rose-50"  color="text-rose-400" />
        <StatCard icon={TrendingUp}    label="Categorias ativas"  value={categories.filter(c => c).length} bg="bg-amber-50" color="text-amber-500" />
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Buscar por nome ou fornecedor..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select w-auto min-w-[160px]" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select w-auto min-w-[150px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="ok">OK</option>
          <option value="alert">Com alerta</option>
          <option value="empty">Zerados</option>
        </select>
      </div>

      {loading ? (
        <div className="card flex justify-center items-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
            <p className="text-sm text-slate-400">Carregando matérias-primas...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={Package}
            title={materials.length === 0 ? 'Nenhuma matéria-prima cadastrada' : 'Nenhum resultado'}
            description={materials.length === 0 ? 'Comece cadastrando os insumos que você usa na produção.' : 'Tente ajustar os filtros para encontrar o que procura.'}
            action={materials.length === 0 && <button onClick={openNew} className="btn-primary"><Plus size={16} /> Cadastrar primeiro insumo</button>}
          />
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Unidade</th>
                <th>Estoque atual</th>
                <th>Custo unitário</th>
                <th>Fornecedor</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((mat) => {
                const status = stockStatus(mat.stock_qty, mat.stock_min)
                return (
                  <tr key={mat.id}>
                    <td>
                      <span className="font-semibold text-slate-800">{mat.name}</span>
                      {mat.width_cm && mat.length_cm && (
                        <p className="text-xs text-sky-500 font-semibold mt-0.5">
                          📐 {Number(mat.width_cm).toLocaleString('pt-BR')}cm × {Number(mat.length_cm).toLocaleString('pt-BR')}cm
                          {' '}· {Number(mat.area_m2).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:4})} m²/{mat.unit}
                        </p>
                      )}
                      {mat.notes && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{mat.notes}</p>}
                    </td>
                    <td>
                      {mat.category ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: mat.category.color }} />
                          <span className="text-slate-600">{mat.category.name}</span>
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td><span className="badge-neutral capitalize">{mat.unit}</span></td>

                    {/* Estoque — com botão de ajuste rápido */}
                    <td>
                      <div className="flex items-center gap-2">
                        <div>
                          <span className={`font-semibold ${status === 'ok' ? 'text-slate-700' : 'text-rose-500'}`}>
                            {Number(mat.stock_qty).toLocaleString('pt-BR')}
                          </span>
                          {mat.stock_min > 0 && (
                            <p className="text-xs text-slate-400">mín: {Number(mat.stock_min).toLocaleString('pt-BR')}</p>
                          )}
                          {mat.area_m2 > 0 && (
                            <p className="text-xs text-sky-500 font-semibold">
                              = {(Number(mat.stock_qty) * Number(mat.area_m2)).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})} m² total
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setStockTarget(mat)}
                          className="p-1 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all"
                          title="Ajustar estoque"
                        >
                          <PackagePlus size={14} />
                        </button>
                      </div>
                    </td>

                    <td className="text-slate-600">{formatCurrency(mat.unit_cost)}</td>
                    <td className="text-slate-500 text-sm">
                      {mat.suppliers_rel?.length > 0 ? (
                        <span title={mat.suppliers_rel.map(sr => sr.supplier?.name).join(', ')}>
                          {mat.suppliers_rel[0]?.supplier?.name}
                          {mat.suppliers_rel.length > 1 && (
                            <span className="text-xs text-sky-500 font-bold ml-1">+{mat.suppliers_rel.length - 1}</span>
                          )}
                        </span>
                      ) : (
                        mat.supplier_rel?.name ?? mat.supplier ?? <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td>{STATUS_BADGE[status]}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(mat)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all" title="Editar">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => setDeleteTarget(mat)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all" title="Remover">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <MaterialFormModal open={formOpen} onClose={() => setFormOpen(false)} onSave={handleSave} initial={editing} loading={saving} />
      <MaterialCategoriesModal open={categoriesOpen} onClose={() => { setCategoriesOpen(false); refetch() }} />

      {/* Modal de ajuste rápido de estoque */}
      {stockTarget && (
        <QuickStockModal
          material={stockTarget}
          open={true}
          onClose={() => setStockTarget(null)}
          onSave={handleStockUpdate}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={saving}
        title={`Remover "${deleteTarget?.name}"?`}
        description="O material será desativado mas o histórico de movimentações será mantido."
        confirmLabel="Remover material"
      />
    </div>
  )
}
