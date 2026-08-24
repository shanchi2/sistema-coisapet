import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

export function useQuoteRequests() {
  const [quotes,  setQuotes]  = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('quote_requests')
      .select('*, supplier:suppliers(name, phone, email), items:quote_request_items(id, unit_price)')
      .order('created_at', { ascending: false })
    if (error) { toast.error('Erro ao carregar cotações.'); console.error(error) }
    else setQuotes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function fetchOne(id) {
    const { data, error } = await supabase
      .from('quote_requests')
      .select('*, supplier:suppliers(*), items:quote_request_items(*), creator:system_users!created_by(name), approver:system_users!approved_by(name)')
      .eq('id', id).single()
    if (error) { toast.error('Erro ao carregar cotação.'); throw error }
    data.items = (data.items || []).sort((a, b) => a.sort_order - b.sort_order)
    return data
  }

  // Busca pública, por token — usada na tela que o próprio fornecedor abre (sem login)
  async function fetchByToken(token) {
    const { data, error } = await supabase
      .from('quote_requests')
      .select('*, supplier:suppliers(name), items:quote_request_items(*)')
      .eq('public_token', token)
      .single()
    if (error) throw error
    data.items = (data.items || []).sort((a, b) => a.sort_order - b.sort_order)
    return data
  }

  async function create({ supplier_id, notes, materials }) {
    const { id: uid } = getSession()
    const { data: quote, error } = await supabase.from('quote_requests').insert({
      supplier_id, notes: notes || null, created_by: uid || null,
    }).select('id, code, public_token').single()

    if (error) { toast.error('Erro ao criar cotação.'); throw error }

    if (materials.length > 0) {
      const items = materials.map((m, i) => ({
        quote_request_id:   quote.id,
        material_id:         m.id,
        material_name_snap:  m.name,
        material_notes_snap: m.notes || null,
        unit_snap:           m.unit || null,
        requested_qty:       m.qty || null,
        sort_order:          i,
      }))
      const { error: itemsErr } = await supabase.from('quote_request_items').insert(items)
      if (itemsErr) { toast.error('Erro ao adicionar itens.'); throw itemsErr }
    }

    toast.success(`Cotação ${quote.code} criada!`)
    await fetchAll()
    return quote
  }

  // Atualiza preço/prazo de um item — usado tanto pelo painel interno (César)
  // quanto pelo formulário público (o próprio fornecedor)
  async function updateItem(itemId, payload) {
    const { error } = await supabase.from('quote_request_items').update({
      unit_price:     payload.unit_price ?? null,
      min_qty:        payload.min_qty ?? null,
      lead_time_days: payload.lead_time_days ?? null,
      notes:          payload.notes ?? null,
    }).eq('id', itemId)
    if (error) throw error
  }

  async function markResponded(id) {
    const { error } = await supabase.from('quote_requests').update({
      status: 'respondido', responded_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) { toast.error('Erro ao atualizar status.'); throw error }
    toast.success('Cotação marcada como respondida!')
    await fetchAll()
  }

  async function setStatus(id, status) {
    const { id: uid } = getSession()
    const payload = { status }
    if (status === 'aprovado') { payload.approved_at = new Date().toISOString(); payload.approved_by = uid || null }
    const { error } = await supabase.from('quote_requests').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar status.'); throw error }
    toast.success('Status atualizado!')
    await fetchAll()
  }

  async function removeQuote(id) {
    const { error } = await supabase.from('quote_requests').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir cotação.'); throw error }
    toast.success('Cotação excluída.')
    await fetchAll()
  }

  return { quotes, loading, refetch: fetchAll, fetchOne, fetchByToken, create, updateItem, markResponded, setStatus, removeQuote }
}
