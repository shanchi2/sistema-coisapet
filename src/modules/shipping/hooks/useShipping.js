import { supabase } from '../../../lib/supabase'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}
function isCancelledStatus(estado) {
  return !!estado && estado.toLowerCase().includes('cancelad')
}

// Carrega os pedidos de UMA PLATAFORMA pra UM DIA específico — usa
// ship_date (calculado uma única vez na criação do pedido, ver
// fase20-ship-date-corte-unico.sql), a mesma fonte de verdade usada em
// TODA a tela agora. Antes disso, o pedido era guardado sob um batch_id
// calculado de um jeito (dia da compra) e mostrado filtrando por outro
// campo à parte (shipping_deadline) — os dois podiam divergir, e foi
// exatamente isso que fez um pedido Shopee sumir da Expedição.
export async function fetchShippingOrders(source, shipDate) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, num_venda, comprador, cidade, estado_uf, status_ml, notes, source, batch_id, ship_date, is_full, needs_attention, items:order_items(id, titulo, sku, variacao, qty, obs_item, picked, picked_at)')
    .eq('source', source)
    .eq('ship_date', shipDate)

  if (error) throw error

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
export async function fetchShippingDayCounts(source) {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('orders')
    .select('ship_date, status_ml, is_full, order_items(id)')
    .eq('source', source)
    .gte('ship_date', todayStr)

  if (error) throw error

  const counts = {}
  ;(data || []).forEach(o => {
    if (isCancelledStatus(o.status_ml)) return
    if (o.is_full) return
    if (!o.order_items || o.order_items.length === 0) return
    counts[o.ship_date] = (counts[o.ship_date] || 0) + 1
  })
  return counts
}

// "Atrasados" — pedido cujo ship_date já passou e ainda não foi
// totalmente separado. Independente de qual dia/lote está aberto na
// tela no momento — é isso que garante que nenhum pedido fica esquecido
// pra trás só porque ninguém voltou pra conferir um dia antigo.
export async function fetchOverdueOrders() {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('orders')
    .select('id, num_venda, comprador, source, ship_date, batch_id, status_ml, is_full, needs_attention, items:order_items(id, picked)')
    .lt('ship_date', todayStr)

  if (error) throw error

  return (data || [])
    .filter(o => !isCancelledStatus(o.status_ml) || o.needs_attention)
    .filter(o => !o.is_full)
    .filter(o => (o.items || []).length > 0 && o.items.some(it => !it.picked))
}

// Acha o batch_id "canônico" pra essa plataforma+dia — usado só pelas
// ações que ainda dependem de batch_id (Fechar o Dia, Meta de Sábado,
// histórico de fechamentos) enquanto a Fase 3 (consolidação de
// import_batches) não torna batch_id exato por (source, ship_date). Se
// houver mais de um lote com pedido nesse dia (resíduo do bug antigo),
// usa o que tem mais pedidos.
export async function resolveBatchId(source, shipDate) {
  const { data, error } = await supabase
    .from('orders')
    .select('batch_id')
    .eq('source', source)
    .eq('ship_date', shipDate)
    .not('batch_id', 'is', null)
  if (error) throw error
  if (!data || data.length === 0) return null
  const counts = {}
  data.forEach(o => { counts[o.batch_id] = (counts[o.batch_id] || 0) + 1 })
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
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
