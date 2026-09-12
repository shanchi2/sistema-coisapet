import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

// Cada produto ATIVO aparece na lista mesmo sem nunca ter tido status
// definido — `media` vem `null` do LEFT JOIN (PostgREST embeda como
// array; pegamos o primeiro item) e a tela usa os defaults abaixo.
// Só grava uma linha em `product_media_status` na hora que alguém de
// fato muda algo pela primeira vez (`upsert`).
export const DEFAULT_MEDIA = {
  video_status: 'nao_iniciada',
  photo_status: 'nao_iniciada',
  video_forecast: null,
  feedback_montagem: null,
  feedback_details: '',
  observations: '',
  overall_status: 'pendente',
  updated_at: null,
}

export function useProductMediaStatus() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, photo_url, media:product_media_status(video_status, photo_status, video_forecast, feedback_montagem, feedback_details, observations, overall_status, updated_at)')
      .eq('active', true)
      .order('name')

    if (error) {
      toast.error('Erro ao carregar produtos.')
      console.error(error)
      setLoading(false)
      return
    }

    setRows((data ?? []).map(p => ({
      id: p.id, name: p.name, sku: p.sku, photo_url: p.photo_url,
      ...DEFAULT_MEDIA, ...(p.media?.[0] ?? {}),
    })))
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // Grava/atualiza 1 ou mais campos de 1 produto — otimista na tela
  // (atualiza local antes da resposta) pra não travar a digitação/
  // seleção enquanto salva, sem precisar de um botão "Salvar" por linha.
  async function updateField(productId, patch) {
    setRows(prev => prev.map(r => (r.id === productId ? { ...r, ...patch } : r)))

    const { error } = await supabase
      .from('product_media_status')
      .upsert({ product_id: productId, ...patch }, { onConflict: 'product_id' })

    if (error) {
      toast.error('Erro ao salvar — tente de novo.')
      console.error(error)
      await fetch() // desfaz o otimista voltando pro estado real do banco
    }
  }

  return { rows, loading, refetch: fetch, updateField }
}
