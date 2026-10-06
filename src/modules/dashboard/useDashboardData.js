import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAllRows } from '../../lib/fetchAllRows'
import { toISODateBR, todayISO } from '../../lib/dateBR'
import { isCancelledStatus } from '../orders/hooks/useOrders'
import { fetchOverdueOrders } from '../shipping/hooks/useShipping'

// Dados reais do Dashboard (06/10). Cada bloco só é buscado se o perfil
// pode vê-lo (`can` vem do DashboardPage, que cruza Controle de Acesso +
// regra de valores). Nada de R$ sai daqui pra quem não é diretor: o
// faturamento só é calculado quando `can.money`.
//
// Faturamento: `orders.total_value/total_brl` estão vazios em todos os
// pedidos (conferido 06/10) — o valor real vem dos itens (preço × qtd),
// mesma regra da Visão Geral da Shopee e do Shopee Ads.

const DAY = 86400000
const addDays = (iso, n) => toISODateBR(new Date(new Date(iso + 'T12:00:00-03:00').getTime() + n * DAY))
const brStart = iso => `${iso}T00:00:00-03:00`

export function useDashboardData(can, uid) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const key = JSON.stringify(can)

  const load = useCallback(async () => {
    setLoading(true)
    const today = todayISO()
    const monthStart = today.slice(0, 8) + '01'
    const prevMonthStart = (() => {
      const [y, m] = today.split('-').map(Number)
      return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`
    })()
    const since30 = addDays(today, -29)
    const chartStart = since30 < monthStart ? since30 : monthStart
    const ordersSince = prevMonthStart < chartStart ? prevMonthStart : chartStart

    const q = {}
    const safe = (p, fallback) => Promise.resolve(p).catch(e => { console.warn('[Dashboard]', e?.message || e); return fallback })

    if (can.orders) {
      // Itens só quando há valor a mostrar (diretor); pros demais basta o pedido.
      q.orders = safe(can.money
        ? fetchAllRows((from, to) => supabase.from('order_items')
            .select('order_id, qty, preco_unit, orders!inner(id, source, data_venda, status_ml)')
            .gte('orders.data_venda', brStart(ordersSince))
            .order('order_id', { ascending: true }).order('id', { ascending: true })
            .range(from, to))
        : fetchAllRows((from, to) => supabase.from('orders')
            .select('id, source, data_venda, status_ml')
            .gte('data_venda', brStart(ordersSince))
            .order('id', { ascending: true })
            .range(from, to)), [])
    }

    if (can.shipping) {
      q.shipToday = safe(supabase.from('orders')
        .select('id, status_ml, is_full, needs_attention, items:order_items(id, picked)')
        .eq('archived', false).eq('ship_date', today)
        .then(r => r.data || []), [])
      q.overdue = safe(fetchOverdueOrders(), [])
    }

    if (can.budgets) {
      q.budgets = safe(supabase.from('budgets')
        .select(can.money ? 'id, code, customer_name, total, created_at' : 'id, code, customer_name, created_at')
        .gte('created_at', brStart(monthStart))
        .order('created_at', { ascending: false })
        .then(r => r.data || []), [])
    }

    if (can.tasks) {
      q.tasks = safe((can.allTasks
        ? supabase.from('tasks').select('id, title, status, due_date, color, task_code, kanban_type, assignee:system_users!assigned_to(name)').neq('status', 'done')
        : supabase.from('tasks').select('id, title, status, due_date, color, task_code, kanban_type').eq('assigned_to', uid).neq('status', 'done')
      ).then(r => r.data || []), [])
    }

    if (can.messages) {
      q.messages = safe(supabase.from('employee_messages')
        .select('id, message, created_at, employee:system_users!employee_id(name)')
        .eq('status', 'pendente').order('created_at', { ascending: false })
        .then(r => r.data || []), [])
    }

    if (can.materials) {
      q.materials = safe(supabase.from('raw_materials')
        .select('id, name, unit, stock_qty, stock_min').eq('active', true)
        .then(r => r.data || []), [])
    }

    if (can.production) {
      q.production = safe(supabase.from('production_entries')
        .select('date, quantity').gte('date', addDays(today, -13))
        .then(r => r.data || []), [])
      q.productionMonth = safe(supabase.from('production_entries')
        .select('quantity').gte('date', monthStart)
        .then(r => r.data || []), [])
    }

    if (can.returns) {
      q.returns = safe(fetchAllRows((from, to) => supabase.from('shopee_returns')
        .select('return_sn, status, return_solution, tracking_number, reverse_logistics_status')
        .order('return_sn', { ascending: true }).range(from, to)), [])
      q.receipts = safe(supabase.from('shopee_return_receipts')
        .select('return_sn, status').then(r => r.data || []), [])
    }

    if (can.reviews) {
      q.reviewsPending = safe(supabase.from('product_reviews')
        .select('id', { count: 'exact', head: true }).eq('approved', false)
        .then(r => r.count || 0), 0)
      q.questionsPending = safe(supabase.from('product_questions')
        .select('id', { count: 'exact', head: true }).eq('approved', true).is('answer', null)
        .then(r => r.count || 0), 0)
    }

    if (can.checklist) {
      q.checklistTasks = safe(supabase.from('checklist_tasks')
        .select('id', { count: 'exact', head: true }).eq('active', true)
        .then(r => r.count || 0), 0)
      q.checklistDone = safe(supabase.from('checklist_entries')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', uid).eq('date', today).eq('done', true)
        .then(r => r.count || 0), 0)
    }

    if (can.clicks) {
      q.clicks = safe(fetchAllRows((from, to) => supabase.from('product_clicks')
        .select('id, clicked_at, platform, page')
        .gte('clicked_at', brStart(addDays(today, -6)))
        .order('id', { ascending: true }).range(from, to)), [])
    }

    const raw = Object.fromEntries(await Promise.all(Object.entries(q).map(async ([k, p]) => [k, await p])))
    setData(shape(raw, { can, today, monthStart, prevMonthStart, since30 }))
    setUpdatedAt(new Date())
    setLoading(false)
  }, [key, uid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  return { data, loading, updatedAt, reload: load }
}

// ─── Transforma linhas cruas em números prontos pra tela ─────────────
function shape(raw, { can, today, monthStart, prevMonthStart, since30 }) {
  const out = {}
  const dayOfMonth = Number(today.slice(8, 10))
  const prevSameDay = prevMonthStart.slice(0, 8) + String(dayOfMonth).padStart(2, '0')

  if (can.orders) {
    // Normaliza: um registro por pedido, com valor (só se veio de itens)
    const byOrder = new Map()
    ;(raw.orders || []).forEach(r => {
      const o = r.orders || r
      if (isCancelledStatus(o.status_ml)) return
      let cur = byOrder.get(o.id)
      if (!cur) {
        cur = { id: o.id, source: o.source || 'manual', day: toISODateBR(new Date(o.data_venda)), value: 0 }
        byOrder.set(o.id, cur)
      }
      if (r.orders) cur.value += (Number(r.preco_unit) || 0) * (Number(r.qty) || 1)
    })
    const orders = [...byOrder.values()]

    const days = []
    for (let d = since30; d <= today; d = addDays(d, 1)) days.push(d)
    const perDay = Object.fromEntries(days.map(d => [d, { day: d, orders: 0, value: 0 }]))
    const sum = { mtd: { orders: 0, value: 0 }, prev: { orders: 0, value: 0 }, today: 0, yesterday: 0 }
    const platforms = { ml: { orders: 0, value: 0 }, shopee: { orders: 0, value: 0 }, manual: { orders: 0, value: 0 } }
    const yesterday = addDays(today, -1)

    orders.forEach(o => {
      if (perDay[o.day]) { perDay[o.day].orders++; perDay[o.day].value += o.value }
      if (o.day === today) sum.today++
      if (o.day === yesterday) sum.yesterday++
      if (o.day >= monthStart) {
        sum.mtd.orders++; sum.mtd.value += o.value
        const p = platforms[o.source] || platforms.manual
        p.orders++; p.value += o.value
      } else if (o.day >= prevMonthStart && o.day <= prevSameDay) {
        sum.prev.orders++; sum.prev.value += o.value
      }
    })
    out.sales = { daily: days.map(d => perDay[d]), ...sum, platforms }
  }

  if (can.shipping) {

    const ship = (raw.shipToday || [])
      .filter(o => !o.is_full && (!isCancelledStatus(o.status_ml) || o.needs_attention) && (o.items || []).length > 0)
    out.shipToday = {
      total: ship.length,
      done: ship.filter(o => o.items.every(i => i.picked)).length,
    }
    out.overdue = (raw.overdue || []).length
  }

  if (can.budgets) {
    const b = raw.budgets || []
    out.budgets = { count: b.length, total: can.money ? b.reduce((s, x) => s + (Number(x.total) || 0), 0) : null, latest: b.slice(0, 5) }
  }

  if (can.tasks) {
    const t = raw.tasks || []
    out.tasks = {
      list: t.slice().sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')),
      overdue: t.filter(x => x.due_date && x.due_date < today).length,
      dueToday: t.filter(x => x.due_date === today).length,
    }
  }

  if (can.messages) out.messages = raw.messages || []

  if (can.materials) {
    const status = m => {
      const min = Number(m.stock_min) || 0, qty = Number(m.stock_qty) || 0
      if (min <= 0) return 'ok'
      return qty <= min ? 'critical' : qty <= min * 1.3 ? 'low' : 'ok'
    }
    const list = (raw.materials || []).map(m => ({ ...m, _s: status(m) })).filter(m => m._s !== 'ok')
      .sort((a, b) => (a._s === b._s ? (Number(a.stock_qty) / (Number(a.stock_min) || 1)) - (Number(b.stock_qty) / (Number(b.stock_min) || 1)) : a._s === 'critical' ? -1 : 1))
    out.materials = { critical: list.filter(m => m._s === 'critical').length, low: list.filter(m => m._s === 'low').length, list }
  }

  if (can.production) {
    const days = []
    for (let d = addDays(today, -13); d <= today; d = addDays(d, 1)) days.push(d)
    const per = Object.fromEntries(days.map(d => [d, 0]))
    ;(raw.production || []).forEach(e => { if (per[e.date] !== undefined) per[e.date] += Number(e.quantity) || 0 })
    out.production = {
      daily: days.map(d => ({ day: d, qty: per[d] })),
      today: per[today] || 0,
      month: (raw.productionMonth || []).reduce((s, e) => s + (Number(e.quantity) || 0), 0),
    }
  }

  if (can.returns) {
    // Mesma regra do filtro "Recebimento pendente" da tela de Retornos
    // (de qualquer período, como lá)
    const rec = Object.fromEntries((raw.receipts || []).map(r => [r.return_sn, r]))
    const AVARIA = new Set(['avaria_transporte', 'avaria_comprador', 'incompleto', 'produto_errado'])
    let toReceive = 0, damaged = 0
    ;(raw.returns || []).forEach(r => {
      const st = (r.status || '').toUpperCase()
      const expects = r.reverse_logistics_status === 'LOGISTICS_DELIVERY_DONE'
        || ((r.return_solution === 0 || !!r.tracking_number) && st !== 'CANCELLED' && st !== 'REJECTED')
      const receipt = rec[r.return_sn]
      if (expects && (!receipt || receipt.status === 'aguardando')) toReceive++
      if (receipt && AVARIA.has(receipt.status)) damaged++
    })
    out.returns = { toReceive, damaged }
  }

  if (can.reviews) out.reviews = { pending: raw.reviewsPending || 0, questions: raw.questionsPending || 0 }

  if (can.checklist) out.checklist = { total: raw.checklistTasks || 0, done: raw.checklistDone || 0 }

  if (can.clicks) {
    const c = raw.clicks || []
    const days = []
    for (let d = addDays(today, -6); d <= today; d = addDays(d, 1)) days.push(d)
    const per = Object.fromEntries(days.map(d => [d, 0]))
    const byPlat = {}
    c.forEach(x => {
      const d = toISODateBR(new Date(x.clicked_at))
      if (per[d] !== undefined) per[d]++
      const k = x.page === 'clo' ? 'clo' : x.platform
      byPlat[k] = (byPlat[k] || 0) + 1
    })
    out.clicks = { total: c.length, daily: days.map(d => ({ day: d, total: per[d] })), byPlat }
  }

  return out
}
