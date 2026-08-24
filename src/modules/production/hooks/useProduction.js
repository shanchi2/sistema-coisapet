import { useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

async function auditLog(action, tableName, recordId, description) {
  try {
    const s = getSession()
    if (!s?.id) return
    await supabase.rpc('audit_log_with_user', {
      p_user_id:     s.id,
      p_action:      action,
      p_table_name:  tableName,
      p_record_id:   recordId,
      p_description: description,
    })
  } catch {}
}



export function useProduction() {
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)

  // ── Busca todos os lotes com itens ───────────────────────────────
  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('production_orders')
      .select(`
        *,
        created_by_user:system_users!created_by(name),
        items:production_order_items(
          *,
          product:products(id, name, sku, photo_url)
        )
      `)
      .order('created_at', { ascending: false })

    if (error) { toast.error('Erro ao carregar esteira.'); console.error(error) }
    else setOrders(data ?? [])
    setLoading(false)
  }, [])

  // ── Cria novo lote ───────────────────────────────────────────────
  async function createOrder({ source, date, notes, items }) {
    const session = JSON.parse(localStorage.getItem('coisapet_session') || '{}')

    // 1. Cria o lote
    const { data: order, error: orderErr } = await supabase
      .from('production_orders')
      .insert({ source, date: date || new Date().toISOString().split('T')[0], notes, created_by: session.id })
      .select('id')
      .single()

    if (orderErr) { toast.error('Erro ao criar lote.'); throw orderErr }

    // 2. Para cada item, verifica se tem estoque
    const itemsWithStock = items.map(item => {
      // Verifica estoque: se o produto tem qty disponível >= qty_ordered
      // (simplificado — o estoque real vem do campo stock_qty de raw_materials via BOM)
      // Por ora, deixamos has_stock = false e o funcionário confirma
      return {
        order_id:     order.id,
        product_id:   item.product_id || null,
        product_name: item.product_name,
        sku:          item.sku || null,
        qty_ordered:  item.qty_ordered,
        has_stock:    item.has_stock || false,
        status:       'pendente',
      }
    })

    const { error: itemsErr } = await supabase
      .from('production_order_items')
      .insert(itemsWithStock)

    if (itemsErr) { toast.error('Erro ao adicionar itens.'); throw itemsErr }

    toast.success(`Lote criado com ${items.length} item(ns)!`)
    await fetchOrders()
    return order.id
  }

  // ── Avança status de um item ─────────────────────────────────────
  async function advanceStatus(item) {
    const NEXT = {
      pendente:    'em_producao',
      em_producao: 'embalagem',
      embalagem:   'pronto',
      pronto:      'enviado',
    }
    const next = NEXT[item.status]
    if (!next) return

    const timestamps = {}
    if (next === 'em_producao') timestamps.started_at = new Date().toISOString()
    if (next === 'embalagem')   timestamps.packed_at   = new Date().toISOString()
    if (next === 'pronto')      timestamps.ready_at    = new Date().toISOString()
    if (next === 'enviado')     timestamps.shipped_at  = new Date().toISOString()

    const { error } = await supabase
      .from('production_order_items')
      .update({ status: next, ...timestamps })
      .eq('id', item.id)

    if (error) { toast.error('Erro ao atualizar status.'); throw error }
    await fetchOrders()
  }

  // ── Confirma baixa de estoque ────────────────────────────────────
  async function confirmStock(itemId) {
    const { error } = await supabase
      .from('production_order_items')
      .update({ stock_confirmed: true, status: 'embalagem', packed_at: new Date().toISOString() })
      .eq('id', itemId)

    if (error) { toast.error('Erro ao confirmar estoque.'); throw error }
    toast.success('Estoque confirmado — item direto para embalagem!')
    await fetchOrders()
  }

  // ── Adiciona nota a um item ──────────────────────────────────────
  async function updateNotes(itemId, notes) {
    const { error } = await supabase
      .from('production_order_items')
      .update({ notes })
      .eq('id', itemId)
    if (error) throw error
    await fetchOrders()
  }

  // ── Deleta lote inteiro ──────────────────────────────────────────
  async function deleteOrder(orderId) {
    const { error } = await supabase
      .from('production_orders')
      .delete()
      .eq('id', orderId)
    if (error) { toast.error('Erro ao excluir lote.'); throw error }
    toast.success('Lote removido.')
    await fetchOrders()
  }

  return {
    orders, loading,
    fetchOrders, createOrder,
    advanceStatus, confirmStock,
    updateNotes, deleteOrder,
  }
}
