import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const PermissionsContext = createContext({})

export function PermissionsProvider({ children }) {
  const { user } = useAuth()
  const [perms,   setPerms]   = useState(null) // null = carregando
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setPerms({}); setLoading(false); return }
    loadPerms()
  }, [user])

  async function loadPerms() {
    setLoading(true)
    console.log('[Permissions] carregando para role:', user?.role)

    const { data, error } = await supabase
      .from('role_permissions')
      .select('module,enabled')
      .eq('role', user.role)

    console.log('[Permissions] data:', data, 'error:', error)

    const map = {}
    ;(data || []).forEach(r => { map[r.module] = r.enabled })
    console.log('[Permissions] map final:', map)
    setPerms(map)
    setLoading(false)
  }

  // Verifica se o usuário tem acesso a um módulo
  // Admin sempre tem acesso a tudo
  // Para outros perfis: precisa existir no banco E estar habilitado
  function canAccess(moduleKey) {
    if (!user) return false
    if (user.role === 'admin') return true
    if (perms === null) return false
    const result = (moduleKey in perms) && perms[moduleKey] === true
    // Log só na primeira vez para não spammar
    return result
  }

  return (
    <PermissionsContext.Provider value={{ canAccess, loading, reload: loadPerms }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}
