import { useEffect, useState, useCallback } from 'react'
import { History, Loader2, AlertTriangle, ExternalLink, RefreshCw, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useMlInsights } from './hooks/useMlInsights'
import { useAuth } from '../../contexts/AuthContext'

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtMoney(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const ACTION_CONFIG = {
  attributes:      { label: 'Ficha técnica',        badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  content:         { label: 'Título/descrição',     badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  quick_fields:    { label: 'Preço/estoque/status', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  create:          { label: 'Anúncio criado',       badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  promotion_join:  { label: 'Entrou em campanha',   badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  promotion_leave: { label: 'Saiu de campanha',     badge: 'bg-slate-100 text-slate-500 border-slate-200' },
  question_answer: { label: 'Pergunta respondida',  badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}
function actionCfg(action) {
  return ACTION_CONFIG[action] || { label: action || '—', badge: 'bg-slate-100 text-slate-500 border-slate-200' }
}

const QUICK_FIELD_LABEL = {
  status: 'status',
  price: 'preço',
  available_quantity: 'estoque',
}
function fmtQuickFieldValue(field, value) {
  if (field === 'price') return fmtMoney(value)
  if (field === 'status') return value === 'active' ? 'ativo' : value === 'paused' ? 'pausado' : value
  return String(value)
}

// Resumo de 1 linha por tipo de gravação — cada `detail` tem um formato
// diferente (ver `logItemUpdate` em ml-insights/index.ts), então cada
// action explica o seu do seu jeito. Nunca inventa nada, só reformata o
// que já foi gravado.
function detailSummary(action, detail) {
  if (!detail) return null
  switch (action) {
    case 'attributes':
      return `${detail.count} campo${detail.count === 1 ? '' : 's'} da ficha técnica`
    case 'content': {
      const parts = []
      if (detail.title) parts.push('título')
      if (detail.description) parts.push('descrição')
      return parts.length ? `Mudou: ${parts.join(' e ')}` : null
    }
    case 'quick_fields':
      return Object.entries(detail)
        .map(([field, value]) => `${QUICK_FIELD_LABEL[field] || field}: ${fmtQuickFieldValue(field, value)}`)
        .join(', ')
    case 'create':
      return detail.title || null
    case 'promotion_join':
      return `Campanha ${detail.promotion_type}${detail.deal_price != null ? ` · preço promo ${fmtMoney(detail.deal_price)}` : ''}`
    case 'promotion_leave':
      return `Campanha ${detail.promotion_type}`
    case 'question_answer':
      return detail.text ? `"${detail.text}"` : null
    default:
      return null
  }
}

function UpdateRow({ row, onToggleCheck, toggling }) {
  return (
    <div className={`flex items-start gap-3 bg-white border rounded-xl p-3 transition-colors ${row.checked ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'}`}>
      <button onClick={() => onToggleCheck(row)} disabled={toggling}
        title={row.checked ? `Sincronizado por ${row.checked_by || 'alguém'} em ${fmtDateTime(row.checked_at)} — clique pra desmarcar` : 'Marcar como já sincronizado na Shopee'}
        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors disabled:opacity-50 ${
          row.checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400 text-transparent'
        }`}>
        {toggling ? <Loader2 size={12} className="animate-spin text-slate-400" /> : <Check size={14} strokeWidth={3} />}
      </button>

      {row.item_thumbnail ? (
        <img src={row.item_thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover border border-slate-100 shrink-0 bg-slate-50" />
      ) : (
        <div className="w-11 h-11 rounded-lg border border-slate-100 shrink-0 bg-slate-50" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {row.permalink ? (
            <a href={row.permalink} target="_blank" rel="noreferrer" className="text-sm text-slate-800 font-medium truncate hover:text-emerald-600">
              {row.item_title || row.item_id}
            </a>
          ) : (
            <span className="text-sm text-slate-800 font-medium truncate">{row.item_title || row.item_id || '—'}</span>
          )}
          {row.permalink && <ExternalLink size={11} className="text-slate-300 shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {row.actions.map(({ action }) => {
            const cfg = actionCfg(action)
            return <span key={action} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${cfg.badge}`}>{cfg.label}</span>
          })}
        </div>
        <div className="mt-1 space-y-0.5">
          {row.actions.map(({ action, detail }) => {
            const summary = detailSummary(action, detail)
            return summary ? <p key={action} className="text-xs text-slate-500 truncate">{summary}</p> : null
          })}
        </div>
        {row.checked && (
          <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
            <Check size={11} /> Sincronizado{row.checked_by ? ` por ${row.checked_by}` : ''} em {fmtDateTime(row.checked_at)}
          </p>
        )}
      </div>

      <div className="text-xs text-slate-400 shrink-0">{fmtDateTime(row.updated_at)}</div>
    </div>
  )
}

const PAGE_SIZE = 15

export function MlUpdatesHistoryPage() {
  const { user } = useAuth()
  const { loading, error, fetchAllItemUpdates, setItemSyncCheck } = useMlInsights()
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0) // página atual, 0-based
  const [togglingId, setTogglingId] = useState(null)

  const load = useCallback(async (p = 0) => {
    const res = await fetchAllItemUpdates(p * PAGE_SIZE, PAGE_SIZE)
    setRows(res.results || [])
    setTotal(res.total ?? 0)
    setPage(p)
  }, [fetchAllItemUpdates])

  useEffect(() => { load(0) }, [load])

  async function toggleCheck(row) {
    setTogglingId(row.item_id)
    try {
      await setItemSyncCheck(row.item_id, !row.checked, user?.name)
      setRows(rs => rs.map(r => r.item_id === row.item_id
        ? { ...r, checked: !row.checked, checked_at: !row.checked ? new Date().toISOString() : null, checked_by: !row.checked ? user?.name : null }
        : r))
      toast.success(row.checked ? 'Desmarcado' : 'Marcado como sincronizado!')
    } catch (err) {
      toast.error('Erro ao marcar: ' + err.message)
    } finally {
      setTogglingId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200">
              <History size={22} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Histórico de Atualizações</h1>
              <p className="text-sm text-slate-500">Tudo que o sistema já mudou nos anúncios — marque o check quando já replicar na Shopee</p>
            </div>
          </div>
          <button onClick={() => load(0)} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors shadow-sm">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {loading ? 'Buscando...' : 'Atualizar'}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {loading && !rows && (
          <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-400" /></div>
        )}

        {rows && (
          <p className="text-xs text-slate-400">{total} anúncio{total === 1 ? '' : 's'} com atualização registrada</p>
        )}

        {rows && rows.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <History size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">Nenhuma atualização registrada ainda.</p>
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="flex flex-col gap-2">
            {rows.map(row => (
              <UpdateRow key={row.item_id} row={row} onToggleCheck={toggleCheck} toggling={togglingId === row.item_id} />
            ))}
          </div>
        )}

        {rows && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => load(page - 1)} disabled={loading || page === 0}
              className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl disabled:opacity-40 transition-colors">
              <ChevronLeft size={15} /> Anterior
            </button>
            <span className="text-xs text-slate-400">Página {page + 1} de {totalPages}</span>
            <button onClick={() => load(page + 1)} disabled={loading || page >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl disabled:opacity-40 transition-colors">
              Próxima <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
