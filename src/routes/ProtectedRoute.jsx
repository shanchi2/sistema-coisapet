import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Roles que NÃO têm acesso ao /sistema — apenas ao /equipe (PWA)
const SISTEMA_BLOCKED_ROLES = ['equipe']

function AcessoNegado() {
  const { signOut } = useAuth()
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#F8FAFC', fontFamily: 'Nunito Sans, sans-serif',
      padding: '24px', gap: '16px', textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: '#FFF1F2', display: 'flex',
        alignItems: 'center', justifyContent: 'center', marginBottom: 8,
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
          stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', fontFamily: 'Nunito, sans-serif' }}>
          Acesso restrito
        </h1>
        <p style={{ fontSize: 14, color: '#64748B', marginTop: 8, maxWidth: 340 }}>
          Sua conta não tem permissão para acessar o sistema de gestão.
          Use o aplicativo da equipe para registrar ponto, férias e mais.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <a href="/equipe/" style={{
          padding: '10px 20px', borderRadius: 12, background: '#F43F5E',
          color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none',
        }}>
          Ir para o App da Equipe
        </a>
        <button onClick={signOut} style={{
          padding: '10px 20px', borderRadius: 12, background: '#F1F5F9',
          color: '#64748B', fontWeight: 700, fontSize: 14,
          border: '1px solid #E2E8F0', cursor: 'pointer',
        }}>
          Sair
        </button>
      </div>
    </div>
  )
}

export function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#F8FAFC',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '4px solid #FCE7F3', borderTopColor: '#F43F5E',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // Equipe → só acessa /equipe, nunca o /sistema
  if (SISTEMA_BLOCKED_ROLES.includes(user.role)) {
    return <AcessoNegado />
  }

  return <Outlet />
}

export function ChangePasswordRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (!user.must_change_password) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
