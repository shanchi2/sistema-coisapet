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


export function useProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:product_categories(id, name, color)
      `)
      .order('name')

    if (error) {
      toast.error('Erro ao carregar produtos.')
      console.error(error)
    } else {
      setProducts(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function create(payload) {
    const { error } = await supabase.from('products').insert(payload)
    if (error) {
      if (error.code === '23505') toast.error('Já existe um produto com este SKU.')
      else toast.error('Erro ao cadastrar produto.')
      throw error
    }
    toast.success('Produto cadastrado!')
    await fetch()
  }

  async function update(id, payload) {
    const { error } = await supabase.from('products').update(payload).eq('id', id)
    if (error) {
      if (error.code === '23505') toast.error('Já existe um produto com este SKU.')
      else toast.error('Erro ao atualizar produto.')
      throw error
    }
    toast.success('Produto atualizado!')
    await fetch()
  }

  async function remove(id) {
    // Soft delete — mantém histórico
    const { error } = await supabase.from('products').update({ active: false }).eq('id', id)
    if (error) { toast.error('Erro ao remover produto.'); throw error }
    toast.success('Produto removido.')
    await fetch()
  }

  // Ajuste manual de estoque (correção de contagem, quebra etc.) — via
  // RPC (fase63), grava o movimento pra auditoria/relatório junto.
  async function adjustStock(productId, delta, reason) {
    const session = getSession()
    const { data, error } = await supabase.rpc('adjust_product_stock', {
      p_product_id: productId, p_delta: delta, p_reason: reason || null, p_user_id: session.id || null,
    })
    if (error) { toast.error('Erro ao ajustar estoque: ' + error.message); throw error }
    await auditLog('update', 'products', productId, `Estoque ajustado (${delta > 0 ? '+' : ''}${delta})${reason ? `: ${reason}` : ''}`)
    toast.success('Estoque ajustado!')
    await fetch()
    return data // novo stock_qty
  }

  async function fetchStockMovements(productId) {
    const { data, error } = await supabase
      .from('product_stock_movements')
      .select('id, quantity_delta, movement_type, reason, created_at, created_by_user:system_users(name)')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) { toast.error('Erro ao carregar movimentações.'); throw error }
    return data ?? []
  }

  return { products, loading, refetch: fetch, create, update, remove, adjustStock, fetchStockMovements }
}
