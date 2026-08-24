import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, Trash2, Users } from 'lucide-react'
import { useEmployees }        from './hooks/useEmployees'
import { EmployeeFormModal, ROLES, getRoleInfo } from './components/EmployeeFormModal'
import { ConfirmDialog }       from '../../components/ui/ConfirmDialog'
import { EmptyState }          from '../../components/ui/EmptyState'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export function EmployeesPage() {
  const { employees, loading, create, update, remove } = useEmployees()

  const [formOpen,     setFormOpen]     = useState(false)
  const [editing,      setEditing]      = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [search,       setSearch]       = useState('')
  const [filterRole,   setFilterRole]   = useState('')

  const filtered = useMemo(() =>
    employees
      .filter(e => !search     || e.name.toLowerCase().includes(search.toLowerCase()) || e.job_title?.toLowerCase().includes(search.toLowerCase()))
      .filter(e => !filterRole || e.role === filterRole)
  , [employees, search, filterRole])

  async function handleSave(payload) {
    setSaving(true)
    try {
      editing ? await update(editing.id, payload) : await create(payload)
      setFormOpen(false)
    } catch {}
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setSaving(true)
    try { await remove(deleteTarget.id); setDeleteTarget(null) }
    catch {} finally { setSaving(false) }
  }

  // Contagem por hierarquia
  const counts = useMemo(() => {
    const map = {}
    ROLES.forEach(r => { map[r.value] = 0 })
    employees.forEach(e => { map[e.role] = (map[e.role] ?? 0) + 1 })
    return map
  }, [employees])

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Cabeçalho */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Funcionários</h2>
          <p className="page-subtitle">Equipe e hierarquias da CoisaPet</p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true) }} className="btn-primary">
          <Plus size={16} /> Novo funcionário
        </button>
      </div>

      {/* Cards por hierarquia */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {ROLES.map(role => (
          <div key={role.value}
            onClick={() => setFilterRole(filterRole === role.value ? '' : role.value)}
            className={`card cursor-pointer transition-all hover:shadow-md ${filterRole === role.value ? 'ring-2 ring-rose-400' : ''}`}
          >
            <div className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold mb-3 ${role.color}`}>
              {role.label}
            </div>
            <p className="font-display font-black text-2xl text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {counts[role.value] ?? 0}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {counts[role.value] === 1 ? 'funcionário' : 'funcionários'}
            </p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Buscar por nome ou cargo..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select w-auto min-w-[160px]" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">Todas as hierarquias</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="card flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
            <p className="text-sm text-slate-400">Carregando funcionários...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={Users}
            title={employees.length === 0 ? 'Nenhum funcionário cadastrado' : 'Nenhum resultado'}
            description={employees.length === 0 ? 'Cadastre os membros da equipe CoisaPet.' : 'Ajuste os filtros.'}
            action={employees.length === 0 && (
              <button onClick={() => setFormOpen(true)} className="btn-primary">
                <Plus size={16} /> Cadastrar primeiro funcionário
              </button>
            )} />
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Hierarquia</th>
                <th>Cargo / Função</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Contratação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => {
                const roleInfo = getRoleInfo(emp.role)
                return (
                  <tr key={emp.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                          <span className="text-rose-500 text-xs font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
                            {emp.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                          </span>
                        </div>
                        <span className="font-semibold text-slate-800">{emp.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleInfo.color}`}>
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="text-slate-600 text-sm">{emp.job_title ?? '—'}</td>
                    <td className="text-slate-500 text-sm">{emp.phone ?? '—'}</td>
                    <td className="text-slate-500 text-sm">{emp.email ?? '—'}</td>
                    <td className="text-slate-500 text-sm">{formatDate(emp.hire_date)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(emp); setFormOpen(true) }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => setDeleteTarget(emp)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all">
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

      <EmployeeFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        initial={editing}
        loading={saving}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={saving}
        title={`Remover "${deleteTarget?.name}"?`}
        description="O funcionário será desativado. O histórico de pontos será mantido."
        confirmLabel="Remover funcionário"
      />
    </div>
  )
}
