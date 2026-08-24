import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

const SESSION_KEY      = 'coisapet_session'
const AUDIT_SESSION_KEY = 'coisapet_audit_session'

/**
 * AuthProvider — autenticação customizada via tabela system_users.
 *
 * A sessão é armazenada no localStorage como um objeto JSON.
 * A senha nunca trafega após o login — apenas os dados do usuário.
 *
 * Disponibiliza:
 *   user     → { id, name, email, role, job_title, must_change_password }
 *   loading  → true enquanto verifica sessão salva
 *   signIn   → (email, password) → lança erro se inválido
 *   signOut  → limpa sessão
 *   refreshUser → recarrega dados do usuário (após trocar senha, etc.)
 */
export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  // Carrega sessão salva ao iniciar
  useEffect(() => {
    async function init() {
      try {
        const saved = localStorage.getItem(SESSION_KEY)
        if (saved) {
          const userData = JSON.parse(saved)
          // Sessões salvas antes dessa feature existir não têm esse campo —
          // assume "agora" pra não derrubar todo mundo no dia do deploy
          if (!userData.session_started_at) userData.session_started_at = new Date().toISOString()
          setUser(userData)

          // Re-registra sessão de auditoria (pode ter expirado se o browser fechou)
          try {
            let auditKey = localStorage.getItem(AUDIT_SESSION_KEY)
            if (!auditKey) {
              auditKey = crypto.randomUUID()
              localStorage.setItem(AUDIT_SESSION_KEY, auditKey)
            }
            await supabase.rpc('register_session', {
              p_session_key: auditKey,
              p_user_id:     userData.id,
            })
            await supabase.rpc('set_audit_user', { p_user_id: userData.id })
          } catch (e) {
            console.warn('Audit session re-register falhou silenciosamente:', e)
          }
        }
      } catch {
        localStorage.removeItem(SESSION_KEY)
      }
      setLoading(false)
    }
    init()
  }, [])

  // Login — chama a RPC user_login no Supabase
  async function signIn(email, password) {
    const { data, error } = await supabase.rpc('user_login', {
      p_email:    email.trim().toLowerCase(),
      p_password: password,
    })

    if (error) throw new Error('Erro de conexão. Tente novamente.')

    // A função retorna { error: "mensagem" } em caso de falha
    if (data?.error) throw new Error(data.error)

    // Marca o início dessa sessão específica — é contra isso que a
    // checagem de "forçar logout" compara depois
    data.session_started_at = new Date().toISOString()

    // Salva sessão no localStorage
    localStorage.setItem(SESSION_KEY, JSON.stringify(data))
    setUser(data)

    // Registra sessão de auditoria — o trigger do banco vai identificar o usuário
    try {
      const auditKey = crypto.randomUUID()
      localStorage.setItem(AUDIT_SESSION_KEY, auditKey)
      await supabase.rpc('register_session', {
        p_session_key: auditKey,
        p_user_id:     data.id,
      })
      // Define também na variável de sessão para a transação atual
      await supabase.rpc('set_audit_user', { p_user_id: data.id })
    } catch (e) {
      console.warn('Audit session register falhou silenciosamente:', e)
    }

    return data
  }

  // Logout
  async function signOut() {
    // Remove sessão de auditoria do banco
    try {
      const auditKey = localStorage.getItem(AUDIT_SESSION_KEY)
      if (auditKey) {
        await supabase.rpc('unregister_session', { p_session_key: auditKey })
        localStorage.removeItem(AUDIT_SESSION_KEY)
      }
    } catch (e) {
      console.warn('Audit session unregister falhou silenciosamente:', e)
    }
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  // Atualiza os dados do usuário na sessão
  // Útil após trocar senha (must_change_password → false)
  async function refreshUser() {
    if (!user?.id) return
    const { data } = await supabase
      .from('system_users')
      .select('id, name, email, role, job_title, must_change_password')
      .eq('id', user.id)
      .single()

    if (data) {
      const updated = { ...user, ...data }
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated))
      setUser(updated)
    }
  }

  // Checagem periódica de logout forçado — a cada 30s, confere se um admin
  // pediu pra encerrar ESSA sessão específica (botão "Desconectar" na ficha
  // do usuário, em Colaboradores). Compara com o momento em que ESSA sessão
  // começou — então só afeta o usuário marcado, ninguém mais é derrubado.
  useEffect(() => {
    if (!user?.id) return

    async function checkForceLogout() {
      try {
        const { data } = await supabase
          .from('system_users')
          .select('force_logout_at')
          .eq('id', user.id)
          .single()

        if (
          data?.force_logout_at &&
          user.session_started_at &&
          new Date(data.force_logout_at) > new Date(user.session_started_at)
        ) {
          toast.error('Sessão expirada por inatividade. Faça login novamente.')
          signOut()
        }
      } catch {
        // Falha de rede não derruba a sessão — só tenta de novo no próximo ciclo
      }
    }

    const interval = setInterval(checkForceLogout, 30000) // a cada 30s
    return () => clearInterval(interval)
  }, [user?.id, user?.session_started_at])

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
