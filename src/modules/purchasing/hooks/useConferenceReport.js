import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

// Relatório de Conferências (25/09) — visão do Administrativo/Diretoria
// sobre tudo que o João já conferiu no tablet: quantidades, avarias,
// fotos e ocorrências. Só leitura, fora "marcar/reabrir ocorrência".
export function useConferenceReport() {
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('material_orders')
      .select(`
        *,
        supplier:suppliers(id, name),
        creator:system_users!created_by(name),
        conferrer:system_users!conferred_by(name),
        items:material_order_items(
          id, raw_material_id, qty_ordered, unit_price, qty_received, qty_damaged, item_status,
          raw_material:raw_materials(id, name, unit)
        ),
        occurrences:material_order_occurrences(
          id, order_item_id, description, qty_damaged, status, reported_at, resolved_at,
          resolver:system_users!resolved_by(name),
          photos:material_order_occurrence_photos(id, storage_path, created_at)
        )
      `)
      .eq('status', 'conferido')
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

  async function setOccurrenceStatus(occurrenceId, status) {
    const session = getSession()
    const patch = status === 'resolvido'
      ? { status, resolved_at: new Date().toISOString(), resolved_by: session.id || null }
      : { status, resolved_at: null, resolved_by: null }
    const { error } = await supabase.from('material_order_occurrences').update(patch).eq('id', occurrenceId)
    if (error) { toast.error('Erro ao atualizar ocorrência.'); throw error }
    toast.success(status === 'resolvido' ? 'Ocorrência marcada como resolvida.' : 'Ocorrência reaberta.')
    await fetch()
  }

  return { orders, loading, refetch: fetch, setOccurrenceStatus }
}
