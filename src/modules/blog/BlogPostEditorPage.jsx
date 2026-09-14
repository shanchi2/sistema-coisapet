import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Sparkles, Loader2, Save, ImagePlus, Trash2,
  CheckCircle2, AlertTriangle, XCircle, Link2, RefreshCw, Globe, Eye, Tag, Settings,
  CalendarClock, X as XIcon, Check, ZoomIn,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useBlogPost } from './hooks/useBlogPosts'
import { useBlogCategories } from './hooks/useBlogCategories'
import { BlogRichTextEditor } from './components/BlogRichTextEditor'
import { BlogCategoriesModal } from './components/BlogCategoriesModal'
import { BlogPreviewModal } from './components/BlogPreviewModal'
import { ProductReferencePicker } from './components/ProductReferencePicker'
import { callBlogAi } from './blogAi'
import { computeSeoChecks, stripHtml, countWords } from './seoChecks'

// Faixa Unicode dos acentos "soltos" (combining diacritical marks) que
// sobram depois do normalize('NFD') — montada via fromCharCode de
// propósito, pra nunca ter um caractere combinante literal dentro do
// arquivo fonte (mesmo cuidado de ChapasPage.jsx).
const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')
function slugify(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-')
}

// ISO (UTC, do banco) → string local pro <input type="datetime-local">
// (que trabalha sempre em horário local, sem timezone no valor).
function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Insere <a> ao redor da PRIMEIRA ocorrência exata de `text` que ainda
// não está dentro de uma tag <a> — checagem simples via regex negativa
// de lookbehind; suficiente pro volume de HTML gerado aqui (não é um
// parser de HTML de verdade, mas cobre o caso real).
function insertFirstLink(html, text, href) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(escaped)
  const idx = html.search(re)
  if (idx === -1) return html
  // Evita linkar um trecho que já está dentro de um <a ...>...</a>
  const before = html.slice(0, idx)
  const openTags = (before.match(/<a\b/gi) || []).length
  const closeTags = (before.match(/<\/a>/gi) || []).length
  if (openTags > closeTags) return html // já está dentro de um link
  // `data-product-link` — mesmo marcador usado no link manual
  // (`BlogRichTextEditor.jsx`), é o que deixa o site público saber que
  // é link de produto (pra contar em `blog_product_clicks`) sem
  // precisar adivinhar por regex de URL.
  return html.slice(0, idx) + `<a href="${href}" target="_blank" rel="noopener noreferrer" data-product-link="true">${text}</a>` + html.slice(idx + text.length)
}

const STATUS_DOT = {
  good: { icon: CheckCircle2, className: 'text-emerald-500' },
  ok:   { icon: AlertTriangle, className: 'text-amber-500' },
  bad:  { icon: XCircle, className: 'text-rose-500' },
}

function SeoCheckRow({ status, label }) {
  const { icon: Icon, className } = STATUS_DOT[status] || STATUS_DOT.ok
  return (
    <div className="flex items-start gap-2 py-1">
      <Icon size={15} className={`shrink-0 mt-0.5 ${className}`} />
      <span className="text-xs text-slate-600 leading-snug">{label}</span>
    </div>
  )
}

