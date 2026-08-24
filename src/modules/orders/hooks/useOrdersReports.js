import { useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

// ─── Busca todas as linhas de uma consulta, contornando o limite
//     padrão de 1000 linhas por resposta do Supabase/PostgREST ──────
// `queryFn(from, to)` deve devolver a query já pronta (com .range aplicado).
async function fetchAllInBatches(queryFn) {
  const BATCH_SIZE = 1000
  const MAX_BATCHES = 50 // teto de segurança (50.000 linhas) contra loop infinito
  let all = []
  let from = 0

  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await queryFn(from, from + BATCH_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < BATCH_SIZE) break // último lote — acabou
    from += BATCH_SIZE
  }
  return all
}

// ─── Monta o objeto de relatório a partir dos dados brutos ─────────
function buildReport(orders, items) {
  const totalOrders = orders.length
  const totalItems  = items.reduce((a, it) => a + (it.qty || 0), 0)

  // Faturamento só é confiável para itens com preco_unit preenchido
  // (hoje, majoritariamente Mercado Livre — a Shopee não traz preço
  // por item no relatório exportado)
  const revenueKnown = items.reduce(
    (a, it) => a + (it.preco_unit ? it.preco_unit * (it.qty || 0) : 0), 0
  )
  const avgTicket = totalOrders > 0 ? revenueKnown / totalOrders : 0

  // ── Pedidos por dia, separado por plataforma (inclui manual) ──────
  const byDayMap = new Map()
  orders.forEach(o => {
    if (!o.data_venda) return
    const day = o.data_venda.slice(0, 10) // YYYY-MM-DD
    if (!byDayMap.has(day)) {
      byDayMap.set(day, { date: day, ml: 0, shopee: 0, manual: 0, total: 0 })
    }
    const entry = byDayMap.get(day)
    if (entry[o.source] !== undefined) entry[o.source] += 1
    entry.total += 1
  })
  const salesByDay = [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  // ── Produtos mais vendidos, com breakdown por plataforma ───────────
  const productMap = new Map()
  items.forEach(it => {
    const key = it.sku || it.titulo
    if (!key) return
    if (!productMap.has(key)) {
      productMap.set(key, { sku: it.sku, titulo: it.titulo, qty: 0, ml: 0, shopee: 0, manual: 0, revenue: 0 })
    }
    const p   = productMap.get(key)
    const src = it.orders?.source
    p.qty += it.qty || 0
    if (src && p[src] !== undefined) p[src] += it.qty || 0
    if (it.preco_unit) p.revenue += it.preco_unit * (it.qty || 0)
  })
  const topProducts = [...productMap.values()].sort((a, b) => b.qty - a.qty)

  // ── Totais por plataforma (para KPIs e pizza) ──────────────────────
  const platformMap = {
    ml:     { orders: 0, items: 0 },
    shopee: { orders: 0, items: 0 },
    manual: { orders: 0, items: 0 },
  }
  orders.forEach(o => { if (platformMap[o.source]) platformMap[o.source].orders += 1 })
  items.forEach(it => {
    const src = it.orders?.source
    if (src && platformMap[src]) platformMap[src].items += (it.qty || 0)
  })

  // ── Dia de pico ─────────────────────────────────────────────────
  const peakDay = salesByDay.reduce((a, b) => (b.total > (a?.total || 0) ? b : a), null)

  return {
    totalOrders, totalItems, revenueKnown, avgTicket,
    salesByDay, topProducts, platformMap, peakDay,
  }
}

export function useOrdersReports() {
  const [loading, setLoading] = useState(false)
  const [report,  setReport]  = useState(null)

  const fetchReport = useCallback(async ({ days = 30 } = {}) => {
    setLoading(true)
    try {
      const end   = new Date()
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
      const startISO = start.toISOString()
      const endISO   = end.toISOString()

      // Pedidos no período — busca em lotes de 1000 (o Supabase limita
      // cada resposta a 1000 linhas por padrão, não importa o .limit() pedido)
      const orders = await fetchAllInBatches((from, to) =>
        supabase
          .from('orders')
          .select('id, source, data_venda, total_value')
          .gte('data_venda', startISO)
          .lte('data_venda', endISO)
          .order('data_venda', { ascending: true })
          .range(from, to)
      )

      // Itens no período — mesma lógica de lotes
      const items = await fetchAllInBatches((from, to) =>
        supabase
          .from('order_items')
          .select('titulo, sku, qty, preco_unit, orders!inner(data_venda, source)')
          .gte('orders.data_venda', startISO)
          .lte('orders.data_venda', endISO)
          .range(from, to)
      )

      setReport(buildReport(orders, items))
    } catch (err) {
      console.error('Erro ao carregar relatório:', err)
      toast.error('Erro ao carregar relatório.')
    } finally {
      setLoading(false)
    }
  }, [])

  return { report, loading, fetchReport }
}
