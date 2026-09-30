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

function sessionName() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}').name || null } catch { return null }
}

// Foto → JPEG base64 (máx 1600px) pra mandar pra Shopee
export async function fileToJpegBase64(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file) })
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85).split(',')[1]
}

// Colunas da lista (sem raw/detail, que são pesados)
const LIST_COLUMNS = [
  'return_sn', 'order_sn', 'status', 'reason', 'text_reason', 'refund_amount', 'amount_before_discount',
  'create_time', 'update_time', 'due_date', 'return_ship_due_date', 'return_seller_due_date', 'return_solution',
  'buyer_username', 'items', 'buyer_images', 'buyer_videos', 'tracking_number', 'logistics_status',
  'reverse_logistics_status', 'is_arrived_at_warehouse', 'dispute_reason', 'dispute_text_reason',
  'compensation_amount', 'compensation_status', 'compensation_due_date', 'compensation_list',
  'shipping_fee_responsibility', 'negotiation', 'seller_proof', 'purchase_date', 'detail_synced_at', 'synced_at',
  'variations', 'our_dispute',
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

  // A resposta vem em `dispute_reason_list` (cada motivo com id, exigência
  // e módulos de prova obrigatórios) — o formato antigo `dispute_reason`
  // (reason_id/reason_text) não vem mais, e a tela achava que não dava pra
  // disputar (30/09). O motivo 81 "live test" é lixo de teste da Shopee.
  async function getDisputeReasons(returnSn) {
    const data = await callShopeeInsights({ action: 'return_dispute_reasons', return_sn: returnSn })
    const list = data.dispute_reason_list || []
    if (list.length) {
      return list
        .filter(r => !/live test/i.test(r.dispute_requirement || ''))
        .map(r => ({
          reason_id: r.dispute_reason,
          requirement: r.dispute_requirement || '',
          modules: r.evidence_module_list || [],
          samples: r.sample_evidence || [],
        }))
    }
    return (data.dispute_reason || []).map(r => ({ reason_id: r.reason_id, reason_text: r.reason_text, requirement: '', modules: [], samples: [] }))
  }

  // Fotos de prova → URLs da Shopee (base64 enviadas + URLs das fotos do comprador)
  async function convertProofImages({ base64 = [], urls = [] }) {
    return (await callShopeeInsights({ action: 'return_convert_images', images: base64, image_urls: urls })).urls || []
  }

  async function confirmReturn(returnSn) {
    const r = await callShopeeInsights({ action: 'return_confirm', return_sn: returnSn })
    await load()
    return r
  }

  async function disputeReturn(returnSn, { email, disputeReason, disputeText, images, reasonLabel }) {
    const r = await callShopeeInsights({
      action: 'return_dispute', return_sn: returnSn,
      email, dispute_reason: disputeReason, dispute_text_reason: disputeText, images,
      reason_label: reasonLabel, by: sessionName(),
    })
    await load()
    return r
  }

  // Contestação feita pelo Seller Center: a API não devolve as fotos que
  // mandamos — anexa aqui (fotos viram URL da Shopee e ficam no our_dispute)
  async function saveOurDisputePhotos(returnSn, files) {
    const base64 = await Promise.all(files.map(fileToJpegBase64))
    const images = await convertProofImages({ base64 })
    if (!images.length) throw new Error('Não consegui enviar as fotos.')
    await callShopeeInsights({ action: 'return_save_our_dispute', return_sn: returnSn, images, by: sessionName() })
    await load()
  }

  return {
    rows, loading, error, syncing, syncError, lastSync, saveOurDisputePhotos,
    reload: load, sync, refreshOne, getDisputeReasons, convertProofImages, confirmReturn, disputeReturn,
  }
}
