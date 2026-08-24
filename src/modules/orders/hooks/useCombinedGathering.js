import { supabase } from '../../../lib/supabase'
import { fetchShippingOrders } from '../../shipping/hooks/useShipping'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// Junta os pedidos de dois lotes (ex: ML + Shopee) pra um dia específico —
// reaproveita a mesma busca segura já usada na Expedição (mesmas regras de
// filtro por data, mesma exclusão de cancelados)
export async function fetchCombinedOrders(batchIds, targetDate) {
  const results = await Promise.all(
    batchIds.filter(Boolean).map(id => fetchShippingOrders(id, targetDate).catch(() => []))
  )
  return results.flat()
}

export async function fetchCombinedGathering(targetDate) {
  const { data, error } = await supabase.from('picklist_gathering_combined')
    .select('item_key, found_qty')
    .eq('target_date', targetDate)
  if (error) throw error
  const map = {}
  ;(data || []).forEach(r => { map[r.item_key] = r.found_qty })
  return map
}

export async function saveCombinedGatheringItem(targetDate, itemKey, foundQty) {
  const { id: uid } = getSession()
  const { error } = await supabase.from('picklist_gathering_combined').upsert({
    target_date: targetDate, item_key: itemKey, found_qty: foundQty,
    updated_at: new Date().toISOString(), updated_by: uid || null,
  }, { onConflict: 'target_date,item_key' })
  if (error) throw error
}

export async function sendCombinedShortageReport(targetDate, missingItems) {
  const { id: uid } = getSession()
  if (!missingItems.length) return
  const { error } = await supabase.from('picklist_shortage_reports').insert(
    missingItems.map(it => ({
      batch_id: null, source: 'combinado', target_date: targetDate,
      item_key: it.key, titulo: it.titulo, sku: it.sku, variacao: it.variacao,
      missing_qty: it.missing, reported_by: uid || null,
    }))
  )
  if (error) throw error
}
