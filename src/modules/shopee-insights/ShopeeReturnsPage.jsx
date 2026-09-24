import { useEffect, useMemo, useState } from 'react'
import {
  RotateCcw, Loader2, AlertTriangle, ChevronLeft, ChevronRight,
  ShieldAlert, CheckCircle2, ExternalLink, CalendarDays, ArrowUpDown,
  LayoutList, BarChart3, TrendingDown, TrendingUp, Clock, AlertCircle,
} from 'lucide-react'
import { useShopeeReturns } from './hooks/useShopeeReturns'
import { Modal } from '../../components/ui/Modal'
import toast from 'react-hot-toast'

const SHOPEE_ORANGE = '#EE4D2D'

// Status crus da Shopee — texto secundário (o que realmente guia a
// tela agora é o "resultado financeiro", ver classifyOutcome).
const STATUS_LABELS = {
  REQUESTED: 'Solicitado', PROCESSING: 'Em processamento', JUDGING: 'Em análise (mediação)',
  ACCEPTED: 'Aceito, aguardando devolução', REFUND_PAID: 'Reembolso pago', CLOSED: 'Encerrado',
  CANCELLED: 'Cancelado', REJECTED: 'Rejeitado',
}
const STATUS_FILTERS = [
  ['ALL', 'Todos'], ['REQUESTED', 'Solicitado'], ['PROCESSING', 'Em processamento'],
  ['JUDGING', 'Em análise'], ['ACCEPTED', 'Aceito'], ['REFUND_PAID', 'Reembolso pago'],
  ['CLOSED', 'Encerrado'], ['CANCELLED', 'Cancelado'],
]
const REASON_LABELS = {
  CHANGE_MIND: 'Mudei de ideia', NOT_RECEIPT: 'Não recebi o produto', WRONG_ITEM: 'Recebi um produto errado',
  ITEM_MISSING: 'Faltou item no pedido', DAMAGED_OTHERS: 'Produto danificado', BROKEN_PRODUCTS: 'Produto chegou quebrado',
  PHYSICAL_DMG: 'Dano físico no produto', FUNCTIONAL_DMG: 'Defeito de funcionamento',
  ITEM_NOT_FIT: 'Não serviu / não é compatível', EXPECTATION_FAILED: 'Diferente do esperado',
  EXPIRED_PRODUCT: 'Produto vencido',
}
const SOLUTION_LABELS = { 0: 'Devolução e Reembolso', 1: 'Apenas Reembolso' }

// Mesma classificação financeira do backend (returnsSummary) — REFUND_PAID
// é a única certeza de que saiu dinheiro; CANCELLED/REJECTED terminou sem
// reembolso (o valor ficou com a gente); os "em aberto" ainda podem virar
// qualquer um dos dois; o resto (CLOSED e afins) fica neutro de propósito
// — nunca chuta se foi ganho ou perda sem ter certeza.
const LOST_STATUSES    = new Set(['REFUND_PAID'])
const KEPT_STATUSES    = new Set(['CANCELLED', 'REJECTED'])
const ACTIONABLE_STATUSES = new Set(['REQUESTED', 'PROCESSING', 'ACCEPTED'])
const PENDING_STATUSES    = new Set(['REQUESTED', 'PROCESSING', 'JUDGING', 'ACCEPTED'])

function outcomeOf(status) {
  if (LOST_STATUSES.has(status)) return 'lost'
  if (KEPT_STATUSES.has(status)) return 'kept'
  if (PENDING_STATUSES.has(status)) return 'pending'
  return 'other'
}

