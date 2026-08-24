import { useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth }  from '../../../contexts/AuthContext'
import toast from 'react-hot-toast'

export function useAudit() {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(false)
  const [total,   setTotal]   = useState(0)
  const { user } = useAuth()

  // ── Define o usuário via session_key ────────────────────────────
  async function setAuditUser(userId) {
    if (!userId) return
    // Mantém compatibilidade antiga
    await supabase.rpc('set_audit_user', { p_user_id: userId })
  }

  // ── Registra uma ação passando o usuário diretamente ─────────────
  // Isso garante que o nome apareça mesmo com conexões REST sem sessão
  async function log(action, tableName, recordId, description, oldData = null, newData = null) {
    try {
      await supabase.rpc('insert_audit_log', {
        p_action:      action,
        p_table_name:  tableName,
        p_record_id:   recordId,
        p_description: description,
        p_old_data:    oldData ? oldData : null,
        p_new_data:    newData ? newData : null,
        p_user_id:     user?.id   ?? null,
        p_user_name:   user?.name ?? null,
      })
    } catch (err) {
      console.warn('Audit log falhou silenciosamente:', err)
    }
  }

  // ── Busca logs com filtros e paginação ──────────────────────────
  const fetchLogs = useCallback(async ({
    page        = 1,
    pageSize    = 30,
    userId      = '',
    tableName   = '',
    action      = '',
    search      = '',
    dateStart   = '',
    dateEnd     = '',
  } = {}) => {
    setLoading(true)
    try {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (userId)    query = query.eq('user_id', userId)
      if (tableName) query = query.eq('table_name', tableName)
      if (action)    query = query.eq('action', action)
      if (search)    query = query.ilike('description', `%${search}%`)
      if (dateStart) query = query.gte('created_at', dateStart + 'T00:00:00')
      if (dateEnd)   query = query.lte('created_at', dateEnd   + 'T23:59:59')

      query = query.range((page - 1) * pageSize, page * pageSize - 1)

      const { data, error, count } = await query

      if (error) throw error
      setLogs(data ?? [])
      setTotal(count ?? 0)
    } catch (err) {
      toast.error('Erro ao carregar histórico.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { logs, loading, total, fetchLogs, setAuditUser, log }
}
