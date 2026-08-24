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


export function useProductCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading]       = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .order('name')

    if (error) {
      toast.error('Erro ao carregar categorias de produtos.')
      console.error(error)
    } else {
      setCategories(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function create(payload) {
    const { error } = await supabase.from('product_categories').insert(payload)
    if (error) { toast.error('Erro ao criar categoria.'); throw error }
    toast.success('Categoria criada!')
    await fetch()
  }

  async function update(id, payload) {
    const { error } = await supabase.from('product_categories').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar categoria.'); throw error }
    toast.success('Categoria atualizada!')
    await fetch()
  }

  async function remove(id) {
    const { error } = await supabase.from('product_categories').delete().eq('id', id)
    if (error) { toast.error('Não é possível excluir — verifique se há produtos vinculados.'); throw error }
    toast.success('Categoria removida.')
    await fetch()
  }

  return { categories, loading, refetch: fetch, create, update, remove }
}
