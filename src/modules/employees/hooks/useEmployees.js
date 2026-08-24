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


export function useEmployees() {
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('active', true)
      .order('name')

    if (error) { toast.error('Erro ao carregar funcionários.'); console.error(error) }
    else setEmployees(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // Retorna o ID do funcionário criado — necessário para vincular ao usuário Auth
  async function create(payload) {
    const { data, error } = await supabase
      .from('employees')
      .insert(payload)
      .select('id')
      .single()

    if (error) { toast.error('Erro ao cadastrar funcionário.'); throw error }
    toast.success('Funcionário cadastrado!')
    await fetch()
    return data.id // ← retorna o ID para o modal vincular ao profile
  }

  async function update(id, payload) {
    const { error } = await supabase.from('employees').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar funcionário.'); throw error }
    toast.success('Funcionário atualizado!')
    await fetch()
  }

  async function remove(id) {
    const { error } = await supabase.from('employees').update({ active: false }).eq('id', id)
    if (error) { toast.error('Erro ao remover funcionário.'); throw error }
    toast.success('Funcionário removido.')
    await fetch()
  }

  return { employees, loading, refetch: fetch, create, update, remove }
}
