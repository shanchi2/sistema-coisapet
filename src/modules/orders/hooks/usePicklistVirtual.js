import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}
function isCancelledStatus(estado) {
  return !!estado && estado.toLowerCase().includes('cancelad')
}

// Carrega os pedidos de um lote (exclui cancelados e vazios), já com foto por SKU
// e filtra por "Data prevista de envio" = hoje, quando essa data existir
export async function fetchVirtualPicklistOrders(batchId) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, num_venda, comprador, cidade, estado_uf, status_ml, notes, shipping_deadline, is_full, items:order_items(id, titulo, sku, variacao, qty, obs_item)')
    .eq('batch_id', batchId)

  if (error) throw error

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const orders = (data || [])
    .filter(o => !isCancelledStatus(o.status_ml))
    // Full = o ML separa e despacha sozinho, a CoisaPet não separa esse
    // pedido — nunca pode entrar em picklist nenhum (ver fase17-pedidos-full.sql)
    .filter(o => !o.is_full)
    .filter(o => (o.items || []).length > 0)
    .filter(o => !o.shipping_deadline || o.shipping_deadline === today)

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

export async function fetchPackagingBoxes() {
  const { data, error } = await supabase.from('packaging_boxes').select('*').eq('active', true).order('code')
  if (error) throw error
  return data || []
}

export async function fetchOrderPackaging(orderId) {
  const { data, error } = await supabase
    .from('order_packaging_usage')
    .select('*, box:packaging_boxes(code, box_number)')
    .eq('order_id', orderId)
  if (error) throw error
  return data || []
}

// Confirma as embalagens usadas nesse pedido — salva o registro E desconta
// automaticamente do estoque de cada caixa selecionada (com movimento no histórico)
export async function confirmOrderPackaging(orderId, selections) {
  const { id: uid } = getSession()
  if (!selections.length) return

  const { error: insErr } = await supabase.from('order_packaging_usage').insert(
    selections.map(s => ({ order_id: orderId, box_id: s.box_id, qty: s.qty, created_by: uid || null }))
  )
  if (insErr) { toast.error('Erro ao salvar embalagem.'); throw insErr }

  for (const s of selections) {
    const { data: box } = await supabase.from('packaging_boxes').select('stock_qty').eq('id', s.box_id).single()
    if (!box) continue
    const newQty = Math.max(0, (parseFloat(box.stock_qty) || 0) - s.qty)
    await supabase.from('packaging_boxes').update({ stock_qty: newQty, updated_at: new Date().toISOString() }).eq('id', s.box_id)
    await supabase.from('packaging_stock_movements').insert({
      box_id: s.box_id, type: 'saida', qty: s.qty, notes: 'Baixa automática — Picklist Virtual', created_by: uid || null,
    })
  }
}
