import { useState, useEffect, useMemo } from 'react'
import {
  History, Search, Filter, User, Database,
  Plus, Pencil, Trash2, DollarSign, Package,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Download,
} from 'lucide-react'
import { useAudit }       from './hooks/useAudit'
import { supabase }       from '../../lib/supabase'

const PAGE_SIZE = 30

// ─── Helpers ─────────────────────────────────────────────────────
function fmtDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('pt-BR') + ' ' +
    dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Badge de ação ────────────────────────────────────────────────
function ActionBadge({ action }) {
  const map = {
    INSERT: { cls: 'bg-emerald-50 text-emerald-700', label: 'Criou',   icon: Plus    },
    UPDATE: { cls: 'bg-sky-50 text-sky-700',         label: 'Editou',  icon: Pencil  },
    DELETE: { cls: 'bg-rose-50 text-rose-600',       label: 'Excluiu', icon: Trash2  },
  }
  const { cls, label, icon: Icon } = map[action] ?? { cls: 'bg-slate-50 text-slate-500', label: action, icon: Database }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      <Icon size={10} /> {label}
    </span>
  )
}

// ─── Badge de tabela ─────────────────────────────────────────────
function TableBadge({ tableName }) {
  const map = {
    bills:                    { label: 'Financeiro',      icon: DollarSign, cls: 'bg-amber-50 text-amber-700'   },
    bill_payments:            { label: 'Pagamento',       icon: DollarSign, cls: 'bg-emerald-50 text-emerald-700' },
    bill_attachments:         { label: 'Anexo',           icon: Database,   cls: 'bg-slate-50 text-slate-600'   },
    suppliers:                { label: 'Fornecedor',      icon: Database,   cls: 'bg-sky-50 text-sky-700'       },
    expense_categories:       { label: 'Tipo Despesa',    icon: Database,   cls: 'bg-rose-50 text-rose-600'     },
    raw_materials:            { label: 'Matéria-Prima',   icon: Package,    cls: 'bg-orange-50 text-orange-700' },
    raw_material_categories:  { label: 'Cat. Insumo',     icon: Database,   cls: 'bg-orange-50 text-orange-600' },
    raw_material_movements:   { label: 'Estoque',         icon: Database,   cls: 'bg-yellow-50 text-yellow-700' },
    products:                 { label: 'Produto',         icon: Package,    cls: 'bg-purple-50 text-purple-700' },
    product_categories:       { label: 'Cat. Produto',    icon: Database,   cls: 'bg-purple-50 text-purple-600' },
    system_users:             { label: 'Usuário',         icon: User,       cls: 'bg-sky-50 text-sky-700'       },
    employees:                { label: 'Funcionário',     icon: User,       cls: 'bg-pink-50 text-pink-700'     },
  }
  const { label, icon: Icon, cls } = map[tableName] ?? { label: tableName, icon: Database, cls: 'bg-slate-50 text-slate-500' }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      <Icon size={10} /> {label}
    </span>
  )
}

