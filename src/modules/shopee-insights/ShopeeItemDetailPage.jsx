import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, ExternalLink, Loader2, AlertTriangle, CheckCircle2, AlertCircle, HelpCircle,
  ImageOff, Play, Pause, Save, Package, Sparkles, Images, ClipboardList, TrendingUp,
  Wand2, Trash2, ZoomIn, X as XIcon, Plus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useShopeeInsights } from './hooks/useShopeeInsights'
import { ConfirmWriteModal } from '../ml-insights/ConfirmWriteModal'

const SHOPEE_ORANGE = '#EE4D2D'

const STATUS_INFO = {
  unhealthy: { label: 'Perdendo exposição', icon: AlertTriangle, text: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200' },
  warning:   { label: 'Atenção',            icon: AlertCircle,   text: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  healthy:   { label: 'Saudável',           icon: CheckCircle2,  text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
}
const UNKNOWN_STATUS = { label: 'Não informado', icon: HelpCircle, text: 'text-slate-500', bg: 'bg-slate-50 border-slate-200' }

function fmtMoney(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(ms) {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const TABS = [
  { key: 'geral',      label: 'Visão Geral',    icon: Package },
  { key: 'conteudo',   label: 'Conteúdo & IA',  icon: Sparkles },
  { key: 'imagens',    label: 'Imagens & IA',   icon: Images },
  { key: 'ficha',      label: 'Ficha Técnica',  icon: ClipboardList },
  { key: 'desempenho', label: 'Desempenho',     icon: TrendingUp },
]

function Card({ icon: Icon, title, caption, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={15} className="text-slate-400"/>
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{title}</p>
      </div>
      {caption && <p className="text-xs text-slate-400 mb-3">{caption}</p>}
      {!caption && <div className="mb-1"/>}
      {children}
    </div>
  )
}

export function ShopeeItemDetailPage() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const {
    loading, error, fetchItemDetail, updateItemPrice, updateItemStock, updateItemStatus,
    suggestItemContent, applyItemContent, updateItemTechnical,
    suggestItemImages, generateItemImage, generateItemImageCustom, attachItemImage, deleteItemImage,
    fetchItemPerformance,
  } = useShopeeInsights()

  const [item, setItem] = useState(null)
  const [tab, setTab] = useState('geral')

  // Ações rápidas (preço/estoque/status)
  const [priceInput, setPriceInput] = useState('')
  const [stockInput, setStockInput] = useState('')
  const [pendingSave, setPendingSave] = useState(null)
  const [pendingToggle, setPendingToggle] = useState(null)
  const [saving, setSaving] = useState(false)

  // Conteúdo & IA
  const [contentSuggestion, setContentSuggestion] = useState(null)
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [editedDescription, setEditedDescription] = useState('')
  const [applyTitleFlag, setApplyTitleFlag] = useState(true)
  const [applyDescFlag, setApplyDescFlag] = useState(true)
  const [pendingContent, setPendingContent] = useState(null)
  const [applyingContent, setApplyingContent] = useState(false)

  // Imagens & IA
  const [imageSuggestions, setImageSuggestions] = useState(null)
  const [loadingImageSuggestions, setLoadingImageSuggestions] = useState(false)
  const [selectedPictureUrl, setSelectedPictureUrl] = useState(null)
  const [customInstruction, setCustomInstruction] = useState('')
  const [generatedImage, setGeneratedImage] = useState(null)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [pendingAttachImage, setPendingAttachImage] = useState(false)
  const [attachingImage, setAttachingImage] = useState(false)
  const [deleteImageTarget, setDeleteImageTarget] = useState(null)
  const [deletingImage, setDeletingImage] = useState(false)
  const [zoomImageUrl, setZoomImageUrl] = useState(null)

  // Ficha Técnica
  const [techWeight, setTechWeight] = useState('')
  const [techLength, setTechLength] = useState('')
  const [techWidth, setTechWidth] = useState('')
  const [techHeight, setTechHeight] = useState('')
  const [pendingTechnical, setPendingTechnical] = useState(false)
  const [savingTechnical, setSavingTechnical] = useState(false)

  // Desempenho
  const [performance, setPerformance] = useState(null)
  const [loadingPerformance, setLoadingPerformance] = useState(false)

  const load = () => fetchItemDetail(itemId).then(data => {
    setItem(data)
    setPriceInput(String(data.price ?? ''))
    setStockInput(String(data.stock ?? ''))
    setTechWeight(String(data.weight ?? ''))
    setTechLength(String(data.dimension?.package_length ?? ''))
    setTechWidth(String(data.dimension?.package_width ?? ''))
    setTechHeight(String(data.dimension?.package_height ?? ''))
  }).catch(() => {})

  useEffect(() => { load() }, [itemId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'desempenho' && item && !performance && !loadingPerformance) {
      setLoadingPerformance(true)
      fetchItemPerformance(item.title).then(setPerformance).catch(() => {}).finally(() => setLoadingPerformance(false))
    }
  }, [tab, item, performance, loadingPerformance, fetchItemPerformance])

  const priceChanged = item && Number(priceInput) !== Number(item.price)
  const stockChanged = item && Number(stockInput) !== Number(item.stock)
  const hasChanges = priceChanged || stockChanged

  function requestSave() {
    if (!hasChanges) return
    setPendingSave({ priceChanged, stockChanged, price: Number(priceInput), stock: Number(stockInput) })
  }

  async function confirmSave() {
    if (!pendingSave) return
    setSaving(true)
    try {
      if (pendingSave.priceChanged) await updateItemPrice(item.item_id, pendingSave.price)
      if (pendingSave.stockChanged) await updateItemStock(item.item_id, pendingSave.stock)
      toast.success('Anúncio atualizado na Shopee!')
      setItem(it => ({ ...it, price: pendingSave.price, stock: pendingSave.stock }))
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message)
    } finally {
      setSaving(false)
      setPendingSave(null)
    }
  }

  function requestToggle() {
    setPendingToggle({ nextStatus: item.status === 'active' ? 'paused' : 'active' })
  }

  async function confirmToggle() {
    if (!pendingToggle) return
    setSaving(true)
    try {
      await updateItemStatus(item.item_id, pendingToggle.nextStatus === 'paused')
      toast.success(pendingToggle.nextStatus === 'active' ? 'Anúncio reativado!' : 'Anúncio pausado!')
      setItem(it => ({ ...it, status: pendingToggle.nextStatus }))
    } catch (err) {
      toast.error('Erro ao atualizar: ' + err.message)
    } finally {
      setSaving(false)
      setPendingToggle(null)
    }
  }

  // ── Conteúdo & IA ────────────────────────────────────────────────
  async function handleSuggestContent() {
    setLoadingSuggestion(true)
    try {
      const res = await suggestItemContent(item.item_id)
      setContentSuggestion(res)
      setEditedTitle(res.suggested.title)
      setEditedDescription(res.suggested.description)
      setApplyTitleFlag(true)
      setApplyDescFlag(true)
    } catch (err) {
      toast.error('Erro ao gerar sugestão: ' + err.message)
    } finally {
      setLoadingSuggestion(false)
    }
  }

  function requestApplyContent() {
    if (!contentSuggestion || (!applyTitleFlag && !applyDescFlag)) return
    if (applyTitleFlag && !editedTitle.trim()) return
    if (applyDescFlag && !editedDescription.trim()) return
    setPendingContent(true)
  }

  async function confirmApplyContent() {
    setApplyingContent(true)
    try {
      const payload = {}
      if (applyTitleFlag) payload.title = editedTitle.trim()
      if (applyDescFlag) payload.description = editedDescription.trim()
      await applyItemContent(item.item_id, payload)
      toast.success('Anúncio atualizado na Shopee!')
      setContentSuggestion(null)
      await load()
    } catch (err) {
      toast.error('Erro ao aplicar: ' + err.message)
    } finally {
      setApplyingContent(false)
      setPendingContent(false)
    }
  }

  // ── Imagens & IA ─────────────────────────────────────────────────
  async function handleSuggestImages() {
    setLoadingImageSuggestions(true)
    try {
      const res = await suggestItemImages(item.item_id)
      setImageSuggestions(res)
      setSelectedPictureUrl(res.images?.[0] || null)
      setGeneratedImage(null)
    } catch (err) {
      toast.error('Erro ao gerar sugestões de imagem: ' + err.message)
    } finally {
      setLoadingImageSuggestions(false)
    }
  }

  async function handleGenerateFromSuggestion(suggestion) {
    if (!selectedPictureUrl) return
    setGeneratingImage(true)
    try {
      const res = await generateItemImage(selectedPictureUrl, suggestion.prompt)
      setGeneratedImage({ ...res, source: suggestion.title })
    } catch (err) {
      toast.error('Erro ao gerar imagem: ' + err.message)
    } finally {
      setGeneratingImage(false)
    }
  }

  async function handleGenerateCustom() {
    if (!selectedPictureUrl || !customInstruction.trim()) return
    setGeneratingImage(true)
    try {
      const res = await generateItemImageCustom(selectedPictureUrl, customInstruction.trim())
      setGeneratedImage({ ...res, source: 'Prompt personalizado' })
    } catch (err) {
      toast.error('Erro ao gerar imagem: ' + err.message)
    } finally {
      setGeneratingImage(false)
    }
  }

  async function confirmAttachImage() {
    setAttachingImage(true)
    try {
      await attachItemImage(item.item_id, generatedImage.image_base64)
      toast.success('Imagem adicionada ao anúncio na Shopee!')
      setGeneratedImage(null)
      setImageSuggestions(null)
      await load()
    } catch (err) {
      toast.error('Erro ao adicionar imagem: ' + err.message)
    } finally {
      setAttachingImage(false)
      setPendingAttachImage(false)
    }
  }

  function requestDeleteImage(imageId, url) {
    setDeleteImageTarget({ imageId, url })
  }

  async function confirmDeleteImage() {
    setDeletingImage(true)
    try {
      await deleteItemImage(item.item_id, deleteImageTarget.imageId)
      toast.success('Foto removida do anúncio!')
      setImageSuggestions(null)
      await load()
    } catch (err) {
      toast.error('Erro ao excluir imagem: ' + err.message)
    } finally {
      setDeletingImage(false)
      setDeleteImageTarget(null)
    }
  }

  // ── Ficha Técnica ────────────────────────────────────────────────
  const technicalChanged = item && (
    Number(techWeight) !== Number(item.weight) ||
    Number(techLength) !== Number(item.dimension?.package_length) ||
    Number(techWidth) !== Number(item.dimension?.package_width) ||
    Number(techHeight) !== Number(item.dimension?.package_height)
  )

  async function confirmSaveTechnical() {
    setSavingTechnical(true)
    try {
      await updateItemTechnical(item.item_id, {
        weight: Number(techWeight),
        dimension: { package_length: Number(techLength), package_width: Number(techWidth), package_height: Number(techHeight) },
      })
      toast.success('Ficha técnica atualizada na Shopee!')
      await load()
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message)
    } finally {
      setSavingTechnical(false)
      setPendingTechnical(false)
    }
  }

  if (loading && !item) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-slate-400"/></div>
  }
  if (error && !item) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
        <div className="max-w-3xl mx-auto flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15}/> {error}
        </div>
      </div>
    )
  }
  if (!item) return null

  const statusInfo = item.quality_level != null
    ? (item.pending.length === 0 ? STATUS_INFO.healthy : item.pending.length === 1 ? STATUS_INFO.warning : STATUS_INFO.unhealthy)
    : UNKNOWN_STATUS
  const StatusIcon = statusInfo.icon

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15}/> Voltar
        </button>

        {/* Header do anúncio */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 lg:p-6 flex gap-4 flex-wrap">
          <div className="w-24 h-24 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center cursor-zoom-in"
            onClick={() => item.thumbnail && setZoomImageUrl(item.thumbnail)}>
            {item.thumbnail
              ? <img src={item.thumbnail} alt="" className="w-full h-full object-cover"/>
              : <ImageOff size={22} className="text-slate-300"/>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusInfo.text} ${statusInfo.bg}`}>
                <StatusIcon size={12} strokeWidth={2}/> {statusInfo.label}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                item.status === 'active' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'
              }`}>
                {item.status === 'active' ? 'Ativo' : item.status === 'paused' ? 'Pausado' : item.status}
              </span>
            </div>
            <a href={item.permalink} target="_blank" rel="noreferrer" className="text-lg font-bold text-slate-800 hover:text-orange-600 inline-flex items-start gap-1.5">
              {item.title}
              <ExternalLink size={14} className="text-slate-300 mt-1.5 shrink-0"/>
            </a>
            <p className="text-xs font-mono text-slate-400 mt-1">{item.item_id}</p>
            {item.pending.length > 0 && (
              <div className="flex flex-col gap-1 mt-2.5">
                {item.pending.map((p, i) => (
                  <span key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg w-fit">
                    {p.suggestion}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={requestToggle}
            className={`flex items-center gap-1.5 h-fit text-sm font-medium px-3.5 py-2 rounded-lg border shrink-0 transition-colors ${
              item.status === 'active'
                ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
            }`}>
            {item.status === 'active' ? <><Pause size={14}/> Pausar</> : <><Play size={14}/> Reativar</>}
          </button>
        </div>

        {/* Tabs */}
        <div className="sticky -top-6 z-10 -mx-6 lg:-mx-8 px-6 lg:px-8 py-2 bg-slate-50/95 backdrop-blur-sm">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                    tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  <Icon size={14}/> {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Aba: Visão Geral ──────────────────────────────────── */}
        {tab === 'geral' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 h-fit">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ações rápidas</p>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Preço</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                  <input type="number" step="0.01" value={priceInput} onChange={e => setPriceInput(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': `${SHOPEE_ORANGE}40` }}/>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Estoque</label>
                <input type="number" value={stockInput} onChange={e => setStockInput(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': `${SHOPEE_ORANGE}40` }}/>
              </div>
              <button onClick={requestSave} disabled={!hasChanges}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
                style={{ background: SHOPEE_ORANGE }}>
                <Save size={14}/> Salvar alterações
              </button>
              {item.has_model && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Esse anúncio tem variações — o preço/estoque acima é aplicado no item como um todo; edição por variação ainda não está disponível aqui.
                </p>
              )}
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Ficha técnica</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div><p className="text-xs text-slate-400">Preço atual</p><p className="font-medium text-slate-700">{fmtMoney(item.price)}</p></div>
                  <div><p className="text-xs text-slate-400">Estoque atual</p><p className="font-medium text-slate-700">{item.stock ?? '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Condição</p><p className="font-medium text-slate-700">{item.condition === 'NEW' ? 'Novo' : item.condition || '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Marca</p><p className="font-medium text-slate-700">{item.brand || '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Peso</p><p className="font-medium text-slate-700">{item.weight ? `${item.weight} kg` : '—'}</p></div>
                  <div><p className="text-xs text-slate-400">Dimensões</p>
                    <p className="font-medium text-slate-700">
                      {item.dimension ? `${item.dimension.package_length}×${item.dimension.package_width}×${item.dimension.package_height} cm` : '—'}
                    </p>
                  </div>
                  <div><p className="text-xs text-slate-400">Criado em</p><p className="font-medium text-slate-700">{fmtDate(item.create_time)}</p></div>
                  <div><p className="text-xs text-slate-400">Atualizado em</p><p className="font-medium text-slate-700">{fmtDate(item.update_time)}</p></div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Descrição</p>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{item.description || 'Sem descrição.'}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Aba: Conteúdo & IA ────────────────────────────────── */}
        {tab === 'conteudo' && (
          <Card icon={Sparkles} title="Sugestão de IA para título e descrição"
            caption="Gerado com base só nos dados reais do anúncio (título, descrição e ficha técnica) — nunca inventa característica que não esteja cadastrada">
            {!contentSuggestion ? (
              <button onClick={handleSuggestContent} disabled={loadingSuggestion}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors">
                {loadingSuggestion ? <Loader2 size={15} className="animate-spin"/> : <Wand2 size={15}/>}
                {loadingSuggestion ? 'Gerando...' : 'Gerar sugestão'}
              </button>
            ) : (
              <div className="space-y-4">
                {contentSuggestion.suggested.changes_summary && (
                  <p className="text-sm text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">{contentSuggestion.suggested.changes_summary}</p>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                      <input type="checkbox" checked={applyTitleFlag} onChange={e => setApplyTitleFlag(e.target.checked)}/> Título
                    </label>
                    {editedTitle !== contentSuggestion.suggested.title && (
                      <button type="button" onClick={() => setEditedTitle(contentSuggestion.suggested.title)}
                        className="text-[11px] text-violet-600 hover:text-violet-700 underline underline-offset-2">
                        Restaurar sugestão da IA
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-[10px] text-slate-400 uppercase mb-1">Atual</p><p className="text-sm text-slate-600">{contentSuggestion.current.title}</p></div>
                    <div className="bg-violet-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-violet-500 uppercase mb-1 flex items-center justify-between">
                        Sugerido (editável)
                        <span className={editedTitle.length > 120 ? 'text-rose-500 font-semibold' : 'text-violet-400'}>{editedTitle.length}/120</span>
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
                    {editedDescription !== contentSuggestion.suggested.description && (
                      <button type="button" onClick={() => setEditedDescription(contentSuggestion.suggested.description)}
                        className="text-[11px] text-violet-600 hover:text-violet-700 underline underline-offset-2">
                        Restaurar sugestão da IA
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-[10px] text-slate-400 uppercase mb-1">Atual</p><p className="text-sm text-slate-600 whitespace-pre-wrap">{contentSuggestion.current.description || '(sem descrição cadastrada)'}</p></div>
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
                    Aplicar na Shopee
                  </button>
                  <button onClick={handleSuggestContent} disabled={loadingSuggestion}
                    className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                    Gerar de novo
                  </button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── Aba: Imagens & IA ─────────────────────────────────── */}
        {tab === 'imagens' && (
          <div className="space-y-4">
            <Card icon={Images} title="Fotos do anúncio" caption={`${item.images.length} foto${item.images.length === 1 ? '' : 's'} — a Shopee recomenda pelo menos 3`}>
              <div className="flex flex-wrap gap-3">
                {item.images.map((url, i) => (
                  <div key={item.image_id_list[i]} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                    <img src={url} alt="" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setZoomImageUrl(url)}/>
                    <button onClick={() => setZoomImageUrl(url)} title="Ver em tamanho grande"
                      className="absolute top-0.5 right-0.5 p-1 bg-white/90 hover:bg-white rounded-md text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ZoomIn size={11}/>
                    </button>
                    <button onClick={() => requestDeleteImage(item.image_id_list[i], url)} title="Excluir do anúncio"
                      className="absolute bottom-0.5 right-0.5 p-1 bg-white/90 hover:bg-rose-50 rounded-md text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={11}/>
                    </button>
                    <button onClick={() => setSelectedPictureUrl(url)} title="Usar como referência pra IA"
                      className={`absolute bottom-0.5 left-0.5 text-[9px] font-semibold px-1 py-0.5 rounded ${selectedPictureUrl === url ? 'bg-violet-600 text-white' : 'bg-white/90 text-slate-500 opacity-0 group-hover:opacity-100'} transition-opacity`}>
                      ref
                    </button>
                  </div>
                ))}
              </div>
            </Card>

            <Card icon={Sparkles} title="Gerar nova foto com IA"
              caption="Sugere ideias de foto com base na ficha técnica e gera a imagem de verdade a partir da foto de referência selecionada acima (marcada 'ref')">
              {!imageSuggestions ? (
                <button onClick={handleSuggestImages} disabled={loadingImageSuggestions}
                  className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors">
                  {loadingImageSuggestions ? <Loader2 size={15} className="animate-spin"/> : <Wand2 size={15}/>}
                  {loadingImageSuggestions ? 'Gerando ideias...' : 'Sugerir ideias de foto'}
                </button>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">Foto de referência selecionada: {selectedPictureUrl ? <span className="text-violet-600 font-medium">escolhida</span> : <span className="text-rose-500">nenhuma — clique em "ref" numa foto acima</span>}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {imageSuggestions.suggestions.map((s, i) => (
                      <div key={i} className="border border-slate-200 rounded-xl p-3">
                        <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                        <p className="text-xs text-slate-500 mt-1">{s.reason}</p>
                        <button onClick={() => handleGenerateFromSuggestion(s)} disabled={!selectedPictureUrl || generatingImage}
                          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 disabled:opacity-40">
                          {generatingImage ? <Loader2 size={12} className="animate-spin"/> : <Wand2 size={12}/>} Gerar essa foto
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Ou peça algo específico</p>
                    <div className="flex gap-2">
                      <input type="text" value={customInstruction} onChange={e => setCustomInstruction(e.target.value)}
                        placeholder='ex: "gere essa imagem na cor rosa, sem mudar mais nada"'
                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" style={{ '--tw-ring-color': '#8b5cf640' }}/>
                      <button onClick={handleGenerateCustom} disabled={!selectedPictureUrl || !customInstruction.trim() || generatingImage}
                        className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-40">
                        {generatingImage ? <Loader2 size={14} className="animate-spin"/> : <Wand2 size={14}/>} Gerar
                      </button>
                    </div>
                  </div>

                  {generatedImage && (
                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex gap-4 flex-wrap items-start">
                      <img src={`data:image/png;base64,${generatedImage.image_base64}`} alt="" className="w-32 h-32 rounded-lg object-cover cursor-zoom-in"
                        onClick={() => setZoomImageUrl(`data:image/png;base64,${generatedImage.image_base64}`)}/>
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-sm font-semibold text-violet-800">{generatedImage.source}</p>
                        <p className="text-xs text-violet-500 mt-1">Prévia — ainda não foi adicionada ao anúncio.</p>
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => setPendingAttachImage(true)} disabled={attachingImage}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                            <Plus size={12}/> Adicionar ao anúncio
                          </button>
                          <button onClick={() => setGeneratedImage(null)} className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg">
                            Descartar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <button onClick={handleSuggestImages} disabled={loadingImageSuggestions} className="text-xs text-slate-400 hover:text-slate-600">
                    Gerar novas ideias
                  </button>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Aba: Ficha Técnica ────────────────────────────────── */}
        {tab === 'ficha' && (
          <Card icon={ClipboardList} title="Ficha técnica" caption="Peso e dimensões da embalagem — condição e marca ainda não são editáveis por aqui">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Peso (kg)</label>
                <input type="number" step="0.1" value={techWeight} onChange={e => setTechWeight(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" style={{ '--tw-ring-color': `${SHOPEE_ORANGE}40` }}/>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Comprim. (cm)</label>
                <input type="number" value={techLength} onChange={e => setTechLength(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" style={{ '--tw-ring-color': `${SHOPEE_ORANGE}40` }}/>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Largura (cm)</label>
                <input type="number" value={techWidth} onChange={e => setTechWidth(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" style={{ '--tw-ring-color': `${SHOPEE_ORANGE}40` }}/>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Altura (cm)</label>
                <input type="number" value={techHeight} onChange={e => setTechHeight(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2" style={{ '--tw-ring-color': `${SHOPEE_ORANGE}40` }}/>
              </div>
            </div>
            <button onClick={() => setPendingTechnical(true)} disabled={!technicalChanged}
              className="mt-4 flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
              style={{ background: SHOPEE_ORANGE }}>
              <Save size={14}/> Salvar alterações
            </button>
            <div className="grid grid-cols-2 gap-3 max-w-xl mt-5 pt-4 border-t border-slate-100 text-sm">
              <div><p className="text-xs text-slate-400">Condição</p><p className="font-medium text-slate-700">{item.condition === 'NEW' ? 'Novo' : item.condition || '—'}</p></div>
              <div><p className="text-xs text-slate-400">Marca</p><p className="font-medium text-slate-700">{item.brand || '—'}</p></div>
            </div>
          </Card>
        )}

        {/* ── Aba: Desempenho ───────────────────────────────────── */}
        {tab === 'desempenho' && (
          <div className="space-y-4">
            <Card icon={TrendingUp} title="Vendas (nosso banco)" caption="Não busca ao vivo na API da Shopee — lê dos pedidos já sincronizados, casados pelo título exato do anúncio">
              {loadingPerformance || !performance ? (
                <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-400"/></div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div><p className="text-2xl font-bold text-slate-800">{performance.units_30d}</p><p className="text-xs text-slate-400 mt-1">unidades / 30d</p></div>
                  <div><p className="text-2xl font-bold text-slate-800">{fmtMoney(performance.revenue_30d)}</p><p className="text-xs text-slate-400 mt-1">receita / 30d</p></div>
                  <div><p className="text-2xl font-bold text-slate-800">{performance.units_90d}</p><p className="text-xs text-slate-400 mt-1">unidades / 90d</p></div>
                  <div><p className="text-2xl font-bold text-slate-800">{fmtMoney(performance.revenue_90d)}</p><p className="text-xs text-slate-400 mt-1">receita / 90d</p></div>
                </div>
              )}
            </Card>
            <Card icon={HelpCircle} title="Ads / tráfego / reputação por anúncio" caption="Ainda não disponível">
              <p className="text-sm text-slate-400">A Shopee ainda não teve confirmado um endpoint de métrica de tráfego/Ads por anúncio individual pro nosso uso — fica pra quando isso for validado contra a API real.</p>
            </Card>
          </div>
        )}
      </div>

      {/* Zoom de imagem */}
      {zoomImageUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-6" onClick={() => setZoomImageUrl(null)}>
          <button onClick={() => setZoomImageUrl(null)} className="absolute top-4 right-4 text-white/80 hover:text-white"><XIcon size={24}/></button>
          <img src={zoomImageUrl} alt="" className="max-w-full max-h-full rounded-lg" onClick={e => e.stopPropagation()}/>
        </div>
      )}

      <ConfirmWriteModal
        open={!!pendingSave}
        platform="Shopee"
        title="Salvar alterações no anúncio"
        confirmLabel="Sim, salvar"
        description="Vai atualizar preço e/ou estoque direto na Shopee agora mesmo."
        confirming={saving}
        onConfirm={confirmSave}
        onCancel={() => setPendingSave(null)}
        detail={pendingSave && (
          <div className="text-sm text-slate-700 space-y-1">
            {pendingSave.priceChanged && <p>Preço: {fmtMoney(item.price)} → <strong>{fmtMoney(pendingSave.price)}</strong></p>}
            {pendingSave.stockChanged && <p>Estoque: {item.stock} → <strong>{pendingSave.stock}</strong></p>}
          </div>
        )}
      />

      <ConfirmWriteModal
        open={!!pendingToggle}
        platform="Shopee"
        title={pendingToggle?.nextStatus === 'active' ? 'Reativar anúncio' : 'Pausar anúncio'}
        confirmLabel={pendingToggle?.nextStatus === 'active' ? 'Sim, reativar' : 'Sim, pausar'}
        description={pendingToggle?.nextStatus === 'active'
          ? 'Vai voltar a aparecer nas buscas e aceitar venda na Shopee agora mesmo.'
          : 'Vai sair das buscas e parar de vender na Shopee agora mesmo (o anúncio continua existindo, só fica pausado).'}
        confirming={saving}
        onConfirm={confirmToggle}
        onCancel={() => setPendingToggle(null)}
        detail={<p className="text-sm text-slate-700">{item.title}</p>}
      />

      <ConfirmWriteModal
        open={!!pendingContent}
        platform="Shopee"
        title="Aplicar título/descrição na Shopee"
        confirmLabel="Sim, aplicar"
        description="Vai atualizar o conteúdo do anúncio direto na Shopee agora mesmo."
        confirming={applyingContent}
        onConfirm={confirmApplyContent}
        onCancel={() => setPendingContent(false)}
        detail={
          <div className="text-sm text-slate-700 space-y-1">
            {applyTitleFlag && <p>Título será atualizado.</p>}
            {applyDescFlag && <p>Descrição será atualizada.</p>}
          </div>
        }
      />

      <ConfirmWriteModal
        open={pendingAttachImage}
        platform="Shopee"
        title="Adicionar foto ao anúncio"
        confirmLabel="Sim, adicionar"
        description="Vai adicionar essa nova foto (gerada por IA) ao anúncio real na Shopee agora mesmo, sem remover nenhuma foto existente."
        confirming={attachingImage}
        onConfirm={confirmAttachImage}
        onCancel={() => setPendingAttachImage(false)}
        detail={generatedImage && <img src={`data:image/png;base64,${generatedImage.image_base64}`} alt="" className="w-24 h-24 rounded-lg object-cover"/>}
      />

      <ConfirmWriteModal
        open={!!deleteImageTarget}
        platform="Shopee"
        title="Excluir foto do anúncio"
        confirmLabel="Sim, excluir"
        description="Vai remover essa foto do anúncio real na Shopee agora mesmo."
        confirming={deletingImage}
        onConfirm={confirmDeleteImage}
        onCancel={() => setDeleteImageTarget(null)}
        detail={deleteImageTarget && <img src={deleteImageTarget.url} alt="" className="w-20 h-20 rounded-lg object-cover"/>}
      />

      <ConfirmWriteModal
        open={pendingTechnical}
        platform="Shopee"
        title="Salvar ficha técnica"
        confirmLabel="Sim, salvar"
        description="Vai atualizar peso e dimensões direto na Shopee agora mesmo."
        confirming={savingTechnical}
        onConfirm={confirmSaveTechnical}
        onCancel={() => setPendingTechnical(false)}
        detail={
          <div className="text-sm text-slate-700 space-y-1">
            <p>Peso: {item.weight} kg → <strong>{techWeight} kg</strong></p>
            <p>Dimensões: {item.dimension?.package_length}×{item.dimension?.package_width}×{item.dimension?.package_height} cm → <strong>{techLength}×{techWidth}×{techHeight} cm</strong></p>
          </div>
        }
      />
    </div>
  )
}
