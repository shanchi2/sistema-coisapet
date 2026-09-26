import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'
import { ITEM_SELECT } from '../orderItem'

// Relatório de Conferências (25/09) — visão do Administrativo/Diretoria
// sobre tudo que o João já conferiu no tablet: quantidades, avarias,
// fotos e ocorrências. Só leitura, fora "marcar/reabrir ocorrência".
export function useConferenceReport() {
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)

  // silent = recarrega sem spinner (depois de atualizar uma ocorrência)
  const fetch = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    const { data, error } = await supabase
      .from('material_orders')
      .select(`
        *,
        supplier:suppliers(id, name),
        creator:system_users!created_by(name),
        conferrer:system_users!conferred_by(name),
        closer:system_users!closed_by(name),
        items:material_order_items(${ITEM_SELECT}),
        occurrences:material_order_occurrences(
          id, order_item_id, sheet_cut_id, kind, description, qty_damaged, qty_affected, status, reported_at, resolved_at, resolution, resolution_notes,
          resolver:system_users!resolved_by(name),
          photos:material_order_occurrence_photos(id, storage_path, created_at)
        )
      `)
      .in('status', ['conferido', 'finalizado'])
      .order('conferred_at', { ascending: false })

    if (error) {
      toast.error('Erro ao carregar conferências.')
      console.error(error)
    } else {
      setOrders(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // Ocorrências agora são atualizadas pelo OccurrenceTrackingModal (occurrenceTracking.js)
  return { orders, loading, refetch: fetch }
}
