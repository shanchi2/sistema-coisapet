import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// Mesmo padrão do useShopeeInsights — extrai a mensagem real de erro do
// corpo da resposta da Edge Function.
async function callShopeeInsights(payload) {
  const { data, error } = await supabase.functions.invoke('shopee-insights', { body: payload })
  if (error) {
    let msg = error.message
    try {
      const parsed = await error.context?.json?.()
      if (parsed?.error) msg = parsed.error
    } catch { /* ignora — usa a mensagem genérica mesmo */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Colunas da lista (sem raw/detail, que são pesados)
const LIST_COLUMNS = [
  'return_sn', 'order_sn', 'status', 'reason', 'text_reason', 'refund_amount', 'amount_before_discount',
  'create_time', 'update_time', 'due_date', 'return_ship_due_date', 'return_seller_due_date', 'return_solution',
  'buyer_username', 'items', 'buyer_images', 'buyer_videos', 'tracking_number', 'logistics_status',
  'reverse_logistics_status', 'is_arrived_at_warehouse', 'dispute_reason', 'dispute_text_reason',
  'compensation_amount', 'compensation_status', 'compensation_due_date', 'compensation_list',
  'shipping_fee_responsibility', 'negotiation', 'seller_proof', 'purchase_date', 'detail_synced_at', 'synced_at',
].join(',')

// Tela "Retornos e Pedidos cancelados" (reescrita 29/09). Lê do espelho
// shopee_returns (fase81) — a API da Shopee devolve a lista do mais antigo
// pro mais novo e o filtro de data não funciona, então a edge function
// sincroniza tudo no banco e a tela lê daqui, na ordem certa. Ao abrir,
// mostra o que tem no banco na hora e sincroniza em segundo plano.
export function useShopeeReturns() {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [syncing, setSyncing]   = useState(false)
  const [syncError, setSyncError] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const syncingRef = useRef(false)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('shopee_returns').select(LIST_COLUMNS)
      .order('create_time', { ascending: false }).limit(5000)
    if (err) { setError(err.message); setLoading(false); return }
    setRows(data ?? [])
    const latest = (data ?? []).reduce((m, r) => (r.synced_at && r.synced_at > m ? r.synced_at : m), '')
    setLastSync(latest || null)
    setLoading(false)
  }, [])

  const sync = useCallback(async ({ full = false } = {}) => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true); setSyncError(null)
    try {
      await callShopeeInsights({ action: 'returns_sync', full, detail_limit: 60 })
      await load()
    } catch (err) {
      setSyncError(err.message)
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [load])

  // Abre com o que tem no banco e sincroniza se passou de 10 min
  useEffect(() => {
    load().then(() => {})
  }, [load])
  useEffect(() => {
    if (loading) return
    const stale = !lastSync || Date.now() - new Date(lastSync).getTime() > 10 * 60000
    if (stale) sync()
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshOne(returnSn) {
    await callShopeeInsights({ action: 'return_detail', return_sn: returnSn })
    await load()
  }

  async function getDisputeReasons(returnSn) {
    return (await callShopeeInsights({ action: 'return_dispute_reasons', return_sn: returnSn })).dispute_reason || []
  }

  async function confirmReturn(returnSn) {
    const r = await callShopeeInsights({ action: 'return_confirm', return_sn: returnSn })
    await load()
    return r
  }

  async function disputeReturn(returnSn, { email, disputeReason, disputeText, images }) {
    const r = await callShopeeInsights({
      action: 'return_dispute', return_sn: returnSn,
      email, dispute_reason: disputeReason, dispute_text_reason: disputeText, images,
    })
    await load()
    return r
  }

  return {
    rows, loading, error, syncing, syncError, lastSync,
    reload: load, sync, refreshOne, getDisputeReasons, confirmReturn, disputeReturn,
  }
}
