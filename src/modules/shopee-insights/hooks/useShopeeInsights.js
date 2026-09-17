import { useCallback, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// Mesmo padrão do callMlInsights (useMlInsights.js) — extrai a mensagem
// real de erro do corpo da resposta da Edge Function.
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

function isCancelledStatus(estado) {
  return !!estado && estado.toLowerCase().includes('cancelad')
}

function toDateOnly(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Diferente do painel do ML (que busca ao vivo na API deles toda vez que
// abre a tela — comentário em MlAccountDashboardPage.jsx): aqui lemos
// direto da NOSSA tabela `orders`, já sincronizada em tempo real desde a
// Fase 1 (shopee-process-webhook). Mais rápido, sem risco de limite de
// chamada da API, e os dados já são nossos de qualquer forma.
export function useShopeeInsights() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const fetchConnectionStatus = useCallback(async () => {
    const { data, error } = await supabase.rpc('shopee_connection_status')
    if (error) throw error
    return data?.[0] ?? { connected: false }
  }, [])

  const fetchOverview = useCallback(async (days) => {
    setLoading(true)
    setError(null)
    try {
      const now = new Date()
      const periodStart = new Date(now.getTime() - days * 86400000)
      const prevStart    = new Date(now.getTime() - 2 * days * 86400000)

      // 1 consulta só, com o join embutido (order_items -> orders) e o
      // filtro de período aplicado do lado de `orders` — evita montar uma
      // lista de IDs e fazer um 2º round-trip com `.in()` gigante (a
      // Shopee já tem histórico grande da importação manual por .xlsx —
      // uma lista de milhares de IDs na URL estourava o limite e dava
      // "Bad Request", bug real achado em 16/09).
      const { data: rows, error: rowsErr } = await supabase
        .from('order_items')
        .select('order_id, titulo, sku, qty, preco_unit, orders!inner(id, data_venda, status_ml, comprador)')
        .eq('orders.source', 'shopee')
        .gte('orders.data_venda', prevStart.toISOString())
        .lte('orders.data_venda', now.toISOString())
      if (rowsErr) throw rowsErr

      const orders = new Map()
      const itemsByOrder = new Map()
      ;(rows || []).forEach(r => {
        const o = r.orders
        if (!orders.has(o.id)) orders.set(o.id, o)
        if (!itemsByOrder.has(o.id)) itemsByOrder.set(o.id, [])
        itemsByOrder.get(o.id).push({ titulo: r.titulo, sku: r.sku, qty: r.qty, preco_unit: r.preco_unit })
      })
      const ordersList = [...orders.values()]

      const orderRevenue = (o) => (itemsByOrder.get(o.id) || []).reduce((s, it) => s + (Number(it.preco_unit) || 0) * (Number(it.qty) || 1), 0)
      const orderUnits    = (o) => (itemsByOrder.get(o.id) || []).reduce((s, it) => s + (Number(it.qty) || 1), 0)

      const isCurrent = (o) => new Date(o.data_venda).getTime() >= periodStart.getTime()
      const current  = ordersList.filter(isCurrent)
      const previous = ordersList.filter(o => !isCurrent(o))
      const notCancelled = (arr) => arr.filter(o => !isCancelledStatus(o.status_ml))

      const revenueOf = (arr) => notCancelled(arr).reduce((s, o) => s + orderRevenue(o), 0)
      const unitsOf    = (arr) => notCancelled(arr).reduce((s, o) => s + orderUnits(o), 0)

      const revenue        = revenueOf(current)
      const revenuePrev    = revenueOf(previous)
      const units          = unitsOf(current)
      const orderCount     = notCancelled(current).length
      const cancelledCount = current.length - notCancelled(current).length
      const distinctBuyers = new Set(notCancelled(current).map(o => o.comprador).filter(Boolean)).size
      const revenueChangePct = revenuePrev > 0 ? (revenue - revenuePrev) / revenuePrev : null

      // Evolução diária
      const byDay = new Map()
      notCancelled(current).forEach(o => {
        const day = toDateOnly(new Date(o.data_venda))
        const prev = byDay.get(day) || { date: day, revenue: 0, units: 0 }
        prev.revenue += orderRevenue(o)
        prev.units += orderUnits(o)
        byDay.set(day, prev)
      })
      const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))

      // Padrão por dia da semana
      const byWeekday = Array.from({ length: 7 }, (_, i) => ({ label: WEEKDAY_LABELS[i], revenue: 0 }))
      notCancelled(current).forEach(o => {
        const wd = new Date(o.data_venda).getDay()
        byWeekday[wd].revenue += orderRevenue(o)
      })

      // Frequência de vendas (últimos `days`, até 30 pra não estourar o calendário)
      const calendarDays = Math.min(days, 30)
      const salesDays = new Set(notCancelled(current).map(o => toDateOnly(new Date(o.data_venda))))
      const calendar = Array.from({ length: calendarDays }, (_, i) => {
        const d = new Date(now.getTime() - (calendarDays - 1 - i) * 86400000)
        const key = toDateOnly(d)
        return { date: key, has_sale: salesDays.has(key) }
      })

      // Top produtos
      const bySku = new Map()
      notCancelled(current).forEach(o => {
        (itemsByOrder.get(o.id) || []).forEach(it => {
          const key = it.sku || it.titulo
          const prev = bySku.get(key) || { titulo: it.titulo, sku: it.sku, revenue: 0, qty: 0 }
          prev.revenue += (Number(it.preco_unit) || 0) * (Number(it.qty) || 1)
          prev.qty += Number(it.qty) || 1
          bySku.set(key, prev)
        })
      })
      const topProducts = [...bySku.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6)

      return {
        period_days: days,
        revenue: {
          revenue, units, order_count: orderCount, cancelled_count: cancelledCount,
          distinct_buyers: distinctBuyers, revenue_change_pct: revenueChangePct,
          daily, by_weekday: byWeekday, calendar, top_products: topProducts,
        },
      }
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchActiveListings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await callShopeeInsights({ action: 'active_listings' })
      return res.results || []
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const updateItemStatus = useCallback(async (itemId, unlist) => {
    return callShopeeInsights({ action: 'update_item_status', item_id: itemId, unlist })
  }, [])

  const fetchItemsHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await callShopeeInsights({ action: 'items_health' })
      return res.results || []
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchItemDetail = useCallback(async (itemId) => {
    setLoading(true)
    setError(null)
    try {
      return await callShopeeInsights({ action: 'item_detail', item_id: itemId })
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const updateItemPrice = useCallback(async (itemId, price) => {
    return callShopeeInsights({ action: 'update_item_price', item_id: itemId, price })
  }, [])

  const updateItemStock = useCallback(async (itemId, stock) => {
    return callShopeeInsights({ action: 'update_item_stock', item_id: itemId, stock })
  }, [])

  const suggestItemContent = useCallback(async (itemId) => {
    return callShopeeInsights({ action: 'suggest_item_content', item_id: itemId })
  }, [])

  const applyItemContent = useCallback(async (itemId, payload) => {
    return callShopeeInsights({ action: 'apply_item_content', item_id: itemId, ...payload })
  }, [])

  const updateItemTechnical = useCallback(async (itemId, fields) => {
    return callShopeeInsights({ action: 'update_item_technical', item_id: itemId, ...fields })
  }, [])

  const suggestItemImages = useCallback(async (itemId) => {
    return callShopeeInsights({ action: 'suggest_item_images', item_id: itemId })
  }, [])

  const generateItemImage = useCallback(async (pictureUrl, prompt) => {
    return callShopeeInsights({ action: 'generate_item_image', picture_url: pictureUrl, prompt })
  }, [])

  const generateItemImageCustom = useCallback(async (pictureUrl, instruction) => {
    return callShopeeInsights({ action: 'generate_item_image_custom', picture_url: pictureUrl, instruction })
  }, [])

  const attachItemImage = useCallback(async (itemId, imageBase64) => {
    return callShopeeInsights({ action: 'attach_item_image', item_id: itemId, image_base64: imageBase64 })
  }, [])

  const deleteItemImage = useCallback(async (itemId, imageId) => {
    return callShopeeInsights({ action: 'delete_item_image', item_id: itemId, image_id: imageId })
  }, [])

  const fetchItemPerformance = useCallback(async (title) => {
    return callShopeeInsights({ action: 'item_performance', title })
  }, [])

  const fetchSbsBoundWarehouses = useCallback(async () => {
    return callShopeeInsights({ action: 'sbs_bound_warehouses' })
  }, [])

  const fetchSbsFulfillmentStock = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await callShopeeInsights({ action: 'sbs_fulfillment_stock' })
      return res.results || []
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Cupons (Voucher) ────────────────────────────────────────────
  const fetchVoucherList = useCallback(async (status = 'all', pageNo = 1, pageSize = 50) => {
    setLoading(true)
    setError(null)
    try {
      const res = await callShopeeInsights({ action: 'voucher_list', status, page_no: pageNo, page_size: pageSize })
      return { list: res.response?.voucher_list || [], more: !!res.response?.more }
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchVoucherDetail = useCallback(async (voucherId) => {
    const res = await callShopeeInsights({ action: 'voucher_detail', voucher_id: voucherId })
    return res.response
  }, [])

  const createVoucher = useCallback(async (payload) => {
    return callShopeeInsights({ action: 'voucher_create', payload })
  }, [])

  const updateVoucher = useCallback(async (payload) => {
    return callShopeeInsights({ action: 'voucher_update', payload })
  }, [])

  const endVoucher = useCallback(async (voucherId) => {
    return callShopeeInsights({ action: 'voucher_end', voucher_id: voucherId })
  }, [])

  const deleteVoucher = useCallback(async (voucherId) => {
    return callShopeeInsights({ action: 'voucher_delete', voucher_id: voucherId })
  }, [])

  // ── Flash Sale (loja) ────────────────────────────────────────────
  const fetchFlashSaleTimeSlots = useCallback(async (startTime, endTime) => {
    const res = await callShopeeInsights({ action: 'flash_sale_time_slots', start_time: startTime, end_time: endTime })
    return res.response || []
  }, [])

  const fetchFlashSaleList = useCallback(async (type = 0, offset = 0, limit = 20) => {
    setLoading(true)
    setError(null)
    try {
      const res = await callShopeeInsights({ action: 'flash_sale_list', type, offset, limit })
      return { list: res.response?.flash_sale_list || [], total: res.response?.total_count || 0 }
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchFlashSaleDetail = useCallback(async (flashSaleId) => {
    const res = await callShopeeInsights({ action: 'flash_sale_detail', flash_sale_id: flashSaleId })
    return res.response
  }, [])

  const fetchFlashSaleItemCriteria = useCallback(async () => {
    const res = await callShopeeInsights({ action: 'flash_sale_item_criteria' })
    return res.response
  }, [])

  const createFlashSale = useCallback(async (timeslotId) => {
    return callShopeeInsights({ action: 'flash_sale_create', timeslot_id: timeslotId })
  }, [])

  const updateFlashSaleStatus = useCallback(async (flashSaleId, status) => {
    return callShopeeInsights({ action: 'flash_sale_update_status', flash_sale_id: flashSaleId, status })
  }, [])

  const deleteFlashSale = useCallback(async (flashSaleId) => {
    return callShopeeInsights({ action: 'flash_sale_delete', flash_sale_id: flashSaleId })
  }, [])

  const fetchFlashSaleItems = useCallback(async (flashSaleId, offset = 0, limit = 50) => {
    const res = await callShopeeInsights({ action: 'flash_sale_items', flash_sale_id: flashSaleId, offset, limit })
    return res.response
  }, [])

  const addFlashSaleItems = useCallback(async (flashSaleId, items) => {
    return callShopeeInsights({ action: 'flash_sale_add_items', flash_sale_id: flashSaleId, items })
  }, [])

  const updateFlashSaleItems = useCallback(async (flashSaleId, items) => {
    return callShopeeInsights({ action: 'flash_sale_update_items', flash_sale_id: flashSaleId, items })
  }, [])

  const deleteFlashSaleItems = useCallback(async (flashSaleId, itemIds) => {
    return callShopeeInsights({ action: 'flash_sale_delete_items', flash_sale_id: flashSaleId, item_ids: itemIds })
  }, [])

  return {
    loading, error, fetchConnectionStatus, fetchOverview, fetchActiveListings, updateItemStatus,
    fetchItemsHealth, fetchItemDetail, updateItemPrice, updateItemStock,
    suggestItemContent, applyItemContent, updateItemTechnical,
    suggestItemImages, generateItemImage, generateItemImageCustom, attachItemImage, deleteItemImage,
    fetchItemPerformance,
    fetchSbsBoundWarehouses, fetchSbsFulfillmentStock,
    fetchVoucherList, fetchVoucherDetail, createVoucher, updateVoucher, endVoucher, deleteVoucher,
    fetchFlashSaleTimeSlots, fetchFlashSaleList, fetchFlashSaleDetail, fetchFlashSaleItemCriteria,
    createFlashSale, updateFlashSaleStatus, deleteFlashSale,
    fetchFlashSaleItems, addFlashSaleItems, updateFlashSaleItems, deleteFlashSaleItems,
  }
}
