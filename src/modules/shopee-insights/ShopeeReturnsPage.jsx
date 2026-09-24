import { useEffect, useState } from 'react'
import {
  RotateCcw, Loader2, AlertTriangle, Clock, ChevronLeft, ChevronRight,
  ShieldAlert, CheckCircle2, X, ExternalLink,
} from 'lucide-react'
import { useShopeeReturns } from './hooks/useShopeeReturns'
import { Modal } from '../../components/ui/Modal'
import toast from 'react-hot-toast'

const SHOPEE_ORANGE = '#EE4D2D'

const STATUS_INFO = {
  REQUESTED:    { label: 'Solicitado',                text: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  PROCESSING:   { label: 'Em processamento',           text: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  JUDGING:      { label: 'Em análise (mediação)',      text: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200' },
  ACCEPTED:     { label: 'Aceito — aguardando devolução', text: 'text-sky-700',  bg: 'bg-sky-50 border-sky-200' },
  REFUND_PAID:  { label: 'Reembolso pago',             text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  CLOSED:       { label: 'Encerrado',                  text: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200' },
  CANCELLED:    { label: 'Cancelado',                  text: 'text-slate-500',  bg: 'bg-slate-50 border-slate-200' },
  REJECTED:     { label: 'Rejeitado',                  text: 'text-rose-700',   bg: 'bg-rose-50 border-rose-200' },
}
const STATUS_FILTERS = [
  ['ALL', 'Todos'], ['REQUESTED', 'Solicitado'], ['PROCESSING', 'Em processamento'],
  ['JUDGING', 'Em análise'], ['ACCEPTED', 'Aceito'], ['REFUND_PAID', 'Reembolso pago'],
  ['CLOSED', 'Encerrado'], ['CANCELLED', 'Cancelado'],
]
// Só os códigos confirmados ao vivo na nossa conta (24/09) + os mais
// comuns documentados publicamente — se aparecer um código novo, cai no
// fallback (mostra o texto cru, nunca quebra a tela).
const REASON_LABELS = {
  CHANGE_MIND:       'Mudei de ideia',
  NOT_RECEIPT:        'Não recebi o produto',
  WRONG_ITEM:         'Recebi um produto errado',
  ITEM_MISSING:       'Faltou item no pedido',
  DAMAGED_OTHERS:     'Produto danificado',
  PHYSICAL_DMG:       'Dano físico no produto',
  FUNCTIONAL_DMG:     'Defeito de funcionamento',
  ITEM_NOT_FIT:       'Não serviu / não é compatível',
  EXPECTATION_FAILED: 'Diferente do esperado',
}
const SOLUTION_LABELS = { 0: 'Devolução e Reembolso', 1: 'Apenas Reembolso' }

function fmtPreco(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(unixSec) {
  if (!unixSec) return null
  return new Date(unixSec * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function daysUntil(unixSec) {
  if (!unixSec) return null
  const diffMs = unixSec * 1000 - Date.now()
  return Math.ceil(diffMs / 86400000)
}

function StatusBadge({ status }) {
  const info = STATUS_INFO[status] || { label: status || '—', text: 'text-slate-500', bg: 'bg-slate-50 border-slate-200' }
  return <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${info.text} ${info.bg}`}>{info.label}</span>
}

// Ações só fazem sentido enquanto a solicitação ainda pode ser
// respondida pelo vendedor — nos outros status (já pago/cancelado/
// encerrado) não faz sentido mostrar Disputar/Confirmar. A doc da
// Shopee confirma que dispute() vale pra REQUESTED, PROCESSING e
// ACCEPTED (esse último é o "aceito, aguardando validação/devolução do
// vendedor" — ainda dá tempo de agir).
const ACTIONABLE_STATUSES = new Set(['REQUESTED', 'PROCESSING', 'ACCEPTED'])

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
            <p className="text-sm text-slate-400">Nenhum motivo de disputa disponível pra essa solicitação.</p>
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

export function ShopeeReturnsPage() {
  const { rows, loading, error, hasMore, page, status, fetchPage, getDisputeReasons, confirmReturn, disputeReturn } = useShopeeReturns()
  const [disputeTarget, setDisputeTarget] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)

  useEffect(() => { fetchPage(1, 'ALL') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function reload() { fetchPage(page, status) }

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
          <button onClick={reload} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors shadow-sm"
            style={{ background: SHOPEE_ORANGE }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
            Atualizar
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

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
            {rows.map(r => {
              const item = r.item?.[0]
              const extraItems = (r.item?.length || 0) - 1
              const days = daysUntil(r.due_date)
              const urgent = days !== null && days <= 3 && ACTIONABLE_STATUSES.has(r.status)
              const canAct = ACTIONABLE_STATUSES.has(r.status)
              return (
                <div key={r.return_sn} className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-semibold text-slate-600">{r.user?.username || 'Comprador'}</span>
                      <span>· Pedido {r.order_sn}</span>
                      <span>· Retorno {r.return_sn}</span>
                    </div>
                    <StatusBadge status={r.status} />
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
                      <p className="text-[10px] font-semibold text-slate-400 uppercase">Reembolso</p>
                      <p className="text-sm font-bold text-emerald-600">{fmtPreco(r.refund_amount)}</p>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase">Motivo</p>
                      <p className="text-sm text-slate-700">{REASON_LABELS[r.reason] || r.reason || '—'}</p>
                      {r.text_reason && <p className="text-xs text-slate-400 mt-0.5 italic line-clamp-2">&ldquo;{r.text_reason}&rdquo;</p>}
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase">Solução</p>
                      <p className="text-sm text-slate-700">{SOLUTION_LABELS[r.return_solution] ?? '—'}</p>
                      {days !== null && canAct && (
                        <p className={`flex items-center gap-1 text-xs font-semibold mt-1 ${urgent ? 'text-rose-600' : 'text-slate-400'}`}>
                          <Clock size={11} /> {days > 0 ? `Vence em ${days} dia${days > 1 ? 's' : ''}` : days === 0 ? 'Vence hoje' : 'Vencido'}
                        </p>
                      )}
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
      </div>

      <DisputeModal open={!!disputeTarget} ret={disputeTarget} onClose={() => setDisputeTarget(null)}
        getDisputeReasons={getDisputeReasons} disputeReturn={disputeReturn}
        onDone={() => { setDisputeTarget(null); reload() }} />
      <ConfirmReturnModal open={!!confirmTarget} ret={confirmTarget} onClose={() => setConfirmTarget(null)}
        confirmReturn={confirmReturn}
        onDone={() => { setConfirmTarget(null); reload() }} />
    </div>
  )
}
