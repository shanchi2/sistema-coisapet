import { useCallback, useState } from 'react'
import { supabase } from '../../../lib/supabase'

async function callMlInsights(payload) {
  const { data, error } = await supabase.functions.invoke('ml-insights', { body: payload })
  if (error) {
    // Edge Functions devolvem o corpo de erro em error.context quando é
    // uma resposta 4xx/5xx — tenta extrair a mensagem real do ML antes de
    // cair no genérico do supabase-js.
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

// Varre TODOS os anúncios ativos em lotes de `limit`, chamando a mesma
// action repetidas vezes com offset crescente — evita 1 invocação gigante
// da edge function pra ~400+ anúncios de uma vez só.
// `onExtra(page)` — chamado a cada página, pra quem precisa acumular
// algo além de `results` (ex: `category_names` do traffic_audit) sem
// mudar o contrato de retorno (array puro) pros outros usos.
async function scanAllPages(action, { limit = 50, onProgress, extraParams = {}, onExtra } = {}) {
  let offset = 0
  let total = Infinity
  const results = []
  while (offset < total) {
    const page = await callMlInsights({ action, offset, limit, ...extraParams })
    total = page.total ?? 0
    results.push(...(page.results || []))
    onExtra?.(page)
    offset += limit
    onProgress?.({ done: Math.min(offset, total), total })
    if (!page.results?.length) break // segurança: evita loop infinito se a API parar de paginar
  }
  return results
}

export function useMlInsights() {
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState(null) // { done, total } | null
  const [error,    setError]    = useState(null)

  const run = useCallback(async (fn) => {
    setLoading(true)
    setError(null)
    setProgress(null)
    try {
      return await fn()
    } catch (err) {
      setError(err.message || String(err))
      throw err
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }, [])

  const fetchItemsHealth = useCallback(
    () => run(() => scanAllPages('items_health', { onProgress: setProgress })),
    [run],
  )

  const fetchAttributesAudit = useCallback(
    () => run(() => scanAllPages('attributes_audit', { onProgress: setProgress })),
    [run],
  )

  // `results.category_names` fica pendurado no array devolvido (não muda
  // o contrato de "array de linhas" que os outros usos já esperam) —
  // mapa `{category_id: nome}` acumulado de todas as páginas do scan,
  // usado só pela tela de Tráfego pra explicar de onde vêm as
  // palavras-chave em alta.
  const fetchTrafficAudit = useCallback(
    (days = 30) => run(async () => {
      const categoryNames = {}
      const results = await scanAllPages('traffic_audit', {
        onProgress: setProgress, extraParams: { days },
        onExtra: (page) => Object.assign(categoryNames, page.category_names),
      })
      results.category_names = categoryNames
      return results
    }),
    [run],
  )

  const fetchPriceScan = useCallback(
    () => run(() => scanAllPages('price_scan', { onProgress: setProgress })),
    [run],
  )

  const fetchQuestions = useCallback(
    () => run(async () => (await callMlInsights({ action: 'questions' })).results || []),
    [run],
  )

  // Sempre chamado depois de confirmação explícita na tela — igual toda
  // outra escrita no Mercado Livre.
  const answerQuestion = useCallback(
    (questionId, text) => run(() => callMlInsights({ action: 'answer_question', question_id: questionId, text })),
    [run],
  )

  // Só SUGERE a resposta (nunca envia) — usa `callMlInsights` direto,
  // sem passar por `run`, pra ter loading próprio por pergunta em vez
  // de travar a tela inteira enquanto gera.
  const draftAnswer = useCallback(
    (questionId, text, itemId) => callMlInsights({ action: 'draft_answer', question_id: questionId, text, item_id: itemId }),
    [],
  )

  const fetchResponseTime = useCallback(
    () => run(() => callMlInsights({ action: 'response_time' })),
    [run],
  )

  const fetchReputation = useCallback(
    () => run(() => callMlInsights({ action: 'reputation' })),
    [run],
  )

  const fetchItemDetail = useCallback(
    (itemId) => run(() => callMlInsights({ action: 'item_detail', item_id: itemId })),
    [run],
  )

  const fetchItemUpdateHistory = useCallback(
    (itemId) => run(async () => (await callMlInsights({ action: 'item_update_history', item_id: itemId })).results || []),
    [run],
  )

  // Histórico completo (todos os itens, não só 1) — agrupado por
  // anúncio, pagina por offset/limit (em nº de anúncios), mais recente
  // primeiro.
  const fetchAllItemUpdates = useCallback(
    (offset = 0, limit = 15) => run(() => callMlInsights({ action: 'all_item_updates', offset, limit })),
    [run],
  )

  // Check manual do Atendimento ("já sincronizei isso na Shopee").
  const setItemSyncCheck = useCallback(
    (itemId, checked, checkedBy) => run(() => callMlInsights({ action: 'set_item_sync_check', item_id: itemId, checked, checked_by: checkedBy })),
    [run],
  )

  // attributes: [{ id, value_id? , value_name? }] — só os campos que o
  // usuário preencheu no formulário. Sempre chamado depois de uma
  // confirmação explícita na tela (nunca automático).
  const applyAttributes = useCallback(
    (itemId, attributes) => run(() => callMlInsights({ action: 'update_item_attributes', item_id: itemId, attributes })),
    [run],
  )

  const fetchAccountDashboard = useCallback(
    (period) => run(() => callMlInsights({ action: 'account_dashboard', period })),
    [run],
  )

  const suggestContent = useCallback(
    (itemId) => run(() => callMlInsights({ action: 'suggest_content', item_id: itemId })),
    [run],
  )

  // { title?, description? } — só os campos marcados pra aplicar.
  const applyContent = useCallback(
    (itemId, { title, description }) => run(() => callMlInsights({ action: 'apply_content', item_id: itemId, title, description })),
    [run],
  )

  const fetchClaimsByProduct = useCallback(
    () => run(() => callMlInsights({ action: 'claims_by_product' })),
    [run],
  )

  const fetchAdsCoverage = useCallback(
    () => run(() => callMlInsights({ action: 'ads_coverage' })),
    [run],
  )

  // ── Publicidade (Product Ads / campanhas) ────────────────────────
  const fetchAdsDashboard = useCallback(
    (days = 30) => run(() => callMlInsights({ action: 'ads_dashboard', days })),
    [run],
  )

  const fetchPromotionInvites = useCallback(
    () => run(async () => (await callMlInsights({ action: 'promotion_invites' })).results || []),
    [run],
  )

  const fetchCoupons = useCallback(
    () => run(async () => (await callMlInsights({ action: 'coupons_list' })).results || []),
    [run],
  )

  const fetchPromotionCandidates = useCallback(
    (promotionId, promotionType) => run(async () =>
      (await callMlInsights({ action: 'promotion_candidates', promotion_id: promotionId, promotion_type: promotionType })).results || []),
    [run],
  )

  // Sempre chamado depois de confirmação explícita na tela.
  const promotionJoinItem = useCallback(
    (itemId, promotionId, promotionType, dealPrice, topDealPrice) => run(() => callMlInsights({
      action: 'promotion_join_item', item_id: itemId, promotion_id: promotionId, promotion_type: promotionType,
      deal_price: dealPrice, top_deal_price: topDealPrice,
    })),
    [run],
  )

  const promotionLeaveItem = useCallback(
    (itemId, promotionId, promotionType) => run(() => callMlInsights({
      action: 'promotion_leave_item', item_id: itemId, promotion_id: promotionId, promotion_type: promotionType,
    })),
    [run],
  )

  const fetchComboSuggestions = useCallback(
    (days = 180) => run(() => callMlInsights({ action: 'combo_suggestions', days })),
    [run],
  )

  // ── Gestão de anúncios ativos ────────────────────────────────────
  const fetchActiveListings = useCallback(
    () => run(async () => (await callMlInsights({ action: 'active_listings' })).results || []),
    [run],
  )

  // fields: { status?, price?, available_quantity? } — só o que mudou.
  // Sempre chamado depois de confirmação explícita na tela.
  const updateItemFields = useCallback(
    (itemId, fields) => run(() => callMlInsights({ action: 'update_item_fields', item_id: itemId, fields })),
    [run],
  )

  // ── Criação de anúncio novo ──────────────────────────────────────
  const predictCategory = useCallback(
    (title) => run(async () => (await callMlInsights({ action: 'predict_category', title })).candidates || []),
    [run],
  )

  const fetchCategoryAttributesForCreate = useCallback(
    (categoryId) => run(() => callMlInsights({ action: 'category_attributes_for_create', category_id: categoryId })),
    [run],
  )

  // file: objeto File do input — converte pra base64 aqui mesmo antes de
  // mandar (Edge Function decodifica e repassa como multipart pro ML).
  const uploadPicture = useCallback(
    (file) => run(() => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'))
      reader.onload = async () => {
        try {
          const base64 = String(reader.result).split(',')[1] || ''
          resolve(await callMlInsights({ action: 'upload_picture', file_base64: base64, file_name: file.name, mime_type: file.type }))
        } catch (err) { reject(err) }
      }
      reader.readAsDataURL(file)
    })),
    [run],
  )

  const fetchStructuralDefaults = useCallback(
    (categoryId) => run(() => callMlInsights({ action: 'structural_defaults', category_id: categoryId })),
    [run],
  )

  // item: payload completo pro ML (title, category_id, price, attributes,
  // pictures, etc.) — montado no frontend a partir do wizard. Sempre
  // chamado depois de confirmação explícita na tela de revisão.
  const createItem = useCallback(
    (item, description) => run(() => callMlInsights({ action: 'create_item', item, description })),
    [run],
  )

  // ── Estoque Full ──────────────────────────────────────────────────
  const fetchFulfillmentStock = useCallback(
    () => run(async () => (await callMlInsights({ action: 'fulfillment_stock' })).results || []),
    [run],
  )

  return {
    loading, progress, error,
    fetchItemsHealth, fetchAttributesAudit,
    fetchTrafficAudit, fetchPriceScan,
    fetchQuestions, fetchResponseTime, fetchReputation,
    fetchItemDetail, applyAttributes, fetchItemUpdateHistory, fetchAllItemUpdates, setItemSyncCheck,
    answerQuestion,
    draftAnswer,
    fetchAccountDashboard,
    suggestContent, applyContent,
    fetchClaimsByProduct,
    fetchAdsCoverage, fetchAdsDashboard,
    fetchPromotionInvites, fetchPromotionCandidates, promotionJoinItem, promotionLeaveItem, fetchCoupons,
    fetchComboSuggestions,
    fetchActiveListings, updateItemFields,
    predictCategory, fetchCategoryAttributesForCreate,
    uploadPicture, fetchStructuralDefaults, createItem,
    fetchFulfillmentStock,
  }
}
