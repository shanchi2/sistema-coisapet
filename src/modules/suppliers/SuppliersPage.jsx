import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, Trash2, Truck, Package } from 'lucide-react'
import { useSuppliers }        from '../financial/hooks/useSuppliers'
import { SupplierFormModal }   from '../financial/components/SupplierFormModal'
import { SupplierMaterialsModal } from '../financial/components/SupplierMaterialsModal'
import { useMaterials }        from '../materials/hooks/useMaterials'
import { ConfirmDialog }       from '../../components/ui/ConfirmDialog'
import { EmptyState }          from '../../components/ui/EmptyState'

export function SuppliersPage() {
  const { suppliers, loading, create, update, remove } = useSuppliers()
  const { materials } = useMaterials()

  const [form,    setForm]    = useState(false)
  const [editing, setEditing] = useState(null)
  const [del,     setDel]     = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [search,  setSearch]  = useState('')
  const [linkSupplier, setLinkSupplier] = useState(null) // fornecedor aberto no modal de vínculo

  // Quantos materiais ativos cada fornecedor tem vinculado
  // (agora N:N — um material pode contar pra mais de um fornecedor)
  const materialsCount = useMemo(() => {
    const map = {}
    materials.filter(m => m.active).forEach(m => {
      (m.suppliers_rel ?? []).forEach(sr => {
        map[sr.supplier_id] = (map[sr.supplier_id] || 0) + 1
      })
    })
    return map
  }, [materials])

  const filtered = useMemo(() =>
    suppliers.filter(s =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.cnpj?.includes(search) ||
      s.email?.toLowerCase().includes(search.toLowerCase())
    )
  , [suppliers, search])

  async function handleSave(p) {
    setSaving(true)
    try { editing ? await update(editing.id, p) : await create(p); setForm(false) }
    catch {} finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Cabeçalho */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Fornecedores</h2>
          <p className="page-subtitle">Cadastro de fornecedores da CoisaPet</p>
        </div>
        <button onClick={() => { setEditing(null); setForm(true) }} className="btn-primary">
          <Plus size={16} /> Novo fornecedor
        </button>
      </div>

      {/* Card resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card flex items-center gap-4 py-4">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
            <Truck size={20} className="text-sky-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Fornecedores ativos</p>
            <p className="font-display font-black text-xl text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {suppliers.length}
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4 py-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Package size={20} className="text-amber-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Materiais sem fornecedor</p>
            <p className="font-display font-black text-xl text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {materials.filter(m => m.active && !(m.suppliers_rel?.length)).length}
            </p>
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="card p-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Buscar por nome, CNPJ ou e-mail..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="card flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
            <p className="text-sm text-slate-400">Carregando fornecedores...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={Truck}
            title={suppliers.length === 0 ? 'Nenhum fornecedor cadastrado' : 'Nenhum resultado'}
            description={suppliers.length === 0
              ? 'Cadastre os fornecedores para vinculá-los às contas a pagar e matérias-primas.'
              : 'Tente ajustar a busca.'
            }
            action={suppliers.length === 0 && (
              <button onClick={() => setForm(true)} className="btn-primary">
                <Plus size={16} /> Cadastrar primeiro fornecedor
              </button>
            )} />
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nome / Razão social</th>
                <th>CNPJ</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Materiais</th>
                <th>Observações</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-sky-50 flex items-center justify-center shrink-0">
                        <span className="text-sky-600 text-xs font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
                          {s.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-semibold text-slate-800">{s.name}</span>
                    </div>
                  </td>
                  <td className="text-slate-500 text-sm font-mono">{s.cnpj ?? '—'}</td>
                  <td className="text-slate-500 text-sm">{s.phone ?? '—'}</td>
                  <td className="text-slate-500 text-sm">{s.email ?? '—'}</td>
                  <td>
                    <button onClick={() => setLinkSupplier(s)}
                      className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-colors
                        ${materialsCount[s.id] ? 'bg-sky-50 text-sky-600 hover:bg-sky-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                      <Package size={13}/> {materialsCount[s.id] || 0} vinculado{materialsCount[s.id] === 1 ? '' : 's'}
                    </button>
                  </td>
                  <td className="text-slate-400 text-sm">
                    {s.notes
                      ? <span className="truncate block max-w-[200px]">{s.notes}</span>
                      : '—'
                    }
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setEditing(s); setForm(true) }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => setDel(s)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SupplierFormModal open={form} onClose={() => setForm(false)} onSave={handleSave} initial={editing} loading={saving} />
      <SupplierMaterialsModal open={!!linkSupplier} onClose={() => setLinkSupplier(null)} supplier={linkSupplier} />
      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)}
        onConfirm={async () => { setSaving(true); try { await remove(del.id); setDel(null) } catch {} finally { setSaving(false) } }}
        loading={saving}
        title={`Remover "${del?.name}"?`}
        description="O fornecedor será desativado. Contas e matérias-primas vinculadas não serão afetadas."
        confirmLabel="Remover fornecedor"
      />
    </div>
  )
}
