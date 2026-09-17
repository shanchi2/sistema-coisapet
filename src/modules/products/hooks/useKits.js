import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

// Kits são produtos comuns (`products.is_kit = true`) com composição em
// `kit_items` — criação/edição continua reaproveitando o ProductFormModal
// já existente (ele já sabe gravar `kit_items` sozinho). Este hook só
// cuida de LISTAR kits (com composição + disponibilidade calculada) e
// remover — mesmo padrão de useProducts.js, escopado a `is_kit = true`.
export function useKits() {
  const [kits,    setKits]    = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const [{ data: kitsData, error: kitsErr }, { data: availData, error: availErr }] = await Promise.all([
      supabase
        .from('products')
        .select(`
          *,
          category:product_categories(id, name, color),
          items:kit_items!kit_items_kit_product_id_fkey(id, qty, sort_order, component:products!component_product_id(id, name, sku, photo_url, stock_qty))
        `)
        .eq('is_kit', true)
        .eq('active', true)
        .order('name'),
      supabase.from('kit_availability').select('kit_product_id, available_qty, component_count'),
    ])

    if (kitsErr || availErr) {
      toast.error('Erro ao carregar kits.')
      console.error(kitsErr || availErr)
      setLoading(false)
      return
    }

    const availById = new Map((availData ?? []).map(a => [a.kit_product_id, a]))
    setKits((kitsData ?? []).map(k => ({
      ...k,
      items: (k.items ?? []).sort((a, b) => a.sort_order - b.sort_order),
      available_qty: availById.get(k.id)?.available_qty ?? (k.items?.length ? 0 : null),
    })))
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function remove(id) {
    // Soft delete — mesmo padrão de products.
    const { error } = await supabase.from('products').update({ active: false }).eq('id', id)
    if (error) { toast.error('Erro ao remover kit.'); throw error }
    toast.success('Kit removido.')
    await fetch()
  }

  return { kits, loading, refetch: fetch, remove }
}
