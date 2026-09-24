import { useCallback, useState } from 'react'
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

// Tela "Retornos e Pedidos cancelados" (espelha o Seller Center) —
// leitura + as 2 ações que existem lá: confirmar (finalizar sem disputa
// e reembolsar) e abrir disputa. Sempre atrás de confirmação explícita
// na tela — nunca em lote, nunca automático (mesma regra de qualquer
// escrita real na Shopee/ML nesse sistema).
export function useShopeeReturns() {
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [hasMore,   setHasMore]   = useState(false)
  const [page,      setPage]      = useState(1)
  const [status,    setStatus]    = useState('ALL')

  const fetchPage = useCallback(async (pageNo, statusFilter) => {
    setLoading(true)
    setError(null)
    try {
      const data = await callShopeeInsights({ action: 'returns_list', page_no: pageNo, page_size: 40, status: statusFilter })
      setRows(data.results || [])
      setHasMore(!!data.more)
      setPage(pageNo)
      setStatus(statusFilter)
    } catch (err) {
      setError(err.message)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  async function getDisputeReasons(returnSn) {
    return (await callShopeeInsights({ action: 'return_dispute_reasons', return_sn: returnSn })).dispute_reason || []
  }

  async function confirmReturn(returnSn) {
    return callShopeeInsights({ action: 'return_confirm', return_sn: returnSn })
  }

  async function disputeReturn(returnSn, { email, disputeReason, disputeText, images }) {
    return callShopeeInsights({
      action: 'return_dispute', return_sn: returnSn,
      email, dispute_reason: disputeReason, dispute_text_reason: disputeText, images,
    })
  }

  return {
    rows, loading, error, hasMore, page, status,
    fetchPage, getDisputeReasons, confirmReturn, disputeReturn,
  }
}
