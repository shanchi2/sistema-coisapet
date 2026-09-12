import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, AlertTriangle, ExternalLink, Save, DollarSign,
  Type, Image as ImageIcon, TrendingUp, Package, Star, HeartPulse,
  ClipboardList, Megaphone, CheckCircle2, XCircle, ChevronDown, Sparkles, Wand2, Truck,
  Zap, Play, Pause, History, LayoutGrid, ImageOff, ArrowRight,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import toast from 'react-hot-toast'
import { useMlInsights } from './hooks/useMlInsights'
import { ConfirmWriteModal } from './ConfirmWriteModal'
import { InfoTooltip } from './InfoTooltip'
import { AttributeRow } from './AttributeRow'

function fmtMoney(v) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—'
  return `${(v * 100).toFixed(1)}%`
}
function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const UPDATE_ACTION_LABEL = {
  attributes: 'Ficha técnica atualizada',
  content: 'Título/descrição atualizados',
  quick_fields: 'Preço/estoque/status atualizado',
  create: 'Anúncio criado',
  promotion_join: 'Indicado pra campanha',
  promotion_leave: 'Removido de campanha',
  question_answer: 'Pergunta respondida',
}
function scoreColor(score) {
  if (score >= 80) return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
  if (score >= 50) return { text: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200'   }
  return { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' }
}
// A API do ML às vezes devolve foto em http:// puro — o site roda em
// https, então isso vira mixed content bloqueado pelo navegador.
function secureThumb(url) {
  return url ? url.replace(/^http:\/\//, 'https://') : null
}

function Card({ icon: Icon, title, caption, help, children, id, highlight }) {
  return (
    <div id={id} className={`bg-white border rounded-2xl p-5 transition-colors ${highlight ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={15} className="text-slate-400"/>
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{title}</p>
        <InfoTooltip text={help}/>
      </div>
      {caption && <p className="text-xs text-slate-400 mb-3">{caption}</p>}
      {!caption && <div className="mb-1"/>}
      {children}
    </div>
  )
}

// Mapeamento de pendências reais do indicador de qualidade do ML pro
// lugar onde dá pra resolver dentro do NOSSO sistema — confirmado ao
// vivo em 2026-09-02 escaneando os 223 anúncios da conta (22 chaves
// distintas encontradas; o ML usa às vezes um prefixo "UP_" e às vezes
// não pro mesmo conceito, por isso normaliza removendo o prefixo antes
// de comparar). Metade dos tipos reais (frete grátis, Envios Flex,
// vídeo, parcelamento, dados fiscais, Ads) são configuração de conta ou
// logística que a API do ML nem deixa a gente gravar — pra esses, o
// link manda pro próprio anúncio no Mercado Livre em vez de fingir um
// botão que não resolveria nada.
const PENDING_ACTIONS = {
  TECHNICAL_SPECIFICATIONS_MAIN: { label: 'Corrigir na Ficha Técnica', tab: 'attributes' },
  PYMES:                          { label: 'Ajustar medidas na Ficha Técnica', tab: 'attributes' },
  PRICE:                           { label: 'Ajustar preço', scrollTo: 'acoes-rapidas' },
  STOCK_DEPOSITO:                  { label: 'Ajustar estoque', scrollTo: 'acoes-rapidas' },
  PROMOTIONS:                      { label: 'Ver campanhas disponíveis', href: '/ml/promocoes' },
}
function pendingAction(key) {
  return PENDING_ACTIONS[String(key || '').replace(/^UP_/, '')] || null
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="text-slate-500">{label}</p>
      <p className="font-semibold text-slate-800">{payload[0].value} visitas</p>
    </div>
  )
}

function Stars({ rating }) {
  const r = Math.round(rating || 0)
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => <Star key={i} size={13} fill={i <= r ? '#F59E0B' : 'none'} stroke="#F59E0B" strokeWidth={1.5}/>)}
    </div>
  )
}

// Formato exato do retorno de Ads não foi confirmado ao vivo ainda —
// tenta achar as métricas em alguns formatos plausíveis (objeto direto,
// ou primeiro item de `results`), sempre com o bruto disponível de reserva.
function pickAdsMetrics(raw) {
  const source = raw?.results?.[0] ?? raw?.[0] ?? raw
  if (!source || typeof source !== 'object') return null
  const keys = ['clicks','prints','ctr','cost','cpc','acos','cvr','organic_units_quantity','direct_units_quantity','indirect_units_quantity']
  const found = {}
  let any = false
  keys.forEach(k => { if (source[k] != null) { found[k] = source[k]; any = true } })
  return any ? found : null
}

const TABS = [
  { key: 'overview',    label: 'Visão Geral',     icon: LayoutGrid },
  { key: 'content',     label: 'Conteúdo & IA',   icon: Sparkles },
  { key: 'attributes',  label: 'Ficha Técnica',   icon: ClipboardList },
  { key: 'performance', label: 'Desempenho',      icon: TrendingUp },
]

export function MlItemDetailPage() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const { loading, error, fetchItemDetail, applyAttributes, suggestContent, applyContent, updateItemFields, fetchItemUpdateHistory } = useMlInsights()
  const [detail, setDetail] = useState(null)
  const [updateHistory, setUpdateHistory] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [tab, setTab] = useState('overview')
  const [form,   setForm]   = useState({})
  const [saving, setSaving] = useState(false)
  const [quickPrice,  setQuickPrice]  = useState('')
  const [quickStock,  setQuickStock]  = useState('')
  const [quickStatus, setQuickStatus] = useState('active')
  const [savingQuick, setSavingQuick] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [editedTitle, setEditedTitle] = useState('')
  const [editedDescription, setEditedDescription] = useState('')
  const [applyTitleFlag, setApplyTitleFlag] = useState(true)
  const [applyDescFlag,  setApplyDescFlag]  = useState(true)
  const [applyingContent, setApplyingContent] = useState(false)
  const [showRawAds, setShowRawAds] = useState(false)
  const [showRawPerf, setShowRawPerf] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null) // null | 'attributes' | 'content' | 'quick'
  const [highlightQuick, setHighlightQuick] = useState(false)

  // Leva o usuário direto pro lugar do PRÓPRIO sistema que resolve essa
  // pendência — troca de aba (fica na mesma página) ou rola até Ações
  // Rápidas (que fica fora das abas, sempre visível) com um destaque
  // temporário pra não passar batido.
  function goToFix(action) {
    if (action.href) { navigate(action.href); return }
    if (action.tab) { setTab(action.tab); return }
    if (action.scrollTo) {
      document.getElementById(action.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightQuick(true)
      setTimeout(() => setHighlightQuick(false), 1800)
    }
  }

  function refreshHistory() {
    fetchItemUpdateHistory(itemId).then(setUpdateHistory).catch(() => {})
  }

  useEffect(() => {
    fetchItemDetail(itemId).then(d => {
      setDetail(d)
      setQuickPrice(String(d.item.price ?? ''))
      setQuickStock(String(d.item.available_quantity ?? ''))
      setQuickStatus(d.item.status || 'active')
    }).catch(() => {})
    refreshHistory()
  }, [itemId, fetchItemDetail]) // eslint-disable-line react-hooks/exhaustive-deps

  const filledCount = Object.values(form).filter(Boolean).length

  // Só ABRE o modal de confirmação — nunca grava nada sozinho.
  function requestSave() {
    if (!filledCount) return
    setConfirmModal('attributes')
  }

  // Só manda pro ML os campos que o usuário de fato mudou (mesmo
  // espírito da Ficha Técnica). Compara contra o valor carregado, não
  // contra o input anterior.
  const quickChanges = detail ? {
    ...(Number(quickPrice) !== detail.item.price && quickPrice.trim() !== '' ? { price: Number(quickPrice) } : {}),
    ...(Number(quickStock) !== detail.item.available_quantity && quickStock.trim() !== '' ? { available_quantity: Number(quickStock) } : {}),
    ...(quickStatus !== (detail.item.status || 'active') ? { status: quickStatus } : {}),
  } : {}
  const quickChangeCount = Object.keys(quickChanges).length

  function requestQuickSave() {
    if (!quickChangeCount) return
    setConfirmModal('quick')
  }

  async function confirmQuickSave() {
    setSavingQuick(true)
    try {
      await updateItemFields(itemId, quickChanges)
      toast.success('Anúncio atualizado no Mercado Livre!')
      const updated = await fetchItemDetail(itemId)
      setDetail(updated)
      setQuickPrice(String(updated.item.price ?? ''))
      setQuickStock(String(updated.item.available_quantity ?? ''))
      setQuickStatus(updated.item.status || 'active')
      refreshHistory()
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message)
    } finally {
      setSavingQuick(false)
      setConfirmModal(null)
    }
  }

  async function confirmSave() {
    const attributes = Object.entries(form).filter(([, v]) => v).map(([id, v]) => ({ id, ...v }))
    setSaving(true)
    try {
      await applyAttributes(itemId, attributes)
      toast.success('Ficha técnica atualizada no Mercado Livre!')
      const updated = await fetchItemDetail(itemId)
      setDetail(updated)
      setForm({})
      refreshHistory()
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message)
    } finally {
      setSaving(false)
      setConfirmModal(null)
    }
  }

  async function handleSuggest() {
    try {
      const res = await suggestContent(itemId)
      setSuggestion(res)
      setEditedTitle(res.suggested.title)
      setEditedDescription(res.suggested.description)
      setApplyTitleFlag(true)
      setApplyDescFlag(true)
    } catch (err) {
      toast.error('Erro ao gerar sugestão: ' + err.message)
    }
  }

  // Só ABRE o modal de confirmação — nunca grava nada sozinho. Bloqueia
  // se o campo marcado ficou vazio depois de editado à mão.
  function requestApplyContent() {
    if (!suggestion || (!applyTitleFlag && !applyDescFlag)) return
    if (applyTitleFlag && !editedTitle.trim()) return
    if (applyDescFlag && !editedDescription.trim()) return
    setConfirmModal('content')
  }

  // Título e descrição são independentes na API do ML — uma pode falhar
  // (ex: anúncio de família de variações rejeita edição de título) sem
  // impedir a outra de ser aplicada. Por isso trata sucesso parcial:
  // mostra toast pra cada lado, só fecha a sugestão inteira se os dois
  // que foram marcados deram certo.
  async function confirmApplyContent() {
    const payload = {}
    if (applyTitleFlag) payload.title = editedTitle.trim()
    if (applyDescFlag)  payload.description = editedDescription.trim()
    setApplyingContent(true)
    try {
      const res = await applyContent(itemId, payload)
      if (res.title)       toast.success('Título atualizado no Mercado Livre!')
      if (res.description) toast.success('Descrição atualizada no Mercado Livre!')
      if (res.errors?.title)       toast.error('Título não foi aplicado: ' + res.errors.title, { duration: 8000 })
      if (res.errors?.description) toast.error('Descrição não foi aplicada: ' + res.errors.description, { duration: 8000 })

      const updated = await fetchItemDetail(itemId)
      setDetail(updated)
      if (res.title || res.description) refreshHistory()

      if (!res.errors) {
        setSuggestion(null)
      } else {
        // Desmarca só o que falhou — evita tentar de novo a mesma
        // restrição (ex: família de variações não muda de ideia).
        if (res.errors.title) setApplyTitleFlag(false)
        if (res.errors.description) setApplyDescFlag(false)
      }
    } catch (err) {
      toast.error('Erro ao aplicar: ' + err.message)
    } finally {
      setApplyingContent(false)
      setConfirmModal(null)
    }
  }

  if (loading && !detail) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-slate-400"/></div>
  }

  if (error && !detail) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15}/> {error}
        </div>
      </div>
    )
  }

  if (!detail) return null

  const sc = scoreColor(detail.title_analysis.score)
  const adsMetrics = detail.ads?.available ? pickAdsMetrics(detail.ads.raw) : null
  const requiredAttrs = detail.all_attributes.filter(a => a.required)
  const extraAttrs    = detail.all_attributes.filter(a => !a.required)
  const missingCount  = detail.missing_attributes?.length ?? 0
  const pictures  = (detail.item.pictures || []).map(secureThumb)
  const heroPic   = pictures[0] || null
  const isActive  = (detail.item.status || 'active') === 'active'

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-5">

        <button onClick={() => navigate('/ml/saude')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={14}/> Voltar pra Saúde dos Anúncios
        </button>

        {/* Hero */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 lg:p-6">
          <div className="flex items-start gap-5 flex-wrap">
            {/* Foto */}
            <div className="shrink-0">
              <div className="w-28 h-28 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                {heroPic
                  ? <img src={heroPic} alt="" className="w-full h-full object-cover"/>
                  : <ImageOff size={26} className="text-slate-300"/>}
              </div>
              {pictures.length > 1 && (
                <div className="flex gap-1 mt-1.5">
                  {pictures.slice(1, 5).map((p, i) => (
                    <img key={i} src={p} alt="" className="w-6 h-6 rounded-md object-cover border border-slate-200"/>
                  ))}
                  {pictures.length > 5 && (
                    <span className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] font-semibold text-slate-400">
                      +{pictures.length - 5}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Título / identidade */}
            <div className="flex-1 min-w-[280px]">
              <a href={detail.item.permalink || `https://produto.mercadolivre.com.br/${detail.item.id}`} target="_blank" rel="noreferrer"
                className="text-xl lg:text-2xl font-bold text-slate-800 hover:text-emerald-600 inline-flex items-start gap-2 leading-snug">
                {detail.item.title}
                <ExternalLink size={16} className="text-slate-300 mt-1 shrink-0"/>
              </a>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${isActive ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                  {isActive ? 'Ativo' : 'Pausado'}
                </span>
                {detail.item.shipping?.is_full && (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Package size={11}/> Full
                  </span>
                )}
                {detail.item.shipping?.free_shipping && !detail.item.shipping?.is_full && (
                  <span className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Truck size={11}/> Frete grátis
                  </span>
                )}
                <span className="text-xs font-mono text-slate-400">{detail.item.id}</span>
              </div>

              {updateHistory && (
                <div className="mt-2.5">
                  {updateHistory.length === 0 ? (
                    <p className="text-xs text-slate-400 flex items-center gap-1"><History size={12}/> Nenhuma alteração feita pelo sistema ainda.</p>
                  ) : (
                    <>
                      <button onClick={() => setShowHistory(s => !s)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                        <History size={12}/> Última atualização: {fmtDateTime(updateHistory[0].updated_at)}
                        <ChevronDown size={12} className={showHistory ? 'rotate-180' : ''}/>
                      </button>
                      {showHistory && (
                        <ul className="mt-1.5 space-y-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 max-w-md">
                          {updateHistory.map((h, i) => (
                            <li key={i} className="text-xs text-slate-500 flex items-center justify-between gap-3">
                              <span>{UPDATE_ACTION_LABEL[h.action] || h.action}</span>
                              <span className="text-slate-400 shrink-0">{fmtDateTime(h.updated_at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Preço */}
            <div className="text-right shrink-0">
              <p className="text-3xl font-bold text-slate-800">{fmtMoney(detail.item.price)}</p>
              <p className="text-xs text-slate-400 mt-1">{detail.item.available_quantity ?? 0} em estoque · {detail.item.sold_quantity ?? 0} vendidos (total)</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {/* Ações rápidas — sempre visível, é a ação mais frequente */}
        <Card id="acoes-rapidas" highlight={highlightQuick} icon={Zap} title="Ações rápidas"
          help="Muda preço, estoque e ativa/pausa o anúncio direto no Mercado Livre. Nada é gravado sozinho — só abre a confirmação depois de clicar em 'Salvar alterações', mostrando exatamente o que vai mudar.">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Preço</label>
              <input type="number" inputMode="decimal" step="0.01" value={quickPrice} onChange={e => setQuickPrice(e.target.value)}
                className="w-28 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-400"/>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Estoque</label>
              <input type="number" inputMode="numeric" step="1" min="0" value={quickStock} onChange={e => setQuickStock(e.target.value)}
                className="w-24 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-400"/>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <button type="button"
                onClick={() => setQuickStatus(s => s === 'active' ? 'paused' : 'active')}
                className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  quickStatus === 'active' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'
                }`}>
                {quickStatus === 'active' ? <><Play size={13}/> Ativo</> : <><Pause size={13}/> Pausado</>}
              </button>
            </div>
            <button onClick={requestQuickSave} disabled={!quickChangeCount || savingQuick}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
              {savingQuick ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
              Salvar alterações{quickChangeCount ? ` (${quickChangeCount})` : ''}
            </button>
          </div>
        </Card>

        {/* Navegação por abas */}
        {/* -top-6 cancela o padding-top do <main> do Layout (24px) — sem
            isso o "sticky top-0" gruda 24px abaixo do topo real da área
            de rolagem, deixando um vão feio entre a barra e o cabeçalho. */}
        <div className="sticky -top-6 z-10 -mx-6 lg:-mx-8 px-6 lg:px-8 py-2 bg-slate-50/95 backdrop-blur-sm">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon
              const badge = t.key === 'attributes' && missingCount > 0 ? missingCount : null
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                    tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  <Icon size={14}/> {t.label}
                  {badge != null && (
                    <span className="text-[10px] font-bold bg-rose-500 text-white rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Aba: Visão Geral ─────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

              {/* Nota do título */}
              <Card icon={Type} title="Nota do título" caption="Heurística própria — não é nota oficial do ML"
                help="Uma pontuação de 0 a 100 que a gente calcula (não é do Mercado Livre) olhando pro título: se usa bem os 60 caracteres permitidos, se não repete palavra à toa, se não tem excesso de maiúscula e se usa algum termo que está sendo muito buscado nessa categoria. Quanto maior, melhor o título tende a performar nas buscas.">
                <div className="flex items-center gap-3">
                  <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center shrink-0 ${sc.border} ${sc.bg}`}>
                    <span className={`text-lg font-bold ${sc.text}`}>{detail.title_analysis.score}</span>
                  </div>
                  <ul className="text-xs space-y-1 flex-1">
                    {detail.title_analysis.checks.map((c, i) => (
                      <li key={i} className={`flex items-start gap-1.5 ${c.ok ? 'text-slate-500' : 'text-rose-600'}`}>
                        {c.ok ? <CheckCircle2 size={12} className="mt-0.5 shrink-0"/> : <XCircle size={12} className="mt-0.5 shrink-0"/>}
                        {c.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>

              {/* Imagens */}
              <Card icon={ImageIcon} title="Imagens" caption={`Ideal: ${detail.images.ideal_min}-${detail.images.ideal_max} fotos`}
                help="O Mercado Livre recomenda entre 6 e 10 fotos por anúncio — poucas fotos costumam reduzir a taxa de conversão (visitas viram venda). Se o produto tem variações (cor, tamanho), cada uma deveria ter pelo menos 1 foto própria.">
                <p className={`text-2xl font-bold mb-2 ${detail.images.status === 'ok' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {detail.images.count} foto{detail.images.count === 1 ? '' : 's'}
                </p>
                {detail.images.variations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.images.variations.map(v => (
                      <span key={v.id} className={`text-xs px-2 py-0.5 rounded-full border ${v.picture_count > 0 ? 'text-slate-600 bg-slate-50 border-slate-200' : 'text-rose-600 bg-rose-50 border-rose-200'}`}>
                        {v.label}: {v.picture_count} foto{v.picture_count === 1 ? '' : 's'}
                      </span>
                    ))}
                  </div>
                )}
              </Card>

              {/* Preço */}
              <Card icon={DollarSign} title="Preço" caption="Só comparação — nenhuma aplicação automática"
                help="'Sugerido pelo ML' é um preço de referência que a própria API do Mercado Livre calcula, olhando concorrência e histórico de vendas. É só informativo — o sistema nunca muda o preço sozinho, essa decisão continua sendo sua.">
                <div className="flex items-center gap-5">
                  <div><p className="text-lg font-bold text-slate-800">{fmtMoney(detail.item.price)}</p><p className="text-xs text-slate-400">atual</p></div>
                  <div><p className="text-lg font-bold text-sky-600">{detail.price_suggestion?.suggested_price != null ? fmtMoney(detail.price_suggestion.suggested_price) : '—'}</p><p className="text-xs text-slate-400">sugerido pelo ML</p></div>
                </div>
              </Card>

              {/* Estoque */}
              <Card icon={Package} title="Estoque restante"
                help="Estimativa de quantos dias o estoque atual deve durar, baseada na média de vendas dos últimos 30 dias (unidades em estoque ÷ vendas médias por dia). Se não houve venda recente, não dá pra estimar — aparece 'Sem venda recente'.">
                <p className={`text-2xl font-bold mb-1 ${detail.stock_days_left != null && detail.stock_days_left < 14 ? 'text-rose-600' : 'text-slate-800'}`}>
                  {detail.stock_days_left != null ? `~${detail.stock_days_left} dias` : 'Sem venda recente'}
                </p>
                <p className="text-xs text-slate-400">{detail.item.available_quantity ?? 0} unidades · {detail.sales.d30 ?? 0} vendidas/30d</p>
              </Card>
            </div>

            {/* Qualidade do anúncio (ML) */}
            <Card icon={HeartPulse} title="Qualidade do anúncio (indicador do Mercado Livre)"
              help="É um diagnóstico que o PRÓPRIO Mercado Livre faz sobre esse anúncio (não somos nós que calculamos) — aponta pendências que podem estar reduzindo a exposição dele nas buscas. 'ver dados brutos' mostra a resposta original da API, útil se algo parecer estranho.">
              {detail.performance ? (
                <>
                  {detail.performance.pending?.length > 0 ? (
                    <ul className="text-sm space-y-2 mb-2">
                      {detail.performance.pending.map((p, i) => {
                        const action = pendingAction(p?.key)
                        const text = p?.title || p?.description || p?.message || JSON.stringify(p)
                        return (
                          <li key={i} className="flex items-start justify-between gap-3 flex-wrap">
                            <span className="flex items-start gap-1.5 text-amber-700 min-w-0">
                              <XCircle size={13} className="mt-0.5 shrink-0"/> {text}
                            </span>
                            {action ? (
                              <button onClick={() => goToFix(action)}
                                className="shrink-0 text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                                {action.label} <ArrowRight size={11}/>
                              </button>
                            ) : (
                              <a href={detail.item.permalink || `https://produto.mercadolivre.com.br/${detail.item.id}`} target="_blank" rel="noreferrer"
                                className="shrink-0 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                                Ajustar no Mercado Livre <ExternalLink size={11}/>
                              </a>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 size={14}/> Nenhuma pendência apontada pelo ML.</p>
                  )}
                  <button onClick={() => setShowRawPerf(s => !s)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mt-2">
                    <ChevronDown size={12} className={showRawPerf ? 'rotate-180' : ''}/> ver dados brutos
                  </button>
                  {showRawPerf && <pre className="text-[10px] bg-slate-900 text-slate-200 rounded-lg p-3 mt-2 overflow-x-auto">{JSON.stringify(detail.performance.raw, null, 2)}</pre>}
                </>
              ) : <p className="text-sm text-slate-400">Sem dado disponível pra esse anúncio.</p>}
            </Card>
          </div>
        )}

        {/* ── Aba: Conteúdo & IA ───────────────────────────────────── */}
        {tab === 'content' && (
          <Card icon={Sparkles} title="Sugestão de IA para título e descrição" caption="Gerado com base só nos dados reais do anúncio — nunca inventa característica que não esteja na ficha técnica"
            help="Clicar em 'Gerar sugestão' NÃO altera nada no Mercado Livre — só mostra uma prévia (atual × sugerido) pra você avaliar. O texto sugerido é editável — pode ajustar, adicionar ou remover algo antes de aplicar. Nada é aplicado até você marcar o que quer (título e/ou descrição) e clicar em 'Aplicar no Mercado Livre', que ainda pede uma confirmação antes de gravar de verdade — e mostra exatamente o texto editado, não o original da IA.">
            {!suggestion ? (
              <button onClick={handleSuggest} disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors">
                {loading ? <Loader2 size={15} className="animate-spin"/> : <Wand2 size={15}/>}
                {loading ? 'Gerando...' : 'Gerar sugestão'}
              </button>
            ) : (
              <div className="space-y-4">
                {suggestion.suggested.changes_summary && (
                  <p className="text-sm text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">{suggestion.suggested.changes_summary}</p>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                      <input type="checkbox" checked={applyTitleFlag} onChange={e => setApplyTitleFlag(e.target.checked)}/> Título
                    </label>
                    {editedTitle !== suggestion.suggested.title && (
                      <button type="button" onClick={() => setEditedTitle(suggestion.suggested.title)}
                        className="text-[11px] text-violet-600 hover:text-violet-700 underline underline-offset-2">
                        Restaurar sugestão da IA
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-[10px] text-slate-400 uppercase mb-1">Atual</p><p className="text-sm text-slate-600">{suggestion.current.title}</p></div>
                    <div className="bg-violet-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-violet-500 uppercase mb-1 flex items-center justify-between">
                        Sugerido (editável)
                        <span className={editedTitle.length > 60 ? 'text-rose-500 font-semibold' : 'text-violet-400'}>{editedTitle.length}/60</span>
                      </p>
                      <input type="text" value={editedTitle} onChange={e => setEditedTitle(e.target.value)}
                        className="w-full bg-transparent text-sm text-slate-800 font-medium focus:outline-none border-b border-transparent focus:border-violet-300"/>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                      <input type="checkbox" checked={applyDescFlag} onChange={e => setApplyDescFlag(e.target.checked)}/> Descrição
                    </label>
                    {editedDescription !== suggestion.suggested.description && (
                      <button type="button" onClick={() => setEditedDescription(suggestion.suggested.description)}
                        className="text-[11px] text-violet-600 hover:text-violet-700 underline underline-offset-2">
                        Restaurar sugestão da IA
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-[10px] text-slate-400 uppercase mb-1">Atual</p><p className="text-sm text-slate-600 whitespace-pre-wrap">{suggestion.current.description || '(sem descrição cadastrada)'}</p></div>
                    <div className="bg-violet-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-violet-500 uppercase mb-1">Sugerido (editável)</p>
                      <textarea value={editedDescription} onChange={e => setEditedDescription(e.target.value)} rows={14}
                        className="w-full bg-transparent text-sm text-slate-800 whitespace-pre-wrap focus:outline-none border border-transparent focus:border-violet-300 rounded-md px-1 -mx-1 resize-y"/>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={requestApplyContent}
                    disabled={applyingContent || (!applyTitleFlag && !applyDescFlag) || (applyTitleFlag && !editedTitle.trim()) || (applyDescFlag && !editedDescription.trim())}
                    className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                    {applyingContent ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                    Aplicar no Mercado Livre
                  </button>
                  <button onClick={handleSuggest} disabled={loading}
                    className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                    Gerar de novo
                  </button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── Aba: Ficha Técnica ───────────────────────────────────── */}
        {tab === 'attributes' && (
          <Card icon={ClipboardList} title="Ficha técnica completa"
            help="Todos os campos que o Mercado Livre pede pra esse tipo de produto. Os com * são obrigatórios — anúncio sem eles tende a aparecer pior nas buscas. Os 'Extras' são recomendados, mas não obrigatórios. Campos marcados como 'controlado por variação' (ex: Cor, Tamanho) não dá pra editar aqui, só direto no Mercado Livre.">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-10">
              <div className="mb-3">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Obrigatórios ({requiredAttrs.length})</p>
                {requiredAttrs.map(attr => (
                  <AttributeRow key={attr.id} attr={attr} value={form[attr.id]} onChange={v => setForm(f => ({ ...f, [attr.id]: v }))}/>
                ))}
              </div>
              {extraAttrs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Extras ({extraAttrs.length})</p>
                  {extraAttrs.map(attr => (
                    <AttributeRow key={attr.id} attr={attr} value={form[attr.id]} onChange={v => setForm(f => ({ ...f, [attr.id]: v }))}/>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={requestSave} disabled={!filledCount || saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                Salvar no Mercado Livre{filledCount ? ` (${filledCount})` : ''}
              </button>
            </div>
          </Card>
        )}

        {/* ── Aba: Desempenho ──────────────────────────────────────── */}
        {tab === 'performance' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            <div className="xl:col-span-2 space-y-4">
              {/* Visitas/Vendas/Conversão */}
              <Card icon={TrendingUp} title="Visitas, vendas e conversão"
                help="Visitas = quantas pessoas abriram o anúncio (vem do Mercado Livre). Vendas = quantidade vendida no período, calculada com base nos pedidos reais que já temos no sistema. Conversão = vendas ÷ visitas — quanto maior, melhor o anúncio está 'convertendo' quem vê em quem compra.">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[['7 dias','d7'],['15 dias','d15'],['30 dias','d30']].map(([label, key]) => {
                    const v = detail.visits[key], s = detail.sales[key]
                    const conv = v ? (s ?? 0) / v : null
                    return (
                      <div key={key} className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-400 mb-1">{label}</p>
                        <p className="text-sm text-slate-700">{v ?? '—'} visitas</p>
                        <p className="text-sm text-slate-700">{s ?? 0} vendas</p>
                        <p className="text-sm font-semibold text-emerald-600">{fmtPct(conv)}</p>
                      </div>
                    )
                  })}
                </div>
                {detail.visits.daily?.length > 0 && (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={detail.visits.daily} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                      <defs>
                        <linearGradient id="visitsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity={0.3}/>
                          <stop offset="100%" stopColor="#10B981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                        tickFormatter={d => d?.slice(5)}/>
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Area type="monotone" dataKey="total" stroke="#10B981" strokeWidth={2} fill="url(#visitsGrad)"/>
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </Card>

              {/* Mercado Ads */}
              <Card icon={Megaphone} title="Mercado Ads" caption="Parte mais nova — pode precisar de ajuste depois do primeiro teste real"
                help="Desempenho de campanhas patrocinadas (anúncio pago, aparece com destaque na busca) pra esse produto específico, quando houver alguma ativa. Ainda em ajuste — se aparecer 'sem dado', pode ser limitação nossa, não necessariamente falta de campanha de verdade.">
                {detail.ads?.available ? (
                  adsMetrics ? (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                      {Object.entries(adsMetrics).map(([k, v]) => (
                        <div key={k} className="bg-slate-50 rounded-lg p-3 text-center">
                          <p className="text-sm font-bold text-slate-800">{typeof v === 'number' ? v.toLocaleString('pt-BR') : v}</p>
                          <p className="text-[10px] text-slate-400 uppercase">{k}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">Conectado ao Ads, mas sem campanha ativa encontrada pra esse item nos últimos 30 dias.</p>
                  )
                ) : (
                  <p className="text-sm text-slate-400">{detail.ads?.reason || detail.ads?.error || 'Ads não disponível.'}</p>
                )}
                {detail.ads?.raw && (
                  <>
                    <button onClick={() => setShowRawAds(s => !s)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mt-2">
                      <ChevronDown size={12} className={showRawAds ? 'rotate-180' : ''}/> ver dados brutos
                    </button>
                    {showRawAds && <pre className="text-[10px] bg-slate-900 text-slate-200 rounded-lg p-3 mt-2 overflow-x-auto">{JSON.stringify(detail.ads.raw, null, 2)}</pre>}
                  </>
                )}
              </Card>
            </div>

            {/* Avaliações — coluna lateral */}
            <div className="space-y-4">
              <Card icon={Star} title="Avaliações"
                help="Nota média e comentários mais recentes que os compradores deixaram nesse anúncio específico, direto do Mercado Livre.">
                {detail.reviews.total > 0 ? (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-2xl font-bold text-slate-800">{detail.reviews.rating_average?.toFixed(1) ?? '—'}</p>
                      <div>
                        <Stars rating={detail.reviews.rating_average}/>
                        <p className="text-xs text-slate-400">{detail.reviews.total} avaliações</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {detail.reviews.recent.map((r, i) => (
                        <div key={i} className="bg-slate-50 rounded-lg px-3 py-2">
                          <Stars rating={r.rate}/>
                          <p className="text-xs text-slate-600 mt-1">{r.comment}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <p className="text-sm text-slate-400">Sem avaliações ainda.</p>}
              </Card>
            </div>
          </div>
        )}

      </div>

      <ConfirmWriteModal
        open={confirmModal === 'attributes'}
        title={`Atualizar ${filledCount} atributo${filledCount > 1 ? 's' : ''} da ficha técnica`}
        description="Vai gravar esses valores direto no anúncio real do Mercado Livre."
        confirming={saving}
        onConfirm={confirmSave}
        onCancel={() => setConfirmModal(null)}
        detail={
          <ul className="text-sm text-slate-700 space-y-1">
            {Object.entries(form).filter(([, v]) => v).map(([id, v]) => {
              const attr = detail?.all_attributes?.find(a => a.id === id)
              const valueLabel = v.value_id ? attr?.values?.find(x => x.id === v.value_id)?.name : v.value_name
              return <li key={id}><strong>{attr?.name || id}:</strong> {valueLabel}</li>
            })}
          </ul>
        }
      />

      <ConfirmWriteModal
        open={confirmModal === 'content' && !!suggestion}
        title={`Atualizar ${[applyTitleFlag && 'título', applyDescFlag && 'descrição'].filter(Boolean).join(' e ')}`}
        description="Vai substituir o conteúdo atual do anúncio real no Mercado Livre pela sugestão da IA."
        confirming={applyingContent}
        onConfirm={confirmApplyContent}
        onCancel={() => setConfirmModal(null)}
        detail={suggestion && (
          <div className="text-sm text-slate-700 space-y-2">
            {applyTitleFlag && <p><strong>Título:</strong> {editedTitle}</p>}
            {applyDescFlag && <p className="whitespace-pre-wrap"><strong>Descrição:</strong> {editedDescription}</p>}
          </div>
        )}
      />

      <ConfirmWriteModal
        open={confirmModal === 'quick'}
        title="Atualizar anúncio"
        description="Vai gravar essas mudanças direto no anúncio real do Mercado Livre."
        confirming={savingQuick}
        onConfirm={confirmQuickSave}
        onCancel={() => setConfirmModal(null)}
        detail={
          <ul className="text-sm text-slate-700 space-y-1">
            {quickChanges.price != null && <li><strong>Preço:</strong> {fmtMoney(quickChanges.price)}</li>}
            {quickChanges.available_quantity != null && <li><strong>Estoque:</strong> {quickChanges.available_quantity} unidades</li>}
            {quickChanges.status && <li><strong>Status:</strong> {quickChanges.status === 'active' ? 'Ativo' : 'Pausado'}</li>}
          </ul>
        }
      />
    </div>
  )
}
