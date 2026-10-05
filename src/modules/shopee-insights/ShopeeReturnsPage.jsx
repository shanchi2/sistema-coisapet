import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  RotateCcw, Loader2, AlertTriangle, ShieldAlert, CheckCircle2, ExternalLink, Clock, AlertCircle,
  TrendingDown, TrendingUp, Search, X, Package, Truck, User, Wallet, ScrollText, Scale, Copy,
  RefreshCw, BarChart3, LayoutList, Image as ImageIcon, Hourglass, Ban,
} from 'lucide-react'
import { useShopeeReturns } from './hooks/useShopeeReturns'
import { Modal } from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'

const SHOPEE_ORANGE = '#EE4D2D'

// ── Tradução dos códigos da Shopee ──────────────────────────────────────
const STATUS_LABELS = {
  REQUESTED: 'Solicitada — aguardando sua resposta', PROCESSING: 'Em andamento (devolução)', JUDGING: 'Em análise pela Shopee',
  SELLER_DISPUTE: 'Em disputa', ACCEPTED: 'Reembolso aceito', REFUND_PAID: 'Reembolso pago', CLOSED: 'Encerrada',
  CANCELLED: 'Cancelada pelo comprador',
}
const REASON_LABELS = {
  CHANGE_MIND: 'Mudei de ideia', NOT_RECEIPT: 'Não recebi o produto', WRONG_ITEM: 'Produto errado',
  ITEM_MISSING: 'Faltou item', DAMAGED_OTHERS: 'Produto danificado', BROKEN_PRODUCTS: 'Chegou quebrado',
  PHYSICAL_DMG: 'Dano físico', FUNCTIONAL_DMG: 'Defeito de funcionamento', ITEM_NOT_FIT: 'Não serviu / não compatível',
  EXPECTATION_FAILED: 'Diferente do esperado', EXPIRED_PRODUCT: 'Produto vencido', DIFFERENT_DESCRIPTION: 'Diferente do anúncio',
  WRONG_DAMAGED_PRODUCT: 'Errado/danificado', MISSING_PARTS: 'Faltando peças',
}
const LOGISTICS_LABELS = {
  LOGISTICS_NOT_STARTED: 'Não iniciada', LOGISTICS_PENDING_ARRANGE: 'Aguardando agendamento', LOGISTICS_READY: 'Pronta pra coleta',
  LOGISTICS_REQUEST_CREATED: 'Etiqueta gerada — aguardando comprador postar', LOGISTICS_PICKUP_DONE: 'Comprador postou — a caminho',
  LOGISTICS_PICKUP_RETRY: 'Nova tentativa de coleta', LOGISTICS_DELIVERY_DONE: 'Entregue pra você', LOGISTICS_DELIVERY_FAILED: 'Falha na entrega',
  LOGISTICS_REQUEST_CANCELED: 'Cancelada', LOGISTICS_LOST: 'Extraviada',
}
const RESPONSIBILITY_LABELS = { SHOPEE: 'Shopee (custo absorvido pela Shopee)', SELLER: 'Vendedor (você)', BUYER: 'Comprador', PENDING: 'Ainda não definida' }
const COMP_TYPE_LABELS = { LOGISTICS_RELATED_COMPENSATION: 'Relacionada à logística' }
const COMP_STATUS_LABELS = { NOT_REQUIRED: 'Não se aplica', PENDING: 'Em análise', APPROVED: 'Aprovada', REJECTED: 'Negada' }
const SOLUTION_LABELS = { 0: 'Devolução e reembolso', 1: 'Só reembolso' }
// Motivo da NOSSA disputa — a API devolve o texto em inglês
const DISPUTE_REASON_PT = {
  'Received return products with physical damage': 'Produto devolvido chegou com dano físico',
  'Received incomplete return products (missing quantity/accessories)': 'Produto devolvido chegou incompleto (faltando quantidade/acessórios)',
  'Received wrong return products': 'Recebi um produto diferente na devolução',
  'Did not receive return products': 'Não recebi o produto devolvido',
  'Received used return products': 'Produto devolvido chegou usado',
}
const disputeReasonPT = r => DISPUTE_REASON_PT[r] || r

