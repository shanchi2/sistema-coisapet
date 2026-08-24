import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

async function auditLog(action, tableName, recordId, description) {
  try {
    const s = getSession()
    if (!s?.id) return
    await supabase.rpc('audit_log_with_user', {
      p_user_id:     s.id,
      p_action:      action,
      p_table_name:  tableName,
      p_record_id:   recordId,
      p_description: description,
    })
  } catch {}
}


/**
 * useBillOfMaterials — gerencia a ficha técnica de um produto.
 *
 * Carrega os itens vinculados ao productId informado,
 * com o join para nome/unidade da matéria-prima.
 */
export function useBillOfMaterials(productId) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!productId) { setItems([]); setLoading(false); return }
    setLoading(true)

    const { data, error } = await supabase
      .from('bill_of_materials')
      .select(`
        *,
        raw_material:raw_materials(id, name, unit, stock_qty, unit_cost)
      `)
      .eq('product_id', productId)
      .order('created_at')

    if (error) {
      toast.error('Erro ao carregar ficha técnica.')
      console.error(error)
    } else {
      setItems(data ?? [])
    }
    setLoading(false)
  }, [productId])

  useEffect(() => { fetch() }, [fetch])

  // Adiciona um insumo à ficha técnica
  async function addItem(rawMaterialId, qtyRequired, notes = null) {
    const { error } = await supabase
      .from('bill_of_materials')
      .insert({
        product_id:      productId,
        raw_material_id: rawMaterialId,
        qty_required:    Number(qtyRequired),
        notes:           notes || null,
      })

    if (error) {
      if (error.code === '23505') {
        toast.error('Este insumo já está na ficha técnica.')
      } else {
        toast.error('Erro ao adicionar insumo.')
      }
      throw error
    }

    toast.success('Insumo adicionado à ficha técnica!')
    await fetch()
  }

  // Atualiza quantidade ou observação de um item
  async function updateItem(id, qty, notes = null) {
    const { error } = await supabase
      .from('bill_of_materials')
      .update({ qty_required: Number(qty), notes: notes || null })
      .eq('id', id)

    if (error) { toast.error('Erro ao atualizar item.'); throw error }
    toast.success('Item atualizado!')
    await fetch()
  }

  // Remove um insumo da ficha técnica
  async function removeItem(id) {
    const { error } = await supabase
      .from('bill_of_materials')
      .delete()
      .eq('id', id)

    if (error) { toast.error('Erro ao remover insumo.'); throw error }
    toast.success('Insumo removido da ficha técnica.')
    await fetch()
  }

  // Calcula quantas unidades o estoque atual suporta fabricar
  const canProduce = items.length === 0
    ? null
    : Math.min(
        ...items.map(item => {
          const stock = Number(item.raw_material?.stock_qty ?? 0)
          const qty   = Number(item.qty_required)
          return qty > 0 ? Math.floor(stock / qty) : Infinity
        })
      )

  return { items, loading, refetch: fetch, addItem, updateItem, removeItem, canProduce }
}
