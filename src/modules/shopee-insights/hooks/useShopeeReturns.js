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

// Recebimento interno (fase93) — status que a produção registra quando a
// devolução CHEGA aqui. `avaria` = exige pelo menos 1 foto/vídeo.
export const RECEIPT_STATUS = {
  aguardando:        { label: 'Aguardando chegada',                    tone: 'bg-slate-100 text-slate-600 border-slate-200' },
  perfeito:          { label: 'Chegou perfeito — volta pro estoque',   tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  avaria_transporte: { label: 'Chegou com avaria (transporte)',        tone: 'bg-rose-50 text-rose-700 border-rose-200', avaria: true },
  avaria_comprador:  { label: 'Chegou com avaria (causada pelo comprador)', tone: 'bg-rose-50 text-rose-700 border-rose-200', avaria: true },
  incompleto:        { label: 'Chegou incompleto / faltando peças',    tone: 'bg-amber-50 text-amber-700 border-amber-200', avaria: true },
  produto_errado:    { label: 'Chegou outro produto',                  tone: 'bg-amber-50 text-amber-700 border-amber-200', avaria: true },
  nao_retornou:      { label: 'Não chegou / extraviado',               tone: 'bg-slate-100 text-slate-600 border-slate-300' },
}

// Foto do celular pode ter 5-10 MB: reduz pra JPEG 1600px antes de subir.
// HEIC (iPhone) o navegador não consegue redesenhar — sobe o original.
export async function compressImage(file) {
  try {
    const b64 = await fileToJpegBase64(file)
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k)
    return { blob: new Blob([bytes], { type: 'image/jpeg' }), ext: 'jpg', type: 'image/jpeg' }
  } catch {
    return { blob: file, ext: (file.name.split('.').pop() || 'jpg').toLowerCase(), type: file.type || 'image/jpeg' }
  }
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
  const [receipts, setReceipts] = useState({}) // return_sn → recebimento interno (fase93)
  const syncingRef = useRef(false)

  const loadReceipts = useCallback(async () => {
    const { data } = await supabase.from('shopee_return_receipts').select('*').limit(5000)
    setReceipts(Object.fromEntries((data || []).map(r => [r.return_sn, r])))
  }, [])
  useEffect(() => { loadReceipts() }, [loadReceipts])

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

  // ── Recebimento interno (fase93) ─────────────────────────────────────
  // Salva status/observação (e a lista de mídias já enviadas). Guarda no
  // histórico quem mudou e pra quê. Se virou avaria, avisa diretoria +
  // atendimento no sino.
  async function saveReceipt(ret, { status, notes, media, restocked }) {
    const prev = receipts[ret.return_sn]
    const by = sessionName()
    const now = new Date().toISOString()
    const entry = { at: now, by, status, notes: notes || null, restocked: !!restocked }
    const row = {
      return_sn: ret.return_sn, status, notes: notes || null, media: media || [],
      restocked: !!restocked,
      restocked_at: restocked ? (prev?.restocked_at || now) : null,
      history: [...(prev?.history || []), entry],
      updated_by_name: by, updated_at: now,
    }
    const { data, error: err } = await supabase.from('shopee_return_receipts').upsert(row).select().single()
    if (err) throw err
    setReceipts(m => ({ ...m, [ret.return_sn]: data }))

    const virouAvaria = RECEIPT_STATUS[status]?.avaria && prev?.status !== status
    if (virouAvaria) {
      const { data: users } = await supabase.from('system_users').select('id').in('role', ['admin', 'atendimento']).eq('active', true)
      if (users?.length) {
        await supabase.from('notifications').insert(users.map(u => ({
          user_id: u.id,
          type: 'shopee_return_damaged',
          title: '📦 Devolução chegou com problema',
          body: `${RECEIPT_STATUS[status].label} — ${ret.items?.[0]?.name || 'produto'} (pedido ${ret.order_sn}). Registrado por ${by || 'alguém'}${notes ? `: "${notes.slice(0, 120)}"` : '.'}`,
          link: '/shopee/retornos',
        })))
      }
    }
    return data
  }

  // Sobe fotos/vídeos pro bucket return-receipts e devolve as entradas
  // pra lista `media` (quem salva no banco é o saveReceipt).
  async function uploadReceiptMedia(returnSn, files) {
    const by = sessionName()
    const out = []
    for (const file of files) {
      const isVideo = file.type.startsWith('video/')
      if (!isVideo && !file.type.startsWith('image/')) continue
      if (file.size > 100 * 1024 * 1024) throw new Error(`"${file.name}" passa de 100 MB — grave um vídeo mais curto.`)
      const up = isVideo ? { blob: file, ext: (file.name.split('.').pop() || 'mp4').toLowerCase(), type: file.type } : await compressImage(file)
      const path = `${returnSn}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${up.ext}`
      const { error: err } = await supabase.storage.from('return-receipts').upload(path, up.blob, { contentType: up.type, upsert: false })
      if (err) throw new Error(`Erro ao enviar "${file.name}": ${err.message}`)
      const { data } = supabase.storage.from('return-receipts').getPublicUrl(path)
      out.push({ path, url: data.publicUrl, type: isVideo ? 'video' : 'image', name: file.name, size: up.blob.size, by, at: new Date().toISOString() })
    }
    return out
  }

  async function deleteReceiptFile(path) {
    await supabase.storage.from('return-receipts').remove([path])
  }

  // Grava SÓ a lista de mídias, na hora (sem mexer no status nem no
  // histórico) — assim foto que já subiu nunca se perde, mesmo se a pessoa
  // fechar a tela sem clicar em "Salvar recebimento".
  async function saveReceiptMedia(returnSn, media) {
    const { data, error: err } = await supabase.from('shopee_return_receipts')
      .upsert({ return_sn: returnSn, media, updated_at: new Date().toISOString(), updated_by_name: sessionName() })
      .select().single()
    if (err) throw err
    setReceipts(m => ({ ...m, [returnSn]: data }))
    return data
  }

  return {
    receipts, saveReceipt, saveReceiptMedia, uploadReceiptMedia, deleteReceiptFile, reloadReceipts: loadReceipts,
    rows, loading, error, syncing, syncError, lastSync, saveOurDisputePhotos,
    reload: load, sync, refreshOne, getDisputeReasons, convertProofImages, confirmReturn, disputeReturn,
  }
}
