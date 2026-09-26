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
        updater:system_users!updated_by(name),
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

  // "Última atualização" do card (fase76): quando + quem
  function touch() {
    return { updated_at: new Date().toISOString(), updated_by: getSession().id || null }
  }

  // items: [{ raw_material_id, qty_ordered, unit_price }]
  async function createOrder({ title, supplier_id, expected_delivery, notes, items }) {
    if (!items?.length) { toast.error('Adicione pelo menos 1 item.'); throw new Error('Sem itens') }
    const session = getSession()

    const { data: order, error } = await supabase
      .from('material_orders')
      .insert({ title: title?.trim() || null, supplier_id: supplier_id || null, expected_delivery: expected_delivery || null, notes: notes || null, created_by: session.id || null })
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
    const { error } = await supabase.from('material_orders').update({ bill_id: billId, ...touch() }).eq('id', orderId)
    if (error) { toast.error('Erro ao vincular conta.'); throw error }
    await fetch()
  }

  // Previsão de entrega (fase75) — editável enquanto o pedido não chegou
  async function setExpectedDelivery(orderId, date) {
    const { error } = await supabase.from('material_orders').update({ expected_delivery: date || null, ...touch() }).eq('id', orderId)
    if (error) { toast.error('Erro ao salvar a previsão.'); throw error }
    toast.success(date ? 'Previsão de entrega salva.' : 'Previsão removida.')
    await fetch()
  }

  // Editar pedido (26/09). Cabeçalho (nome, fornecedor, previsão, obs)
  // sempre editável; itens SÓ antes da conferência — depois disso o
  // estoque já entrou por eles (raw_material_movements) e as ocorrências
  // apontam pros itens, então mexer quebraria o histórico.
  async function updateOrder(order, { title, supplier_id, expected_delivery, notes, items }) {
    const { error } = await supabase.from('material_orders').update({
      title: title?.trim() || null,
      supplier_id: supplier_id || null,
      expected_delivery: expected_delivery || null,
      notes: notes?.trim() || null,
      ...touch(),
    }).eq('id', order.id)
    if (error) { toast.error('Erro ao salvar o pedido.'); throw error }

    if (order.status === 'pedido') {
      if (!items?.length) { toast.error('O pedido precisa de pelo menos 1 item.'); throw new Error('Sem itens') }
      const keepIds = new Set(items.filter(it => it.id).map(it => it.id))
      const removed = (order.items || []).filter(it => !keepIds.has(it.id)).map(it => it.id)
      if (removed.length) {
        const { error: delErr } = await supabase.from('material_order_items').delete().in('id', removed)
        if (delErr) { toast.error('Erro ao remover itens.'); throw delErr }
      }
      for (const it of items.filter(it => it.id)) {
        const { error: upErr } = await supabase.from('material_order_items').update({
          qty_ordered: Number(it.qty_ordered),
          unit_price: it.unit_price ? Number(it.unit_price) : null,
        }).eq('id', it.id)
        if (upErr) { toast.error('Erro ao atualizar itens.'); throw upErr }
      }
      const added = items.filter(it => !it.id)
      if (added.length) {
        const { error: insErr } = await supabase.from('material_order_items').insert(added.map(it => ({
          order_id: order.id,
          raw_material_id: it.raw_material_id,
          qty_ordered: Number(it.qty_ordered),
          unit_price: it.unit_price ? Number(it.unit_price) : null,
        })))
        if (insErr) { toast.error('Erro ao adicionar itens.'); throw insErr }
      }
    }

    toast.success('Pedido atualizado!')
    await fetch()
  }

  // Excluir de vez — só antes da conferência (ou cancelado). Conferido
  // já movimentou estoque; aí o caminho é finalizar/acompanhar, não apagar.
  // A conta do Financeiro (se houver) NÃO é apagada junto: fica lá e o
  // modal de confirmação avisa pra conferir no Financeiro.
  async function deleteOrder(order) {
    if (!['pedido', 'cancelado'].includes(order.status)) {
      toast.error('Pedido já conferido não pode ser excluído (o estoque já entrou).')
      throw new Error('Pedido conferido')
    }
    const { error } = await supabase.from('material_orders').delete().eq('id', order.id)
    if (error) { toast.error('Erro ao excluir pedido.'); throw error }
    toast.success('Pedido excluído.')
    await fetch()
  }

  async function cancelOrder(orderId) {
    const { error } = await supabase.from('material_orders').update({ status: 'cancelado', ...touch() }).eq('id', orderId)
    if (error) { toast.error('Erro ao cancelar pedido.'); throw error }
    toast.success('Pedido cancelado.')
    await fetch()
  }

  // Ocorrências: acompanhamento pelo OccurrenceTrackingModal (occurrenceTracking.js)
  return { orders, loading, refetch: fetch, createOrder, updateOrder, deleteOrder, linkBill, cancelOrder, setExpectedDelivery }
}
