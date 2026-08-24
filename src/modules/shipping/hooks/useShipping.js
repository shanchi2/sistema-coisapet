import { supabase } from '../../../lib/supabase'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}
function isCancelledStatus(estado) {
  return !!estado && estado.toLowerCase().includes('cancelad')
}

// Carrega os pedidos do lote (exclui cancelados/vazios), com foto por SKU
// e o status 'picked' de cada item — filtra por "Data prevista de envio"
// (targetDate, ou hoje por padrão).
//
// REGRA DE SEGURANÇA IMPORTANTE: só a Shopee informa "data prevista de
// envio" no relatório — ML e pedido manual NÃO têm essa informação, então
// NUNCA sabemos se um pedido deles é de hoje ou de amanhã. Por isso:
//   • Na visão de HOJE: aparece tudo (ML, Shopee de hoje, manual) — igual sempre foi
//   • Em qualquer OUTRO dia: aparece só Shopee com aquela data exata —
//     ML/manual NUNCA aparecem em dia futuro, pra não arriscar "esconder"
//     um pedido de hoje achando que é de outro dia.
export async function fetchShippingOrders(batchId, targetDate = null) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, num_venda, comprador, cidade, estado_uf, status_ml, notes, source, shipping_deadline, items:order_items(id, titulo, sku, variacao, qty, obs_item, picked, picked_at)')
    .eq('batch_id', batchId)

  if (error) throw error

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const filterDate = targetDate || today
  const isToday = filterDate === today

  const orders = (data || [])
    .filter(o => !isCancelledStatus(o.status_ml))
    .filter(o => (o.items || []).length > 0)
    .filter(o => {
      if (o.shipping_deadline) return o.shipping_deadline === filterDate
      return isToday // sem data de envio — só existe na visão de hoje
    })

  const skus = [...new Set(orders.flatMap(o => o.items.map(it => it.sku).filter(Boolean)))]
  let photoMap = {}
  if (skus.length > 0) {
    const { data: prods } = await supabase.from('products').select('sku, photo_url').in('sku', skus)
    ;(prods || []).forEach(p => { photoMap[p.sku] = p.photo_url })
  }

  return orders.map(o => ({
    ...o,
    items: o.items.map(it => ({ ...it, photo_url: it.sku ? photoMap[it.sku] : null })),
  }))
}

// Marca/desmarca um item como separado
export async function toggleItemPicked(itemId, picked) {
  const { id: uid } = getSession()
  const { error } = await supabase.from('order_items').update({
    picked,
    picked_at: picked ? new Date().toISOString() : null,
    picked_by: picked ? (uid || null) : null,
  }).eq('id', itemId)
  if (error) throw error
}

// Conta quantos pedidos existem por dia (hoje + próximos), só pra avisar
// visualmente quais dias têm algo esperando — não usado pra decidir o que
// mostra no picklist (isso é sempre feito de novo, com segurança, dentro
// de fetchShippingOrders)
export async function fetchShippingDayCounts(batchId) {
  const { data, error } = await supabase
    .from('orders')
    .select('shipping_deadline, status_ml, order_items(id)')
    .eq('batch_id', batchId)
    .not('shipping_deadline', 'is', null)

  if (error) throw error

  const counts = {}
  ;(data || []).forEach(o => {
    if (isCancelledStatus(o.status_ml)) return
    if (!o.order_items || o.order_items.length === 0) return
    counts[o.shipping_deadline] = (counts[o.shipping_deadline] || 0) + 1
  })
  return counts
}

// ── Meta de "Envios de Sábado" (20% + 1) ────────────────────────
export async function fetchSaturdayTarget(batchId, targetDate) {
  const { data, error } = await supabase.from('saturday_targets')
    .select('*, activator:system_users!activated_by(name)')
    .eq('batch_id', batchId).eq('target_date', targetDate).maybeSingle()
  if (error) throw error
  return data
}

// Ativa a meta (uma vez só por lote+dia) — o número fica fixo a partir daqui,
// não recalcula sozinho mesmo se entrar pedido novo depois
export async function activateSaturdayTarget(batchId, targetDate, totalOrders) {
  const { id: uid } = getSession()
  const targetCount = Math.ceil(totalOrders * 0.2) + 1
  const { data, error } = await supabase.from('saturday_targets')
    .insert({
      batch_id: batchId, target_date: targetDate,
      total_orders_at_activation: totalOrders, target_count: targetCount,
      activated_by: uid || null,
    })
    .select('*, activator:system_users!activated_by(name)')
    .single()
  if (error) throw error
  return data
}
