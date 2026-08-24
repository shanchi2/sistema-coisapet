import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

export function usePackaging() {
  const [boxes,   setBoxes]   = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('packaging_boxes')
      .select('*')
      .eq('active', true)
      .order('code')
    if (error) { toast.error('Erro ao carregar embalagens.'); console.error(error) }
    else setBoxes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function create(payload) {
    const { error } = await supabase.from('packaging_boxes').insert({
      code:         payload.code || null,
      box_number:   payload.box_number || null,
      dimension:    payload.dimension || null,
      product_name: payload.product_name || null,
      stock_qty:    payload.stock_qty ? parseFloat(payload.stock_qty) : 0,
      stock_min:    payload.stock_min ? parseFloat(payload.stock_min) : null,
      notes:        payload.notes || null,
    })
    if (error) { toast.error('Erro ao cadastrar caixa.'); throw error }
    toast.success('Modelo de caixa cadastrado!')
    await fetch()
  }

  async function update(id, payload) {
    const { error } = await supabase.from('packaging_boxes').update({
      code:         payload.code || null,
      box_number:   payload.box_number || null,
      dimension:    payload.dimension || null,
      product_name: payload.product_name || null,
      stock_min:    payload.stock_min ? parseFloat(payload.stock_min) : null,
      notes:        payload.notes || null,
      updated_at:   new Date().toISOString(),
    }).eq('id', id)
    if (error) { toast.error('Erro ao atualizar caixa.'); throw error }
    toast.success('Modelo atualizado!')
    await fetch()
  }

  async function remove(id) {
    const { error } = await supabase.from('packaging_boxes').update({ active: false }).eq('id', id)
    if (error) { toast.error('Erro ao remover.'); throw error }
    toast.success('Modelo removido.')
    await fetch()
  }

  // Lança entrada ou saída — grava o movimento E atualiza o saldo
  async function moveStock(boxId, type, qty, notes) {
    const { id: uid } = getSession()
    const box = boxes.find(b => b.id === boxId)
    if (!box) return

    const delta = type === 'entrada' ? qty : -qty
    const newQty = Math.max(0, (parseFloat(box.stock_qty) || 0) + delta)

    const { error: moveErr } = await supabase.from('packaging_stock_movements').insert({
      box_id: boxId, type, qty, notes: notes || null, created_by: uid || null,
    })
    if (moveErr) { toast.error('Erro ao registrar movimentação.'); throw moveErr }

    const { error: updErr } = await supabase.from('packaging_boxes').update({
      stock_qty: newQty, updated_at: new Date().toISOString(),
    }).eq('id', boxId)
    if (updErr) { toast.error('Erro ao atualizar estoque.'); throw updErr }

    toast.success(type === 'entrada' ? `+${qty} adicionado ao estoque!` : `-${qty} baixado do estoque!`)
    await fetch()
  }

  async function fetchMovements(boxId) {
    const { data, error } = await supabase
      .from('packaging_stock_movements')
      .select('*, author:system_users!created_by(name)')
      .eq('box_id', boxId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) { toast.error('Erro ao carregar histórico.'); throw error }
    return data ?? []
  }

  return { boxes, loading, refetch: fetch, create, update, remove, moveStock, fetchMovements }
}
