import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Loader2, AlertTriangle, Sparkles, Search,
  Image as ImageIcon, X, CheckCircle2, PlusCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useMlInsights } from './hooks/useMlInsights'
import { ConfirmWriteModal } from './ConfirmWriteModal'
import { AttributeRow } from './AttributeRow'

const STEPS = ['Produto', 'Categoria', 'Ficha técnica', 'Preço e estoque', 'Fotos', 'Descrição', 'Revisão']

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
    <div className="bg-white border border-slate-200 rounded-xl p-5">
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

  // Step 4 — preço/estoque/frete
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('1')
  const [freeShipping, setFreeShipping] = useState(false)
  const [structuralDefaults, setStructuralDefaults] = useState(null)

  // Step 5 — fotos
  const [photos, setPhotos] = useState([]) // [{ localId, file, previewUrl, status, id?, error? }]

  // Step 6 — descrição
  const [description, setDescription] = useState('')

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

  const requiredAttrs = attributes.filter(a => a.required)
  const extraAttrs    = attributes.filter(a => !a.required)
  const missingRequired = requiredAttrs.filter(a => !a.is_variation_attribute && !form[a.id])

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
    return {
      title: title.trim(),
      category_id: categoryId,
      price: Number(price),
      currency_id: structuralDefaults?.currency_id || 'BRL',
      available_quantity: Number(stock),
      buying_mode: structuralDefaults?.buying_mode || 'buy_it_now',
      listing_type_id: structuralDefaults?.listing_type_id || 'gold_special',
      condition: 'new',
      pictures: uploadedPhotos.map(p => ({ id: p.id })),
      attributes: Object.entries(form).filter(([, v]) => v).map(([id, v]) => ({ id, ...v })),
      shipping: { mode: structuralDefaults?.shipping_mode || 'me2', local_pick_up: false, free_shipping: freeShipping },
    }
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

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        <div>
          <button onClick={() => navigate('/ml/anuncios')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
            <ArrowLeft size={14}/> Voltar pra Anúncios
          </button>
          <h1 className="text-xl font-semibold text-slate-800">Criar anúncio novo</h1>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 flex-wrap text-xs">
          {STEPS.map((label, i) => (
            <span key={label} className={`px-2.5 py-1 rounded-full border font-medium ${
              i + 1 === step ? 'bg-emerald-600 border-emerald-600 text-white'
                : i + 1 < step ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-400'
            }`}>
              {i + 1}. {label}
            </span>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {/* Step 1 — Produto */}
        {step === 1 && (
          <Card title="Nome do produto">
            <input type="text" value={title} onChange={e => { setTitle(e.target.value); if (templateId) clearTemplate() }}
              placeholder="Ex: Gaiola para Hamster com Roda e Casinha"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"/>

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
            <div className="flex justify-between mt-4">
              <button onClick={() => setStep(templateId ? 1 : 2)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
              <button onClick={() => setStep(4)} disabled={!!missingRequired.length}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                Continuar{missingRequired.length ? ` (faltam ${missingRequired.length})` : ''} <ArrowRight size={14}/>
              </button>
            </div>
          </Card>
        )}

        {/* Step 4 — Preço, estoque, frete */}
        {step === 4 && (
          <Card title="Preço, estoque e frete">
            <div className="flex flex-wrap gap-4">
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
              <button onClick={() => setStep(3)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
              <button onClick={() => setStep(5)} disabled={!price.trim() || Number(price) <= 0 || !stock.trim() || Number(stock) < 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                Continuar <ArrowRight size={14}/>
              </button>
            </div>
          </Card>
        )}

        {/* Step 5 — Fotos */}
        {step === 5 && (
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
              <button onClick={() => setStep(4)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
              <button onClick={() => setStep(6)} disabled={!uploadedPhotos.length || anyPhotoUploading}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                Continuar <ArrowRight size={14}/>
              </button>
            </div>
          </Card>
        )}

        {/* Step 6 — Descrição */}
        {step === 6 && (
          <Card title="Descrição">
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={10}
              placeholder="Descreva o produto — o que é, do que é feito, medidas, cuidados..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-400 resize-y"/>
            <p className="text-xs text-slate-400 mt-1">Pode deixar em branco e escrever depois no detalhe do anúncio (que já tem sugestão de IA).</p>
            <div className="flex justify-between mt-4">
              <button onClick={() => setStep(5)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
              <button onClick={() => setStep(7)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
                Continuar <ArrowRight size={14}/>
              </button>
            </div>
          </Card>
        )}

        {/* Step 7 — Revisão */}
        {step === 7 && (
          <Card title="Revisão">
            <div className="space-y-3 text-sm text-slate-700">
              <p><strong>Título:</strong> {title}</p>
              <p><strong>Categoria:</strong> {categoryName || categoryId}</p>
              <p><strong>Preço:</strong> {fmtMoney(price)} · <strong>Estoque:</strong> {stock} unidades · {freeShipping ? 'Frete grátis' : 'Frete pago pelo comprador'}</p>
              <p><strong>Fotos:</strong> {uploadedPhotos.length}</p>
              <p><strong>Atributos preenchidos:</strong> {Object.values(form).filter(Boolean).length}</p>
              {description.trim() && <p className="whitespace-pre-wrap"><strong>Descrição:</strong> {description}</p>}
            </div>
            <div className="flex justify-between mt-5">
              <button onClick={() => setStep(6)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeft size={14}/> Voltar</button>
              <button onClick={() => setConfirmOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
                <PlusCircle size={15}/> Publicar anúncio
              </button>
            </div>
          </Card>
        )}

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
            <p>{fmtMoney(price)} · {stock} unidades · {uploadedPhotos.length} foto{uploadedPhotos.length === 1 ? '' : 's'}</p>
          </div>
        }
      />
    </div>
  )
}
