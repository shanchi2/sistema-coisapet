import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

const CHECK_COUNT = 9

// ── Lista (tela principal) ──────────────────────────────────────────
// Carrega produtos ativos + progresso agregado (quantas das 9 fotos já
// existem + se já tem vídeo) e agrupa variações usando parent_product_id,
// mesma lógica de agrupamento da tela de Produtos (ProductsPage.jsx).
export function useMediaProductsList() {
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const [{ data: prods, error: pErr }, { data: images, error: iErr }, { data: media, error: mErr }] = await Promise.all([
      supabase.from('products')
        .select('id, name, sku, photo_url, parent_product_id, group_id')
        .eq('active', true)
        .eq('is_sellable', true) // Produto principal (fase64) nunca é fotografado — nunca aparece aqui.
        .order('name'),
      supabase.from('product_images')
        .select('product_id, check_slot')
        .not('check_slot', 'is', null),
      supabase.from('product_media_status')
        .select('product_id, video_url, feedback_montagem, is_priority, prioritized_at'),
    ])

    if (pErr || iErr || mErr) {
      toast.error('Erro ao carregar produtos.')
      console.error(pErr || iErr || mErr)
      setLoading(false)
      return
    }

    const checksByProduct = {}
    ;(images ?? []).forEach(img => {
      checksByProduct[img.product_id] = (checksByProduct[img.product_id] || 0) + 1
    })
    const mediaByProduct = {}
    ;(media ?? []).forEach(m => { mediaByProduct[m.product_id] = m })

    setProducts((prods ?? []).map(p => ({
      ...p,
      checksFilled: checksByProduct[p.id] || 0,
      hasVideo: !!mediaByProduct[p.id]?.video_url,
      hasFeedback: mediaByProduct[p.id]?.feedback_montagem !== undefined && mediaByProduct[p.id]?.feedback_montagem !== null,
      isPriority: !!mediaByProduct[p.id]?.is_priority,
      prioritizedAt: mediaByProduct[p.id]?.prioritized_at || null,
    })))
    setLoading(false)
  }, [])

  // Marca/desmarca prioridade da semana — otimista (não espera o round-trip
  // pra atualizar a tela, mesmo padrão do updateField do hook de detalhe).
  async function togglePriority(productId, next) {
    setProducts(prev => prev.map(p => p.id === productId
      ? { ...p, isPriority: next, prioritizedAt: next ? new Date().toISOString() : null }
      : p))

    const { error } = await supabase.from('product_media_status')
      .upsert({ product_id: productId, is_priority: next, prioritized_at: next ? new Date().toISOString() : null }, { onConflict: 'product_id' })

    if (error) {
      toast.error('Erro ao salvar prioridade.')
      console.error(error)
      await fetch()
    }
  }

  useEffect(() => { fetch() }, [fetch])

  // Agrupa variações por `parent_product_id` — key comum é o id do
  // produto principal (fase64) quando a família foi migrada, ou o id
  // do próprio mestre (padrão antigo) quando ainda não foi. Produto
  // principal nunca entra em `products` (filtrado na busca acima, ele
  // nunca é fotografado), então o "master" do card sempre é uma
  // variação de verdade, rastreável — só o agrupamento em si muda.
  const groups = useMemo(() => {
    const map = new Map()
    products.forEach(p => {
      const key = p.parent_product_id || p.id
      if (!map.has(key)) map.set(key, { key, master: p, variations: [], isGroup: false })
      else map.get(key).variations.push(p)
    })
    map.forEach(g => { g.isGroup = g.variations.length > 0 })
    return Array.from(map.values())
  }, [products])

  const totals = useMemo(() => ({
    total:     products.length,
    completos: products.filter(p => p.checksFilled === CHECK_COUNT && p.hasVideo).length,
    pendentes: products.filter(p => p.checksFilled < CHECK_COUNT || !p.hasVideo).length,
    feedback:  products.filter(p => p.hasFeedback).length,
  }), [products])

  return { products, groups, totals, loading, refetch: fetch, togglePriority }
}