// Variação do item (Fase 85): nome + foto vindos do get_model_list
function variationOf(r, it) {
  if (!it) return null
  return r.variations?.[String(it.model_id)] || (it.variation_sku ? { name: null, sku: it.variation_sku, image: null } : null)
}
function VariationChip({ v, big }) {
  if (!v?.name && !v?.sku) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-bold bg-violet-100 text-violet-700 ${big ? 'text-sm px-2.5 py-1' : 'text-[11px] px-1.5 py-0.5'}`}>
      {v.name || v.sku}
    </span>
  )
}

// ── Datas (sempre Brasília) ─────────────────────────────────────────────
const TZ = 'America/Sao_Paulo'
function fmtDate(iso) { return iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) : '—' }
function fmtDateTime(iso) { return iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—' }
// Valores (reembolso, compensação, preço) só pra diretoria (role admin) —
// Atendimento e Produção usam esta tela pra acompanhar os chamados, mas sem
// ver dinheiro (pedido do Raphael, 05/10). Só esconde na TELA: a tabela
// shopee_returns continua legível pela chave anon (o app não usa sessão do
// Supabase Auth, então não há como filtrar coluna por usuário no banco).
const ShowValuesCtx = createContext(true)
const useShowValues = () => useContext(ShowValuesCtx)

function fmtPreco(v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function hoursUntil(iso) { return iso ? (new Date(iso).getTime() - Date.now()) / 3600000 : null }
function fmtCountdown(iso) {
  const h = hoursUntil(iso)
  if (h == null) return null
  if (h < 0) { const ah = -h; return ah < 24 ? `venceu há ${Math.round(ah)}h` : `venceu há ${Math.round(ah / 24)}d` }
  if (h < 1) return `vence em ${Math.max(1, Math.round(h * 60))} min`
  if (h < 24) return `vence em ${Math.round(h)}h`
  return `vence em ${Math.ceil(h / 24)}d`
}
function ago(iso) {
  if (!iso) return 'nunca'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  if (m < 1440) return `há ${Math.round(m / 60)}h`
  return `há ${Math.round(m / 1440)}d`
}

// ── Regras de negócio ───────────────────────────────────────────────────
const itemBack = r => r.reverse_logistics_status === 'LOGISTICS_DELIVERY_DONE'

// Qual prazo importa agora e se ele é NOSSO (precisa agir) ou só informativo
function deadlineOf(r) {
  if (r.status === 'REQUESTED') return { at: r.due_date, label: 'Responder a solicitação (aceitar ou disputar)', ours: true }
  if (r.status === 'PROCESSING' && itemBack(r)) return { at: r.return_seller_due_date, label: 'Conferir o produto devolvido e decidir (aceitar ou disputar)', ours: true }
  if (r.status === 'PROCESSING') return { at: r.return_ship_due_date, label: 'Comprador devolver o produto', ours: false }
  return null
}

// Resultado financeiro de cada caso
function outcomeOf(r) {
  if (['REQUESTED', 'PROCESSING', 'JUDGING', 'SELLER_DISPUTE'].includes(r.status)) return 'open'
  if (r.status === 'CANCELLED') return 'kept'
  if (['ACCEPTED', 'REFUND_PAID'].includes(r.status)) return Number(r.compensation_amount) > 0 ? 'compensated' : 'refunded'
  return 'closed'
}
const OUTCOME = {
  open:        { label: 'Em aberto',                  tone: 'bg-sky-50 text-sky-700 border-sky-200',       bar: '#38bdf8' },
  kept:        { label: 'Cancelada — valor mantido',   tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: '#10b981' },
  compensated: { label: 'Reembolsado, mas compensado', tone: 'bg-violet-50 text-violet-700 border-violet-200', bar: '#8b5cf6' },
  refunded:    { label: 'Reembolsado ao comprador',    tone: 'bg-rose-50 text-rose-700 border-rose-200',     bar: '#f43f5e' },
  closed:      { label: 'Encerrada',                   tone: 'bg-slate-100 text-slate-500 border-slate-200', bar: '#cbd5e1' },
}

function urgencyOf(r) {
  const d = deadlineOf(r)
  if (!d?.ours || !d.at) return null
  const h = hoursUntil(d.at)
  if (h < 0) return 'overdue'
  if (h <= 72) return 'soon'
  return 'ok'
}

const FILTERS = [
  ['acao', 'Precisa agir'], ['andamento', 'Em andamento'], ['disputa', 'Com disputa'], ['compensacao', 'Com compensação'],
  ['reembolsadas', 'Reembolsadas'], ['canceladas', 'Canceladas'], ['todas', 'Todas'],
]
function matchFilter(r, f) {
  switch (f) {
    case 'acao': return !!deadlineOf(r)?.ours
    case 'andamento': return outcomeOf(r) === 'open'
    case 'disputa': return (r.dispute_reason?.length || 0) > 0 || ['JUDGING', 'SELLER_DISPUTE'].includes(r.status)
    case 'compensacao': return Number(r.compensation_amount) > 0
    case 'reembolsadas': return ['refunded', 'compensated'].includes(outcomeOf(r))
    case 'canceladas': return r.status === 'CANCELLED'
    default: return true
  }
}

const PERIODS = [[30, '30 dias'], [90, '90 dias'], [180, '6 meses'], [365, '1 ano'], [0, 'Tudo']]

// ── Peças ───────────────────────────────────────────────────────────────
function OutcomeBadge({ r }) {
  const o = OUTCOME[outcomeOf(r)]
  const label = outcomeOf(r) === 'open' ? (STATUS_LABELS[r.status] || 'Em aberto') : o.label
  return <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full border ${o.tone}`}>{label}</span>
}

function DeadlineChip({ r, big }) {
  const d = deadlineOf(r)
  if (!d?.at) return null
  const u = urgencyOf(r)
  const tone = !d.ours ? 'bg-slate-50 text-slate-500 border-slate-200'
    : u === 'overdue' ? 'bg-rose-600 text-white border-rose-600'
    : u === 'soon' ? 'bg-amber-100 text-amber-800 border-amber-300'
    : 'bg-sky-50 text-sky-700 border-sky-200'
  return (
    <span className={`inline-flex items-center gap-1 ${big ? 'text-xs px-3 py-1.5' : 'text-[11px] px-2 py-0.5'} font-bold rounded-full border ${tone} ${d.ours && u === 'soon' ? 'animate-pulse' : ''}`}
      title={`${d.label} — até ${fmtDateTime(d.at)}`}>
      <Clock size={big ? 13 : 11} /> {d.ours ? '' : 'Comprador: '}{fmtCountdown(d.at)}
    </span>
  )
}

function Kpi({ icon: Icon, label, value, sub, color, bg, onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-orange-200 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: bg }}><Icon size={15} style={{ color }} /></span>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
      </div>
      <p className="text-xl font-black text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </button>
  )
}

