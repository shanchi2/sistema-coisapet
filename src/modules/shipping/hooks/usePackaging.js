import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
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
      box_id: s.box_id, type: 'saida', qty: s.qty, notes: 'Baixa automática — Expedição', created_by: uid || null,
    })
  }
}