// ─── Paginador ────────────────────────────────────────────────────
function Paginator({ page, totalPages, total, onPage }) {
  if (totalPages <= 1) return null
  const start = (page - 1) * PAGE_SIZE + 1
  const end   = Math.min(page * PAGE_SIZE, total)
  const delta = 2
  const s     = Math.max(1, Math.min(page - delta, totalPages - delta * 2))
  const e2    = Math.min(totalPages, s + delta * 2)

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
      <p className="text-xs text-slate-400">
        <span className="font-semibold text-slate-600">{start}–{end}</span> de{' '}
        <span className="font-semibold text-slate-600">{total}</span> registros
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(1)} disabled={page === 1} title="Primeira"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 transition-all">
          <ChevronsLeft size={15} />
        </button>
        <button onClick={() => onPage(page - 1)} disabled={page === 1} title="Anterior"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 transition-all">
          <ChevronLeft size={15} />
        </button>
        {s > 1 && <span className="w-8 text-center text-slate-300 text-xs">•••</span>}
        {Array.from({ length: e2 - s + 1 }, (_, i) => s + i).map(p => (
          <button key={p} onClick={() => onPage(p)}
            className={`w-8 h-8 rounded-lg text-sm font-semibold transition-all ${
              p === page ? 'bg-rose-400 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}>
            {p}
          </button>
        ))}
        {e2 < totalPages && <span className="w-8 text-center text-slate-300 text-xs">•••</span>}
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages} title="Próxima"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 transition-all">
          <ChevronRight size={15} />
        </button>
        <button onClick={() => onPage(totalPages)} disabled={page === totalPages} title="Última"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 transition-all">
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  )
}

// ─── Descrição formatada ─────────────────────────────────────────
function DescriptionCell({ description, action, tableName }) {
  if (!description) return <span className="text-slate-300">—</span>

  // Detecta padrão "X → Y" (mudança de valor)
  const arrowMatch = description.match(/^(.+?):\s*(.+?)\s*→\s*(.+)$/)
  if (arrowMatch) {
    const [, label, oldVal, newVal] = arrowMatch
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-slate-500 text-xs font-medium">{label}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded line-through">{oldVal.trim()}</span>
          <span className="text-slate-300 text-xs">→</span>
          <span className="text-xs font-mono bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-semibold">{newVal.trim()}</span>
        </div>
      </div>
    )
  }

  // Detecta padrão com aspas "Nome do item" - destaca o nome
  const quoteMatch = description.match(/^(.*?)"(.+?)"(.*)$/)
  if (quoteMatch) {
    const [, before, name, after] = quoteMatch
    return (
      <span>
        {before}
        <span className="font-semibold text-slate-700 bg-slate-100 px-1 rounded">"{name}"</span>
        {after}
      </span>
    )
  }

  return <span>{description}</span>
}

// ─── Página principal ─────────────────────────────────────────────
export function AuditPage() {
  const { logs, loading, total, fetchLogs } = useAudit()
  const [users, setUsers] = useState([])

  // Filtros
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterTable,setFilterTable]= useState('')
  const [filterAction,setFilterAction]= useState('')
  const [dateStart,  setDateStart]  = useState('')
  const [dateEnd,    setDateEnd]    = useState('')

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Carrega usuários para o filtro
  useEffect(() => {
    supabase.from('system_users')
      .select('id, name')
      .eq('active', true)
      .order('name')
      .then(({ data }) => setUsers(data ?? []))
  }, [])

  // Busca logs quando filtros mudam
  useEffect(() => {
    fetchLogs({ page, pageSize: PAGE_SIZE, userId: filterUser, tableName: filterTable,
      action: filterAction, search, dateStart, dateEnd })
  }, [page, search, filterUser, filterTable, filterAction, dateStart, dateEnd])

  function resetFilters() {
    setSearch(''); setFilterUser(''); setFilterTable('')
    setFilterAction(''); setDateStart(''); setDateEnd(''); setPage(1)
  }

  function handleFilterChange(fn) { fn(); setPage(1) }

  // Exporta CSV
  function handleExport() {
    const rows = logs.map(l => ({
      'Data/Hora':   fmtDateTime(l.created_at),
      'Usuário':     l.user_name ?? 'Sistema',
      'Ação':        l.action,
      'Módulo':      l.table_name,
      'Descrição':   l.description,
      'ID Registro': l.record_id ?? '',
    }))
    const headers = Object.keys(rows[0] ?? {})
    const csv = [
      headers.join(';'),
      ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(';'))
    ].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `coisapet-historico-${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const hasFilters = search || filterUser || filterTable || filterAction || dateStart || dateEnd

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Cabeçalho */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Histórico de Ações</h2>
          <p className="page-subtitle">Registro completo de todas as operações no sistema</p>
        </div>
        <button onClick={handleExport} className="btn-secondary" disabled={logs.length === 0}>
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-col gap-3">
        {/* Linha 1: busca + datas */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8" placeholder="Buscar na descrição..."
              value={search} onChange={e => handleFilterChange(() => setSearch(e.target.value))} />
          </div>
          <div className="flex items-center gap-2">
            <label className="form-label mb-0 shrink-0">De</label>
            <input type="date" className="input w-auto"
              value={dateStart} onChange={e => handleFilterChange(() => setDateStart(e.target.value))} />
          </div>
          <div className="flex items-center gap-2">
            <label className="form-label mb-0 shrink-0">Até</label>
            <input type="date" className="input w-auto"
              value={dateEnd} onChange={e => handleFilterChange(() => setDateEnd(e.target.value))} />
          </div>
        </div>

        {/* Linha 2: selects */}
        <div className="flex flex-wrap gap-3 items-center">
          <select className="select w-auto min-w-[160px]" value={filterUser}
            onChange={e => handleFilterChange(() => setFilterUser(e.target.value))}>
            <option value="">Todos os usuários</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="select w-auto min-w-[150px]" value={filterTable}
            onChange={e => handleFilterChange(() => setFilterTable(e.target.value))}>
            <option value="">Todos os módulos</option>
            <option value="bills">Financeiro — Contas</option>
            <option value="bill_payments">Financeiro — Pagamentos</option>
            <option value="bill_attachments">Financeiro — Anexos</option>
            <option value="suppliers">Fornecedores</option>
            <option value="expense_categories">Tipos de Despesa</option>
            <option value="raw_materials">Matéria-Prima</option>
            <option value="raw_material_categories">Cat. Matéria-Prima</option>
            <option value="raw_material_movements">Movimentação Estoque</option>
            <option value="products">Produtos</option>
            <option value="product_categories">Cat. Produtos</option>
            <option value="system_users">Usuários</option>
            <option value="employees">Funcionários</option>
          </select>
          <select className="select w-auto min-w-[130px]" value={filterAction}
            onChange={e => handleFilterChange(() => setFilterAction(e.target.value))}>
            <option value="">Todas as ações</option>
            <option value="INSERT">Criou</option>
            <option value="UPDATE">Editou</option>
            <option value="DELETE">Excluiu</option>
          </select>
          {hasFilters && (
            <button onClick={resetFilters}
              className="text-xs text-rose-500 hover:text-rose-600 font-semibold transition-colors">
              Limpar filtros
            </button>
          )}
          <span className="text-xs text-slate-400 ml-auto">
            {total.toLocaleString('pt-BR')} registro{total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="card flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" />
            <p className="text-sm text-slate-400">Carregando histórico...</p>
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div className="card flex flex-col items-center py-16 gap-3">
          <History size={32} className="text-slate-200" />
          <p className="font-semibold text-slate-500">
            {hasFilters ? 'Nenhum resultado para os filtros selecionados' : 'Nenhuma ação registrada ainda'}
          </p>
          {hasFilters && (
            <button onClick={resetFilters} className="text-xs text-rose-500 font-semibold">
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Módulo</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="text-slate-500 text-sm whitespace-nowrap">
                    {fmtDateTime(log.created_at)}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                        <span className="text-rose-400 text-[10px] font-bold">
                          {(log.user_name ?? 'S').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                        {log.user_name ?? <span className="text-slate-300 font-normal">Sistema</span>}
                      </span>
                    </div>
                  </td>
                  <td><ActionBadge action={log.action} /></td>
                  <td><TableBadge tableName={log.table_name} /></td>
                  <td className="text-slate-600 text-sm max-w-[420px]">
                    <DescriptionCell description={log.description} action={log.action} tableName={log.table_name}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Paginator page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </div>
      )}
    </div>
  )
}