function Section({ icon: Icon, title, children, tone }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone || 'bg-white border-slate-200'}`}>
      <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3"><Icon size={15} className="text-slate-400" /> {title}</p>
      {children}
    </div>
  )
}
function Field({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-700 text-right min-w-0">{children}</span>
    </div>
  )
}

// ── Modais de ação (gravam direto na Shopee — confirmação explícita) ────
// A API manda os motivos só por código + exigência de prova (sem nome) —
// nomes aqui a partir da exigência de cada um (30/09).
const DISPUTE_REASON_LABELS = {
  82: 'Produto devolvido danificado / com problema',
  83: 'Devolução veio vazia ou com itens faltando',
  84: 'Produto devolvido diferente do anunciado',
  86: 'Outro motivo',
  89: 'Produto devolvido com sinais de uso',
}
function reasonLabel(r) {
  return r.reason_text || DISPUTE_REASON_LABELS[r.reason_id] || r.modules?.[0]?.requirement || `Motivo ${r.reason_id}`
}

// Reduz a foto no navegador (máx 1600px, JPEG) antes de mandar
async function fileToJpegBase64(file) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.88).split(',')[1]
}

// Mesmo fluxo do "Dispute to Shopee" do Seller Center: motivo → descrição
// (até 256) → provas (fotos suas e/ou as fotos que o comprador mandou) →
// confirmação. Fotos viram URL da Shopee (convert_image) e vão na disputa.
function DisputeModal({ open, onClose, ret, reasons, disputeReturn, convertProofImages, onDone }) {
  const [reasonId, setReasonId] = useState('')
  const [text, setText]         = useState('')
  const [email, setEmail]       = useState('raphael@coisapet.com.br')
  const [files, setFiles]       = useState([])       // [{ file, preview }]
  const [buyerPicks, setBuyerPicks] = useState(new Set())
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving]     = useState('')       // '' | 'fotos' | 'disputa'
  useEffect(() => {
    if (!open) return
    setReasonId(''); setText(''); setFiles([]); setBuyerPicks(new Set()); setConfirming(false); setSaving('')
  }, [open])

  const reason = reasons.find(r => String(r.reason_id) === String(reasonId))
  const needsProof = (reason?.modules || []).some(m => m.is_required)
  const proofCount = files.length + buyerPicks.size
  const buyerPhotos = ret?.buyer_images || []

  function addFiles(list) {
    const next = Array.from(list || []).filter(f => f.type.startsWith('image/')).map(file => ({ file, preview: URL.createObjectURL(file) }))
    setFiles(prev => [...prev, ...next].slice(0, 9))
  }
  function toggleBuyer(url) {
    setBuyerPicks(prev => { const n = new Set(prev); n.has(url) ? n.delete(url) : n.add(url); return n })
  }

  function validate() {
    if (!reasonId) { toast.error('Escolha o motivo.'); return false }
    if (needsProof && proofCount === 0) { toast.error('Esse motivo exige prova — anexe pelo menos 1 foto.'); return false }
    if (!email.trim()) { toast.error('Informe um e-mail de contato.'); return false }
    return true
  }

  async function handleSubmit() {
    try {
      let images = []
      if (proofCount) {
        setSaving('fotos')
        const base64 = await Promise.all(files.map(f => fileToJpegBase64(f.file)))
        images = await convertProofImages({ base64, urls: [...buyerPicks] })
        if (!images.length) throw new Error('Não consegui enviar as fotos de prova pra Shopee.')
      }
      setSaving('disputa')
      await disputeReturn(ret.return_sn, { email: email.trim(), disputeReason: Number(reasonId), disputeText: text.trim(), images, reasonLabel: reason ? reasonLabel(reason) : null })
      toast.success('Disputa aberta na Shopee!')
      onDone()
    } catch (err) {
      toast.error('Erro ao abrir disputa: ' + err.message, { duration: 10000 })
      setConfirming(false)
    } finally { setSaving('') }
  }

  return (
    <Modal open={open} onClose={() => !saving && onClose()} size="lg" title="Disputar com a Shopee" subtitle={ret ? `Pedido ${ret.order_sn} — solicitação ${ret.return_sn}` : ''}
      footer={confirming ? <>
        <span className="mr-auto text-sm font-semibold text-rose-700">Confirma a disputa na Shopee? A mediação deles decide o resultado.</span>
        <button onClick={() => setConfirming(false)} className="btn-secondary" disabled={!!saving}>Voltar</button>
        <button onClick={handleSubmit} className="btn-primary bg-rose-600 hover:bg-rose-700" disabled={!!saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
          {saving === 'fotos' ? 'Enviando fotos...' : saving === 'disputa' ? 'Abrindo disputa...' : 'Sim, abrir disputa'}
        </button>
      </> : <>
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={() => validate() && setConfirming(true)} className="btn-primary"><ShieldAlert size={14} /> Continuar</button>
      </>}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Motivo *</label>
          <select value={reasonId} onChange={e => setReasonId(e.target.value)} className="input" disabled={confirming}>
            <option value="">Selecione o motivo...</option>
            {reasons.map(r => <option key={r.reason_id} value={r.reason_id}>{reasonLabel(r)}</option>)}
          </select>
          {reason && (
            <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 space-y-1">
              {(reason.modules || []).map((m, i) => (
                <p key={i} className="font-semibold text-slate-700">{m.is_required ? '📎 Obrigatório: ' : '📎 '}{m.requirement}</p>
              ))}
              {reason.requirement && <p className="whitespace-pre-line text-slate-500">{reason.requirement}</p>}
              {reason.samples?.length > 0 && (
                <div className="flex gap-1.5 pt-1">{reason.samples.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer"><img src={s.thumbnail || s.url} alt="" className="w-12 h-12 rounded object-cover border" title="Exemplo de prova" /></a>)}</div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Descrição</label>
          <textarea value={text} onChange={e => setText(e.target.value.slice(0, 256))} rows={3} className="input text-sm" disabled={confirming}
            placeholder="Ex: O produto voltou com 2 grades amassadas e a caixa rasgada — não estava assim quando enviamos." />
          <p className="text-[11px] text-slate-400 text-right">{text.length}/256</p>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Provas (fotos) {needsProof && <span className="text-rose-600 normal-case">— obrigatório pra esse motivo</span>}</label>
          <div className="flex gap-2 flex-wrap">
            {files.map((f, i) => (
              <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-orange-400">
                <img src={f.preview} alt="" className="w-full h-full object-cover" />
                {!confirming && <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"><X size={11} /></button>}
              </div>
            ))}
            {!confirming && files.length < 9 && (
              <label className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:border-orange-400 hover:text-orange-500 cursor-pointer text-[10px] font-semibold">
                <ImageIcon size={18} /> Enviar fotos
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              </label>
            )}
          </div>
          {buyerPhotos.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] text-slate-500 mb-1.5">Ou use as fotos que o comprador mandou (a Shopee aceita, se mostrarem o problema):</p>
              <div className="flex gap-2 flex-wrap">
                {buyerPhotos.map(url => {
                  const on = buyerPicks.has(url)
                  return (
                    <button key={url} type="button" disabled={confirming} onClick={() => toggleBuyer(url)}
                      className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 ${on ? 'border-orange-500' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {on && <span className="absolute inset-0 bg-orange-500/30 flex items-center justify-center"><CheckCircle2 size={18} className="text-white" /></span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">E-mail de contato</label>
          <input value={email} onChange={e => setEmail(e.target.value)} className="input" type="email" disabled={confirming} />
        </div>
      </div>
    </Modal>
  )
}

function ConfirmReturnModal({ open, onClose, ret, confirmReturn, onDone }) {
  const showValues = useShowValues()
  const [saving, setSaving] = useState(false)
  async function handleConfirm() {
    setSaving(true)
    try { await confirmReturn(ret.return_sn); toast.success('Reembolso aceito na Shopee.'); onDone() }
    catch (err) { toast.error('Erro ao confirmar: ' + err.message) }
    finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Aceitar e reembolsar" subtitle={ret ? `Pedido ${ret.order_sn} — solicitação ${ret.return_sn}` : ''}
      footer={<>
        <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={handleConfirm} className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {saving ? 'Confirmando...' : 'Sim, aceitar e reembolsar'}
        </button>
      </>}>
      <p className="flex items-start gap-1.5 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2.5">
        <AlertTriangle size={15} className="shrink-0 mt-0.5 text-orange-500" />
        {showValues
          ? <>Aceita a devolução direto na Shopee e libera <strong>&nbsp;{fmtPreco(ret?.refund_amount)}&nbsp;</strong> de reembolso pro comprador, sem disputa. Não dá pra desfazer.</>
          : <>Aceita a devolução direto na Shopee e libera o reembolso pro comprador, sem disputa. Não dá pra desfazer.</>}
      </p>
    </Modal>
  )
}

// ── Painel de detalhe (conteúdo do Seller Center) ───────────────────────
// Nossa contestação (Fase 85): motivo + descrição (a API devolve) e as
// fotos que mandamos (a API NÃO devolve — guardamos ao disputar pelo
// sistema; disputa feita no Seller Center dá pra anexar aqui depois).
function OurDisputeSection({ r, api }) {
  const [uploading, setUploading] = useState(false)
  const our = r.our_dispute || {}
  const reasons = (r.dispute_reason || []).length ? r.dispute_reason : (our.reason_label ? [our.reason_label] : [])
  const texts = r.dispute_text_reason || []
  const photos = our.images || []

  async function attach(list) {
    const files = Array.from(list || []).filter(f => f.type.startsWith('image/')).slice(0, 9)
    if (!files.length) return
    setUploading(true)
    try {
      await api.saveOurDisputePhotos(r.return_sn, files)
      toast.success('Fotos anexadas à contestação.')
    } catch (err) {
      toast.error('Erro ao anexar: ' + err.message)
    } finally { setUploading(false) }
  }

  return (
    <Section icon={Scale} title="Nossa contestação" tone="bg-rose-50/50 border-rose-100">
      {reasons.map((reason, i) => (
        <div key={i} className="mb-3 last:mb-0">
          <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wide">Motivo</p>
          <p className="text-sm font-semibold text-slate-800">{disputeReasonPT(reason)}</p>
          {(texts[i] || (i === 0 && our.text)) && (
            <>
              <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wide mt-2">Descrição do problema</p>
              <p className="text-sm text-slate-700 bg-white border border-rose-100 rounded-lg px-3 py-2 mt-0.5 whitespace-pre-line">{texts[i] || our.text}</p>
            </>
          )}
        </div>
      ))}
      {!reasons.length && <p className="text-sm text-slate-600">Em análise pela Shopee.</p>}

      <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wide mt-3 mb-1">Fotos que enviamos</p>
      {photos.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {photos.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" className="w-20 h-20 rounded-lg object-cover border border-rose-200 hover:ring-2 hover:ring-rose-300" /></a>)}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          A Shopee não devolve pela API as fotos da contestação. {our.source === 'sistema' ? 'Esta contestação foi enviada sem fotos.' : 'Se ela foi feita pelo Seller Center, anexe as mesmas fotos aqui pra ficar registrado.'}
        </p>
      )}
      <label className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : 'bg-white border-rose-200 text-rose-700 hover:bg-rose-50'}`}>
        {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
        {uploading ? 'Enviando...' : photos.length ? 'Anexar mais fotos' : 'Anexar fotos da contestação'}
        <input type="file" accept="image/*" multiple className="hidden" onChange={e => { attach(e.target.files); e.target.value = '' }} />
      </label>
      {(our.at || our.attached_at) && (
        <p className="text-[11px] text-slate-400 mt-2">
          {our.source === 'sistema' ? `Enviada pelo sistema${our.by ? ` por ${our.by}` : ''} em ${fmtDateTime(our.at)}` : `Fotos anexadas${our.attached_by ? ` por ${our.attached_by}` : ''} em ${fmtDateTime(our.attached_at)}`}
        </p>
      )}
    </Section>
  )
}

