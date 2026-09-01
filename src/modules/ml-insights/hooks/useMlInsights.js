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
async function scanAllPages(action, { limit = 50, onProgress, extraParams = {} } = {}) {
  let offset = 0
  let total = Infinity
  const results = []
  while (offset < total) {
    const page = await callMlInsights({ action, offset, limit, ...extraParams })
    total = page.total ?? 0
    results.push(...(page.results || []))
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

  const fetchTrafficAudit = useCallback(
    (days = 30) => run(() => scanAllPages('traffic_audit', { onProgress: setProgress, extraParams: { days } })),
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

  const fetchPromotionsOverview = useCallback(
    () => run(() => callMlInsights({ action: 'promotions_overview' })),
    [run],
  )

  const fetchComboSuggestions = useCallback(
    (days = 180) => run(() => callMlInsights({ action: 'combo_suggestions', days })),
    [run],
  )

  return {
    loading, progress, error,
    fetchItemsHealth, fetchAttributesAudit,
    fetchTrafficAudit, fetchPriceScan,
    fetchQuestions, fetchResponseTime, fetchReputation,
    fetchItemDetail, applyAttributes,
    fetchAccountDashboard,
    suggestContent, applyContent,
    fetchClaimsByProduct,
    fetchAdsCoverage,
    fetchPromotionsOverview,
    fetchComboSuggestions,
  }
}
