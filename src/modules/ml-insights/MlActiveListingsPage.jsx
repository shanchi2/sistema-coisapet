import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Loader2, AlertTriangle, Search, Plus, ExternalLink, Play, Pause } from 'lucide-react'
import toast from 'react-hot-toast'
import { useMlInsights } from './hooks/useMlInsights'
import { ConfirmWriteModal } from './ConfirmWriteModal'

function fmtMoney(v) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function MlActiveListingsPage() {
  const navigate = useNavigate()
  const { loading, error, fetchActiveListings, updateItemFields } = useMlInsights()
  const [rows, setRows] = useState(null) // null = nunca carregado
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | active | paused
  const [pendingToggle, setPendingToggle] = useState(null) // { item_id, title, nextStatus } | null
  const [toggling, setToggling] = useState(false)

  const load = () => fetchActiveListings().then(setRows).catch(() => {})
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!rows) return []
    return rows
      .filter(r => statusFilter === 'all' || r.status === statusFilter)
      .filter(r => !search.trim() || r.title?.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  }, [rows, search, statusFilter])

  const counts = useMemo(() => {
    if (!rows) return { active: 0, paused: 0 }
    return {
      active: rows.filter(r => r.status === 'active').length,
      paused: rows.filter(r => r.status === 'paused').length,
    }
  }, [rows])

  // Só ABRE o modal de confirmação — nunca pausa/reativa com 1 clique.
  function requestToggle(row) {
    setPendingToggle({ item_id: row.item_id, title: row.title, nextStatus: row.status === 'active' ? 'paused' : 'active' })
  }

  async function confirmToggle() {
    if (!pendingToggle) return
    setToggling(true)
    try {
      await updateItemFields(pendingToggle.item_id, { status: pendingToggle.nextStatus })
      toast.success(pendingToggle.nextStatus === 'active' ? 'Anúncio reativado!' : 'Anúncio pausado!')
      setRows(rs => rs.map(r => r.item_id === pendingToggle.item_id ? { ...r, status: pendingToggle.nextStatus } : r))
    } catch (err) {
      toast.error('Erro ao atualizar: ' + err.message)
    } finally {
      setToggling(false)
      setPendingToggle(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-5">

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <Store size={20} className="text-slate-400"/> Anúncios
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Pausar, reativar e criar anúncio novo. Preço/estoque/ficha técnica são editados no detalhe de cada anúncio.
            </p>
          </div>
          <button onClick={() => navigate('/ml/anuncios/novo')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors">
            <Plus size={15}/> Criar anúncio novo
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título..."
              className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-emerald-400 bg-white"/>
          </div>
          <div className="flex gap-1.5">
            {[
              ['all', `Todos (${(counts.active + counts.paused) || 0})`],
              ['active', `Ativos (${counts.active})`],
              ['paused', `Pausados (${counts.paused})`],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  statusFilter === key ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading && !rows ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-400"/></div>
        ) : !filtered.length ? (
          <p className="text-sm text-slate-400 text-center py-16">
            {rows && !rows.length ? 'Nenhum anúncio encontrado.' : 'Nenhum anúncio bate com o filtro.'}
          </p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {filtered.map(row => (
              <div key={row.item_id} className="flex items-center gap-3 p-3">
                <img src={row.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-100 shrink-0 bg-slate-50"/>
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/ml/saude/${row.item_id}`)}>
                  <p className="text-sm text-slate-800 font-medium truncate hover:text-emerald-600">{row.title}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    {fmtMoney(row.price)} · {row.available_quantity ?? 0} em estoque
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${
                  row.status === 'active' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'
                }`}>
                  {row.status === 'active' ? 'Ativo' : row.status === 'paused' ? 'Pausado' : row.status}
                </span>
                <a href={row.permalink} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className="text-slate-300 hover:text-slate-500 shrink-0" title="Ver no Mercado Livre">
                  <ExternalLink size={15}/>
                </a>
                <button onClick={() => requestToggle(row)}
                  className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border shrink-0 transition-colors ${
                    row.status === 'active'
                      ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                      : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                  }`}>
                  {row.status === 'active' ? <><Pause size={12}/> Pausar</> : <><Play size={12}/> Reativar</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmWriteModal
        open={!!pendingToggle}
        title={pendingToggle?.nextStatus === 'active' ? 'Reativar anúncio' : 'Pausar anúncio'}
        confirmLabel={pendingToggle?.nextStatus === 'active' ? 'Sim, reativar' : 'Sim, pausar'}
        description={pendingToggle?.nextStatus === 'active'
          ? 'Vai voltar a aparecer nas buscas e aceitar venda no Mercado Livre agora mesmo.'
          : 'Vai sair das buscas e parar de vender no Mercado Livre agora mesmo (o anúncio continua existindo, só fica pausado).'}
        confirming={toggling}
        onConfirm={confirmToggle}
        onCancel={() => setPendingToggle(null)}
        detail={pendingToggle && <p className="text-sm text-slate-700">{pendingToggle.title}</p>}
      />
    </div>
  )
}