function DetailPanel({ r, api, onClose }) {
  const showValues = useShowValues()
  const [refreshing, setRefreshing] = useState(false)
  const [reasons, setReasons] = useState(null) // null = verificando
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const d = deadlineOf(r)
  const actionable = !!d?.ours

  useEffect(() => {
    setReasons(null)
    // Atualiza ao vivo + descobre se ainda dá pra disputar
    setRefreshing(true)
    api.refreshOne(r.return_sn).catch(() => {}).finally(() => setRefreshing(false))
    if (actionable) api.getDisputeReasons(r.return_sn).then(setReasons).catch(() => setReasons([]))
    else setReasons([])
  }, [r.return_sn]) // eslint-disable-line react-hooks/exhaustive-deps

  const item = r.items?.[0]
  const photos = r.buyer_images || []
  const videos = (r.buyer_videos || []).map(v => v.video_url || v.url || v).filter(x => typeof x === 'string')

  function copy(t) { navigator.clipboard?.writeText(t); toast.success('Copiado!') }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-slate-50 overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap"><OutcomeBadge r={r} /><DeadlineChip r={r} big /></div>
            <p className="text-sm text-slate-500 mt-1.5 flex items-center gap-1.5 flex-wrap">
              Solicitação <button onClick={() => copy(r.return_sn)} className="font-mono text-slate-700 hover:text-orange-600 flex items-center gap-1">{r.return_sn}<Copy size={11} /></button>
              · Pedido <button onClick={() => copy(r.order_sn)} className="font-mono text-slate-700 hover:text-orange-600 flex items-center gap-1">{r.order_sn}<Copy size={11} /></button>
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {refreshing && <Loader2 size={15} className="animate-spin text-slate-300" />}
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Ação necessária */}
          {actionable && (
            <div className={`rounded-2xl border-2 p-4 ${urgencyOf(r) === 'overdue' ? 'border-rose-300 bg-rose-50' : urgencyOf(r) === 'soon' ? 'border-amber-300 bg-amber-50' : 'border-sky-200 bg-sky-50'}`}>
              <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Hourglass size={15} /> {d.label}</p>
              <p className="text-sm text-slate-600 mt-0.5">Prazo: <b>{fmtDateTime(d.at)}</b> ({fmtCountdown(d.at)})</p>
              {urgencyOf(r) === 'overdue' && <p className="text-xs text-rose-700 mt-1">O prazo passou — a Shopee costuma decidir sozinha a favor do comprador. Confira no Seller Center se ainda há alguma opção.</p>}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {reasons === null ? (
                  <span className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Verificando se dá pra disputar...</span>
                ) : reasons.length > 0 ? (
                  <button onClick={() => setDisputeOpen(true)} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5"><ShieldAlert size={14} /> Abrir disputa</button>
                ) : (
                  <span className="text-xs text-slate-500 flex items-center gap-1"><Ban size={12} /> A Shopee não oferece disputa nesta etapa</span>
                )}
                <button onClick={() => setConfirmOpen(true)} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-emerald-700 hover:border-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={14} /> Aceitar e reembolsar</button>
              </div>
            </div>
          )}

          {/* Linha do tempo */}
          <Section icon={Clock} title="Linha do tempo">
            <div className="flex flex-col gap-2">
              {[
                ['Compra', r.purchase_date, null],
                ['Comprador solicitou devolução/reembolso', r.create_time, null],
                ['Prazo pra responder a solicitação', r.due_date, r.status === 'REQUESTED'],
                ['Prazo do comprador devolver', r.return_ship_due_date, r.status === 'PROCESSING' && !itemBack(r)],
                ['Prazo pra conferir o produto devolvido', r.return_seller_due_date, r.status === 'PROCESSING' && itemBack(r)],
                ['Prazo da compensação', r.compensation_due_date, false],
                ['Última atualização', r.update_time, null],
              ].filter(([, at]) => at).map(([label, at, active]) => (
                <div key={label} className="flex items-center gap-3 text-sm">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${active ? 'bg-orange-500 ring-4 ring-orange-100' : new Date(at) < new Date() ? 'bg-slate-300' : 'bg-sky-400'}`} />
                  <span className={`flex-1 ${active ? 'font-bold text-slate-800' : 'text-slate-600'}`}>{label}</span>
                  <span className="text-slate-500 tabular-nums">{fmtDateTime(at)}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Produto */}
          <Section icon={Package} title="Produto">
            {(r.items || []).map((it, i) => {
              const v = variationOf(r, it)
              const img = v?.image || it.images?.[0]
              return (
                <div key={i} className="flex items-center gap-3 mb-3 last:mb-0">
                  <a href={img || undefined} target="_blank" rel="noreferrer" className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">{img && <img src={img} alt="" className="w-full h-full object-cover" />}</a>
                  <div className="min-w-0 text-sm flex flex-col gap-1">
                    <p className="font-semibold text-slate-700 line-clamp-2">{it.name}</p>
                    {v && (
                      <p className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold text-slate-400 uppercase">Variação</span>
                        <VariationChip v={v} big />
                      </p>
                    )}
                    <p className="text-xs text-slate-400">{v?.sku || it.variation_sku || it.item_sku || ''} {it.amount ? `· ${it.amount} un.` : ''} {showValues && it.item_price ? `· ${fmtPreco(it.item_price)}` : ''}</p>
                  </div>
                </div>
              )
            })}
            {!item && <p className="text-sm text-slate-400">—</p>}
          </Section>

          {/* Solicitado pelo comprador */}
          <Section icon={User} title="Solicitado pelo comprador">
            <Field label="Comprador">{r.buyer_username || '—'}</Field>
            {showValues && <Field label="Valor do reembolso"><b>{fmtPreco(r.refund_amount)}</b>{Number(r.amount_before_discount) > Number(r.refund_amount) && <span className="text-xs text-slate-400"> (antes do desconto {fmtPreco(r.amount_before_discount)})</span>}</Field>}
            <Field label="Tipo">{SOLUTION_LABELS[r.return_solution] ?? '—'}</Field>
            <Field label="Motivo">{REASON_LABELS[r.reason] || r.reason || '—'}</Field>
            {r.text_reason && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 mt-1 italic">&ldquo;{r.text_reason}&rdquo;</p>}
            {(photos.length > 0 || videos.length > 0) && (
              <div className="flex gap-2 flex-wrap mt-2">
                {photos.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" className="w-20 h-20 rounded-lg object-cover border border-slate-200 hover:ring-2 hover:ring-orange-300" /></a>)}
                {videos.map((v, i) => <a key={`v${i}`} href={v} target="_blank" rel="noreferrer" className="w-20 h-20 rounded-lg bg-slate-800 text-white text-xs flex items-center justify-center">▶ vídeo</a>)}
              </div>
            )}
          </Section>

          {/* Disputa */}
          {((r.dispute_reason?.length || 0) > 0 || ['JUDGING', 'SELLER_DISPUTE'].includes(r.status) || r.our_dispute) && (
            <OurDisputeSection r={r} api={api} />
          )}

          {/* Compensação */}
          <Section icon={Wallet} title="Compensação pra você (vendedor)" tone={Number(r.compensation_amount) > 0 ? 'bg-violet-50/60 border-violet-100' : undefined}>
            {Number(r.compensation_amount) > 0 ? (
              <>
                {showValues && <Field label="Valor"><b className="text-violet-700 text-base">{fmtPreco(r.compensation_amount)}</b></Field>}
                {(r.compensation_list || []).map((c, i) => <Field key={i} label="Tipo">{COMP_TYPE_LABELS[c.compensation_type] || c.compensation_type}{showValues ? ` · ${fmtPreco(c.compensation_amount)}` : ''}</Field>)}
                {r.compensation_status && <Field label="Situação">{COMP_STATUS_LABELS[r.compensation_status] || r.compensation_status}</Field>}
                <p className="text-[11px] text-slate-400 mt-1">Valor definido pela Shopee pra cobrir o prejuízo (ajuste de carteira). Confira o extrato da carteira no Seller Center.</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">{r.compensation_status === 'NOT_REQUIRED' ? 'Não se aplica a este caso.' : 'Nenhuma compensação registrada.'}</p>
            )}
          </Section>

          {/* Envio da devolução */}
          <Section icon={Truck} title="Envio da devolução">
            <Field label="Status">{LOGISTICS_LABELS[r.reverse_logistics_status] || r.reverse_logistics_status || '—'}</Field>
            {r.tracking_number && (
              <Field label="Rastreio">
                <a href={`https://www.17track.net/pt/track?nums=${r.tracking_number}`} target="_blank" rel="noreferrer" className="font-mono text-sky-600 hover:underline inline-flex items-center gap-1">{r.tracking_number}<ExternalLink size={11} /></a>
              </Field>
            )}
            {r.is_arrived_at_warehouse === 1 && <Field label="Armazém">Chegou no armazém da Shopee</Field>}
          </Section>

          {/* Responsabilidade logística */}
          <Section icon={ScrollText} title="Responsabilidade logística">
            <Field label="Responsável">{RESPONSIBILITY_LABELS[r.shipping_fee_responsibility] || r.shipping_fee_responsibility || '—'}</Field>
          </Section>

          <p className="text-[11px] text-slate-400 text-center">Dados da Shopee · detalhe atualizado {ago(r.detail_synced_at)}</p>
        </div>
      </div>

      {/* Os modais ficam na árvore do React DENTRO do fundo do painel (que
          fecha no clique) — sem barrar a propagação aqui, qualquer clique
          no modal (ex: abrir o select de motivo) "vazava" e fechava tudo. */}
      <div onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
        <DisputeModal open={disputeOpen} ret={r} reasons={reasons || []} disputeReturn={api.disputeReturn} convertProofImages={api.convertProofImages}
          onClose={() => setDisputeOpen(false)} onDone={() => { setDisputeOpen(false); onClose() }} />
        <ConfirmReturnModal open={confirmOpen} ret={r} confirmReturn={api.confirmReturn}
          onClose={() => setConfirmOpen(false)} onDone={() => { setConfirmOpen(false); onClose() }} />
      </div>
    </div>
  )
}