function fmtPreco(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(unixSec) {
  if (!unixSec) return null
  return new Date(unixSec * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateISO(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function daysUntil(unixSec) {
  if (!unixSec) return null
  return Math.ceil((unixSec * 1000 - Date.now()) / 86400000)
}

const SORT_OPTIONS = [
  ['return_desc',   'Devolução — mais recente'],
  ['return_asc',    'Devolução — mais antiga'],
  ['purchase_desc', 'Compra — mais recente'],
  ['purchase_asc',  'Compra — mais antiga'],
]
function sortRows(rows, sortKey) {
  const [field, dir] = sortKey.startsWith('return_') ? ['create_time', sortKey.slice(7)] : ['purchase_date', sortKey.slice(9)]
  return [...rows].sort((a, b) => {
    const va = field === 'create_time' ? a.create_time : (a.purchase_date ? new Date(a.purchase_date).getTime() / 1000 : null)
    const vb = field === 'create_time' ? b.create_time : (b.purchase_date ? new Date(b.purchase_date).getTime() / 1000 : null)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return dir === 'asc' ? va - vb : vb - va
  })
}

// ── Selo único por linha — resolve de cara "perdemos, recuperamos, ou
// ainda precisa de ação" (era a maior confusão da versão anterior, que
// espalhava status + prazo em pedaços separados). ──────────────────
function OutcomeBadge({ r }) {
  const outcome = outcomeOf(r.status)
  if (outcome === 'lost') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
        <TrendingDown size={13} /> Reembolsado — {fmtPreco(r.refund_amount)} perdido
      </span>
    )
  }
  if (outcome === 'kept') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <TrendingUp size={13} /> Sem reembolso — valor mantido
      </span>
    )
  }
  if (outcome === 'pending') {
    const days = daysUntil(r.due_date)
    const canAct = ACTIONABLE_STATUSES.has(r.status)
    if (canAct && days !== null && days < 0) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          <AlertCircle size={13} /> Prazo vencido — pode não dar mais pra agir
        </span>
      )
    }
    if (canAct && days !== null && days <= 3) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
          <Clock size={13} /> {days <= 0 ? 'Vence hoje' : `Vence em ${days}d`} — precisa agir
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
        <Clock size={13} /> {STATUS_LABELS[r.status] || 'Em aberto'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
      {STATUS_LABELS[r.status] || r.status || 'Encerrado'}
    </span>
  )
}

// Cor da barra lateral do card — reforça o mesmo sinal do selo, dá pra
// escanear a lista inteira só pela faixa colorida à esquerda.
function outcomeBorderColor(r) {
  const outcome = outcomeOf(r.status)
  if (outcome === 'lost') return '#f43f5e'
  if (outcome === 'kept') return '#10b981'
  if (outcome === 'pending') {
    const days = daysUntil(r.due_date)
    if (ACTIONABLE_STATUSES.has(r.status) && days !== null && days <= 3) return '#f59e0b'
    return '#38bdf8'
  }
  return '#cbd5e1'
}

