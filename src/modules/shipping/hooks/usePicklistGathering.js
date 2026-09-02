import { supabase } from '../../../lib/supabase'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// Carrega o progresso já salvo (quantidade já encontrada de cada item),
// separado por dia — o mesmo item em dias diferentes do mesmo lote não se mistura
export async function fetchGathering(batchId, targetDate) {
  const { data, error } = await supabase.from('picklist_gathering')
    .select('item_key, found_qty')
    .eq('batch_id', batchId)
    .eq('target_date', targetDate)
  if (error) throw error
  const map = {}
  ;(data || []).forEach(r => { map[r.item_key] = r.found_qty })
  return map
}

// Salva (upsert) a quantidade encontrada de um item — chamado a cada +/-.
// `sku` é opcional — só quando vem preenchido é que a reconciliação com
// a Esteira de Produção roda (Fase 40: `reconcile_stock_found` casa por
// SKU; sem SKU, de propósito não mexe em nada, mais seguro do que
// arriscar casar errado). Mesmo padrão do lado combinado
// (`useCombinedGathering.js`).
export async function saveGatheringItem(batchId, itemKey, foundQty, targetDate, sku) {
  const { id: uid } = getSession()
  const { error } = await supabase.from('picklist_gathering').upsert({
    batch_id: batchId, item_key: itemKey, found_qty: foundQty, target_date: targetDate,
    updated_at: new Date().toISOString(), updated_by: uid || null,
  }, { onConflict: 'batch_id,item_key,target_date' })
  if (error) throw error
  if (sku) {
    try { await supabase.rpc('reconcile_stock_found', { p_sku: sku, p_found_qty: foundQty }) } catch { /* não derruba o save principal */ }
  }
}

// Envia o relatório do que faltou pra Produção — um registro por item incompleto
export async function sendShortageReport(batchId, missingItems, targetDate) {
  const { id: uid } = getSession()
  if (!missingItems.length) return
  const { error } = await supabase.from('picklist_shortage_reports').insert(
    missingItems.map(it => ({
      batch_id: batchId, item_key: it.key, titulo: it.titulo, sku: it.sku, variacao: it.variacao,
      missing_qty: it.missing, reported_by: uid || null, target_date: targetDate,
    }))
  )
  if (error) throw error
}
