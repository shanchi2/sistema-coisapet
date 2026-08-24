import { useState, useEffect, useRef } from 'react'
import { X, Upload, Trash2, Package, Tag, DollarSign, Ruler, FileText, Link, Check, Loader2, RefreshCw, Layers, Plus, Palette, Images } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

// ── Helpers ────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-')
}

function Field({ label, required, hint, error, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
        {label}
        {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
      {hint  && !error && <p className="text-[11px] text-slate-400">{hint}</p>}
      {error && <p className="text-[11px] text-rose-500">{error}</p>}
    </div>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <Icon size={13} className="text-slate-400"/>
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-4 flex flex-col gap-4">{children}</div>
    </div>
  )
}

// ── Modal principal ────────────────────────────────────────────────
export function ProductFormModal({ open, onClose, product, initial, categories = [], onSaved, onSave, loading: externalLoading = false }) {
  const isEditing = !!(product ?? initial)

  const EMPTY = {
    name: '', sku: '', slug: '', category_id: '',
    short_description: '', description: '', notes: '',
    price_shopee: '', price_ml: '', sale_price: '',
    url_shopee: '', url_ml: '',
    width_cm: '', height_cm: '', depth_cm: '', weight_g: '',
    active: true,
    is_kit: false,
  }

  const [form,       setForm]       = useState(EMPTY)
  const [errors,     setErrors]     = useState({})
  const [saving,     setSaving]     = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [photoUrl,   setPhotoUrl]   = useState(null)
  const [photoSrc,   setPhotoSrc]   = useState(null)
  const [slugAuto,   setSlugAuto]   = useState(true)
  // Estados para variações
  const [varTypes,   setVarTypes]   = useState([])   // tipos: Cor, Tamanho, etc.
  const [varOptions, setVarOptions] = useState({})   // type_id → [options]
  const [selectedVars, setSelectedVars] = useState({}) // type_id → option_id
  const fileRef    = useRef()
  const galleryRef = useRef()
  const [gallery,      setGallery]      = useState([])
  const [uploadingGal, setUploadingGal] = useState(false)
  // Estados para Kit (composição)
  const [kitComponents, setKitComponents] = useState([]) // [{product_id, name, sku, photo_url, qty}]
  const [kitSearch,     setKitSearch]     = useState('')
  const [allProducts,   setAllProducts]   = useState([])

  // Carrega tipos e opções de variação
  useEffect(() => {
    async function loadVarData() {
      const { data: types } = await supabase
        .from('product_variation_types')
        .select('id, name, sort_order')
        .order('sort_order')
      setVarTypes(types || [])

      const { data: opts } = await supabase
        .from('product_variation_options')
        .select('id, value, type_id')
        .order('value')
      if (opts) {
        const grouped = {}
        opts.forEach(o => {
          if (!grouped[o.type_id]) grouped[o.type_id] = []
          grouped[o.type_id].push(o)
        })
        setVarOptions(grouped)
      }
    }
    loadVarData()
  }, [])

  // Carrega variações atuais do produto ao abrir para edição
  useEffect(() => {
    async function loadProductVars() {
      const prod = product ?? initial
      if (!prod?.id || !open) return
      const { data } = await supabase
        .from('product_variations')
        .select(`id, product_variation_option_links(option_id, product_variation_options(id, value, type_id))`)
        .eq('product_id', prod.id)
        .maybeSingle()  // retorna null se não existir, sem erro 406
      if (data) {
        const selected = {}
        data.product_variation_option_links?.forEach(link => {
          const opt = link.product_variation_options
          if (opt) selected[opt.type_id] = opt.id
        })
        setSelectedVars(selected)
      } else {
        setSelectedVars({})
      }
    }
    loadProductVars()
  }, [open, product, initial])

  // Inicializa form ao abrir
  useEffect(() => {
    if (!open) return
    const prod = product ?? initial  // aceita ambas as props
    if (prod) {
      setForm({
        name:              prod.name             ?? '',
        sku:               prod.sku              ?? '',
        slug:              prod.slug             ?? '',
        category_id:       prod.category_id      ?? '',
        short_description: prod.short_description?? '',
        description:       prod.description      ?? '',
        price_shopee:      prod.price_shopee     ?? '',
        price_ml:          prod.price_ml         ?? '',
        sale_price:        prod.sale_price       ?? '',
        url_shopee:        prod.url_shopee       ?? '',
        url_ml:            prod.url_ml           ?? '',
        width_cm:          prod.width_cm         ?? '',
        height_cm:         prod.height_cm        ?? '',
        depth_cm:          prod.depth_cm         ?? '',
        weight_g:          prod.weight_g         ?? '',
        notes:             prod.notes            ?? '',
        active:            prod.active           ?? true,
        is_kit:            prod.is_kit           ?? false,
      })
      setPhotoUrl(prod.photo_url ?? null)
      setSlugAuto(!prod.slug)
      loadPhotoPreview(prod.photo_url)
    } else {
      setForm(EMPTY)
      setPhotoUrl(null)
      setPhotoSrc(null)
      setSlugAuto(true)
    }
    setErrors({})
  }, [open, product])

  // Carrega tipos e opções de variação
  useEffect(() => {
    async function loadVarData() {
      const { data: types } = await supabase.from('product_variation_types').select('id,name,sort_order').order('sort_order')
      setVarTypes(types || [])
      const { data: opts } = await supabase.from('product_variation_options').select('id,value,type_id').order('value')
      if (opts) {
        const grouped = {}
        opts.forEach(o => { if (!grouped[o.type_id]) grouped[o.type_id] = []; grouped[o.type_id].push(o) })
        setVarOptions(grouped)
      }
    }
    loadVarData()
  }, [])

  // Carrega variações e galeria do produto ao abrir edição
  useEffect(() => {
    ;(async () => {
      const prod = product ?? initial
      if (!prod?.id || !open) return
      const { data: pv } = await supabase.from('product_variations')
        .select('id,product_variation_option_links(option_id,product_variation_options(id,value,type_id))')
        .eq('product_id', prod.id).maybeSingle()
      if (pv) {
        const sel = {}
        pv.product_variation_option_links?.forEach(link => {
          const opt = link.product_variation_options
          if (opt) sel[opt.type_id] = opt.id
        })
        setSelectedVars(sel)
      } else { setSelectedVars({}) }
      const { data: galData } = await supabase.from('product_images').select('*').eq('product_id', prod.id).order('sort_order')
      if (galData && galData.length > 0) {
        const galWithSrc = await Promise.all(galData.map(async g => {
          const { data: s } = await supabase.storage.from('product-photos').createSignedUrl(g.photo_url, 3600)
          return { ...g, src: s?.signedUrl || null }
        }))
        setGallery(galWithSrc)
      } else { setGallery([]) }
    })()
  }, [open, product, initial])

  // Carrega produtos disponíveis pro picker de Kit (só produtos individuais, ativos)
  useEffect(() => {
    async function loadAllProducts() {
      const { data } = await supabase.from('products').select('id,name,sku,photo_url,is_kit').eq('active', true).order('name')
      setAllProducts((data || []).filter(p => !p.is_kit))
    }
    loadAllProducts()
  }, [])

  // Carrega a composição do kit ao abrir pra edição
  useEffect(() => {
    async function loadKitItems() {
      const prod = product ?? initial
      if (!prod?.id || !open || !prod.is_kit) { setKitComponents([]); return }
      const { data } = await supabase.from('kit_items')
        .select('component_product_id, qty, component:products!component_product_id(id,name,sku,photo_url)')
        .eq('kit_product_id', prod.id).order('sort_order')
      setKitComponents((data || []).map(k => ({
        product_id: k.component_product_id,
        name: k.component?.name, sku: k.component?.sku, photo_url: k.component?.photo_url,
        qty: k.qty,
      })))
    }
    loadKitItems()
    if (!open) { setKitSearch(''); }
  }, [open, product, initial])

  function toggleKitComponent(p) {
    setKitComponents(prev => prev.some(c => c.product_id === p.id)
      ? prev.filter(c => c.product_id !== p.id)
      : [...prev, { product_id: p.id, name: p.name, sku: p.sku, photo_url: p.photo_url, qty: 1 }])
  }
  function setKitQty(productId, qty) {
    setKitComponents(prev => prev.map(c => c.product_id === productId ? { ...c, qty: Math.max(1, qty) } : c))
  }
  function removeKitComponent(productId) {
    setKitComponents(prev => prev.filter(c => c.product_id !== productId))
  }
  const currentProdId = (product ?? initial)?.id
  const filteredKitProducts = kitSearch.trim()
    ? allProducts.filter(p => p.id !== currentProdId && p.name.toLowerCase().includes(kitSearch.toLowerCase()))
    : []
  // Auto-slug enquanto slugAuto = true
  useEffect(() => {
    if (slugAuto && form.name) {
      setForm(f => ({ ...f, slug: slugify(f.name) }))
    }
  }, [form.name, slugAuto])

  async function loadPhotoPreview(path) {
    if (!path) return setPhotoSrc(null)
    const { data } = await supabase.storage.from('product-photos').createSignedUrl(path, 3600)
    setPhotoSrc(data?.signedUrl ?? null)
  }

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: null }))
  }

  // ── Upload de foto ─────────────────────────────────────────────
  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('Máx 10 MB'); return }

    setUploading(true)
    try {
      // Remove foto anterior se existia
      if (photoUrl) await supabase.storage.from('product-photos').remove([photoUrl])

      const ext  = file.name.split('.').pop()
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('product-photos').upload(path, file)
      if (error) throw error

      setPhotoUrl(path)
      const { data: signed } = await supabase.storage.from('product-photos').createSignedUrl(path, 3600)
      setPhotoSrc(signed?.signedUrl ?? null)
      toast.success('Foto enviada!')
    } catch (err) {
      toast.error('Erro no upload: ' + err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleGalleryUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploadingGal(true)
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) { toast.error('Máx 10 MB'); continue }
        const ext  = file.name.split('.').pop()
        const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from('product-photos').upload(path, file)
        if (error) throw error
        const { data: s } = await supabase.storage.from('product-photos').createSignedUrl(path, 3600)
        setGallery(prev => [...prev, { id: null, photo_url: path, src: s?.signedUrl || null, sort_order: prev.length }])
      }
      toast.success('Foto(s) adicionada(s)!')
    } catch (err) { toast.error('Erro: ' + err.message) }
    finally { setUploadingGal(false); e.target.value = '' }
  }

  async function removeGalleryPhoto(idx) {
    const item = gallery[idx]
    if (item?.photo_url) {
      await supabase.storage.from('product-photos').remove([item.photo_url])
      if (item.id) await supabase.from('product_images').delete().eq('id', item.id)
    }
    setGallery(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveGallery(productId) {
    const newPhotos = gallery.filter(g => !g.id)
    for (let i = 0; i < newPhotos.length; i++) {
      await supabase.from('product_images').insert({
        product_id: productId, photo_url: newPhotos[i].photo_url,
        sort_order: gallery.indexOf(newPhotos[i]),
      })
    }
    for (const g of gallery.filter(g => g.id)) {
      await supabase.from('product_images').update({ sort_order: gallery.indexOf(g) }).eq('id', g.id)
    }
  }

  async function removePhoto() {
    if (photoUrl) await supabase.storage.from('product-photos').remove([photoUrl])
    setPhotoUrl(null); setPhotoSrc(null); setGallery([]); setSelectedVars({})
  }

  // ── Validação ──────────────────────────────────────────────────
  function validate() {
    const e = {}
    if (!form.name.trim())  e.name = 'Nome obrigatório'
    if (!form.slug.trim())  e.slug = 'Slug obrigatório'
    if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = 'Só letras minúsculas, números e hífens'
    return e
  }

  // ── Salvar ─────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      const payload = {
        name:               form.name.trim(),
        sku:                form.sku.trim()  || null,
        slug:               form.slug.trim(),
        category_id:        form.category_id || null,
        short_description:  form.short_description.trim() || null,
        description:        form.description.trim()       || null,
        price_shopee:       form.price_shopee !== '' ? parseFloat(form.price_shopee) : null,
        price_ml:           form.price_ml     !== '' ? parseFloat(form.price_ml)     : null,
        sale_price:         form.sale_price   !== '' ? parseFloat(form.sale_price)   : 0,
        url_shopee:         form.url_shopee.trim() || null,
        url_ml:             form.url_ml.trim()     || null,
        width_cm:           form.width_cm  !== '' ? parseFloat(form.width_cm)  : null,
        height_cm:          form.height_cm !== '' ? parseFloat(form.height_cm) : null,
        depth_cm:           form.depth_cm  !== '' ? parseFloat(form.depth_cm)  : null,
        weight_g:           form.weight_g  !== '' ? parseFloat(form.weight_g)  : null,
        photo_url:          photoUrl || null,
        notes:              form.notes.trim() || null,
        active:             form.active,
        is_kit:             form.is_kit,
      }

      // Se o ProductsPage passou onSave (hook), delega para ele — padrão antigo
      // ── 1. Salva o produto ─────────────────────────────
      let savedProdId = null
      if (typeof onSave === 'function') {
        await onSave(payload)
        savedProdId = isEditing ? (product ?? initial).id : null
      } else {
        const { data: savedData, error } = isEditing
          ? await supabase.from('products').update(payload).eq('id', (product ?? initial).id).select('id').maybeSingle()
          : await supabase.from('products').insert(payload).select('id').maybeSingle()
        if (error) {
          if (error.code === '23505' && error.message.includes('slug')) setErrors({ slug: 'Este slug já está em uso' })
          else if (error.code === '23505' && error.message.includes('sku')) setErrors({ sku: 'Este SKU já está em uso' })
          else toast.error('Erro ao salvar: ' + error.message)
          return
        }
        savedProdId = isEditing ? (product ?? initial).id : savedData?.id
      }

      // ── 2. Salva galeria ────────────────────────────────
      if (savedProdId) await saveGallery(savedProdId)

      // ── 2b. Salva (ou limpa) a composição do Kit ─────────
      if (savedProdId) {
        await supabase.from('kit_items').delete().eq('kit_product_id', savedProdId)
        if (form.is_kit && kitComponents.length > 0) {
          const { error: kitErr } = await supabase.from('kit_items').insert(
            kitComponents.map((c, i) => ({
              kit_product_id: savedProdId, component_product_id: c.product_id, qty: c.qty, sort_order: i,
            }))
          )
          if (kitErr) toast.error('Produto salvo, mas houve erro ao salvar a composição do kit: ' + kitErr.message)
        }
      }

      // ── 3. Salva variações ──────────────────────────────
      const validVarEntries = Object.entries(selectedVars).filter(([, optId]) => !!optId)

      if (savedProdId) {
        // Busca ou cria o product_variation deste produto
        // .maybeSingle() retorna null sem erro se não existir (diferente de .single() que dá 406)
        let { data: existingVar } = await supabase
          .from('product_variations')
          .select('id')
          .eq('product_id', savedProdId)
          .maybeSingle()

        let varId = existingVar?.id

        if (!varId && validVarEntries.length > 0) {
          // Só cria o product_variation se tiver ao menos 1 variação selecionada
          const { data: newVar } = await supabase
            .from('product_variations')
            .insert({ product_id: savedProdId, sku: payload.sku, active: true })
            .select('id')
            .maybeSingle()
          varId = newVar?.id
        }

        if (varId) {
          // Sempre limpa os links antigos
          await supabase
            .from('product_variation_option_links')
            .delete()
            .eq('variation_id', varId)

          // Insere os novos links (só se tiver variações selecionadas)
          if (validVarEntries.length > 0) {
            const links = validVarEntries.map(([, option_id]) => ({ variation_id: varId, option_id }))
            const { error: linkError } = await supabase
              .from('product_variation_option_links')
              .insert(links)
            if (linkError) console.error('Erro ao salvar links de variação:', linkError)
          }
        }
      }

      toast.success(isEditing ? 'Produto atualizado!' : 'Produto cadastrado!')
      onSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mb-6">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
              <Package size={17} className="text-violet-600"/>
            </div>
            <div>
              <h2 className="font-bold text-slate-800">
                {isEditing ? 'Editar produto' : 'Novo produto'}
              </h2>
              <p className="text-xs text-slate-400">{isEditing ? (product ?? initial)?.name : 'Preencha os dados do produto'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={18}/>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">

          {/* ── 1. IDENTIDADE ─────────────────────────────────── */}
          <Section icon={Package} title="Identidade">
            <Field label="Tipo de produto" hint={form.is_kit ? 'Este produto é composto por outros produtos do catálogo' : 'Produto cadastrado normalmente, com ficha técnica própria'}>
              <select className="select" value={form.is_kit ? 'kit' : 'individual'}
                onChange={e => set('is_kit', e.target.value === 'kit')}>
                <option value="individual">Produto individual</option>
                <option value="kit">Kit (composto por outros produtos)</option>
              </select>
            </Field>
            <div className="grid grid-cols-[1fr_160px] gap-4">
              <Field label="Nome do produto" required error={errors.name}>
                <input className={`input ${errors.name ? 'border-rose-400' : ''}`}
                  placeholder="Ex: Terrário Hamster G 60x40x40"
                  value={form.name} onChange={e => set('name', e.target.value)}/>
              </Field>
              <Field label="SKU" hint="Padrão: CP-TIPO-0001" error={errors.sku}>
                <input className={`input font-mono text-sm ${errors.sku ? 'border-rose-400' : ''}`}
                  placeholder="CP-TER-0001"
                  value={form.sku} onChange={e => set('sku', e.target.value.toUpperCase())}/>
              </Field>
            </div>

            {/* Slug */}
            <Field label="Slug (URL)" required hint={`coisapet.com.br/${form.slug || 'slug-do-produto'}`} error={errors.slug}>
              <div className="flex gap-2">
                <input className={`input flex-1 font-mono text-sm ${errors.slug ? 'border-rose-400' : ''}`}
                  placeholder="terrario-hamster-g"
                  value={form.slug}
                  onChange={e => { setSlugAuto(false); set('slug', e.target.value.toLowerCase().replace(/\s+/g,'-')) }}/>
                <button type="button" title="Regenerar pelo nome"
                  onClick={() => { setSlugAuto(true); setForm(f => ({...f, slug: slugify(f.name)})) }}
                  className="px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors">
                  <RefreshCw size={14}/>
                </button>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Categoria">
                <select className="select" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                  <option value="">Sem categoria</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="select" value={form.active ? 'true' : 'false'}
                  onChange={e => set('active', e.target.value === 'true')}>
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* ── 2. DESCRIÇÃO ──────────────────────────────────── */}
          <Section icon={FileText} title="Descrição">
            <Field label="Chamada curta" hint="Aparece na listagem de produtos (máx. 160 caracteres)">
              <input className="input" placeholder="Terrário de alto padrão para hamsters e roedores de médio porte."
                maxLength={160}
                value={form.short_description} onChange={e => set('short_description', e.target.value)}/>
              <p className="text-[11px] text-slate-400 text-right">{form.short_description.length}/160</p>
            </Field>
            <Field label="Descrição completa" hint="Aparece na página do produto (PDP). Pode ser copiada da Shopee/ML.">
              <textarea className="input resize-none" rows={5}
                placeholder="Descreva o produto em detalhes: materiais, diferenciais, indicações de uso..."
                value={form.description} onChange={e => set('description', e.target.value)}/>
            </Field>
            <Field label="Variações / Observações" hint="Ex: Cor: Marrom, Tamanho: G — aparece no dropdown de pedidos">
              <input className="input"
                placeholder="Ex: Cor: Marrom | Tamanho: G | Com acessórios"
                value={form.notes} onChange={e => set('notes', e.target.value)}/>
            </Field>
          </Section>

          {/* ── 3. FICHA TÉCNICA ──────────────────────────────── */}
          {!form.is_kit && (
          <Section icon={Ruler} title="Ficha técnica — dimensões">
            <div className="grid grid-cols-4 gap-3">
              <Field label="Largura (cm)" hint="obrigatório">
                <input type="number" step="0.01" min="0" className="input"
                  placeholder="60" value={form.width_cm} onChange={e => set('width_cm', e.target.value)}/>
              </Field>
              <Field label="Altura (cm)" hint="obrigatório">
                <input type="number" step="0.01" min="0" className="input"
                  placeholder="40" value={form.height_cm} onChange={e => set('height_cm', e.target.value)}/>
              </Field>
              <Field label="Profundidade (cm)" hint="opcional">
                <input type="number" step="0.01" min="0" className="input"
                  placeholder="40" value={form.depth_cm} onChange={e => set('depth_cm', e.target.value)}/>
              </Field>
              <Field label="Peso (g)" hint="opcional">
                <input type="number" step="1" min="0" className="input"
                  placeholder="850" value={form.weight_g} onChange={e => set('weight_g', e.target.value)}/>
              </Field>
            </div>
            {/* Preview da dimensão */}
            {(form.width_cm || form.height_cm) && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                <Ruler size={13} className="text-slate-400"/>
                <span className="text-xs text-slate-600 font-medium">
                  {[form.width_cm, form.height_cm, form.depth_cm].filter(Boolean).join(' × ')} cm
                  {form.weight_g ? ` · ${form.weight_g}g` : ''}
                </span>
              </div>
            )}
          </Section>
          )}

          {/* ── 4. PREÇOS E LINKS ─────────────────────────────── */}
          <Section icon={DollarSign} title="Preços e marketplaces">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Preço Shopee (R$)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" className="input pl-8"
                    placeholder="0,00" value={form.price_shopee} onChange={e => set('price_shopee', e.target.value)}/>
                </div>
              </Field>
              <Field label="Preço Mercado Livre (R$)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" className="input pl-8"
                    placeholder="0,00" value={form.price_ml} onChange={e => set('price_ml', e.target.value)}/>
                </div>
              </Field>
              <Field label="Preço base (R$)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" className="input pl-8"
                    placeholder="0,00" value={form.sale_price} onChange={e => set('sale_price', e.target.value)}/>
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Link Shopee">
                <div className="relative">
                  <Link size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input className="input pl-8 text-sm" placeholder="https://shopee.com.br/..."
                    value={form.url_shopee} onChange={e => set('url_shopee', e.target.value)}/>
                </div>
              </Field>
              <Field label="Link Mercado Livre">
                <div className="relative">
                  <Link size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input className="input pl-8 text-sm" placeholder="https://produto.mercadolivre.com.br/..."
                    value={form.url_ml} onChange={e => set('url_ml', e.target.value)}/>
                </div>
              </Field>
            </div>
          </Section>

          {/* ── COMPOSIÇÃO DO KIT ─────────────────────────────── */}
          {form.is_kit && (
            <Section icon={Layers} title="Composição do Kit">
              <p className="text-xs text-slate-400">
                Busque e marque quais produtos fazem parte deste kit. Isso vai aparecer pro pessoal da Expedição na hora de separar o pedido.
              </p>
              <div className="relative">
                <input className="input" placeholder="Buscar produto pra adicionar ao kit..."
                  value={kitSearch} onChange={e => setKitSearch(e.target.value)} />
              </div>
              {filteredKitProducts.length > 0 && (
                <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-50">
                  {filteredKitProducts.slice(0, 20).map(p => {
                    const isSel = kitComponents.some(c => c.product_id === p.id)
                    return (
                      <button key={p.id} type="button" onClick={() => toggleKitComponent(p)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 ${isSel ? 'bg-violet-50/60' : ''}`}>
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${isSel ? 'bg-violet-500 border-violet-500' : 'border-slate-300'}`}>
                          {isSel && <Check size={11} className="text-white" />}
                        </div>
                        <span className="text-sm text-slate-700 flex-1 truncate">{p.name}</span>
                        {p.sku && <span className="text-[10px] font-mono text-slate-400 shrink-0">{p.sku}</span>}
                      </button>
                    )
                  })}
                </div>
              )}

              {kitComponents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-3">Nenhum produto adicionado ainda ao kit.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Itens do kit ({kitComponents.length})</p>
                  {kitComponents.map(c => (
                    <div key={c.product_id} className="flex items-center gap-2.5 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                      <span className="text-sm font-medium text-slate-700 flex-1 truncate">{c.name}</span>
                      {c.sku && <span className="text-[10px] font-mono text-slate-400 shrink-0">{c.sku}</span>}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => setKitQty(c.product_id, c.qty - 1)}
                          className="w-6 h-6 rounded-lg bg-white border border-slate-200 text-slate-500 font-bold text-xs flex items-center justify-center">−</button>
                        <span className="w-6 text-center text-sm font-bold text-slate-700">{c.qty}</span>
                        <button type="button" onClick={() => setKitQty(c.product_id, c.qty + 1)}
                          className="w-6 h-6 rounded-lg bg-white border border-slate-200 text-slate-500 font-bold text-xs flex items-center justify-center">+</button>
                      </div>
                      <button type="button" onClick={() => removeKitComponent(c.product_id)} className="text-rose-400 hover:text-rose-600 shrink-0">
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ── 5. FOTO ───────────────────────────────────────── */}
          <Section icon={Tag} title="Foto principal">
            <div className="flex items-start gap-4">
              {/* Preview */}
              <div className="w-28 h-28 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 relative">
                {uploading && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-violet-500"/>
                  </div>
                )}
                {photoSrc
                  ? <img src={photoSrc} alt="preview" className="w-full h-full object-contain p-1"/>
                  : <Package size={32} className="text-slate-300"/>
                }
              </div>
              {/* Ações */}
              <div className="flex flex-col gap-2 flex-1">
                <p className="text-xs text-slate-500">JPG, PNG ou WebP · Máx 10 MB</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto}/>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600 disabled:opacity-50">
                    <Upload size={14}/>
                    {photoSrc ? 'Trocar foto' : 'Enviar foto'}
                  </button>
                  {photoSrc && (
                    <button type="button" onClick={removePhoto}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors text-rose-500">
                      <Trash2 size={14}/>
                      Remover
                    </button>
                  )}
                </div>
                {photoUrl && (
                  <p className="text-[11px] text-slate-400 font-mono truncate">{photoUrl}</p>
                )}
              </div>
            </div>
          </Section>

          {/* ── 6. VARIAÇÕES ─────────────────────────────────── */}
          {varTypes.length > 0 && (
            <Section icon={Layers} title="Variações">
              <p className="text-xs text-slate-400">
                Selecione as variações deste produto específico (ex: Cor: Branco, Tamanho: G).
                Para adicionar novas opções, acesse a página de Variações.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {varTypes.map(type => {
                  const opts = varOptions[type.id] || []
                  const selectedId = selectedVars[type.id] || ''
                  return (
                    <Field key={type.id} label={type.name}>
                      <select
                        className="select"
                        value={selectedId}
                        onChange={e => setSelectedVars(prev => ({
                          ...prev,
                          [type.id]: e.target.value || undefined,
                        }))}
                      >
                        <option value="">— Sem {type.name.toLowerCase()} —</option>
                        {opts.map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.value}</option>
                        ))}
                      </select>
                    </Field>
                  )
                })}
              </div>
              {/* Preview das variações selecionadas */}
              {Object.keys(selectedVars).filter(tid => selectedVars[tid]).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {varTypes.map(type => {
                    const optId = selectedVars[type.id]
                    if (!optId) return null
                    const opt = (varOptions[type.id] || []).find(o => o.id === optId)
                    if (!opt) return null
                    return (
                      <span key={type.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 border border-violet-200 text-violet-700">
                        <Palette size={9} />
                        {type.name}: {opt.value}
                        <button
                          type="button"
                          onClick={() => setSelectedVars(prev => { const n={...prev}; delete n[type.id]; return n })}
                          className="ml-0.5 hover:text-violet-900"
                        >×</button>
                      </span>
                    )
                  })}
                </div>
              )}
            </Section>
          )}

          {/* ── 6. GALERIA ───────────────────────────────────── */}
          <Section icon={Images} title="Galeria de Fotos">
            <p className="text-xs text-slate-400">Fotos extras do produto — aparecem na página do produto no site.</p>
            {gallery.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {gallery.map((img, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 group">
                    {img.src ? <img src={img.src} alt="" className="w-full h-full object-cover"/> : <Package size={24} className="text-slate-300 absolute inset-0 m-auto"/>}
                    <button type="button" onClick={() => removeGalleryPhoto(idx)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={10} strokeWidth={2.5}/>
                    </button>
                    <span className="absolute bottom-1 left-1 text-[9px] bg-black/40 text-white px-1 rounded">{idx + 1}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload}/>
              <button type="button" onClick={() => galleryRef.current?.click()} disabled={uploadingGal}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600 disabled:opacity-50">
                {uploadingGal ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
                {uploadingGal ? 'Enviando...' : 'Adicionar fotos'}
              </button>
              <p className="text-xs text-slate-400">Múltiplas · Máx 10 MB cada</p>
            </div>
          </Section>

          {/* ── 7. VARIAÇÕES ─────────────────────────────────── */}
          {varTypes.length > 0 && (
            <Section icon={Layers} title="Variações">
              <p className="text-xs text-slate-400">Selecione as variações deste produto (ex: Cor: Branco, Tamanho: G).</p>
              <div className="grid grid-cols-2 gap-3">
                {varTypes.map(type => {
                  const opts = varOptions[type.id] || []
                  const selectedId = selectedVars[type.id] || ''
                  return (
                    <div key={type.id} className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-600">{type.name}</label>
                      <select className="select" value={selectedId}
                        onChange={e => setSelectedVars(prev => ({ ...prev, [type.id]: e.target.value || undefined }))}>
                        <option value="">— Sem {type.name.toLowerCase()} —</option>
                        {opts.map(opt => <option key={opt.id} value={opt.id}>{opt.value}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>
              {Object.keys(selectedVars).filter(tid => selectedVars[tid]).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {varTypes.map(type => {
                    const optId = selectedVars[type.id]
                    if (!optId) return null
                    const opt = (varOptions[type.id] || []).find(o => o.id === optId)
                    if (!opt) return null
                    return (
                      <span key={type.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 border border-violet-200 text-violet-700">
                        <Palette size={9}/> {type.name}: {opt.value}
                        <button type="button" onClick={() => setSelectedVars(prev => { const n={...prev}; delete n[type.id]; return n })} className="ml-0.5 hover:text-violet-900">×</button>
                      </span>
                    )
                  })}
                </div>
              )}
            </Section>
          )}

          {/* ── Footer ────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              disabled={saving}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || uploading || externalLoading}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors disabled:opacity-60">
              {saving
                ? <><Loader2 size={15} className="animate-spin"/> Salvando…</>
                : <><Check size={15}/> {isEditing ? 'Salvar alterações' : 'Cadastrar produto'}</>
              }
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}