import { useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { fetchAllRows } from '../../../lib/fetchAllRows'
import { toISODateBR } from '../../../lib/dateBR'

// Shopee Ads — tudo que vem da API passa pela Edge Function `shopee-ads`
// (separada do shopee-insights). O que é NOSSO (recargas, configurações,
// histórico de saldo, log de alterações) é lido/gravado direto nas tabelas
// da fase92.
async function callShopeeAds(payload) {
  const { data, error } = await supabase.functions.invoke('shopee-ads', { body: payload })
  if (error) {
    let msg = error.message
    try {
      const parsed = await error.context?.json?.()
      if (parsed?.error) msg = parsed.error
    } catch { /* usa a mensagem genérica */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export function useShopeeAds() {
  // ── API (via edge function) ──────────────────────────────────────
  const fetchDashboard = useCallback((start, end) =>
    callShopeeAds({ action: 'ads_dashboard', start_date: start, end_date: end }), [])

  const fetchShopDaily = useCallback(async (start, end) =>
    (await callShopeeAds({ action: 'ads_shop_daily', start_date: start, end_date: end })).results || [], [])

  const fetchShopHourly = useCallback(async (date) =>
    (await callShopeeAds({ action: 'ads_shop_hourly', date })).results || [], [])

  const fetchCampaigns = useCallback((start, end) =>
    callShopeeAds({ action: 'ads_campaigns', start_date: start, end_date: end }), [])

  const fetchCampaignHourly = useCallback(async (campaignId, date) =>
    (await callShopeeAds({ action: 'ads_campaign_hourly', campaign_id: campaignId, date })).results || [], [])

  const fetchRecommendedItems = useCallback(async () =>
    (await callShopeeAds({ action: 'ads_recommended_items' })).results || [], [])

  const fetchRecommendedKeywords = useCallback((itemId, input) =>
    callShopeeAds({ action: 'ads_recommended_keywords', item_id: itemId, input_keyword: input || undefined }), [])

  const fetchRecommendedRoi = useCallback(async (itemId) =>
    (await callShopeeAds({ action: 'ads_recommended_roi', item_id: itemId })).result, [])

  const snapshotBalance = useCallback(() => callShopeeAds({ action: 'ads_balance_snapshot' }), [])

  // Escrita — sempre chamada depois do ConfirmWriteModal.
  const editCampaign = useCallback((payload) => callShopeeAds({ action: 'ads_edit_campaign', ...payload }), [])
  const editKeywords = useCallback((payload) => callShopeeAds({ action: 'ads_edit_keywords', ...payload }), [])

  // ── Nosso banco (fase92) ─────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase.from('shopee_ads_settings').select('*').eq('id', 1).maybeSingle()
    if (error) throw error
    return data
  }, [])

  const saveSettings = useCallback(async (patch, userName) => {
    const { error } = await supabase.from('shopee_ads_settings')
      .upsert({ id: 1, ...patch, updated_at: new Date().toISOString(), updated_by_name: userName || null })
    if (error) throw error
  }, [])

  const fetchCredits = useCallback(async () => {
    const { data, error } = await supabase.from('shopee_ads_credits')
      .select('*').order('data', { ascending: false }).order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  }, [])

  // Recarga lançada pela equipe. `launchInFinance` cria também a conta no
  // Financeiro (bills) já paga — mesmo caminho do useBills: insere a conta
  // "aberto" e um pagamento; o trigger handle_bill_payment marca "pago".
  const addCredit = useCallback(async (credit, { launchInFinance, categoryId, user } = {}) => {
    let billId = null
    if (launchInFinance) {
      const { data: bill, error: billErr } = await supabase.from('bills').insert({
        description: `Recarga Shopee Ads${credit.forma_pagamento ? ` (${credit.forma_pagamento})` : ''}`,
        amount: Number(credit.valor),
        due_date: credit.data,
        status: 'aberto',
        category_id: categoryId || null,
        notes: credit.observacao || 'Lançado pelo módulo Shopee Ads',
      }).select('id').single()
      if (billErr) throw new Error(`Recarga não salva — erro ao criar a conta no Financeiro: ${billErr.message}`)
      billId = bill.id
      const { error: payErr } = await supabase.from('bill_payments').insert({
        bill_id: billId, amount: Number(credit.valor), paid_at: credit.data, notes: 'Recarga Shopee Ads',
      })
      if (payErr) throw new Error(`Conta criada no Financeiro, mas o pagamento não foi registrado: ${payErr.message}`)
    }
    const { error } = await supabase.from('shopee_ads_credits').insert({
      ...credit,
      valor: Number(credit.valor),
      bonus: Number(credit.bonus || 0),
      bill_id: billId,
      created_by: user?.id || null,
      created_by_name: user?.name || null,
    })
    if (error) throw error
  }, [])

  const updateCredit = useCallback(async (id, patch) => {
    const { error } = await supabase.from('shopee_ads_credits').update(patch).eq('id', id)
    if (error) throw error
  }, [])

  const deleteCredit = useCallback(async (id) => {
    const { error } = await supabase.from('shopee_ads_credits').delete().eq('id', id)
    if (error) throw error
  }, [])

  const fetchBalanceHistory = useCallback(async (days = 90) => {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const { data, error } = await supabase.from('shopee_ads_balance_snapshots')
      .select('captured_at, balance, auto_top_up, source')
      .gte('captured_at', since).order('captured_at', { ascending: true })
    if (error) throw error
    return data || []
  }, [])

  const fetchActionsLog = useCallback(async (campaignId = null, limit = 200) => {
    let q = supabase.from('shopee_ads_actions_log').select('*').order('created_at', { ascending: false }).limit(limit)
    if (campaignId) q = q.eq('campaign_id', String(campaignId))
    const { data, error } = await q
    if (error) throw error
    return data || []
  }, [])

  const fetchExpenseCategories = useCallback(async () => {
    const { data } = await supabase.from('expense_categories').select('id, name').order('name')
    return data || []
  }, [])

  // Faturamento total Shopee no período (todas as vendas, não só Ads) —
  // pra mostrar quanto das vendas veio de anúncio. Mesma regra do
  // useShopeeInsights.fetchOverview: soma preço × qtd dos itens, sem
  // cancelados, paginado (PostgREST corta em 1000 linhas).
  const fetchShopeeRevenueByDay = useCallback(async (start, end) => {
    const rows = await fetchAllRows((from, to) => supabase
      .from('order_items')
      .select('order_id, qty, preco_unit, orders!inner(id, data_venda, status_ml)')
      .eq('orders.source', 'shopee')
      .gte('orders.data_venda', `${start}T00:00:00-03:00`)
      .lte('orders.data_venda', `${end}T23:59:59-03:00`)
      .order('order_id', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to))
    const byDay = {}
    const orderIds = new Set()
    ;(rows || []).forEach(r => {
      if ((r.orders?.status_ml || '').toLowerCase().includes('cancelad')) return
      const day = toISODateBR(new Date(r.orders.data_venda))
      byDay[day] = (byDay[day] || 0) + (Number(r.preco_unit) || 0) * (Number(r.qty) || 1)
      orderIds.add(r.order_id)
    })
    return { byDay, total: Object.values(byDay).reduce((s, v) => s + v, 0), orders: orderIds.size }
  }, [])

  return {
    fetchDashboard, fetchShopDaily, fetchShopHourly, fetchCampaigns, fetchCampaignHourly,
    fetchRecommendedItems, fetchRecommendedKeywords, fetchRecommendedRoi, snapshotBalance,
    editCampaign, editKeywords,
    fetchSettings, saveSettings, fetchCredits, addCredit, updateCredit, deleteCredit,
    fetchBalanceHistory, fetchActionsLog, fetchExpenseCategories, fetchShopeeRevenueByDay,
  }
}