// ── Relatório ───────────────────────────────────────────────────────────
function ReportTab({ rows }) {
  const showValues = useShowValues()
  const byReason = useMemo(() => {
    const m = {}
    rows.forEach(r => { m[r.reason] = (m[r.reason] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [rows])
  const byProduct = useMemo(() => {
    const m = {}
    rows.forEach(r => {
      const it = r.items?.[0]; if (!it) return
      const k = it.item_id
      m[k] = m[k] || { name: it.name, img: it.images?.[0], count: 0, refunded: 0 }
      m[k].count++
      if (['refunded', 'compensated'].includes(outcomeOf(r))) m[k].refunded += Number(r.refund_amount) || 0
    })
    return Object.values(m).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [rows])
  const byMonth = useMemo(() => {
    const m = {}
    rows.forEach(r => {
      if (!r.create_time) return
      const k = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(new Date(r.create_time))
      m[k] = m[k] || { total: 0, refunded: 0 }
      m[k].total++
      if (['refunded', 'compensated'].includes(outcomeOf(r))) m[k].refunded++
    })
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
  }, [rows])
  const maxReason = byReason[0]?.[1] || 1
  const maxMonth = Math.max(1, ...byMonth.map(([, v]) => v.total))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-sm font-bold text-slate-700 mb-4">Motivos mais comuns</p>
        <div className="flex flex-col gap-2.5">
          {byReason.map(([reason, count]) => (
            <div key={reason} className="flex items-center gap-3" title={`${count} solicitações`}>
              <span className="text-xs text-slate-600 w-44 shrink-0 truncate">{REASON_LABELS[reason] || reason}</span>
              <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full flex items-center justify-end pr-1.5" style={{ width: `${Math.max((count / maxReason) * 100, 7)}%`, background: SHOPEE_ORANGE }}>
                  <span className="text-[10px] font-black text-white">{count}</span>
                </div>
              </div>
            </div>
          ))}
          {!byReason.length && <p className="text-sm text-slate-400">Sem dados no período.</p>}
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-sm font-bold text-slate-700 mb-4">Solicitações por mês <span className="font-normal text-slate-400">(laranja escuro = reembolsadas)</span></p>
        <div className="flex items-end gap-1.5 h-40">
          {byMonth.map(([k, v]) => (
            <div key={k} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${k}: ${v.total} solicitações, ${v.refunded} reembolsadas`}>
              <div className="w-full flex flex-col justify-end rounded-t-md overflow-hidden" style={{ height: `${(v.total / maxMonth) * 128}px`, background: '#fed7c7' }}>
                <div style={{ height: `${(v.refunded / Math.max(1, v.total)) * 100}%`, background: SHOPEE_ORANGE }} />
              </div>
              <span className="text-[9px] text-slate-400">{k.slice(5)}/{k.slice(2, 4)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-5 lg:col-span-2">
        <p className="text-sm font-bold text-slate-700 mb-3">Produtos com mais solicitações</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {byProduct.map((p, i) => (
            <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2">
              <div className="w-10 h-10 rounded-lg bg-white overflow-hidden border border-slate-200 shrink-0">{p.img && <img src={p.img} alt="" className="w-full h-full object-cover" />}</div>
              <p className="text-xs text-slate-700 flex-1 min-w-0 line-clamp-2">{p.name}</p>
              <div className="text-right shrink-0">
                <p className="text-sm font-black text-slate-800">{p.count}×</p>
                {showValues && p.refunded > 0 && <p className="text-[10px] text-rose-600">{fmtPreco(p.refunded)} reemb.</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Página ──────────────────────────────────────────────────────────────
export function ShopeeReturnsPage() {
  const { user } = useAuth()
  const showValues = user?.role === 'admin'
  const api = useShopeeReturns()
  const { rows, loading, error, syncing, syncError, lastSync, sync } = api
  const [tab, setTab]       = useState('lista')
  const [period, setPeriod] = useState(90)
  const [filter, setFilter] = useState('todas')
  const [q, setQ]           = useState('')
  const [openSn, setOpenSn] = useState(null)

  const inPeriod = useMemo(() => {
    if (!period) return rows
    const since = Date.now() - period * 86400000
    return rows.filter(r => r.create_time && new Date(r.create_time).getTime() >= since)
  }, [rows, period])

  // Prazos: sempre de TODAS (não só do período) — nada que precise de ação fica escondido
  const actionable = useMemo(() => rows.filter(r => deadlineOf(r)?.ours)
    .sort((a, b) => new Date(deadlineOf(a).at || 0) - new Date(deadlineOf(b).at || 0)), [rows])

  const kpis = useMemo(() => {
    const k = { total: inPeriod.length, refunded: 0, refundedN: 0, comp: 0, compN: 0, kept: 0, keptN: 0, open: 0, openN: 0 }
    inPeriod.forEach(r => {
      const o = outcomeOf(r), v = Number(r.refund_amount) || 0
      if (o === 'refunded' || o === 'compensated') { k.refunded += v; k.refundedN++ }
      if (Number(r.compensation_amount) > 0) { k.comp += Number(r.compensation_amount); k.compN++ }
      if (o === 'kept') { k.kept += v; k.keptN++ }
      if (o === 'open') { k.open += v; k.openN++ }
    })
    return k
  }, [inPeriod])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    let l = (filter === 'acao' ? actionable : inPeriod).filter(r => matchFilter(r, filter))
    if (s) l = l.filter(r => [r.return_sn, r.order_sn, r.buyer_username, r.items?.[0]?.name].some(x => (x || '').toLowerCase().includes(s)))
    return l
  }, [inPeriod, actionable, filter, q])

  const openRow = rows.find(r => r.return_sn === openSn)
  const overdue = actionable.filter(r => urgencyOf(r) === 'overdue').length
  const soon = actionable.filter(r => urgencyOf(r) === 'soon').length

  return (
    <ShowValuesCtx.Provider value={showValues}>
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1400px] mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: `linear-gradient(135deg, ${SHOPEE_ORANGE}, #D6431F)` }}>
              <RotateCcw size={20} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Retornos e Pedidos Cancelados</h1>
              <p className="text-sm text-slate-500">Devoluções e reembolsos da Shopee — prazos, disputas e compensações</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {syncing ? <span className="flex items-center gap-1.5 text-orange-600 font-semibold"><Loader2 size={13} className="animate-spin" /> Sincronizando com a Shopee...</span>
              : <span>Atualizado {ago(lastSync)}</span>}
            <button onClick={() => sync()} disabled={syncing} className="flex items-center gap-1.5 font-semibold text-slate-500 hover:text-orange-600 disabled:opacity-40"><RefreshCw size={13} /> Atualizar</button>
            <button onClick={() => sync({ full: true })} disabled={syncing} className="font-semibold text-slate-400 hover:text-orange-600 disabled:opacity-40" title="Varre todas as páginas da Shopee (~1 min)">Sincronização completa</button>
          </div>
        </div>

        {syncError && <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5"><AlertTriangle size={15} /> Erro ao sincronizar: {syncError}</div>}
        {error && <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5"><AlertTriangle size={15} /> {error}</div>}

        {/* Precisa agir — sempre no topo */}
        {actionable.length > 0 && (
          <div className={`rounded-2xl border-2 p-4 ${overdue || soon ? 'border-amber-300 bg-amber-50' : 'border-sky-200 bg-sky-50'}`}>
            <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-2">
              <AlertCircle size={16} className="text-amber-600" /> {actionable.length} solicitaç{actionable.length > 1 ? 'ões precisam' : 'ão precisa'} de ação sua
              {overdue > 0 && <span className="text-rose-700">· {overdue} com prazo vencido</span>}
              {soon > 0 && <span className="text-amber-700">· {soon} vencendo em até 3 dias</span>}
            </p>
            <div className="flex flex-col gap-1.5">
              {actionable.slice(0, 6).map(r => (
                <button key={r.return_sn} onClick={() => setOpenSn(r.return_sn)} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 text-left hover:ring-2 hover:ring-orange-200">
                  <DeadlineChip r={r} />
                  <span className="text-sm font-semibold text-slate-700 truncate flex-1 flex items-center gap-2"><span className="truncate">{r.items?.[0]?.name || r.return_sn}</span><VariationChip v={variationOf(r, r.items?.[0])} /></span>
                  <span className="text-xs text-slate-500 hidden md:inline">{deadlineOf(r).label}</span>
                  {showValues && <span className="text-sm font-bold text-slate-800 shrink-0">{fmtPreco(r.refund_amount)}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Período + KPIs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {PERIODS.map(([d, label]) => (
            <button key={d} onClick={() => setPeriod(d)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${period === d ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-500 hover:border-orange-300'}`}
              style={period === d ? { background: SHOPEE_ORANGE } : undefined}>{label}</button>
          ))}
          <span className="text-xs text-slate-400 ml-1">{period ? `solicitações criadas nos últimos ${period} dias` : 'todo o histórico'}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi icon={LayoutList} label="Solicitações" value={kpis.total} color="#64748b" bg="#f1f5f9" onClick={() => setFilter('todas')} />
          {/* Sem permissão de valores: o cartão mostra a QUANTIDADE de casos no lugar do R$ */}
          <Kpi icon={TrendingDown} label="Reembolsado ao comprador" value={showValues ? fmtPreco(kpis.refunded) : kpis.refundedN} sub={showValues ? `${kpis.refundedN} caso(s)` : 'caso(s)'} color="#e11d48" bg="#fff1f2" onClick={() => setFilter('reembolsadas')} />
          <Kpi icon={Wallet} label="Compensação recebida" value={showValues ? fmtPreco(kpis.comp) : kpis.compN} sub={showValues ? `${kpis.compN} caso(s) — ajuste de carteira` : 'caso(s) — ajuste de carteira'} color="#7c3aed" bg="#f5f3ff" onClick={() => setFilter('compensacao')} />
          <Kpi icon={TrendingUp} label={showValues ? 'Canceladas — valor mantido' : 'Canceladas'} value={showValues ? fmtPreco(kpis.kept) : kpis.keptN} sub={showValues ? `${kpis.keptN} caso(s)` : 'caso(s)'} color="#059669" bg="#ecfdf5" onClick={() => setFilter('canceladas')} />
          <Kpi icon={Hourglass} label="Em andamento" value={showValues ? fmtPreco(kpis.open) : kpis.openN} sub={showValues ? `${kpis.openN} caso(s)` : 'caso(s)'} color="#0284c7" bg="#f0f9ff" onClick={() => setFilter('andamento')} />
        </div>

        {/* Abas */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1">
            <button onClick={() => setTab('lista')} className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg ${tab === 'lista' ? 'text-white' : 'text-slate-500 hover:bg-slate-50'}`} style={tab === 'lista' ? { background: SHOPEE_ORANGE } : undefined}><LayoutList size={15} /> Solicitações</button>
            <button onClick={() => setTab('relatorio')} className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg ${tab === 'relatorio' ? 'text-white' : 'text-slate-500 hover:bg-slate-50'}`} style={tab === 'relatorio' ? { background: SHOPEE_ORANGE } : undefined}><BarChart3 size={15} /> Relatório</button>
          </div>
          {tab === 'lista' && (
            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pedido, solicitação, produto, comprador..." className="input pl-9 py-2 text-sm" />
            </div>
          )}
        </div>

        {tab === 'relatorio' ? <ReportTab rows={inPeriod} /> : (
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILTERS.map(([key, label]) => (
                <button key={key} onClick={() => setFilter(key)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${filter === key ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  {label}{key === 'acao' && actionable.length ? ` (${actionable.length})` : ''}
                </button>
              ))}
              <span className="text-xs text-slate-400 ml-1">{list.length} resultado(s){filter === 'acao' ? ' — de qualquer período' : ''}</span>
            </div>

            {loading ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200"><Loader2 size={26} className="mx-auto mb-2 animate-spin text-slate-300" /><p className="text-slate-400 text-sm">Carregando...</p></div>
            ) : list.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <CheckCircle2 size={30} strokeWidth={1} className="mx-auto mb-2 text-slate-200" />
                <p className="text-slate-400 text-sm">{rows.length ? 'Nenhuma solicitação nesse filtro' : syncing ? 'Buscando as solicitações na Shopee...' : 'Nenhuma solicitação sincronizada ainda'}</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                {list.slice(0, 300).map(r => {
                  const it = r.items?.[0]
                  return (
                    <button key={r.return_sn} onClick={() => setOpenSn(r.return_sn)}
                      className="w-full text-left grid grid-cols-[4px_1fr] hover:bg-orange-50/40 transition-colors">
                      <span style={{ background: OUTCOME[outcomeOf(r)].bar }} />
                      <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-[90px_minmax(0,2.2fr)_minmax(0,1.3fr)_110px_minmax(0,1.6fr)] gap-x-4 gap-y-1 items-center">
                        <div className="text-xs text-slate-500">
                          <p className="font-semibold text-slate-700">{fmtDate(r.create_time)}</p>
                          <p className="text-[10px] text-slate-400 font-mono truncate">{r.order_sn}</p>
                        </div>
                        <div className="flex items-center gap-2.5 min-w-0">
                          {(() => { const v = variationOf(r, it); const img = v?.image || it?.images?.[0]; return (<>
                          <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 shrink-0">{img ? <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" /> : <ImageIcon size={14} className="m-auto mt-3 text-slate-300" />}</div>
                          <div className="min-w-0">
                            <p className="text-sm text-slate-700 truncate">{it?.name || '—'}</p>
                            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1.5"><VariationChip v={v} />{r.buyer_username}</p>
                          </div></>) })()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-slate-600 truncate">{REASON_LABELS[r.reason] || r.reason}</p>
                          {(r.dispute_reason?.length > 0) && <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1"><Scale size={10} /> Disputa aberta</p>}
                        </div>
                        <div className="text-sm font-bold text-slate-800 md:text-right">{showValues ? fmtPreco(r.refund_amount) : ''}</div>
                        <div className="flex items-center gap-1.5 flex-wrap md:justify-end">
                          <OutcomeBadge r={r} />
                          <DeadlineChip r={r} />
                          {Number(r.compensation_amount) > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{showValues ? `+${fmtPreco(r.compensation_amount)}` : 'Compensado'}</span>}
                        </div>
                      </div>
                    </button>
                  )
                })}
                {list.length > 300 && <p className="text-xs text-slate-400 text-center py-3">Mostrando 300 de {list.length} — use a busca ou um período menor.</p>}
              </div>
            )}
          </>
        )}
      </div>

      {openRow && <DetailPanel r={openRow} api={api} onClose={() => setOpenSn(null)} />}
    </div>
    </ShowValuesCtx.Provider>
  )
}
