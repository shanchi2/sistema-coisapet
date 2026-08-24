import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

function itemsPayload(budgetId, items) {
  return items.map((it, i) => ({
    budget_id:  budgetId,
    product_id: it.product_id || null,
    name:       it.name,
    sku:        it.sku || null,
    photo_url:  it.photo_url || null,
    unit_price: it.unit_price,
    qty:        it.qty,
    category:   it.category,
    sort_order: i,
  }))
}

// Monta um resumo legível do que mudou — vira o texto do histórico
function diffBudget(before, after) {
  const changes = []
  if ((before.customer_name || '') !== (after.customerName || '')) {
    changes.push(`Cliente: ${before.customer_name || '—'} → ${after.customerName || '—'}`)
  }
  if ((before.customer_phone || '') !== (after.customerPhone || '')) {
    changes.push('WhatsApp alterado')
  }
  if ((before.notes || '') !== (after.notes || '')) {
    changes.push('Observações alteradas')
  }
  const beforeCount = before.items?.length || 0
  if (beforeCount !== after.items.length) {
    changes.push(`Itens: ${beforeCount} → ${after.items.length}`)
  }
  const beforeTotal = (before.items || []).reduce((a, it) => a + (it.unit_price || 0) * (it.qty || 0), 0)
  const afterTotal  = after.items.reduce((a, it) => a + (it.unit_price || 0) * (it.qty || 0), 0)
  if (Math.abs(beforeTotal - afterTotal) > 0.009) {
    const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    changes.push(`Total: ${fmt(beforeTotal)} → ${fmt(afterTotal)}`)
  }
  return changes.length ? changes.join(' · ') : 'Sem alterações relevantes'
}

export function useBudgets() {
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('budgets')
      .select('*, items:budget_items(count), creator:system_users!created_by(name)')
      .order('created_at', { ascending: false })
    if (error) { toast.error('Erro ao carregar orçamentos.'); console.error(error) }
    else setBudgets(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function fetchOne(id) {
    const { data, error } = await supabase
      .from('budgets')
      .select('*, items:budget_items(*), history:budget_history(*, editor:system_users!edited_by(name))')
      .eq('id', id)
      .single()
    if (error) { toast.error('Erro ao carregar orçamento.'); throw error }
    data.history = (data.history || []).sort((a, b) => new Date(b.edited_at) - new Date(a.edited_at))
    data.items   = (data.items   || []).sort((a, b) => a.sort_order - b.sort_order)
    return data
  }

  async function create({ customerName, customerPhone, notes, items }) {
    const { id: uid } = getSession()
    const total = items.reduce((a, it) => a + it.unit_price * it.qty, 0)

    const { data: budget, error } = await supabase.from('budgets').insert({
      customer_name:  customerName || null,
      customer_phone: customerPhone || null,
      notes:          notes || null,
      total,
      created_by:     uid || null,
    }).select('id, code').single()

    if (error) { toast.error('Erro ao salvar orçamento.'); throw error }

    if (items.length > 0) {
      const { error: itemsErr } = await supabase.from('budget_items').insert(itemsPayload(budget.id, items))
      if (itemsErr) { toast.error('Erro ao salvar itens do orçamento.'); throw itemsErr }
    }

    await supabase.from('budget_history').insert({
      budget_id: budget.id, edited_by: uid || null, action: 'created', summary: 'Orçamento criado',
    })

    toast.success(`Orçamento ${budget.code} salvo!`)
    await fetchAll()
    return budget
  }

  async function update(id, { customerName, customerPhone, notes, items }) {
    const { id: uid } = getSession()
    const total  = items.reduce((a, it) => a + it.unit_price * it.qty, 0)
    const before = await fetchOne(id) // pra montar o resumo do que mudou

    const { error } = await supabase.from('budgets').update({
      customer_name:  customerName || null,
      customer_phone: customerPhone || null,
      notes:          notes || null,
      total,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    if (error) { toast.error('Erro ao atualizar orçamento.'); throw error }

    // Substitui os itens (mesmo padrão já usado no resto do sistema pra listas filhas)
    await supabase.from('budget_items').delete().eq('budget_id', id)
    if (items.length > 0) {
      const { error: itemsErr } = await supabase.from('budget_items').insert(itemsPayload(id, items))
      if (itemsErr) { toast.error('Erro ao atualizar itens do orçamento.'); throw itemsErr }
    }

    const summary = diffBudget(before, { customerName, customerPhone, notes, items })
    await supabase.from('budget_history').insert({
      budget_id: id, edited_by: uid || null, action: 'updated', summary,
    })

    toast.success('Orçamento atualizado!')
    await fetchAll()
  }

  async function removeBudget(id) {
    const { error } = await supabase.from('budgets').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir orçamento.'); throw error }
    toast.success('Orçamento excluído.')
    await fetchAll()
  }

  return { budgets, loading, refetch: fetchAll, fetchOne, create, update, removeBudget }
}
