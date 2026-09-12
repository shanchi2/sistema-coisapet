import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Loader2, AlertTriangle, Sparkles, Search,
  Image as ImageIcon, X, CheckCircle2, Circle, PlusCircle,
  Type, LayoutGrid, ClipboardList, DollarSign, AlignLeft,
  EyeOff, Palette, Plus, Trash2, Video, Info,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useMlInsights } from './hooks/useMlInsights'
import { ConfirmWriteModal } from './ConfirmWriteModal'
import { AttributeRow } from './AttributeRow'
import { InfoTooltip } from './InfoTooltip'

const STEPS = [
  { label: 'Produto',           icon: Type },
  { label: 'Categoria',         icon: LayoutGrid },
  { label: 'Ficha técnica',     icon: ClipboardList },
  { label: 'Variações',         icon: Palette },
  { label: 'Preço e estoque',   icon: DollarSign },
  { label: 'Fotos',             icon: ImageIcon },
  { label: 'Descrição',         icon: AlignLeft },
  { label: 'Revisão',           icon: CheckCircle2 },
]

// ── SEO do título ────────────────────────────────────────────────
// Nada de mágica de IA aqui — só as regras que o próprio ML usa pra
// avaliar título (limite de 60 caracteres, sem tudo maiúsculo, sem
// palavra de propaganda que a política deles rejeita) + boa prática
// básica de busca (produto + atributo principal + marca).
const TITLE_MAX = 60
const TITLE_PROMO_WORDS = ['grátis', 'gratis', 'promoção', 'promocao', 'oferta', 'imperdível', 'imperdivel', 'menor preço', 'menor preco']
function titleChecks(title) {
  const t = title.trim()
  const len = t.length
  const isAllCaps = t.length > 3 && t === t.toUpperCase() && /[A-ZÀ-Ú]/.test(t)
  const hasPromoWord = TITLE_PROMO_WORDS.some(w => t.toLowerCase().includes(w))
  const hasExcessiveSpaces = /\s{2,}/.test(t)
  return {
    len,
    lenOk: len >= 20 && len <= TITLE_MAX,
    isAllCaps,
    hasPromoWord,
    hasExcessiveSpaces,
    good: len >= 20 && len <= TITLE_MAX && !isAllCaps && !hasPromoWord && !hasExcessiveSpaces,
  }
}

