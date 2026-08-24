import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

const CARD_SELECT = `
  *,
  requester:system_users!requested_by(name),
  purchaser:system_users!purchased_by(name),
  receiver:system_users!received_by(name),
  supplier:suppliers(name),
  attachments:purchase_board_attachments(id)
`

const CARD_DETAIL_SELECT = `
  *,
  requester:system_users!requested_by(name),
  purchaser:system_users!purchased_by(name),
  receiver:system_users!received_by(name),
  supplier:suppliers(name),
  attachments:purchase_board_attachments(*, uploader:system_users!uploaded_by(name))
`

export function usePurchaseBoard() {
  const [cards,   setCards]   = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('purchase_board_cards')
      .select(CARD_SELECT)
      .order('created_at', { ascending: false })
    if (error) { toast.error('Erro ao carregar Compra da Lousa.'); console.error(error) }
    else setCards(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function fetchOne(id) {
    const { data, error } = await supabase
      .from('purchase_board_cards')
      .select(CARD_DETAIL_SELECT)
      .eq('id', id).single()
    if (error) { toast.error('Erro ao carregar o card.'); throw error }
    return data
  }

  // ── Cria pedido (coluna "A Comprar") — Produção lança ────────────
  async function createCard({ title, qty_needed, qty_unit, estimated_value, priority, request_notes }) {
    const { id: uid } = getSession()
    const { data: card, error } = await supabase.from('purchase_board_cards').insert({
      title, qty_needed: qty_needed || null, qty_unit: qty_unit || 'un',
      estimated_value: estimated_value || null, priority: priority || 'normal',
      request_notes: request_notes || null, requested_by: uid || null,
    }).select('id, title, qty_needed, qty_unit, priority').single()

    if (error) { toast.error('Erro ao lançar item.'); throw error }

    // Notifica Administrativo + Diretor, já com um resumo do que é
    const { data: notifyUsers } = await supabase.from('system_users')
      .select('id').in('role', ['admin', 'administrativo']).eq('active', true)
    if (notifyUsers?.length) {
      const qtyTxt = card.qty_needed ? ` (${card.qty_needed} ${card.qty_unit || 'un'})` : ''
      const urgTxt = card.priority === 'urgente' ? '🔥 URGENTE — ' : ''
      await supabase.from('notifications').insert(notifyUsers.map(u => ({
        user_id: u.id, type: 'purchase_request',
        title: 'Novo item na Compra da Lousa',
        body: `${urgTxt}${card.title}${qtyTxt} precisa ser comprado.`,
        link: '/compra-lousa',
      })))
    }

    toast.success('Item lançado na Compra da Lousa!')
    await fetchAll()
    return card
  }

  // ── Marca como "Comprado" — preenche dados da compra ─────────────
  async function markPurchased(id, payload) {
    const { id: uid } = getSession()
    const { error } = await supabase.from('purchase_board_cards').update({
      status: 'comprado',
      purchased_by: uid || null,
      purchased_at: new Date().toISOString(),
      estimated_delivery_date: payload.estimated_delivery_date || null,
      qty_purchased: payload.qty_purchased || null,
      purchase_value: payload.purchase_value || null,
      purchased_where: payload.purchased_where || null,
      supplier_id: payload.supplier_id || null,
      purchase_notes: payload.purchase_notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) { toast.error('Erro ao marcar como comprado.'); throw error }
    toast.success('Marcado como comprado!')
    await fetchAll()
  }

  // ── Volta uma etapa (sem precisar preencher formulário de novo) ──
  async function moveBack(id, currentStatus) {
    const prev = currentStatus === 'entregue' ? 'comprado' : 'a_comprar'
    const { error } = await supabase.from('purchase_board_cards').update({
      status: prev, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) { toast.error('Erro ao voltar etapa.'); throw error }
    toast.success('Voltou pra ' + (prev === 'comprado' ? 'Comprado' : 'A Comprar') + '.')
    await fetchAll()
  }

  // ── Marca como "Entregue" — Produção confirma recebimento ────────
  async function markDelivered(id, payload) {
    const { id: uid } = getSession()
    const { error } = await supabase.from('purchase_board_cards').update({
      status: 'entregue',
      received_by: uid || null,
      received_at: payload.received_at || new Date().toISOString(),
      received_notes: payload.received_notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) { toast.error('Erro ao marcar como entregue.'); throw error }
    toast.success('Marcado como entregue!')
    await fetchAll()
  }

  async function removeCard(id) {
    const { error } = await supabase.from('purchase_board_cards').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir.'); throw error }
    toast.success('Item removido.')
    await fetchAll()
  }

  // ── Anexos ─────────────────────────────────────────────────────
  async function uploadAttachment(cardId, file) {
    const { id: uid } = getSession()
    const path = `${cardId}/${Date.now()}_${file.name}`
    const { error: upErr } = await supabase.storage.from('purchase-attachments').upload(path, file, { upsert: true })
    if (upErr) { toast.error('Erro ao enviar arquivo.'); throw upErr }

    const { error } = await supabase.from('purchase_board_attachments').insert({
      card_id: cardId, file_url: path, file_name: file.name, uploaded_by: uid || null,
    })
    if (error) { toast.error('Erro ao registrar anexo.'); throw error }
    toast.success('Anexo enviado!')
  }

  async function deleteAttachment(attachmentId, fileUrl) {
    await supabase.storage.from('purchase-attachments').remove([fileUrl])
    const { error } = await supabase.from('purchase_board_attachments').delete().eq('id', attachmentId)
    if (error) { toast.error('Erro ao remover anexo.'); throw error }
    toast.success('Anexo removido.')
  }

  return {
    cards, loading, refetch: fetchAll, fetchOne,
    createCard, markPurchased, markDelivered, moveBack, removeCard,
    uploadAttachment, deleteAttachment,
  }
}