function DisputeModal({ open, onClose, ret, getDisputeReasons, disputeReturn, onDone }) {
  const [reasons, setReasons] = useState([])
  const [loadingReasons, setLoadingReasons] = useState(false)
  const [reasonId, setReasonId] = useState('')
  const [text, setText] = useState('')
  const [email, setEmail] = useState('raphael@coisapet.com.br')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !ret) return
    setReasonId(''); setText(''); setSaving(false)
    setLoadingReasons(true)
    getDisputeReasons(ret.return_sn)
      .then(setReasons)
      .catch(err => toast.error('Erro ao buscar motivos de disputa: ' + err.message))
      .finally(() => setLoadingReasons(false))
  }, [open, ret]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!reasonId) { toast.error('Escolhe um motivo pra disputa.'); return }
    if (!email.trim()) { toast.error('Informa um e-mail de contato.'); return }
    setSaving(true)
    try {
      await disputeReturn(ret.return_sn, { email: email.trim(), disputeReason: reasonId, disputeText: text.trim() })
      toast.success('Disputa aberta na Shopee!')
      onDone()
    } catch (err) {
      toast.error('Erro ao abrir disputa: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="Abrir disputa"
      subtitle={ret ? `Pedido ${ret.order_sn} — retorno ${ret.return_sn}` : ''}
      footer={<>
        <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={handleSubmit} className="btn-primary" disabled={saving || loadingReasons}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
          {saving ? 'Enviando...' : 'Confirmar disputa'}
        </button>
      </>}>
      <div className="space-y-3">
        <p className="flex items-start gap-1.5 text-[11px] text-orange-700 bg-orange-50 rounded-lg px-2.5 py-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          Isso grava direto na Shopee — a mediação deles decide o resultado, não dá pra desfazer sozinho depois.
        </p>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Motivo da disputa</label>
          {loadingReasons ? (
            <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" /> Carregando motivos...</div>
          ) : reasons.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum motivo de disputa disponível pra essa solicitação (o prazo pode já ter passado).</p>
          ) : (
            <select value={reasonId} onChange={e => setReasonId(e.target.value)} className="input">
              <option value="">Selecione...</option>
              {reasons.map(r => <option key={r.reason_id} value={r.reason_id}>{r.reason_text}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Justificativa (opcional)</label>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} className="input text-sm"
            placeholder="Explica o motivo da disputa com mais detalhe..." />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">E-mail de contato</label>
          <input value={email} onChange={e => setEmail(e.target.value)} className="input" type="email" />
        </div>
      </div>
    </Modal>
  )
}

function ConfirmReturnModal({ open, onClose, ret, confirmReturn, onDone }) {
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    try {
      await confirmReturn(ret.return_sn)
      toast.success('Devolução confirmada e reembolso liberado!')
      onDone()
    } catch (err) {
      toast.error('Erro ao confirmar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Finalizar sem disputas"
      subtitle={ret ? `Pedido ${ret.order_sn} — retorno ${ret.return_sn}` : ''}
      footer={<>
        <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={handleConfirm} className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {saving ? 'Confirmando...' : 'Confirmar e reembolsar'}
        </button>
      </>}>
      <p className="flex items-start gap-1.5 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2.5">
        <AlertTriangle size={15} className="shrink-0 mt-0.5 text-orange-500" />
        Vai confirmar essa devolução direto na Shopee e liberar <strong>{fmtPreco(ret?.refund_amount)}</strong> de
        reembolso pro comprador — sem disputa. Não dá pra desfazer depois.
      </p>
    </Modal>
  )
}

// ── Aba "Acompanhamento" — a lista, redesenhada ──────────────────────
function AcompanhamentoTab({ shopee }) {
  const { rows, loading, error, hasMore, page, status, fetchPage, getDisputeReasons, confirmReturn, disputeReturn } = shopee
  const [disputeTarget, setDisputeTarget] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [sortKey, setSortKey] = useState('return_desc')

  useEffect(() => { fetchPage(1, 'ALL') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function reload() { fetchPage(page, status) }
  const sortedRows = useMemo(() => sortRows(rows, sortKey), [rows, sortKey])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(([key, label]) => (
            <button key={key} onClick={() => fetchPage(1, key)} disabled={loading}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                status === key ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-500 hover:border-orange-300'
              }`}
              style={status === key ? { background: SHOPEE_ORANGE } : undefined}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={reload} disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-orange-600 disabled:opacity-50">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Atualizar
          </button>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
            <ArrowUpDown size={13} />
            <select value={sortKey} onChange={e => setSortKey(e.target.value)}
              className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none">
              {SORT_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Legenda — deixa explícito o que cada cor quer dizer, de cara */}
      <div className="flex items-center gap-4 flex-wrap text-[11px] text-slate-400 bg-white border border-slate-200 rounded-xl px-3 py-2">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Perdemos (reembolsado)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Recuperamos (sem reembolso)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Precisa agir logo</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> Em aberto, sem urgência</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Encerrado / outro</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Loader2 size={28} className="mx-auto mb-3 text-slate-300 animate-spin" />
          <p className="text-slate-400">Carregando solicitações...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <CheckCircle2 size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
          <p className="text-slate-400">Nenhuma solicitação nesse filtro</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedRows.map(r => {
            const item = r.item?.[0]
            const extraItems = (r.item?.length || 0) - 1
            const canAct = ACTIONABLE_STATUSES.has(r.status)
            return (
              <div key={r.return_sn} className="bg-white border border-slate-200 rounded-2xl p-4 border-l-4"
                style={{ borderLeftColor: outcomeBorderColor(r) }}>
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                    <span className="font-semibold text-slate-600">{r.user?.username || 'Comprador'}</span>
                    <span>· Pedido {r.order_sn}</span>
                    <span>· Retorno {r.return_sn}</span>
                  </div>
                  <OutcomeBadge r={r} />
                </div>

                <div className="flex items-center gap-4 flex-wrap mb-3 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <CalendarDays size={11} />
                    Comprado em {fmtDateISO(r.purchase_date) || <span className="italic text-slate-300">não sincronizado</span>}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays size={11} />
                    Devolução pedida em {fmtDate(r.create_time)}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 items-start">
                  <div className="flex gap-3">
                    <div className="w-14 h-14 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                      {item?.images?.[0] && <img src={item.images[0]} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 line-clamp-2">{item?.name || '—'}</p>
                      {item?.item_sku && <p className="text-xs text-slate-400 font-mono mt-0.5">{item.item_sku}</p>}
                      {extraItems > 0 && <p className="text-xs text-slate-400 mt-0.5">+{extraItems} outro{extraItems > 1 ? 's' : ''} item{extraItems > 1 ? 's' : ''}</p>}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Valor</p>
                    <p className="text-sm font-bold text-slate-700">{fmtPreco(r.refund_amount)}</p>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Motivo</p>
                    <p className="text-sm text-slate-700">{REASON_LABELS[r.reason] || r.reason || '—'}</p>
                    {r.text_reason && <p className="text-xs text-slate-400 mt-0.5 italic line-clamp-2">&ldquo;{r.text_reason}&rdquo;</p>}
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Solução</p>
                    <p className="text-sm text-slate-700">{SOLUTION_LABELS[r.return_solution] ?? '—'}</p>
                  </div>

                  <div className="flex flex-col gap-1.5 items-stretch lg:items-end shrink-0">
                    {canAct ? (
                      <>
                        <button onClick={() => setDisputeTarget(r)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 justify-end">
                          <ShieldAlert size={12} /> Disputar
                        </button>
                        <button onClick={() => setConfirmTarget(r)}
                          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 justify-end">
                          <CheckCircle2 size={12} /> Finalizar sem disputa
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-300">Sem ação disponível</span>
                    )}
                    {r.tracking_number && (
                      <a href={`https://www.17track.net/en/track?nums=${r.tracking_number}`} target="_blank" rel="noreferrer"
                        className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 justify-end">
                        <ExternalLink size={10} /> {r.tracking_number}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => fetchPage(page - 1, status)} disabled={page <= 1 || loading}
            className="flex items-center gap-1 text-sm font-semibold text-slate-500 disabled:opacity-30 hover:text-orange-600">
            <ChevronLeft size={16} /> Anterior
          </button>
          <span className="text-sm text-slate-400">Página {page}</span>
          <button onClick={() => fetchPage(page + 1, status)} disabled={!hasMore || loading}
            className="flex items-center gap-1 text-sm font-semibold text-slate-500 disabled:opacity-30 hover:text-orange-600">
            Próxima <ChevronRight size={16} />
          </button>
        </div>
      )}

      <DisputeModal open={!!disputeTarget} ret={disputeTarget} onClose={() => setDisputeTarget(null)}
        getDisputeReasons={getDisputeReasons} disputeReturn={disputeReturn}
        onDone={() => { setDisputeTarget(null); reload() }} />
      <ConfirmReturnModal open={!!confirmTarget} ret={confirmTarget} onClose={() => setConfirmTarget(null)}
        confirmReturn={confirmReturn}
        onDone={() => { setConfirmTarget(null); reload() }} />
    </div>
  )
}

// ── Aba "Relatório" — totais do período ──────────────────────────────
const PERIOD_OPTIONS = [[90, '90 dias'], [180, '180 dias'], [365, '1 ano'], [730, '2 anos']]

function KpiCard({ icon: Icon, label, value, sub, color, bg }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: bg }}>
          <Icon size={15} style={{ color }} />
        </div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-black text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function ReportTab({ shopee }) {
  const { summary, summaryLoading, summaryError, fetchSummary } = shopee
  const [days, setDays] = useState(365)

  useEffect(() => { fetchSummary(days) }, [days]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">Totais das solicitações de devolução pedidas nesse período</p>
        <div className="flex items-center gap-1.5">
          {PERIOD_OPTIONS.map(([d, label]) => (
            <button key={d} onClick={() => setDays(d)} disabled={summaryLoading}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                days === d ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-500 hover:border-orange-300'
              }`}
              style={days === d ? { background: SHOPEE_ORANGE } : undefined}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {summaryError && (
        <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} /> {summaryError}
        </div>
      )}

      {summaryLoading ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Loader2 size={28} className="mx-auto mb-3 text-slate-300 animate-spin" />
          <p className="text-slate-400">Somando as solicitações do período (pode levar um pouco)...</p>
        </div>
      ) : summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={TrendingDown} label="Perdemos (reembolsado)" color="#e11d48" bg="#fff1f2"
              value={fmtPreco(summary.lost.amount)} sub={`${summary.lost.count} solicitaç${summary.lost.count === 1 ? 'ão' : 'ões'}`} />
            <KpiCard icon={TrendingUp} label="Recuperamos (sem reembolso)" color="#059669" bg="#ecfdf5"
              value={fmtPreco(summary.kept.amount)} sub={`${summary.kept.count} solicitaç${summary.kept.count === 1 ? 'ão' : 'ões'}`} />
            <KpiCard icon={Clock} label="Em aberto — precisa de ação" color="#d97706" bg="#fffbeb"
              value={fmtPreco(summary.pending.amount)} sub={`${summary.pending.count} solicitaç${summary.pending.count === 1 ? 'ão' : 'ões'} em aberto`} />
            <KpiCard icon={AlertCircle} label="Vencendo ou já vencido" color="#dc2626" bg="#fef2f2"
              value={summary.pending.urgent_count + summary.pending.overdue_count}
              sub={`${summary.pending.overdue_count} vencido${summary.pending.overdue_count === 1 ? '' : 's'} · ${summary.pending.urgent_count} vencendo em até 3 dias`} />
          </div>

          {summary.truncated && (
            <p className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle size={13} /> Esse período tem muita solicitação — os números acima podem estar incompletos (bateu no limite de segurança da busca). Tenta um período menor pra ver o total exato.
            </p>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={15} className="text-slate-400" />
              <p className="text-sm font-bold text-slate-700">Principais motivos de devolução</p>
            </div>
            {summary.by_reason.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma solicitação nesse período.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {summary.by_reason.map(({ reason, count }) => {
                  const max = summary.by_reason[0].count
                  return (
                    <div key={reason} className="flex items-center gap-3">
                      <span className="text-xs text-slate-600 w-48 shrink-0 truncate">{REASON_LABELS[reason] || reason}</span>
                      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full flex items-center justify-end pr-1.5"
                          style={{ width: `${Math.max((count / max) * 100, 6)}%`, background: SHOPEE_ORANGE }}>
                          <span className="text-[10px] font-black text-white">{count}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function ShopeeReturnsPage() {
  const shopee = useShopeeReturns()
  const [tab, setTab] = useState('acompanhamento')

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1500px] mx-auto space-y-6">

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: `linear-gradient(135deg, ${SHOPEE_ORANGE}, #D6431F)`, boxShadow: `0 2px 10px ${SHOPEE_ORANGE}40` }}>
              <RotateCcw size={20} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Retornos e Pedidos Cancelados</h1>
              <p className="text-sm text-slate-500">Acompanhamento de devoluções da Shopee, direto da API</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 w-fit">
          <button onClick={() => setTab('acompanhamento')}
            className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${tab === 'acompanhamento' ? 'text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            style={tab === 'acompanhamento' ? { background: SHOPEE_ORANGE } : undefined}>
            <LayoutList size={15} /> Acompanhamento
          </button>
          <button onClick={() => setTab('relatorio')}
            className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${tab === 'relatorio' ? 'text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            style={tab === 'relatorio' ? { background: SHOPEE_ORANGE } : undefined}>
            <BarChart3 size={15} /> Relatório
          </button>
        </div>

        {tab === 'acompanhamento' ? <AcompanhamentoTab shopee={shopee} /> : <ReportTab shopee={shopee} />}
      </div>
    </div>
  )
}
