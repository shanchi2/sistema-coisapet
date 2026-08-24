import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Menu } from 'lucide-react'
import { ChatWidget } from '../chat/ChatWidget'
import { MLSaleToast } from '../notifications/MLSaleToast'
import { ChatLayoutProvider, useChatLayout, DOCKED_WIDTH } from '../../contexts/ChatLayoutContext'

const PAGE_TITLES = {
  '/dashboard':     'Dashboard',
  '/pedidos':       'Pedidos',
  '/materia-prima': 'Matéria-Prima',
  '/produtos':      'Produtos',
  '/producao':      'Produção',
  '/financeiro':    'Financeiro',
  '/relatorios':    'Relatórios',
  '/fornecedores':  'Fornecedores',
  '/usuarios':      'Usuários',
  '/historico':     'Histórico de Ações',
}

export function Layout() {
  return (
    <ChatLayoutProvider>
      <LayoutInner />
    </ChatLayoutProvider>
  )
}

function LayoutInner() {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? 'CoisaPet'
  const { mode } = useChatLayout()

  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)

  // Fecha ao navegar no mobile
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false)
  }, [pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50" style={{overflowX:"hidden"}}>

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />

      <div
        className="flex-1 flex flex-col min-w-0 overflow-hidden"
        style={{
          marginRight: mode === 'docked' ? DOCKED_WIDTH : 0,
          transition: 'margin-right .2s ease',
        }}
      >
        <Header title={title} onMenuToggle={() => setSidebarOpen(o => !o)} />
        <main
          className="flex-1 p-6 animate-fade-in"
          style={{ overflowY: 'auto', overflowX: 'hidden' }}
        >
          <Outlet />
        </main>
      </div>

      {/* Botão hamburguer flutuante — só aparece no mobile quando sidebar fechada */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed bottom-6 right-5 z-40 md:hidden
                     w-12 h-12 rounded-2xl shadow-lg
                     flex items-center justify-center
                     transition-all active:scale-95"
          style={{ backgroundColor: '#1E293B' }}
          aria-label="Abrir menu"
        >
          <Menu size={20} color="white" />
        </button>
      )}

      <ChatWidget />
      <MLSaleToast />
    </div>
  )
}
