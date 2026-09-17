import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { getSignedUrl, invalidateSignedUrl } from '../../../lib/signedUrlCache'
import toast from 'react-hot-toast'

// Referências visuais dos 9 checks (guias prontos separados pelo
// Raphael — Kit, Substrato, Banheirinha, Rodinha, Terrário — uma imagem
// por exemplo, até 5 por check). Não são por produto — são as mesmas em
// qualquer tela do módulo, e dificilmente mudam. Cache em módulo (fora
// do hook): busca 1x por sessão, todo produto que abrir depois reaproveita
// sem bater no banco/storage de novo — só invalida quando alguém sobe ou
// remove uma referência de verdade.
let cachedBySlot = null

async function fetchAndGroup() {
  const { data, error } = await supabase
    .from('media_guide_examples')
    .select('id, image_url, title, check_slot, sort_order')
    .not('check_slot', 'is', null)
    .order('sort_order')

  if (error) throw error

  const withSrc = await Promise.all((data ?? []).map(async ex => ({
    ...ex, src: await getSignedUrl('product-photos', ex.image_url),
  })))

  const grouped = {}
  withSrc.forEach(ex => {
    if (!grouped[ex.check_slot]) grouped[ex.check_slot] = []
    grouped[ex.check_slot].push(ex)
  })
  return grouped
}

export function useGuideExamples() {
  const [bySlot,  setBySlot]  = useState(cachedBySlot || {})
  const [loading, setLoading] = useState(!cachedBySlot)

  const load = useCallback(async (force = false) => {
    if (cachedBySlot && !force) { setBySlot(cachedBySlot); setLoading(false); return }
    setLoading(true)
    try {
      cachedBySlot = await fetchAndGroup()
      setBySlot(cachedBySlot)
    } catch (err) {
      toast.error('Erro ao carregar exemplos.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function uploadToSlot(slot, files) {
    const current = cachedBySlot?.[slot]?.length || 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: máx 10 MB.`); continue }
      try {
        const ext  = file.name.split('.').pop()
        const path = `guide-examples/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from('product-photos').upload(path, file)
        if (upErr) throw upErr
        const { error } = await supabase.from('media_guide_examples')
          .insert({ image_url: path, title: file.name, check_slot: slot, sort_order: current + i })
        if (error) throw error
      } catch (err) {
        toast.error('Erro no upload: ' + err.message)
        console.error(err)
      }
    }
    await load(true)
  }

  async function removeExample(id) {
    const item = Object.values(cachedBySlot || {}).flat().find(e => e.id === id)
    if (!item) return
    try {
      await supabase.storage.from('product-photos').remove([item.image_url])
      await supabase.from('media_guide_examples').delete().eq('id', id)
      invalidateSignedUrl('product-photos', item.image_url)
      await load(true)
    } catch (err) {
      toast.error('Erro ao remover: ' + err.message)
      console.error(err)
    }
  }

  return { bySlot, loading, uploadToSlot, removeExample }
}
