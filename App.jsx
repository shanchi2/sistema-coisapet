import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import { AuthProvider }          from './contexts/AuthContext'
import { ProtectedRoute, ChangePasswordRoute } from './routes/ProtectedRoute'
import { Layout }                from './components/layout/Layout'

import { LoginPage }             from './modules/auth/LoginPage'
import { ChangePasswordPage }    from './modules/auth/ChangePasswordPage'
import { DashboardPage }         from './modules/dashboard/DashboardPage'
import { MaterialsPage }         from './modules/materials/MaterialsPage'
import { ProductsPage }          from './modules/products/ProductsPage'
import { FinancialPage }         from './modules/financial/FinancialPage'
import { ReportsPage }           from './modules/reports/ReportsPage'
import { UsersPage }             from './modules/users/UsersPage'
import { SuppliersPage }         from './modules/suppliers/SuppliersPage'
import { AuditPage }             from './modules/audit/AuditPage'
import { ComingSoonPage }        from './components/ui/ComingSoonPage'
import { ProductionPage }        from './modules/production/ProductionPage'

export default function App() {
  return (
    //<BrowserRouter basename={import.meta.env.PROD ? '/coisapet' : '/'}>
    <BrowserRouter basename={import.meta.env.PROD ? '/sistema' : '/'}>

      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              fontFamily: 'Nunito Sans, sans-serif',
              fontSize: '14px',
              borderRadius: '12px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
              border: '1px solid #F1F5F9',
            },
            success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#F43F5E', secondary: '#fff' } },
          }}
        />

        <Routes>
          {/* ── Público ── */}
          <Route path="/login" element={<LoginPage />} />

          {/* ── Troca de senha obrigatória (primeiro login) ── */}
          <Route element={<ChangePasswordRoute />}>
            <Route path="/trocar-senha" element={<ChangePasswordPage />} />
          </Route>

          {/* ── Área protegida ── */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />

              <Route path="/dashboard"     element={<DashboardPage />} />
              <Route path="/materia-prima" element={<MaterialsPage />} />
              <Route path="/produtos"      element={<ProductsPage />} />
              <Route path="/financeiro"    element={<FinancialPage />} />
              <Route path="/relatorios"    element={<ReportsPage />} />
              <Route path="/fornecedores" element={<SuppliersPage />} />
              <Route path="/usuarios"      element={<UsersPage />} />
              <Route path="/historico"     element={<AuditPage />} />

              <Route path="/pedidos" element={
                <ComingSoonPage title="Pedidos" description="Gestão de pedidos com impacto direto no estoque e produção." />
              } />
              <Route path="/producao" element={<ProductionPage />} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
