import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

// Pedidos de Matéria-Prima/Chapas (Fase 70, 25/09) — módulo do César.
// "Chapas" aqui NÃO é a tabela `chapas` (essa é receita de corte, vira
// produto acabado) — é só matéria-prima com unit='chapa', já suportado
// por raw_materials, sem entidade nova. Estoque só sobe na conferência
// (ver useMaterialConference.js), nunca na criação do pedido.
export function useMaterialOrders() {
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
        closer:system_users!closed_by(name),
        occurrences:material_order_occurrences(
          id, order_item_id, kind, status, description, qty_damaged, qty_affected, reported_at, resolved_at, resolution, resolution_notes,
          resolver:system_users!resolved_by(name),
          photos:material_order_occurrence_photos(id, storage_path)
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Erro ao carregar pedidos de matéria-prima.')
      console.error(error)
    } else {
      setOrders(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // items: [{ raw_material_id, qty_ordered, unit_price }]
  async function createOrder({ title, supplier_id, notes, items }) {
    if (!items?.length) { toast.error('Adicione pelo menos 1 item.'); throw new Error('Sem itens') }
    const session = getSession()

    const { data: order, error } = await supabase
      .from('material_orders')
      .insert({ title: title?.trim() || null, supplier_id: supplier_id || null, notes: notes || null, created_by: session.id || null })
      .select('id').single()
    if (error) { toast.error('Erro ao criar pedido.'); throw error }

    const { error: itemsErr } = await supabase.from('material_order_items').insert(
      items.map(it => ({
        order_id: order.id,
        raw_material_id: it.raw_material_id,
        qty_ordered: Number(it.qty_ordered),
        unit_price: it.unit_price ? Number(it.unit_price) : null,
      }))
    )
    if (itemsErr) { toast.error('Pedido criado, mas erro ao salvar itens.'); throw itemsErr }

    toast.success('Pedido criado!')
    await fetch()
    return order.id
  }

  // Vincula a conta real do Financeiro já criada (ver MaterialOrdersPage,
  // mesmo botão explícito "Registrar no Financeiro" — nunca automático).
  async function linkBill(orderId, billId) {
    const { error } = await supabase.from('material_orders').update({ bill_id: billId, updated_at: new Date().toISOString() }).eq('id', orderId)
    if (error) { toast.error('Erro ao vincular conta.'); throw error }
    await fetch()
  }

  async function cancelOrder(orderId) {
    const { error } = await supabase.from('material_orders').update({ status: 'cancelado', updated_at: new Date().toISOString() }).eq('id', orderId)
    if (error) { toast.error('Erro ao cancelar pedido.'); throw error }
    toast.success('Pedido cancelado.')
    await fetch()
  }

  // Ocorrências: acompanhamento pelo OccurrenceTrackingModal (occurrenceTracking.js)
  return { orders, loading, refetch: fetch, createOrder, linkBill, cancelOrder }
}