// ── Detalhe (checklist de 1 produto) ────────────────────────────────
export function useProductMediaDetail(productId) {
  const [product,  setProduct]  = useState(null)
  const [siblings, setSiblings] = useState([])
  const [checks,   setChecks]   = useState({}) // { [slot]: { id, photo_url, src } }
  const [media,    setMedia]    = useState(null) // linha de product_media_status (ou null)
  const [loading,  setLoading]  = useState(true)

  const fetch = useCallback(async () => {
    if (!productId) return
    setLoading(true)

    const { data: prod, error: prodErr } = await supabase
      .from('products')
      .select('id, name, sku, photo_url, parent_product_id, group_id, width_cm, height_cm, depth_cm, accessories_included, includes_wheel, wheel_diameter_cm, compatible_species')
      .eq('id', productId)
      .single()

    if (prodErr || !prod) {
      toast.error('Produto não encontrado.')
      console.error(prodErr)
      setLoading(false)
      return
    }

    const groupMasterId = prod.parent_product_id || prod.id
    const [{ data: sibs }, { data: images }, { data: mediaRow }] = await Promise.all([
      supabase.from('products')
        .select('id, name, sku, photo_url')
        .or(`id.eq.${groupMasterId},parent_product_id.eq.${groupMasterId}`)
        .eq('active', true)
        .eq('is_sellable', true) // Nunca lista o produto principal (fase64) como se fosse uma cor fotografável.
        .order('name'),
      supabase.from('product_images')
        .select('id, photo_url, check_slot')
        .eq('product_id', productId)
        .not('check_slot', 'is', null),
      supabase.from('product_media_status')
        .select('*')
        .eq('product_id', productId)
        .maybeSingle(),
    ])

    const checkMap = {}
    for (const img of images ?? []) {
      const { data: signed } = await supabase.storage.from('product-photos').createSignedUrl(img.photo_url, 3600)
      checkMap[img.check_slot] = { id: img.id, photo_url: img.photo_url, src: signed?.signedUrl || null }
    }

    let videoSrc = null
    if (mediaRow?.video_url) {
      const { data: signed } = await supabase.storage.from('product-videos').createSignedUrl(mediaRow.video_url, 3600)
      videoSrc = signed?.signedUrl || null
    }

    setProduct(prod)
    setSiblings(sibs ?? [])
    setChecks(checkMap)
    setMedia(mediaRow ? { ...mediaRow, videoSrc } : { product_id: productId, feedback_montagem: null, feedback_details: '', observations: '', video_url: null, videoSrc: null })
    setLoading(false)
  }, [productId])

  useEffect(() => { fetch() }, [fetch])

  async function uploadCheckPhoto(slot, file) {
    if (file.size > 10 * 1024 * 1024) { toast.error('Máx 10 MB.'); return }
    try {
      const existing = checks[slot]
      if (existing?.photo_url) await supabase.storage.from('product-photos').remove([existing.photo_url])

      const ext  = file.name.split('.').pop()
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('product-photos').upload(path, file)
      if (upErr) throw upErr

      if (existing?.id) {
        const { error } = await supabase.from('product_images').update({ photo_url: path }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('product_images')
          .insert({ product_id: productId, photo_url: path, check_slot: slot, sort_order: slot })
        if (error) throw error
      }

      const { data: signed } = await supabase.storage.from('product-photos').createSignedUrl(path, 3600)
      setChecks(prev => ({ ...prev, [slot]: { id: existing?.id, photo_url: path, src: signed?.signedUrl || null } }))
      await fetch() // pega o id novo se era insert
      toast.success('Foto enviada!')
    } catch (err) {
      toast.error('Erro no upload: ' + err.message)
      console.error(err)
    }
  }

  async function removeCheckPhoto(slot) {
    const existing = checks[slot]
    if (!existing) return
    try {
      await supabase.storage.from('product-photos').remove([existing.photo_url])
      if (existing.id) await supabase.from('product_images').delete().eq('id', existing.id)
      setChecks(prev => { const next = { ...prev }; delete next[slot]; return next })
      toast.success('Foto removida.')
    } catch (err) {
      toast.error('Erro ao remover: ' + err.message)
      console.error(err)
    }
  }

  async function uploadVideo(file) {
    if (file.size > 80 * 1024 * 1024) { toast.error('Máx 80 MB.'); return }
    try {
      if (media?.video_url) await supabase.storage.from('product-videos').remove([media.video_url])

      const ext  = file.name.split('.').pop()
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('product-videos').upload(path, file)
      if (upErr) throw upErr

      const { error } = await supabase.from('product_media_status')
        .upsert({ product_id: productId, video_url: path, video_uploaded_at: new Date().toISOString() }, { onConflict: 'product_id' })
      if (error) throw error

      const { data: signed } = await supabase.storage.from('product-videos').createSignedUrl(path, 3600)
      setMedia(prev => ({ ...prev, video_url: path, videoSrc: signed?.signedUrl || null }))
      toast.success('Vídeo enviado!')
    } catch (err) {
      toast.error('Erro no upload: ' + err.message)
      console.error(err)
    }
  }

  async function removeVideo() {
    if (!media?.video_url) return
    try {
      await supabase.storage.from('product-videos').remove([media.video_url])
      await supabase.from('product_media_status').update({ video_url: null, video_uploaded_at: null }).eq('product_id', productId)
      setMedia(prev => ({ ...prev, video_url: null, videoSrc: null }))
      toast.success('Vídeo removido.')
    } catch (err) {
      toast.error('Erro ao remover: ' + err.message)
      console.error(err)
    }
  }

  async function saveFeedback(value, details) {
    const patch = { feedback_montagem: value, feedback_details: details?.trim() || null }
    setMedia(prev => ({ ...prev, ...patch }))
    const { error } = await supabase.from('product_media_status').upsert({ product_id: productId, ...patch }, { onConflict: 'product_id' })
    if (error) { toast.error('Erro ao salvar.'); console.error(error); await fetch() }
  }

  async function saveNotes(value) {
    const patch = { observations: value?.trim() || null }
    setMedia(prev => ({ ...prev, ...patch }))
    const { error } = await supabase.from('product_media_status').upsert({ product_id: productId, ...patch }, { onConflict: 'product_id' })
    if (error) { toast.error('Erro ao salvar.'); console.error(error); await fetch() }
  }

  return {
    product, siblings, checks, media, loading,
    uploadCheckPhoto, removeCheckPhoto, uploadVideo, removeVideo, saveFeedback, saveNotes,
  }
}
