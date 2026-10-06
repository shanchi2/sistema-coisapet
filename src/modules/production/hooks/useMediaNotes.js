import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { compressImage } from '../../shopee-insights/hooks/useShopeeReturns'

// Observações do produto na Atualização de Mídia (06/10, fase98) — um
// histórico de relatos com texto + fotos/vídeos, autor/data e
// aberto/resolvido. Ex.: "Isa relatou um vão entre a plataforma e as
// escadas" → produção (Vini) revisa o projeto e marca resolvido.
// Mídias no bucket público `media-notes` (nome aleatório).

const BUCKET = 'media-notes'
export const notePublicUrl = path => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

export function useMediaNotes(productId) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!productId) return
    const { data, error } = await supabase.from('product_media_notes')
      .select('*').eq('product_id', productId).order('created_at', { ascending: false })
    if (!error) setNotes(data || [])
    setLoading(false)
  }, [productId])
  useEffect(() => { setLoading(true); load() }, [load])

  // Sobe as mídias e cria o relato
  const addNote = useCallback(async (body, files, onProgress) => {
    const media = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      onProgress?.(i + 1, files.length)
      const isVideo = (f.type || '').startsWith('video/')
      let blob = f, ext = (f.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase(), type = f.type
      if (!isVideo) ({ blob, ext, type } = await compressImage(f))
      const path = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type || undefined })
      if (error) throw new Error(`Falha ao enviar ${f.name}: ${error.message}`)
      media.push({ path, type: isVideo ? 'video' : 'image', name: f.name })
    }
    const me = getSession()
    const { error } = await supabase.from('product_media_notes').insert({
      product_id: productId, body: body.trim(), media,
      created_by: me.id || null, created_by_name: me.name || null,
    })
    if (error) throw error
    await load()
  }, [productId, load])

  const setStatus = useCallback(async (note, status) => {
    const me = getSession()
    const { error } = await supabase.from('product_media_notes').update(
      status === 'resolvido'
        ? { status, resolved_at: new Date().toISOString(), resolved_by_name: me.name || null }
        : { status, resolved_at: null, resolved_by_name: null },
    ).eq('id', note.id)
    if (error) throw error
    await load()
  }, [load])

  const removeNote = useCallback(async note => {
    const paths = (note.media || []).map(m => m.path)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    const { error } = await supabase.from('product_media_notes').delete().eq('id', note.id)
    if (error) throw error
    await load()
  }, [load])

  return { notes, loading, addNote, setStatus, removeNote }
}
