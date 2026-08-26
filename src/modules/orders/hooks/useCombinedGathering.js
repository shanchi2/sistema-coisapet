import { supabase } from '../../../lib/supabase'
import { fetchShippingOrders } from '../../shipping/hooks/useShipping'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// Junta os pedidos de dois lotes (ex: ML + Shopee) pra um dia específico —
// reaproveita a mesma busca segura já usada na Expedição (mesmas regras de
// filtro por data, mesma exclusão de cancelados). Recebe batchIds (como
// sempre foi chamado) e só resolve a fonte de cada um, já que a busca em
// si agora é por (source, ship_date), não mais por batch_id.
export async function fetchCombinedOrders(batchIds, targetDate) {
  const ids = batchIds.filter(Boolean)
  if (ids.length === 0) return []
  const { data: batches } = await supabase.from('import_batches').select('id, source').in('id', ids)
  const sources = [...new Set((batches || []).map(b => b.source))]
  const results = await Promise.all(
    sources.map(source => fetchShippingOrders(source, targetDate).catch(() => []))
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
