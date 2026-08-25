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
    .select('id, num_venda, comprador, cidade, estado_uf, status_ml, notes, source, shipping_deadline, is_full, needs_attention, items:order_items(id, titulo, sku, variacao, qty, obs_item, picked, picked_at)')
    .eq('batch_id', batchId)

  if (error) throw error

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const filterDate = targetDate || today
  const isToday = filterDate === today

  const orders = (data || [])
    // Cancelado normalmente some da Expedição — MAS se já tinha item
    // separado quando cancelou (needs_attention), continua aparecendo
    // com aviso em vez de sumir sem rastro (era exatamente isso que
    // causava pedido já pronto desaparecer da tela).
    .filter(o => !isCancelledStatus(o.status_ml) || o.needs_attention)
    // Full = o ML separa e despacha sozinho, nunca entra em expedição
    // (ver fase17-pedidos-full.sql)
    .filter(o => !o.is_full)
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

// Staff confirmou que já olhou o aviso de "cancelado após separado" —
// tira o aviso da tela. Se um novo webhook tocar esse pedido de novo
// enquanto ele continuar cancelado E com item separado, o aviso volta
// (é um estado real que ainda não foi resolvido, não só um alerta pontual).
export async function clearNeedsAttention(orderId) {
  const { error } = await supabase.from('orders').update({ needs_attention: false }).eq('id', orderId)
  if (error) throw error
}

// Grava o fechamento do dia — histórico permanente de quantos pedidos
// fecharam/ficaram incompletos e quais itens faltaram em cada um.
// Fechar de novo (depois de mais pedidos serem separados) cria uma NOVA
// versão no banco, nunca sobrescreve o fechamento anterior.
export async function closeShippingDay(batchId, targetDate, orders) {
  const { id: uid } = getSession()
  const payload = orders.map(o => {
    const missing = (o.items || []).filter(it => !it.picked)
    return {
      order_id: o.id,
      num_venda: o.num_venda || null,
      source: o.source || null,
      comprador: o.comprador || null,
      status: missing.length === 0 ? 'closed' : 'incomplete',
      missing_items: missing.length > 0
        ? missing.map(it => ({ titulo: it.titulo, sku: it.sku, variacao: it.variacao, missing_qty: it.qty }))
        : null,
    }
  })
  const { data, error } = await supabase.rpc('close_shipping_day', {
    p_batch_id: batchId,
    p_target_date: targetDate,
    p_closed_by: uid || null,
    p_orders: payload,
  })
  if (error) throw error
  return data
}

// Histórico de fechamentos de um lote — mais recente primeiro, incluindo
// versões supersedidas (pra transparência total: nada some do histórico).
export async function fetchShippingClosures(batchId) {
  const { data, error } = await supabase
    .from('shipping_day_closures')
    .select('*, closer:system_users!closed_by(name), orders:shipping_order_closures(*)')
    .eq('batch_id', batchId)
    .order('target_date', { ascending: false })
    .order('version', { ascending: false })
  if (error) throw error
  return data || []
}

// Conta quantos pedidos existem por dia (hoje + próximos), só pra avisar
// visualmente quais dias têm algo esperando — não usado pra decidir o que
// mostra no picklist (isso é sempre feito de novo, com segurança, dentro
// de fetchShippingOrders)
export async function fetchShippingDayCounts(batchId) {
  const { data, error } = await supabase
    .from('orders')
    .select('shipping_deadline, status_ml, is_full, order_items(id)')
    .eq('batch_id', batchId)
    .not('shipping_deadline', 'is', null)

  if (error) throw error

  const counts = {}
  ;(data || []).forEach(o => {
    if (isCancelledStatus(o.status_ml)) return
    if (o.is_full) return
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
