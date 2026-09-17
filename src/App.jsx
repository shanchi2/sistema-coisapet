import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import { AuthProvider }          from './contexts/AuthContext'
import { PermissionsProvider }   from './contexts/PermissionsContext'
import { usePermissions }        from './contexts/PermissionsContext'
import { ProtectedRoute, ChangePasswordRoute } from './routes/ProtectedRoute'
import { Layout }                from './components/layout/Layout'

import { LoginPage }             from './modules/auth/LoginPage'
import PublicQuotePage           from './modules/quotes/PublicQuotePage'
import { ChangePasswordPage }    from './modules/auth/ChangePasswordPage'
import { DashboardPage }         from './modules/dashboard/DashboardPage'
import { MaterialsPage }         from './modules/materials/MaterialsPage'
import { ProductsPage }          from './modules/products/ProductsPage'
import { KitsPage }              from './modules/products/KitsPage'
import { FinancialPage }         from './modules/financial/FinancialPage'
import { FinanceiroDiretoriaPage } from './modules/financial/FinanceiroDiretoriaPage'
import { DrivePage }             from './modules/drive/DrivePage'
import { CoisaDecorPage }        from './modules/coisadecor/CoisaDecorPage'
import { ReportsPage }           from './modules/reports/ReportsPage'
import { UsersPage }             from './modules/users/UsersPage'
import { SuppliersPage }         from './modules/suppliers/SuppliersPage'
import { AuditPage }             from './modules/audit/AuditPage'
import { ProductionPage }        from './modules/production/ProductionPage'
import { ChapasPage }            from './modules/production/ChapasPage'
import { MediaControlPage }      from './modules/production/MediaControlPage'
import { MediaChecklistPage }    from './modules/production/MediaChecklistPage'
import { OrdersPage }            from './modules/orders/OrdersPage'
import PickListShopee            from './modules/orders/PickListShopee'
import { ExpedicaoPage }         from './modules/shipping/ExpedicaoPage'
import { OrcamentosPage }        from './modules/orders/OrcamentosPage'
import { KanbanPage }            from './modules/kanban/KanbanPage'
import { KanbanOperacionalPage } from './modules/kanban/KanbanOperacionalPage'
import { RHOverviewPage }        from './modules/rh/RHOverviewPage'
import { RHPontoPage }           from './modules/rh/RHPontoPage'
import { RHPontoSemanalPage }    from './modules/rh/RHPontoSemanalPage'
import { RHHorasFimSemanaPage }  from './modules/rh/RHHorasFimSemanaPage'
import { RHMensagensPage }       from './modules/rh/RHMensagensPage'
import { CotacoesPage }          from './modules/quotes/CotacoesPage'
import { PurchaseBoardPage }     from './modules/purchasing/PurchaseBoardPage'
import { ChatGroupsPage }        from './modules/directors/ChatGroupsPage'
import { EmbalagensPage }        from './modules/packaging/EmbalagensPage'
import { MeetingsPage }          from './modules/meetings/MeetingsPage'
import { ManualsPage }           from './modules/manuals/ManualsPage'
import { MaintenancePage }       from './modules/maintenance/MaintenancePage'
import { ServicesPage }          from './modules/maintenance/ServicesPage'
import { PurchasesPage }         from './modules/maintenance/PurchasesPage'
import { RHRelatorioPage }       from './modules/rh/RHRelatorioPage'
import { BaixaDiariaPage }       from './modules/production/BaixaDiariaPage'
import { PassagemTurnoPage }     from './modules/production/PassagemTurnoPage'
import { AccessControlPage }     from './modules/access/AccessControlPage'
import { ProductClicksPage }     from './modules/reports/ProductClicksPage'
import { VaultPage }             from './modules/cofre/VaultPage'
import { DirectorsPage }         from './modules/directors/DirectorsPage'
import { QRCodePage }             from './modules/qrcode/QRCodePage'
import { RHHorasPage, RHFeriasPage, RHAtestadosPage, RHAvisosPage, RHHoleritesPage } from './modules/rh/RHPages'
import { VariationsPage } from './modules/products/VariationsPage'
import { ProductionEntriesPage } from './modules/production/ProductionEntriesPage'
import { BioLinksPage } from './modules/links/BioLinksPage'
import { ChecklistPage } from './modules/checklist/ChecklistPage'
import { ReviewsPage } from './modules/reviews/ReviewsPage'
import { MlAccountDashboardPage } from './modules/ml-insights/MlAccountDashboardPage'
import { ShopeeOverviewPage } from './modules/shopee-insights/ShopeeOverviewPage'
import { ShopeeActiveListingsPage } from './modules/shopee-insights/ShopeeActiveListingsPage'
import { ShopeeHealthPage } from './modules/shopee-insights/ShopeeHealthPage'
import { ShopeeItemDetailPage } from './modules/shopee-insights/ShopeeItemDetailPage'
import { ShopeeFullStockPage } from './modules/shopee-insights/ShopeeFullStockPage'
import { ShopeeVouchersPage } from './modules/shopee-insights/ShopeeVouchersPage'
import { ShopeeFlashSalePage } from './modules/shopee-insights/ShopeeFlashSalePage'
import { MlTrafficPage } from './modules/ml-insights/MlTrafficPage'
import { MlHealthPage } from './modules/ml-insights/MlHealthPage'
import { MlUpdatesHistoryPage } from './modules/ml-insights/MlUpdatesHistoryPage'
import { MlItemDetailPage } from './modules/ml-insights/MlItemDetailPage'
import { MlQuestionsReputationPage } from './modules/ml-insights/MlQuestionsReputationPage'
import { MlPromotionsPage } from './modules/ml-insights/MlPromotionsPage'
import { MlAdsPage } from './modules/ml-insights/MlAdsPage'
import { MlOpportunitiesPage } from './modules/ml-insights/MlOpportunitiesPage'
import { MlFullStockPage } from './modules/ml-insights/MlFullStockPage'
import { MlFullShipmentsPage } from './modules/ml-insights/MlFullShipmentsPage'
import { MlCouponsPage } from './modules/ml-insights/MlCouponsPage'
import { MlActiveListingsPage } from './modules/ml-insights/MlActiveListingsPage'
import { MlCreateListingPage } from './modules/ml-insights/MlCreateListingPage'
import { BlogPage } from './modules/blog/BlogPage'
import { BlogPostEditorPage } from './modules/blog/BlogPostEditorPage'
import { BlogBulkGeneratePage } from './modules/blog/BlogBulkGeneratePage'