function fmtMoney(v) {
  if (v == null || Number.isNaN(v)) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Mesma lógica de prefill usada pela Ficha Técnica de edição — só que
// aqui parte de um anúncio MODELO (current_value/current_value_id dele)
// em vez do próprio item sendo editado.
function prefillFormFromAttributes(attrs) {
  const f = {}
  ;(attrs || []).forEach(a => {
    if (a.is_variation_attribute) return
    if (a.current_value_id) f[a.id] = { value_id: a.current_value_id }
    else if (a.current_value) f[a.id] = { value_name: a.current_value }
  })
  return f
}

function Card({ title, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 lg:p-6">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  )
}

export function MlCreateListingPage() {
  const navigate = useNavigate()
  const {
    error, fetchActiveListings, fetchItemDetail,
    predictCategory, fetchCategoryAttributesForCreate,
    uploadPicture, fetchStructuralDefaults, createItem,
  } = useMlInsights()

  const [step, setStep] = useState(1)

  // Step 1 — produto / modelo
  const [title, setTitle] = useState('')
  const [templates, setTemplates] = useState(null)
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateId, setTemplateId] = useState(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateAttrs, setTemplateAttrs] = useState(null) // atributos já preenchidos, se veio de modelo

  // Step 2 — categoria
  const [categoryId, setCategoryId] = useState(null)
  const [categoryName, setCategoryName] = useState(null)
  const [candidates, setCandidates] = useState(null)
  const [manualCategoryId, setManualCategoryId] = useState('')
  const [categoryLoading, setCategoryLoading] = useState(false)

  // Step 3 — ficha técnica
  const [attributes, setAttributes] = useState([])
  const [form, setForm] = useState({})

  // Step 4 — variações (opcional)
  const [varAttrId,  setVarAttrId]  = useState('') // id do atributo escolhido pra variar (ex: COLOR)
  const [variations, setVariations] = useState([]) // [{ localId, value_id?, value_name, price, stock }]
  const [newVarValue, setNewVarValue] = useState('') // texto livre, só quando o atributo não tem lista fechada

  // Step 5 — preço/estoque/frete
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('1')
  const [freeShipping, setFreeShipping] = useState(false)
  const [structuralDefaults, setStructuralDefaults] = useState(null)

  // Step 6 — fotos
  const [photos, setPhotos] = useState([]) // [{ localId, file, previewUrl, status, id?, error? }]

  // Step 7 — descrição + vídeo
  const [description, setDescription] = useState('')
  const [videoId, setVideoId] = useState('')

  // Publicação
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(null)

  useEffect(() => {
    fetchActiveListings().then(setTemplates).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredTemplates = useMemo(() => {
    if (!templates) return []
    const q = templateSearch.trim().toLowerCase()
    return q ? templates.filter(t => t.title?.toLowerCase().includes(q)) : templates
  }, [templates, templateSearch])

  async function selectTemplate(t) {
    setTemplateId(t.item_id)
    setTitle(t.title || '')
    setTemplateLoading(true)
    try {
      const detail = await fetchItemDetail(t.item_id)
      setTemplateAttrs(detail.all_attributes)
      await loadCategory(detail.item.category_id, detail.all_attributes)
    } catch (err) {
      toast.error('Erro ao carregar modelo: ' + err.message)
    } finally {
      setTemplateLoading(false)
    }
  }

  function clearTemplate() {
    setTemplateId(null)
    setTemplateAttrs(null)
    setCategoryId(null)
    setCategoryName(null)
    setAttributes([])
    setForm({})
    setStructuralDefaults(null)
  }

  // Busca sugestão de categoria pelo título — endpoint confirmado ao
  // vivo em 2026-09-01 (`domain_discovery`).
  async function handlePredict() {
    if (!title.trim()) return
    setCategoryLoading(true)
    try {
      setCandidates(await predictCategory(title.trim()))
    } catch (err) {
      toast.error('Erro ao sugerir categoria: ' + err.message)
    } finally {
      setCategoryLoading(false)
    }
  }

  // Carrega atributos + nome da categoria + defaults estruturais
  // (listing_type/frete/moeda, copiados de um anúncio real já ativo).
  // Se `prefillAttrs` veio de um modelo, usa os VALORES dele em vez de
  // buscar a ficha técnica vazia.
  async function loadCategory(catId, prefillAttrs) {
    setCategoryLoading(true)
    try {
      const [catRes, defaults] = await Promise.all([
        fetchCategoryAttributesForCreate(catId),
        fetchStructuralDefaults(catId),
      ])
      setCategoryId(catId)
      setCategoryName(catRes.category_name)
      if (prefillAttrs) {
        setAttributes(prefillAttrs)
        setForm(prefillFormFromAttributes(prefillAttrs))
      } else {
        setAttributes(catRes.attributes)
        setForm({})
      }
      setStructuralDefaults(defaults)
      setStep(3)
    } catch (err) {
      toast.error('Erro ao carregar categoria: ' + err.message)
    } finally {
      setCategoryLoading(false)
    }
  }

  const hasVariations = variations.length > 0

  // Atributo(s) que essa categoria permite usar como variação (ex: COLOR,
  // SIZE) — só oferecemos escolher 1 por simplicidade (cobre o caso real
  // mais comum: cor OU tamanho, não as duas combinadas).
  const variationCandidates = attributes.filter(a => a.is_variation_attribute)
  const varAttr = variationCandidates.find(a => a.id === varAttrId) || null
  // COLOR vem com `value_type: "string"` mesmo tendo lista fechada de
  // verdade (~50 opções em `values`) — olhar só o value_type escondia
  // as opções e caía sempre no campo de texto livre.
  const varAttrHasClosedList = (varAttr?.values?.length || 0) > 0
  const varAttrAvailableValues = varAttrHasClosedList
    ? varAttr.values.filter(v => !variations.some(vr => vr.value_id === v.id))
    : []
  // O atributo escolhido só fica "travado" (Ficha Técnica desabilitada,
  // "Controlado por variação") enquanto REALMENTE está sendo usado como
  // variação nessa sessão — se o vendedor não usa variação nenhuma (ou
  // usa outro atributo), esse campo volta a ser editável normal, senão
  // uma Cor obrigatória, por exemplo, ficaria impossível de preencher.
  const activeVarAttrId = hasVariations ? varAttrId : null
  function displayAttr(a) {
    return a.is_variation_attribute && a.id !== activeVarAttrId ? { ...a, is_variation_attribute: false } : a
  }

  const requiredAttrs = attributes.filter(a => a.required && !a.hidden)
  const extraAttrs    = attributes.filter(a => !a.required && !a.hidden)
  // "Escondidos" = o próprio Mercado Livre não mostra esse campo pro
  // vendedor preencher (tags.hidden na API), mas ele existe e conta de
  // verdade — ex: dimensão/peso da embalagem, usado no cálculo de
  // frete. Mostrado numa seção separada, nunca misturado nos "Extras".
  const hiddenAttrs   = attributes.filter(a => a.hidden)
  // Bloqueia publicar mesmo se o obrigatório estiver escondido (raro,
  // mas não visto ainda em nenhuma categoria real testada) — por isso
  // olha TODOS os `required`, não só os que aparecem nos "Obrigatórios".
  // Só ignora o obrigatório que está REALMENTE virando variação agora.
  const missingRequired = attributes.filter(a => a.required && a.id !== activeVarAttrId && !form[a.id])
  const filledAttrCount = Object.values(form).filter(Boolean).length
  const filledHiddenCount = hiddenAttrs.filter(a => form[a.id]).length

  function chooseVarAttr(id) {
    setVarAttrId(id)
    setVariations([]) // troca de atributo zera as linhas — combinações eram do outro atributo
  }

  function addVariationFromList(v) {
    setVariations(vs => [...vs, { localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, value_id: v.id, value_name: v.name, price: '', stock: '1' }])
  }

  function addVariationFreeText() {
    const name = newVarValue.trim()
    if (!name) return
    setVariations(vs => [...vs, { localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, value_id: null, value_name: name, price: '', stock: '1' }])
    setNewVarValue('')
  }

  function removeVariation(localId) {
    setVariations(vs => vs.filter(v => v.localId !== localId))
  }

  function updateVariation(localId, patch) {
    setVariations(vs => vs.map(v => v.localId === localId ? { ...v, ...patch } : v))
  }

  function clearVariations() {
    setVarAttrId('')
    setVariations([])
    setNewVarValue('')
  }

  const variationsMissingData = variations.some(v => !v.price || Number(v.price) <= 0 || v.stock === '' || Number(v.stock) < 0)

  async function handlePhotoSelect(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // permite selecionar o mesmo arquivo de novo depois de remover
    for (const file of files) {
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const previewUrl = URL.createObjectURL(file)
      setPhotos(ps => [...ps, { localId, file, previewUrl, status: 'uploading' }])
      try {
        const res = await uploadPicture(file)
        setPhotos(ps => ps.map(p => p.localId === localId ? { ...p, status: 'done', id: res.id } : p))
      } catch (err) {
        setPhotos(ps => ps.map(p => p.localId === localId ? { ...p, status: 'error', error: err.message } : p))
      }
    }
  }

  function removePhoto(localId) {
    setPhotos(ps => {
      const found = ps.find(p => p.localId === localId)
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl)
      return ps.filter(p => p.localId !== localId)
    })
  }

  const uploadedPhotos = photos.filter(p => p.status === 'done')
  const anyPhotoUploading = photos.some(p => p.status === 'uploading')

  function buildPayload() {
    const payload = {
      title: title.trim(),
      category_id: categoryId,
      currency_id: structuralDefaults?.currency_id || 'BRL',
      buying_mode: structuralDefaults?.buying_mode || 'buy_it_now',
      listing_type_id: structuralDefaults?.listing_type_id || 'gold_special',
      condition: 'new',
      pictures: uploadedPhotos.map(p => ({ id: p.id })),
      attributes: Object.entries(form).filter(([, v]) => v).map(([id, v]) => ({ id, ...v })),
      shipping: { mode: structuralDefaults?.shipping_mode || 'me2', local_pick_up: false, free_shipping: freeShipping },
    }
    if (videoId.trim()) payload.video_id = videoId.trim()

    if (hasVariations) {
      // Com variação, preço/estoque vivem em CADA variação — o ML não
      // aceita (e não faz sentido) mandar os dois níveis juntos.
      // `family_name` é OBRIGATÓRIO junto com `variations` — confirmado
      // num erro real ao publicar em 2026-09-08 ("body does not contains
      // some or none of [family_name, price, available_quantity]"): sem
      // preço/estoque no nível do item, o ML exige esse nome de família
      // pra agrupar as variações. Usamos o próprio título como padrão.
      payload.family_name = title.trim()
      payload.variations = variations.map(v => ({
        attribute_combinations: [
          v.value_id ? { id: varAttrId, value_id: v.value_id } : { id: varAttrId, value_name: v.value_name },
        ],
        price: Number(v.price),
        available_quantity: Number(v.stock),
      }))
    } else {
      payload.price = Number(price)
      payload.available_quantity = Number(stock)
    }
    return payload
  }

  async function confirmPublish() {
    setPublishing(true)
    try {
      const res = await createItem(buildPayload(), description.trim() || undefined)
      setPublished(res)
      if (res.description_error) {
        toast.error('Anúncio criado, mas a descrição não foi aplicada: ' + res.description_error, { duration: 10000 })
      } else {
        toast.success('Anúncio publicado no Mercado Livre!')
      }
    } catch (err) {
      toast.error('Erro ao publicar: ' + err.message)
    } finally {
      setPublishing(false)
      setConfirmOpen(false)
    }
  }

  if (published) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <CheckCircle2 size={36} className="text-emerald-500 mx-auto"/>
          <p className="text-lg font-semibold text-slate-800">Anúncio publicado!</p>
          <p className="text-sm text-slate-500">{published.item.title}</p>
          <div className="flex gap-2 justify-center pt-2">
            <button onClick={() => navigate(`/ml/saude/${published.item.id}`)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
              Ver anúncio
            </button>
            <button onClick={() => navigate('/ml/anuncios')}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors">
              Voltar pra Anúncios
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Progresso pro painel de resumo — mesma condição usada em cada etapa
  // pra liberar o "Continuar", só que aqui é só leitura (não bloqueia nada).
  const tChecks = titleChecks(title)
  const progress = [
    { label: 'Produto',         done: !!title.trim() },
    { label: 'Categoria',       done: !!categoryId },
    { label: 'Ficha técnica',   done: !!categoryId && !missingRequired.length },
    { label: 'Variações',       done: true }, // opcional — nunca bloqueia
    { label: 'Preço e estoque', done: hasVariations ? !variationsMissingData : (!!price.trim() && Number(price) > 0 && !!stock.trim()) },
    { label: 'Fotos',           done: uploadedPhotos.length > 0 },
    { label: 'Descrição',       done: !!description.trim() },
  ]

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1400px] mx-auto space-y-6">

        <div>
          <button onClick={() => navigate('/ml/anuncios')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
            <ArrowLeft size={14}/> Voltar pra Anúncios
          </button>
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200">
              <PlusCircle size={22} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Criar anúncio novo</h1>
              <p className="text-sm text-slate-500">Passo {step} de {STEPS.length} — {STEPS[step - 1].label}</p>
            </div>
          </div>
        </div>

        {/* Trilha compacta — só em telas pequenas, sem a coluna lateral */}
        <div className="flex items-center gap-1 flex-wrap text-xs lg:hidden">
          {STEPS.map((s, i) => (
            <span key={s.label} className={`px-2.5 py-1 rounded-full border font-medium ${
              i + 1 === step ? 'bg-emerald-600 border-emerald-600 text-white'
                : i + 1 < step ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-400'
            }`}>
              {i + 1}. {s.label}
            </span>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_300px] gap-6 items-start">

          {/* Trilha de passos — só em telas grandes */}
          <nav className="hidden lg:flex lg:flex-col gap-1 lg:sticky lg:top-6">
            {STEPS.map((s, i) => {
              const n = i + 1
              const isDone = n < step
              const isCurrent = n === step
              const Icon = s.icon
              return (
                <button key={s.label} disabled={!isDone} onClick={() => isDone && setStep(n)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    isCurrent ? 'bg-emerald-600 text-white shadow-sm'
                      : isDone ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer'
                      : 'text-slate-400 cursor-default'
                  }`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    isCurrent ? 'bg-white/20' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-100'
                  }`}>
                    {isDone ? <CheckCircle2 size={13}/> : <Icon size={12}/>}
                  </span>
                  <span className="text-sm font-medium">{s.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Conteúdo do passo atual */}
          <div>
            {/* Step 1 — Produto */}
            {step === 1 && (
              <Card title="Nome do produto">
                <input type="text" value={title} onChange={e => { setTitle(e.target.value); if (templateId) clearTemplate() }}
                  placeholder="Ex: Gaiola para Hamster com Roda e Casinha"
                  maxLength={TITLE_MAX + 20} // deixa passar um pouco pra mostrar o aviso, não trava o teclado
                  className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none ${
                    !title.trim() ? 'border-slate-200 focus:border-emerald-400'
                      : tChecks.good ? 'border-emerald-300 focus:border-emerald-400'
                      : 'border-amber-300 focus:border-amber-400'
                  }`}/>

                {/* SEO do título — regras reais do ML (limite de caractere,
                    política de propaganda), não é sugestão de IA. */}
                {title.trim() && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full transition-all ${tChecks.len > TITLE_MAX ? 'bg-rose-400' : tChecks.lenOk ? 'bg-emerald-400' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(100, (tChecks.len / TITLE_MAX) * 100)}%` }}/>
                      </div>
                      <span className={`text-[11px] font-mono shrink-0 ${tChecks.len > TITLE_MAX ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                        {tChecks.len}/{TITLE_MAX}
                      </span>
                    </div>
                    <ul className="text-[11px] space-y-0.5">
                      {tChecks.len > TITLE_MAX && <li className="text-rose-500">✕ Passou de {TITLE_MAX} caracteres — o Mercado Livre corta o resto.</li>}
                      {tChecks.len > 0 && tChecks.len < 20 && <li className="text-amber-600">⚠ Título curto — inclua o tipo do produto + atributo principal (cor, tamanho, material).</li>}
                      {tChecks.isAllCaps && <li className="text-amber-600">⚠ Tudo em maiúsculas — o ML rebaixa isso na busca, prefira Caixa Normal.</li>}
                      {tChecks.hasPromoWord && <li className="text-amber-600">⚠ Palavra de propaganda ("grátis", "promoção"...) — a política do ML rejeita isso no título.</li>}
                      {tChecks.hasExcessiveSpaces && <li className="text-amber-600">⚠ Espaços duplicados no meio do texto.</li>}
                      {tChecks.good && <li className="text-emerald-600">✓ Título dentro do tamanho ideal e sem problema conhecido.</li>}
                    </ul>
                  </div>
                )}

                <div className="mt-5 pt-4 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Ou usar um anúncio já existente como modelo (opcional)</p>
                  <p className="text-xs text-slate-400 mb-3">Copia categoria e ficha técnica de um anúncio seu — preço, estoque e fotos são sempre do zero.</p>
                  {templateId ? (
                    <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <span className="text-sm text-emerald-800 truncate">{templateLoading ? 'Carregando modelo...' : title}</span>
                      <button onClick={clearTemplate} className="text-emerald-600 hover:text-emerald-800 shrink-0"><X size={15}/></button>
                    </div>
                  ) : (
                    <>
                      <div className="relative mb-2">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <input type="text" value={templateSearch} onChange={e => setTemplateSearch(e.target.value)}
                          placeholder="Buscar anúncio..."
                          className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-emerald-400"/>
                      </div>
                      {templates === null ? (
                        <p className="text-xs text-slate-400">Carregando anúncios...</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
                          {filteredTemplates.slice(0, 30).map(t => (
                            <button key={t.item_id} onClick={() => selectTemplate(t)}
                              className="w-full text-left text-xs px-3 py-2 hover:bg-slate-50 truncate">
                              {t.title}
                            </button>
                          ))}
                          {!filteredTemplates.length && <p className="text-xs text-slate-400 px-3 py-2">Nenhum anúncio encontrado.</p>}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex justify-end mt-4">
                  <button onClick={() => templateId ? setStep(3) : setStep(2)} disabled={!title.trim() || templateLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                    Continuar <ArrowRight size={14}/>
                  </button>
                </div>
              </Card>
            )}

            {/* Step 2 — Categoria */}
            {step === 2 && (
              <Card title="Categoria">
                {!candidates ? (
                  <button onClick={handlePredict} disabled={categoryLoading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors">
                    {categoryLoading ? <Loader2 size={15} className="animate-spin"/> : <Sparkles size={15}/>}
                    {categoryLoading ? 'Buscando...' : 'Sugerir categoria pelo título'}
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    {candidates.map(c => (
                      <button key={c.category_id} onClick={() => loadCategory(c.category_id, null)} disabled={categoryLoading}
                        className="w-full text-left text-sm border border-slate-200 rounded-lg px-3 py-2.5 hover:border-emerald-300 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                        <span className="font-medium text-slate-700">{c.category_name}</span>
                        {c.domain_name && <span className="text-xs text-slate-400 ml-2">{c.domain_name}</span>}
                      </button>
                    ))}
                    {!candidates.length && <p className="text-xs text-slate-400">Nenhuma sugestão encontrada — use o ID manual abaixo.</p>}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Ou digitar o ID da categoria manualmente</p>
                  <div className="flex gap-2">
                    <input type="text" value={manualCategoryId} onChange={e => setManualCategoryId(e.target.value)}
                      placeholder="Ex: MLB456660"
                      className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"/>
                    <button onClick={() => loadCategory(manualCategoryId.trim(), null)} disabled={!manualCategoryId.trim() || categoryLoading}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                      Usar
                    </button>
                  </div>
                </div>

                <div className="flex justify-between mt-5">
                  <button onClick={() => setStep(1)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
                </div>
              </Card>
            )}

            {/* Step 3 — Ficha técnica */}
            {step === 3 && (
              <Card title={`Ficha técnica${categoryName ? ` — ${categoryName}` : ''}`}>
                <div className="mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Obrigatórios ({requiredAttrs.length})</p>
                  {requiredAttrs.map(attr => (
                    <AttributeRow key={attr.id} attr={displayAttr(attr)} value={form[attr.id]} onChange={v => setForm(f => ({ ...f, [attr.id]: v }))}/>
                  ))}
                </div>
                {extraAttrs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Extras ({extraAttrs.length})</p>
                    {extraAttrs.map(attr => (
                      <AttributeRow key={attr.id} attr={displayAttr(attr)} value={form[attr.id]} onChange={v => setForm(f => ({ ...f, [attr.id]: v }))}/>
                    ))}
                  </div>
                )}
                {hiddenAttrs.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2.5 mb-2">
                      <EyeOff size={14} className="text-violet-500 mt-0.5 shrink-0"/>
                      <p className="text-xs text-violet-700 leading-relaxed">
                        <strong>Campos que o próprio painel do Mercado Livre não mostra pra você preencher</strong> — mas existem de verdade e afetam o anúncio (ex: dimensão/peso da embalagem entram direto no cálculo de frete). Preencher aqui é uma vantagem que o ML não te dá.
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-violet-600 uppercase mb-1 flex items-center gap-1.5">
                      Ocultos no ML ({hiddenAttrs.length}) <InfoTooltip source="nosso" text="Confirmado direto na API do Mercado Livre: esses atributos têm a marcação 'hidden' — o formulário deles não aparece na criação normal de anúncio, mas o campo é aceito e usado de verdade." />
                    </p>
                    {hiddenAttrs.map(attr => (
                      <AttributeRow key={attr.id} attr={displayAttr(attr)} value={form[attr.id]} onChange={v => setForm(f => ({ ...f, [attr.id]: v }))}/>
                    ))}
                  </div>
                )}
                <div className="flex justify-between mt-4">
                  <button onClick={() => setStep(templateId ? 1 : 2)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
                  <button onClick={() => setStep(4)} disabled={!!missingRequired.length}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                    Continuar{missingRequired.length ? ` (faltam ${missingRequired.length})` : ''} <ArrowRight size={14}/>
                  </button>
                </div>
              </Card>
            )}

            {/* Step 4 — Variações (opcional) */}
            {step === 4 && (
              <Card title="Variações (opcional)">
                {!variationCandidates.length ? (
                  <p className="text-sm text-slate-400">Essa categoria não tem atributo de variação disponível (cor, tamanho...) — pode seguir direto.</p>
                ) : !varAttrId ? (
                  <div>
                    <p className="text-xs text-slate-500 mb-3">Esse produto vem em mais de uma opção (cor, tamanho...) que você quer no MESMO anúncio, cada uma com seu preço/estoque? Escolha o atributo que varia — ou pule direto se não tiver.</p>
                    <div className="flex flex-wrap gap-2">
                      {variationCandidates.map(a => (
                        <button key={a.id} onClick={() => chooseVarAttr(a.id)}
                          className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
                          {a.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <p className="text-sm text-slate-700">Variando por: <strong>{varAttr?.name}</strong></p>
                      <button onClick={clearVariations} className="text-xs text-slate-400 hover:text-rose-500 flex items-center gap-1"><X size={12}/> Não usar variação</button>
                    </div>

                    {/* Adicionar valor novo */}
                    {varAttrHasClosedList ? (
                      varAttrAvailableValues.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {varAttrAvailableValues.map(v => (
                            <button key={v.id} onClick={() => addVariationFromList(v)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                              <Plus size={11}/> {v.name}
                            </button>
                          ))}
                        </div>
                      )
                    ) : (
                      <div className="flex gap-2 mb-3">
                        <input type="text" value={newVarValue} onChange={e => setNewVarValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addVariationFreeText()}
                          placeholder={`Digite um valor de ${varAttr?.name || 'variação'}...`}
                          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"/>
                        <button onClick={addVariationFreeText} disabled={!newVarValue.trim()}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                          <Plus size={14}/>
                        </button>
                      </div>
                    )}

                    {/* Linhas já adicionadas — preço/estoque por variação */}
                    {variations.length > 0 && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        {variations.map((v, idx) => (
                          <div key={v.localId} className={`flex items-center gap-3 px-3 py-2.5 ${idx < variations.length - 1 ? 'border-b border-slate-100' : ''}`}>
                            <p className="text-sm text-slate-700 flex-1 min-w-0 truncate">{v.value_name}</p>
                            <div>
                              <label className="block text-[10px] text-slate-400">Preço</label>
                              <input type="number" inputMode="decimal" step="0.01" value={v.price}
                                onChange={e => updateVariation(v.localId, { price: e.target.value })}
                                className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400"/>
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400">Estoque</label>
                              <input type="number" inputMode="numeric" step="1" min="0" value={v.stock}
                                onChange={e => updateVariation(v.localId, { stock: e.target.value })}
                                className="w-16 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400"/>
                            </div>
                            <button onClick={() => removeVariation(v.localId)} className="text-slate-300 hover:text-rose-500 shrink-0"><Trash2 size={14}/></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {!variations.length && <p className="text-xs text-slate-400">Adicione pelo menos 1 valor acima (ex: uma cor) pra montar a variação — ou clique em "Não usar variação".</p>}
                  </div>
                )}
                <div className="flex justify-between mt-5">
                  <button onClick={() => setStep(3)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
                  <button onClick={() => setStep(5)} disabled={hasVariations && (!variations.length || variationsMissingData)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                    {hasVariations ? 'Continuar' : 'Pular — sem variação'} <ArrowRight size={14}/>
                  </button>
                </div>
              </Card>
            )}

            {/* Step 5 — Preço, estoque, frete (só quando NÃO tem variação —
                com variação, cada linha já tem seu preço/estoque próprio) */}
            {step === 5 && (
              <Card title={hasVariations ? 'Estoque e frete' : 'Preço, estoque e frete'}>
                {hasVariations && (
                  <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2.5 mb-4">
                    <Info size={14} className="text-sky-500 mt-0.5 shrink-0"/>
                    <p className="text-xs text-sky-700">Preço e estoque de cada variação já foram definidos no passo anterior — aqui só falta o frete.</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-4">
                  {!hasVariations && (
                    <>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Preço</label>
                        <input type="number" inputMode="decimal" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
                          className="w-32 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-400"/>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Estoque</label>
                        <input type="number" inputMode="numeric" step="1" min="0" value={stock} onChange={e => setStock(e.target.value)}
                          className="w-24 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-400"/>
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Condição</label>
                    <span className="block text-sm text-slate-500 px-2.5 py-1.5">Novo (fixo)</span>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Frete</label>
                    <button type="button" onClick={() => setFreeShipping(f => !f)}
                      className={`text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                        freeShipping ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'
                      }`}>
                      {freeShipping ? 'Frete grátis' : 'Frete pago pelo comprador'}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between mt-5">
                  <button onClick={() => setStep(4)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
                  <button onClick={() => setStep(6)} disabled={!hasVariations && (!price.trim() || Number(price) <= 0 || !stock.trim() || Number(stock) < 0)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                    Continuar <ArrowRight size={14}/>
                  </button>
                </div>
              </Card>
            )}

            {/* Step 6 — Fotos */}
            {step === 6 && (
              <Card title="Fotos">
                <p className="text-xs text-slate-400 mb-3">Mínimo 1 foto pra publicar — ideal entre 6 e 10.</p>
                <label className="flex items-center gap-2 w-fit px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl cursor-pointer transition-colors">
                  <ImageIcon size={15}/> Adicionar fotos
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect}/>
                </label>
                {photos.length > 0 && (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-4">
                    {photos.map(p => (
                      <div key={p.localId} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                        <img src={p.previewUrl} alt="" className="w-full h-full object-cover"/>
                        {p.status === 'uploading' && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <Loader2 size={16} className="animate-spin text-white"/>
                          </div>
                        )}
                        {p.status === 'error' && (
                          <div className="absolute inset-0 bg-rose-900/70 flex items-center justify-center p-1" title={p.error}>
                            <AlertTriangle size={16} className="text-white"/>
                          </div>
                        )}
                        <button onClick={() => removePhoto(p.localId)}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center">
                          <X size={11} className="text-white"/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between mt-5">
                  <button onClick={() => setStep(5)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
                  <button onClick={() => setStep(7)} disabled={!uploadedPhotos.length || anyPhotoUploading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                    Continuar <ArrowRight size={14}/>
                  </button>
                </div>
              </Card>
            )}

            {/* Step 7 — Descrição + vídeo */}
            {step === 7 && (
              <Card title="Descrição">
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={10}
                  placeholder="Descreva o produto — o que é, do que é feito, medidas, cuidados..."
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-400 resize-y"/>
                <p className="text-xs text-slate-400 mt-1">Pode deixar em branco e escrever depois no detalhe do anúncio (que já tem sugestão de IA).</p>

                <div className="mt-5 pt-4 border-t border-slate-100">
                  <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5 flex items-center gap-1.5">
                    <Video size={13}/> Vídeo do produto (opcional)
                  </label>
                  <input type="text" value={videoId} onChange={e => setVideoId(e.target.value)}
                    placeholder="ID do vídeo no YouTube (ex: dQw4w9WgXcQ)"
                    className="w-full max-w-sm text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"/>
                  <p className="text-xs text-slate-400 mt-1">É só o código depois de "v=" no link do YouTube — não a URL inteira. Anúncio com vídeo real tende a converter mais.</p>
                </div>

                <div className="flex justify-between mt-4">
                  <button onClick={() => setStep(6)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
                  <button onClick={() => setStep(8)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
                    Continuar <ArrowRight size={14}/>
                  </button>
                </div>
              </Card>
            )}

            {/* Step 8 — Revisão */}
            {step === 8 && (
              <Card title="Revisão">
                <div className="space-y-3 text-sm text-slate-700 mb-5">
                  <p><strong>Título:</strong> {title}</p>
                  <p><strong>Categoria:</strong> {categoryName || categoryId}</p>
                  {hasVariations ? (
                    <div>
                      <p><strong>Variações por {varAttr?.name}:</strong> {variations.length} opções, {freeShipping ? 'frete grátis' : 'frete pago pelo comprador'}</p>
                      <ul className="text-xs text-slate-500 mt-1 space-y-0.5">
                        {variations.map(v => <li key={v.localId}>· {v.value_name} — {fmtMoney(v.price)} · {v.stock} un.</li>)}
                      </ul>
                    </div>
                  ) : (
                    <p><strong>Preço:</strong> {fmtMoney(price)} · <strong>Estoque:</strong> {stock} unidades · {freeShipping ? 'Frete grátis' : 'Frete pago pelo comprador'}</p>
                  )}
                  <p><strong>Fotos:</strong> {uploadedPhotos.length}</p>
                  <p><strong>Atributos preenchidos:</strong> {filledAttrCount}{hiddenAttrs.length > 0 ? ` (incluindo ${filledHiddenCount} de ${hiddenAttrs.length} ocultos no ML)` : ''}</p>
                  {videoId.trim() && <p><strong>Vídeo:</strong> {videoId.trim()}</p>}
                  {description.trim() && <p className="whitespace-pre-wrap"><strong>Descrição:</strong> {description}</p>}
                </div>

                {/* Checklist de qualidade — comparação simples com o que o
                    próprio ML valoriza (título, fotos, atributos completos),
                    calculado aqui mesmo, sem inventar nota nenhuma. */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2.5">Checklist do anúncio</p>
                  <ul className="space-y-1.5 text-xs">
                    <li className={`flex items-center gap-1.5 ${tChecks.good ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {tChecks.good ? <CheckCircle2 size={13}/> : <AlertTriangle size={13}/>} Título dentro do tamanho ideal (20–{TITLE_MAX} caracteres, sem problema de política)
                    </li>
                    <li className={`flex items-center gap-1.5 ${uploadedPhotos.length >= 6 ? 'text-emerald-600' : uploadedPhotos.length >= 1 ? 'text-amber-600' : 'text-rose-500'}`}>
                      {uploadedPhotos.length >= 6 ? <CheckCircle2 size={13}/> : <AlertTriangle size={13}/>} {uploadedPhotos.length} foto{uploadedPhotos.length === 1 ? '' : 's'} (ideal 6 a 10 — mínimo 1 pra publicar)
                    </li>
                    <li className={`flex items-center gap-1.5 ${!missingRequired.length ? 'text-emerald-600' : 'text-rose-500'}`}>
                      <CheckCircle2 size={13}/> Todos os atributos obrigatórios da categoria preenchidos
                    </li>
                    <li className={`flex items-center gap-1.5 ${hiddenAttrs.length === 0 ? 'text-slate-400' : filledHiddenCount === hiddenAttrs.length ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {hiddenAttrs.length === 0 ? <Circle size={13}/> : filledHiddenCount === hiddenAttrs.length ? <CheckCircle2 size={13}/> : <AlertTriangle size={13}/>}
                      {hiddenAttrs.length === 0 ? 'Sem campos ocultos do ML nessa categoria' : `${filledHiddenCount} de ${hiddenAttrs.length} campos ocultos do ML preenchidos (frete/dimensão)`}
                    </li>
                    <li className={`flex items-center gap-1.5 ${description.trim() ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {description.trim() ? <CheckCircle2 size={13}/> : <Circle size={13}/>} Descrição preenchida
                    </li>
                    <li className={`flex items-center gap-1.5 ${videoId.trim() ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {videoId.trim() ? <CheckCircle2 size={13}/> : <Circle size={13}/>} Vídeo do produto (opcional, ajuda conversão)
                    </li>
                  </ul>
                </div>

                <div className="flex justify-between mt-5">
                  <button onClick={() => setStep(7)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
                  <button onClick={() => setConfirmOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
                    <PlusCircle size={15}/> Publicar anúncio
                  </button>
                </div>
              </Card>
            )}
          </div>

          {/* Painel de resumo — foto + dados + progresso, sempre visível */}
          <aside className="hidden lg:block lg:sticky lg:top-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Resumo</p>
              <div className="w-full aspect-square rounded-xl bg-slate-100 border border-slate-200 overflow-hidden mb-3 flex items-center justify-center">
                {uploadedPhotos[0]
                  ? <img src={uploadedPhotos[0].previewUrl} alt="" className="w-full h-full object-cover"/>
                  : <ImageIcon size={28} className="text-slate-300"/>}
              </div>
              <p className="text-sm font-semibold text-slate-800 line-clamp-2 mb-1">{title.trim() || 'Sem título ainda'}</p>
              <p className="text-xs text-slate-400 mb-3">{categoryName || 'Categoria não definida'}</p>
              <div className="flex items-baseline gap-2 mb-4 pb-4 border-b border-slate-100">
                <p className="text-lg font-bold text-slate-800">
                  {hasVariations
                    ? (variations.some(v => v.price) ? `A partir de ${fmtMoney(Math.min(...variations.filter(v => v.price).map(v => Number(v.price))))}` : '—')
                    : (price.trim() ? fmtMoney(price) : '—')}
                </p>
                <p className="text-xs text-slate-400">
                  {hasVariations ? `${variations.length} variações` : `${stock || 0} un.`} · {uploadedPhotos.length} foto{uploadedPhotos.length === 1 ? '' : 's'}
                </p>
              </div>
              <ul className="space-y-1.5">
                {progress.map(p => (
                  <li key={p.label} className={`flex items-center gap-1.5 text-xs ${p.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {p.done ? <CheckCircle2 size={13}/> : <Circle size={13}/>} {p.label}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>

      <ConfirmWriteModal
        open={confirmOpen}
        title="Publicar anúncio novo"
        description="Isso cria um anúncio NOVO e real no Mercado Livre agora mesmo, visível pros seus clientes."
        confirmLabel="Sim, publicar no Mercado Livre"
        confirming={publishing}
        onConfirm={confirmPublish}
        onCancel={() => setConfirmOpen(false)}
        detail={
          <div className="text-sm text-slate-700 space-y-1">
            <p><strong>{title}</strong></p>
            <p>
              {hasVariations ? `${variations.length} variações por ${varAttr?.name}` : `${fmtMoney(price)} · ${stock} unidades`}
              {' · '}{uploadedPhotos.length} foto{uploadedPhotos.length === 1 ? '' : 's'}
            </p>
          </div>
        }
      />
    </div>
  )
}
