import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

async function auditLog(action, tableName, recordId, description) {
  try {
    const s = getSession()
    if (!s?.id) return
    await supabase.rpc('audit_log_with_user', {
      p_user_id: s.id, p_action: action,
      p_table_name: tableName, p_record_id: recordId,
      p_description: description,
    })
  } catch {}
}
import toast from 'react-hot-toast'

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading]     = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('active', true)
      .order('name')

    if (error) { toast.error('Erro ao carregar fornecedores.'); console.error(error) }
    else setSuppliers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function create(payload) {
    const { error } = await supabase.from('suppliers').insert(payload)
    if (error) { toast.error('Erro ao cadastrar fornecedor.'); throw error }
    toast.success('Fornecedor cadastrado!')
    await fetch()
  }

  async function update(id, payload) {
    const { error } = await supabase.from('suppliers').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar fornecedor.'); throw error }
    toast.success('Fornecedor atualizado!')
    await fetch()
  }

  async function remove(id) {
    const { error } = await supabase.from('suppliers').update({ active: false }).eq('id', id)
    if (error) { toast.error('Erro ao remover fornecedor.'); throw error }
    toast.success('Fornecedor removido.')
    await fetch()
  }

  return { suppliers, loading, refetch: fetch, create, update, remove }
}