function GuardedRoute({ moduleKey, children }) {
  const { canAccess, loading } = usePermissions()
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )
  if (!canAccess(moduleKey)) return <Navigate to="/dashboard" replace/>
  return children
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.PROD ? '/sistema' : '/'}>
      <AuthProvider>
        <PermissionsProvider>
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
            <Route path="/login" element={<LoginPage />} />
            <Route path="/cotacao/:token" element={<PublicQuotePage />} />

            <Route element={<ChangePasswordRoute />}>
              <Route path="/trocar-senha" element={<ChangePasswordPage />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              {/* Fora do <Layout /> de propósito — tela cheia, sem sidebar/header,
                  pra Expedição usar no tablet sem distração nenhuma. */}
              <Route path="/expedicao" element={<ExpedicaoPage />} />

              <Route element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />

                <Route path="/dashboard" element={<DashboardPage />} />

                {/* Produção */}
                <Route path="/producao"       element={<GuardedRoute moduleKey="producao"><ProductionPage /></GuardedRoute>} />
                <Route path="/producao/chapas" element={<GuardedRoute moduleKey="producao"><ChapasPage /></GuardedRoute>} />
                <Route path="/producao/midia"  element={<GuardedRoute moduleKey="controle-midia"><MediaControlPage /></GuardedRoute>} />
                <Route path="/producao/midia/:productId" element={<GuardedRoute moduleKey="controle-midia"><MediaChecklistPage /></GuardedRoute>} />
                <Route path="/baixa-diaria"   element={<GuardedRoute moduleKey="baixa-diaria"><BaixaDiariaPage /></GuardedRoute>} />
                <Route path="/passagem-turno" element={<GuardedRoute moduleKey="producao"><PassagemTurnoPage /></GuardedRoute>} />
                <Route path="/manutencao"     element={<GuardedRoute moduleKey="manutencao"><MaintenancePage /></GuardedRoute>} />
                <Route path="/servicos"       element={<GuardedRoute moduleKey="manutencao"><ServicesPage /></GuardedRoute>} />
                <Route path="/compras"        element={<GuardedRoute moduleKey="financeiro"><PurchasesPage /></GuardedRoute>} />
                <Route path="/manuais"        element={<GuardedRoute moduleKey="manuais"><ManualsPage /></GuardedRoute>} />
                <Route path="/qrcode"         element={<GuardedRoute moduleKey="qrcode"><QRCodePage /></GuardedRoute>} />
                <Route path="/variacoes"      element={<GuardedRoute moduleKey="produtos"><VariationsPage /></GuardedRoute>} />
                <Route path="/checklist"      element={<GuardedRoute moduleKey="checklist"><ChecklistPage /></GuardedRoute>} />
                <Route path="/avaliacoes"     element={<GuardedRoute moduleKey="avaliacoes"><ReviewsPage /></GuardedRoute>} />

                {/* Otimização ML */}
                <Route path="/ml"                element={<GuardedRoute moduleKey="ml-insights"><MlAccountDashboardPage /></GuardedRoute>} />
                <Route path="/shopee"            element={<GuardedRoute moduleKey="shopee-insights"><ShopeeOverviewPage /></GuardedRoute>} />
                <Route path="/shopee/anuncios"    element={<GuardedRoute moduleKey="shopee-insights"><ShopeeActiveListingsPage /></GuardedRoute>} />
                <Route path="/shopee/saude"       element={<GuardedRoute moduleKey="shopee-insights"><ShopeeHealthPage /></GuardedRoute>} />
                <Route path="/shopee/item/:itemId" element={<GuardedRoute moduleKey="shopee-insights"><ShopeeItemDetailPage /></GuardedRoute>} />
                <Route path="/shopee/full"        element={<GuardedRoute moduleKey="shopee-insights"><ShopeeFullStockPage /></GuardedRoute>} />
                <Route path="/shopee/cupons"      element={<GuardedRoute moduleKey="shopee-insights"><ShopeeVouchersPage /></GuardedRoute>} />
                <Route path="/shopee/flash-sale"  element={<GuardedRoute moduleKey="shopee-insights"><ShopeeFlashSalePage /></GuardedRoute>} />
                <Route path="/ml/trafego"        element={<GuardedRoute moduleKey="ml-insights"><MlTrafficPage /></GuardedRoute>} />
                <Route path="/ml/saude"          element={<GuardedRoute moduleKey="ml-insights"><MlHealthPage /></GuardedRoute>} />
                <Route path="/ml/saude/:itemId"  element={<GuardedRoute moduleKey="ml-insights"><MlItemDetailPage /></GuardedRoute>} />
                <Route path="/ml/historico"      element={<GuardedRoute moduleKey="ml-historico"><MlUpdatesHistoryPage /></GuardedRoute>} />
                <Route path="/ml/perguntas"      element={<GuardedRoute moduleKey="ml-insights"><MlQuestionsReputationPage /></GuardedRoute>} />
                <Route path="/ml/promocoes"      element={<GuardedRoute moduleKey="ml-insights"><MlPromotionsPage /></GuardedRoute>} />
                <Route path="/ml/publicidade"    element={<GuardedRoute moduleKey="ml-insights"><MlAdsPage /></GuardedRoute>} />
                <Route path="/ml/oportunidades"  element={<GuardedRoute moduleKey="ml-insights"><MlOpportunitiesPage /></GuardedRoute>} />
                <Route path="/ml/full"           element={<GuardedRoute moduleKey="ml-insights"><MlFullStockPage /></GuardedRoute>} />
                <Route path="/ml/full/envios"    element={<GuardedRoute moduleKey="ml-insights"><MlFullShipmentsPage /></GuardedRoute>} />
                <Route path="/ml/cupons"         element={<GuardedRoute moduleKey="ml-insights"><MlCouponsPage /></GuardedRoute>} />
                <Route path="/ml/anuncios"       element={<GuardedRoute moduleKey="ml-insights"><MlActiveListingsPage /></GuardedRoute>} />
                <Route path="/ml/anuncios/novo"  element={<GuardedRoute moduleKey="ml-insights"><MlCreateListingPage /></GuardedRoute>} />

                {/* Blog */}
                <Route path="/blog"             element={<GuardedRoute moduleKey="blog"><BlogPage /></GuardedRoute>} />
                <Route path="/blog/novo"        element={<GuardedRoute moduleKey="blog"><BlogPostEditorPage /></GuardedRoute>} />
                <Route path="/blog/gerar-lote"  element={<GuardedRoute moduleKey="blog"><BlogBulkGeneratePage /></GuardedRoute>} />
                <Route path="/blog/:id"         element={<GuardedRoute moduleKey="blog"><BlogPostEditorPage /></GuardedRoute>} />

                {/* Catálogo */}
                <Route path="/materia-prima"  element={<GuardedRoute moduleKey="materiais"><MaterialsPage /></GuardedRoute>} />
                <Route path="/produtos"       element={<GuardedRoute moduleKey="produtos"><ProductsPage /></GuardedRoute>} />
                <Route path="/kits"           element={<GuardedRoute moduleKey="produtos"><KitsPage /></GuardedRoute>} />
                <Route path="/fornecedores"   element={<GuardedRoute moduleKey="fornecedores"><SuppliersPage /></GuardedRoute>} />

                {/* Gestão */}
                <Route path="/financeiro"           element={<GuardedRoute moduleKey="financeiro"><FinancialPage /></GuardedRoute>} />
                <Route path="/financeiro-diretoria" element={<GuardedRoute moduleKey="financeiro-dir"><FinanceiroDiretoriaPage /></GuardedRoute>} />
                <Route path="/drive"                element={<GuardedRoute moduleKey="drive"><DrivePage /></GuardedRoute>} />
                <Route path="/coisadecor"           element={<GuardedRoute moduleKey="coisadecor"><CoisaDecorPage /></GuardedRoute>} />
                <Route path="/relatorios"           element={<GuardedRoute moduleKey="relatorios"><ReportsPage /></GuardedRoute>} />
                <Route path="/pedidos"              element={<GuardedRoute moduleKey="pedidos"><OrdersPage /></GuardedRoute>} />
                <Route path="/pick-list"            element={<GuardedRoute moduleKey="pedidos"><PickListShopee /></GuardedRoute>} />
                <Route path="/orcamentos"            element={<GuardedRoute moduleKey="orcamentos"><OrcamentosPage /></GuardedRoute>} />
                <Route path="/reunioes"             element={<GuardedRoute moduleKey="reunioes"><MeetingsPage /></GuardedRoute>} />
                <Route path="/kanban"               element={<GuardedRoute moduleKey="kanban"><KanbanPage /></GuardedRoute>} />
                <Route path="/kanban-op"            element={<GuardedRoute moduleKey="kanban-op"><KanbanOperacionalPage /></GuardedRoute>} />

                {/* RH */}
                <Route path="/rh"           element={<GuardedRoute moduleKey="rh"><RHOverviewPage /></GuardedRoute>} />
                <Route path="/rh/ponto"     element={<GuardedRoute moduleKey="rh"><RHPontoPage /></GuardedRoute>} />
                <Route path="/rh/ponto-semanal" element={<GuardedRoute moduleKey="rh"><RHPontoSemanalPage /></GuardedRoute>} />
                <Route path="/rh/horas-fim-semana" element={<GuardedRoute moduleKey="rh"><RHHorasFimSemanaPage /></GuardedRoute>} />
                <Route path="/rh/mensagens" element={<GuardedRoute moduleKey="mensagens"><RHMensagensPage /></GuardedRoute>} />
                <Route path="/cotacoes" element={<GuardedRoute moduleKey="cotacoes"><CotacoesPage /></GuardedRoute>} />
                <Route path="/compra-lousa" element={<GuardedRoute moduleKey="compra-lousa"><PurchaseBoardPage /></GuardedRoute>} />
                <Route path="/grupos-chat" element={<GuardedRoute moduleKey="grupos-chat"><ChatGroupsPage /></GuardedRoute>} />
                <Route path="/packaging" element={<GuardedRoute moduleKey="packaging"><EmbalagensPage /></GuardedRoute>} />
                <Route path="/rh/horas"     element={<GuardedRoute moduleKey="rh"><RHHorasPage /></GuardedRoute>} />
                <Route path="/rh/ferias"    element={<GuardedRoute moduleKey="rh"><RHFeriasPage /></GuardedRoute>} />
                <Route path="/rh/atestados" element={<GuardedRoute moduleKey="rh"><RHAtestadosPage /></GuardedRoute>} />
                <Route path="/rh/avisos"    element={<GuardedRoute moduleKey="rh"><RHAvisosPage /></GuardedRoute>} />
                <Route path="/rh/holerites" element={<GuardedRoute moduleKey="rh"><RHHoleritesPage /></GuardedRoute>} />
                <Route path="/rh/relatorio" element={<GuardedRoute moduleKey="rh"><RHRelatorioPage /></GuardedRoute>} />

                {/* Admin */}
                <Route path="/usuarios"  element={<GuardedRoute moduleKey="usuarios"><UsersPage /></GuardedRoute>} />
                <Route path="/historico" element={<GuardedRoute moduleKey="historico"><AuditPage /></GuardedRoute>} />
                <Route path="/acesso"    element={<GuardedRoute moduleKey="acesso"><AccessControlPage /></GuardedRoute>} />
                <Route path="/cliques"   element={<GuardedRoute moduleKey="acesso"><ProductClicksPage /></GuardedRoute>} />
                <Route path="/cofre"     element={<GuardedRoute moduleKey="cofre"><VaultPage /></GuardedRoute>} />
                <Route path="/directors" element={<GuardedRoute moduleKey="directors"><DirectorsPage /></GuardedRoute>} />
                <Route path="/producao-horistas" element={<GuardedRoute moduleKey="producao-horistas"><ProductionEntriesPage /></GuardedRoute>} />
                <Route path="/bio-links" element={<GuardedRoute moduleKey="bio-links"><BioLinksPage /></GuardedRoute>} />

                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>
          </Routes>

        </PermissionsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}