function Card({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-4 ${className}`}>
      {title && (
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
          {Icon && <Icon size={13} />} {title}
        </h3>
      )}
      {children}
    </div>
  )
}

export function BlogPostEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { post, loading, save } = useBlogPost(id)
  const { categories, refetch: refetchCategories } = useBlogCategories()

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugAuto, setSlugAuto] = useState(true)
  const [excerpt, setExcerpt] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState(null)
  const [categoryId, setCategoryId] = useState(null)
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false)
  const [focusKeyword, setFocusKeyword] = useState('')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [secondaryKeywords, setSecondaryKeywords] = useState([])
  const [status, setStatus] = useState('draft')
  const [scheduledAt, setScheduledAt] = useState('') // valor do <input type="datetime-local">, string local
  const [scheduledAtSaved, setScheduledAtSaved] = useState(null) // ISO, o que já está salvo (pra exibir no badge)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const scheduleBoxRef = useRef(null)

  const [aiContext, setAiContext] = useState('')
  const [aiTargetWords, setAiTargetWords] = useState(600)
  const [generating, setGenerating] = useState(false)
  const [editorResetKey, setEditorResetKey] = useState('new')

  const [saving, setSaving] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [generatingCover, setGeneratingCover] = useState(false)
  const [candidateCoverUrl, setCandidateCoverUrl] = useState(null) // capa gerada, aguardando aprovação
  const [zoomImageUrl, setZoomImageUrl] = useState(null) // qualquer imagem em tela cheia (capa atual ou candidata)
  const [referenceProduct, setReferenceProduct] = useState(null) // produto opcional usado como referência visual
  const [coverImagePrompt, setCoverImagePrompt] = useState('') // instrução extra opcional pra guiar a cena da capa

  const [suggestions, setSuggestions] = useState([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [appliedTexts, setAppliedTexts] = useState(new Set())

  // Carrega post existente pros campos locais
  useEffect(() => {
    if (!post) return
    setTitle(post.title || '')
    setSlug(post.slug || '')
    setSlugAuto(false)
    setExcerpt(post.excerpt || '')
    setContentHtml(post.content_html || '')
    setCoverImageUrl(post.cover_image_url || null)
    setCategoryId(post.category_id || null)
    setFocusKeyword(post.focus_keyword || '')
    setMetaTitle(post.meta_title || '')
    setMetaDescription(post.meta_description || '')
    setSecondaryKeywords(post.tags || [])
    setStatus(post.status === 'trash' ? 'draft' : (post.status || 'draft'))
    setScheduledAt(isoToLocalInput(post.scheduled_at))
    setScheduledAtSaved(post.scheduled_at || null)
    setAiContext(post.ai_context || '')
    setAiTargetWords(post.ai_target_words || 600)
    setEditorResetKey(`loaded-${post.id}`)
  }, [post])

  useEffect(() => {
    if (slugAuto && title) setSlug(slugify(title))
  }, [title, slugAuto])

  useEffect(() => {
    if (!scheduleOpen) return
    function onClickOutside(e) {
      if (scheduleBoxRef.current && !scheduleBoxRef.current.contains(e.target)) setScheduleOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [scheduleOpen])

  const wordCount = useMemo(() => countWords(stripHtml(contentHtml)), [contentHtml])
  const seoChecks = useMemo(() => computeSeoChecks({ title, slug, metaTitle, metaDescription, focusKeyword, contentHtml }), [title, slug, metaTitle, metaDescription, focusKeyword, contentHtml])

  function buildPayload(overrideStatus, overrideScheduledAt) {
    const finalStatus = overrideStatus ?? status
    return {
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim() || null,
      content_html: contentHtml,
      cover_image_url: coverImageUrl,
      category_id: categoryId || null,
      focus_keyword: focusKeyword.trim() || null,
      meta_title: metaTitle.trim() || null,
      meta_description: metaDescription.trim() || null,
      tags: secondaryKeywords.length ? secondaryKeywords : null,
      ai_context: aiContext.trim() || null,
      ai_target_words: aiTargetWords || null,
      status: finalStatus,
      scheduled_at: finalStatus === 'scheduled' ? overrideScheduledAt : null,
      ...(overrideStatus === 'published' && !post?.published_at ? { published_at: new Date().toISOString() } : {}),
    }
  }

  async function handleSave(overrideStatus, overrideScheduledAt) {
    if (!title.trim()) return toast.error('Dá um título pro post antes de salvar.')
    if (!slug.trim()) return toast.error('O slug não pode ficar vazio.')
    setSaving(true)
    try {
      const newId = await save(buildPayload(overrideStatus, overrideScheduledAt), { silent: false })
      if (overrideStatus) setStatus(overrideStatus)
      if (overrideStatus === 'scheduled') setScheduledAtSaved(overrideScheduledAt)
      if (!id) navigate(`/blog/${newId}`, { replace: true })
    } catch (err) {
      if (err.code === '23505') toast.error('Já existe um post com este slug.')
      else toast.error('Erro ao salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleConfirmSchedule() {
    if (!scheduledAt) return toast.error('Escolha uma data e hora primeiro.')
    const iso = new Date(scheduledAt).toISOString()
    if (new Date(iso) <= new Date()) return toast.error('Escolha uma data no futuro.')
    handleSave('scheduled', iso)
    setScheduleOpen(false)
  }

  async function handleGenerate() {
    if (!focusKeyword.trim()) return toast.error('Defina a palavra-chave foco primeiro.')
    if (contentHtml && !window.confirm('Já existe conteúdo escrito. Gerar de novo vai SUBSTITUIR título, SEO e o texto atual. Continuar?')) return

    setGenerating(true)
    try {
      const data = await callBlogAi('generate_content', { keyword: focusKeyword.trim(), context: aiContext.trim(), target_words: aiTargetWords })

      setTitle(data.title || '')
      setSlugAuto(true)
      setSlug(data.slug ? slugify(data.slug) : slugify(data.title || ''))
      setMetaTitle(data.meta_title || '')
      setMetaDescription(data.meta_description || '')
      setSecondaryKeywords(Array.isArray(data.secondary_keywords) ? data.secondary_keywords : [])
      setExcerpt(data.excerpt || '')
      setContentHtml(data.content_html || '')
      setEditorResetKey(`generated-${Date.now()}`)
      setSuggestions([])
      setAppliedTexts(new Set())
      toast.success('Conteúdo gerado! Revise antes de publicar.')
    } catch (err) {
      toast.error('Erro ao gerar conteúdo: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSuggestLinks() {
    if (!contentHtml.trim()) return toast.error('Escreva ou gere o conteúdo antes de sugerir links.')
    setSuggestLoading(true)
    try {
      const data = await callBlogAi('suggest_links', { content_html: contentHtml })
      setSuggestions(data.suggestions || [])
      if (!data.suggestions?.length) toast('Nenhum hyperlink relevante encontrado pra sugerir agora.', { icon: '🔎' })
    } catch (err) {
      toast.error('Erro ao sugerir links: ' + err.message)
    } finally {
      setSuggestLoading(false)
    }
  }

  function applySuggestion(s) {
    const href = `https://coisapet.com.br/${s.slug}`
    setContentHtml(prev => insertFirstLink(prev, s.text, href))
    setEditorResetKey(`link-${Date.now()}`)
    setAppliedTexts(prev => new Set(prev).add(s.text))
  }

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `posts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('blog-covers').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('blog-covers').getPublicUrl(path)
      setCoverImageUrl(data.publicUrl)
      toast.success('Capa enviada!')
    } catch (err) {
      toast.error('Erro no upload: ' + err.message)
    } finally {
      setUploadingCover(false)
      e.target.value = ''
    }
  }

  // Contexto pra IA gerar a imagem — título/resumo/palavra-chave dão
  // mais direção que o corpo inteiro; um trecho do texto ajuda quando
  // ainda não tem título/resumo definidos.
  // Pedido do Raphael (11/09): usar só o resumo como base do prompt de
  // imagem — mais leve e previsível que somar título + palavra-chave +
  // um trecho do corpo. Só cai pra título/palavra-chave se ainda não
  // tiver resumo escrito (post recém-começado).
  function buildImageContext() {
    const base = excerpt.trim() || title.trim() || focusKeyword.trim() || stripHtml(contentHtml).slice(0, 300)
    return coverImagePrompt.trim() ? `${base}\n\nInstrução extra do usuário pra essa imagem (siga com prioridade): ${coverImagePrompt.trim()}` : base
  }

  async function handleGenerateCover() {
    if (!title.trim() && !focusKeyword.trim() && !contentHtml.trim()) {
      return toast.error('Escreva um título, palavra-chave ou conteúdo antes de gerar a capa.')
    }
    setGeneratingCover(true)
    try {
      const data = await callBlogAi('generate_image', {
        context: buildImageContext(),
        reference_photo_path: referenceProduct?.photo_url || undefined,
      })
      // Não troca a capa direto — fica em espera até o usuário aprovar,
      // pra poder ver em tamanho grande e decidir antes de substituir
      // a que já estava (pedido do Raphael, 11/09).
      setCandidateCoverUrl(data.image_url)
    } catch (err) {
      toast.error('Erro ao gerar capa: ' + err.message)
    } finally {
      setGeneratingCover(false)
    }
  }

  function acceptCandidateCover() {
    setCoverImageUrl(candidateCoverUrl)
    setCandidateCoverUrl(null)
    toast.success('Capa atualizada!')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto pb-16">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button onClick={() => navigate('/blog')}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> Voltar pro Blog
        </button>
        <div className="flex items-center gap-2">
          {status === 'published' && (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1.5 rounded-lg">
              <Globe size={12} /> Publicado
            </span>
          )}
          {status === 'scheduled' && scheduledAtSaved && (
            <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1.5 rounded-lg">
              <CalendarClock size={12} /> Agendado pra {new Date(scheduledAtSaved).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          <button onClick={() => setPreviewOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-colors">
            <Eye size={15} /> Ver prévia
          </button>

          <button onClick={() => handleSave('draft')} disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar rascunho
          </button>

          <div className="relative" ref={scheduleBoxRef}>
            <button onClick={() => setScheduleOpen(true)} disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
              <CalendarClock size={15} /> {status === 'scheduled' ? 'Reagendar' : 'Agendar'}
            </button>
            {scheduleOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Publicar em</label>
                  <button onClick={() => setScheduleOpen(false)} className="text-slate-400 hover:text-slate-600"><XIcon size={13} /></button>
                </div>
                <input type="datetime-local" className="input text-sm mb-3"
                  min={isoToLocalInput(new Date().toISOString())}
                  value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                <button onClick={handleConfirmSchedule} disabled={saving}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />} Confirmar agendamento
                </button>
                <p className="text-[11px] text-slate-400 mt-2">O post vira publicado sozinho nessa data — pode fechar o sistema.</p>
              </div>
            )}
          </div>

          <button onClick={() => handleSave('published')} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />} {status === 'published' ? 'Atualizar' : 'Publicar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">

        {/* ── Coluna principal ── */}
        <div className="space-y-4 min-w-0">
          <input
            className="w-full text-2xl font-bold text-slate-800 placeholder:text-slate-300 outline-none border-b border-transparent focus:border-slate-200 pb-2 bg-transparent"
            placeholder="Título do post"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="shrink-0">coisapet.com.br/blog/</span>
            <input
              className="flex-1 font-mono bg-transparent outline-none border-b border-transparent focus:border-slate-200 text-slate-600"
              value={slug}
              onChange={e => { setSlugAuto(false); setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-')) }}
            />
            <button type="button" title="Regenerar pelo título" onClick={() => { setSlugAuto(true); setSlug(slugify(title)) }}
              className="p-1 rounded text-slate-400 hover:text-slate-600">
              <RefreshCw size={12} />
            </button>
          </div>

          <BlogRichTextEditor html={contentHtml} onChange={setContentHtml} resetKey={editorResetKey} />
          <p className="text-xs text-slate-400">{wordCount} palavras</p>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Resumo (aparece na listagem)</label>
            <textarea className="input" rows={2} value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="1-2 frases curtas resumindo o post..." />
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">

          {/* Capa */}
          <Card title="Imagem de capa" icon={ImagePlus}>
            {coverImageUrl ? (
              <div className="relative group">
                <img src={coverImageUrl} alt="" className="w-full h-32 object-cover rounded-xl cursor-zoom-in"
                  onClick={() => setZoomImageUrl(coverImageUrl)} />
                <button onClick={() => setZoomImageUrl(coverImageUrl)} title="Ver em tamanho grande"
                  className="absolute top-1.5 left-1.5 p-1.5 bg-white/90 hover:bg-white rounded-lg text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn size={13} />
                </button>
                <button onClick={() => setCoverImageUrl(null)} title="Remover capa"
                  className="absolute top-1.5 right-1.5 p-1.5 bg-white/90 hover:bg-white rounded-lg text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 size={13} />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-1.5 h-24 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
                {uploadingCover
                  ? <Loader2 size={18} className="animate-spin text-slate-400" />
                  : <><ImagePlus size={18} className="text-slate-400" /><span className="text-xs text-slate-400">Enviar imagem</span></>}
                <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={uploadingCover} />
              </label>
            )}

            {candidateCoverUrl && (
              <div className="mt-2 border border-indigo-200 bg-indigo-50/50 rounded-xl p-2.5">
                <p className="text-[11px] font-semibold text-indigo-700 mb-1.5">Nova capa gerada — usar essa?</p>
                <div className="relative group mb-2">
                  <img src={candidateCoverUrl} alt="" className="w-full h-32 object-cover rounded-lg cursor-zoom-in"
                    onClick={() => setZoomImageUrl(candidateCoverUrl)} />
                  <button onClick={() => setZoomImageUrl(candidateCoverUrl)} title="Ver em tamanho grande"
                    className="absolute top-1.5 right-1.5 p-1.5 bg-white/90 hover:bg-white rounded-lg text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn size={13} />
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={acceptCandidateCover}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors">
                    <Check size={12} /> Usar essa
                  </button>
                  <button onClick={() => setCandidateCoverUrl(null)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors">
                    Descartar
                  </button>
                </div>
              </div>
            )}

            <div className="mt-2">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Referência visual (opcional)</label>
              <ProductReferencePicker value={referenceProduct} onChange={setReferenceProduct} />
              {referenceProduct && (
                <p className="text-[10px] text-slate-400 mt-1">A IA usa a foto real desse produto como base — só funciona bem se ele for do mesmo assunto do post.</p>
              )}
            </div>

            <div className="mt-2">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Instrução extra pra imagem (opcional)</label>
              <textarea className="input text-xs min-h-[60px] resize-none" rows={2}
                placeholder="ex: hamster cavando na maravalha, ambiente mais claro"
                value={coverImagePrompt} onChange={e => setCoverImagePrompt(e.target.value)} />
            </div>

            <button onClick={handleGenerateCover} disabled={generatingCover}
              className="w-full flex items-center justify-center gap-1.5 mt-2 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
              {generatingCover
                ? <><Loader2 size={13} className="animate-spin" /> Gerando com IA...</>
                : <><Sparkles size={13} /> {coverImageUrl ? 'Gerar outra com IA' : 'Gerar capa com IA'}</>}
            </button>
          </Card>

          {/* Categoria */}
          <Card title="Categoria" icon={Tag}>
            <div className="flex gap-2">
              <select className="select flex-1" value={categoryId || ''} onChange={e => setCategoryId(e.target.value || null)}>
                <option value="">Sem categoria</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" title="Gerenciar categorias" onClick={() => setManageCategoriesOpen(true)}
                className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors">
                <Settings size={15} />
              </button>
            </div>
          </Card>

          {/* Gerador de IA */}
          <Card title="Gerar com IA" icon={Sparkles} className="border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white">
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Palavra-chave foco</label>
                <input className="input" value={focusKeyword} onChange={e => setFocusKeyword(e.target.value)} placeholder="ex: terrário para hamster" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Mini-contexto (opcional)</label>
                <textarea className="input" rows={3} value={aiContext} onChange={e => setAiContext(e.target.value)} placeholder="ex: focar em cuidados de ventilação e substrato ideal" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Tamanho aproximado (palavras)</label>
                <input type="number" className="input" min={150} step={50} value={aiTargetWords} onChange={e => setAiTargetWords(Number(e.target.value))} />
              </div>
              <button onClick={handleGenerate} disabled={generating}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {generating ? 'Gerando...' : contentHtml ? 'Gerar de novo' : 'Gerar conteúdo'}
              </button>
            </div>
          </Card>

          {/* SEO */}
          <Card title="SEO" icon={Eye}>
            <div className="space-y-2.5 mb-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Título SEO ({metaTitle.length}/60)</label>
                <input className="input text-xs" value={metaTitle} onChange={e => setMetaTitle(e.target.value)} maxLength={70} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Meta descrição ({metaDescription.length}/156)</label>
                <textarea className="input text-xs" rows={3} value={metaDescription} onChange={e => setMetaDescription(e.target.value)} maxLength={180} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Palavras-chave secundárias</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {secondaryKeywords.map((kw, i) => (
                    <span key={i} className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                      {kw}
                      <button type="button" onClick={() => setSecondaryKeywords(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-indigo-400 hover:text-indigo-700"><XIcon size={10} /></button>
                    </span>
                  ))}
                </div>
                <input className="input text-xs" placeholder="Digite e pressione Enter pra adicionar"
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    const v = e.currentTarget.value.trim()
                    if (v) setSecondaryKeywords(prev => [...prev, v])
                    e.currentTarget.value = ''
                  }} />
              </div>
            </div>
            <div className="border-t border-slate-100 pt-2.5">
              {seoChecks.map((c, i) => <SeoCheckRow key={i} {...c} />)}
            </div>
          </Card>

          {/* Hyperlinks sugeridos */}
          <Card title="Hyperlinks sugeridos" icon={Link2}>
            <button onClick={handleSuggestLinks} disabled={suggestLoading}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 mb-2.5">
              {suggestLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Sugerir hyperlinks
            </button>
            {suggestions.length > 0 && (
              <div className="space-y-2">
                {suggestions.map((s, i) => {
                  const applied = appliedTexts.has(s.text)
                  return (
                    <div key={i} className="flex items-start justify-between gap-2 p-2 bg-slate-50 rounded-lg">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">"{s.text}"</p>
                        <p className="text-[11px] text-slate-400 truncate">→ {s.product_name}</p>
                      </div>
                      <button onClick={() => applySuggestion(s)} disabled={applied}
                        className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg transition-colors ${
                          applied ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                        }`}>
                        {applied ? 'Inserido ✓' : 'Inserir'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      <BlogCategoriesModal
        open={manageCategoriesOpen}
        onClose={() => { setManageCategoriesOpen(false); refetchCategories() }}
      />

      <BlogPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        post={{
          title, slug, contentHtml, coverImageUrl, metaTitle, metaDescription, status,
          category: categories.find(c => c.id === categoryId) || null,
          authorName: post?.author_name,
          publishedAt: post?.published_at,
          scheduledAt: scheduledAtSaved,
        }}
      />

      {zoomImageUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-6" onClick={() => setZoomImageUrl(null)}>
          <img src={zoomImageUrl} alt="" className="max-w-full max-h-full rounded-xl" onClick={e => e.stopPropagation()} />
          <button onClick={() => setZoomImageUrl(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
            <XIcon size={20} />
          </button>
        </div>
      )}
    </div>
  )
}
