import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, Boxes, Package,
  Factory, DollarSign, Users, BarChart2, LogOut,
  ChevronRight, Truck, History,
  TrendingUp, Calendar, FileSpreadsheet, MessageSquare, MessagesSquare,
  FileText, Bell, Receipt, LayoutGrid, Kanban, BookOpen, Wrench, CalendarCheck2, PackageMinus,
  PanelLeftClose, PanelLeftOpen, Shield, MousePointerClick, ShoppingCart, ShoppingBag, Lock, HardDrive, Gem, PackageSearch, Star, QrCode, Layers, Link2, ClipboardCheck, Clock,
} from 'lucide-react'
import { useAuth }        from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'

const NAV_SECTIONS = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard',  moduleKey: 'dashboard', icon: LayoutDashboard, label: 'Dashboard',  roles: ['admin','administrativo','atendimento','producao','marketplace'] },
      { to: '/pedidos',    moduleKey: 'pedidos',    icon: ClipboardList,   label: 'Pedidos',    roles: ['admin','administrativo','atendimento'] },
      { to: '/pick-list',  moduleKey: 'pedidos',    icon: PackageSearch,   label: 'Pick List',  roles: ['admin','administrativo','atendimento'] },
      { to: '/orcamentos', moduleKey: 'orcamentos', icon: Receipt,         label: 'Orçamentos', roles: ['admin','administrativo','atendimento'] },
    ],
  },
  {
    label: 'Produção',
    items: [
      { to: '/kanban-op',      moduleKey: 'kanban-op',    icon: Kanban,         label: 'Kanban Operacional', roles: ['admin','administrativo','atendimento','producao','marketplace'] },
      { to: '/materia-prima',  moduleKey: 'materiais',    icon: Boxes,          label: 'Matéria-Prima',     roles: ['admin','administrativo','producao','marketplace'] },
      { to: '/packaging',      moduleKey: 'packaging',    icon: Package,        label: 'Embalagem',         roles: ['admin','administrativo','producao'] },
      { to: '/produtos',       moduleKey: 'produtos',     icon: Package,        label: 'Produtos',          roles: ['admin','administrativo','producao','marketplace'] },
      { to: '/variacoes',      moduleKey: 'produtos',     icon: Layers,         label: 'Variações',         roles: ['admin','administrativo','marketplace'] },
      { to: '/producao',       moduleKey: 'producao',     icon: Factory,        label: 'Produção',          roles: ['admin','administrativo','producao'] },
      { to: '/checklist',      moduleKey: 'checklist',    icon: ClipboardCheck, label: 'Checklist Diário',  roles: ['admin','administrativo','atendimento'] },
      { to: '/manuais',        moduleKey: 'manuais',      icon: BookOpen,       label: 'Manuais',           roles: ['admin','administrativo','producao'] },
      { to: '/qrcode',        moduleKey: 'qrcode',       icon: QrCode,         label: 'QR Code',           roles: ['admin','administrativo','atendimento','producao'] },
      { to: '/manutencao',     moduleKey: 'manutencao',   icon: Wrench,         label: 'Manutenção',        roles: ['admin','administrativo','producao'] },
      { to: '/servicos',        moduleKey: 'manutencao',   icon: ShoppingCart,   label: 'Serviços', roles: ['admin','administrativo','producao'] },
      { to: '/baixa-diaria',   moduleKey: 'baixa-diaria', icon: PackageMinus,   label: 'Baixa Diária',      roles: ['admin','administrativo','producao'] },
      { to: '/compra-lousa',   moduleKey: 'compra-lousa', icon: ShoppingBag,    label: 'Compra da Lousa',   roles: ['admin','administrativo','producao'] },
      { to: '/passagem-turno', moduleKey: 'producao',     icon: ClipboardList,  label: 'Passagem de Turno', roles: ['admin','administrativo','producao'] },
      { to: '/avaliacoes', moduleKey: 'avaliacoes', icon: Star, label: 'Avaliações', roles: ['admin','administrativo','atendimento'] },
    ],
  },
  {
    label: 'Recursos Humanos',
    items: [
      { to: '/rh',           moduleKey: 'rh', icon: LayoutGrid,      label: 'Visão Geral',        roles: ['admin','administrativo'] },
      { to: '/rh/mensagens', moduleKey: 'mensagens', icon: MessageSquare, label: 'Mensagens e Avisos', roles: ['admin'] },
      { to: '/rh/horas',     moduleKey: 'rh', icon: TrendingUp,      label: 'Banco de Horas',     roles: ['admin','administrativo'] },
      { to: '/rh/ferias',    moduleKey: 'rh', icon: Calendar,        label: 'Férias',             roles: ['admin','administrativo'] },
      { to: '/rh/atestados', moduleKey: 'rh', icon: FileText,        label: 'Atestados',          roles: ['admin','administrativo'] },
      { to: '/rh/avisos',    moduleKey: 'rh', icon: Bell,            label: 'Avisos',             roles: ['admin','administrativo'] },
      { to: '/reunioes',     moduleKey: 'reunioes', icon: CalendarCheck2, label: 'Reuniões',       roles: ['admin','administrativo'] },
      { to: '/rh/holerites', moduleKey: 'rh', icon: Receipt,         label: 'Holerites',          roles: ['admin','administrativo'] },
      { to: '/rh/ponto',     moduleKey: 'rh', icon: Clock,           label: 'Registros de Ponto', roles: ['admin','administrativo'] },
      { to: '/rh/relatorio', moduleKey: 'rh', icon: FileSpreadsheet, label: 'Relatório de Ponto', roles: ['admin','administrativo'] },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/financeiro',   moduleKey: 'financeiro',   icon: DollarSign,   label: 'Financeiro',   roles: ['admin','administrativo'] },
      { to: '/drive',        moduleKey: 'drive',        icon: HardDrive,    label: 'Drive',        roles: ['admin','administrativo','marketplace'] },
      { to: '/coisadecor',   moduleKey: 'coisadecor',   icon: Gem,          label: 'CoisaDecor',   roles: ['admin','administrativo'] },
      { to: '/compras',      moduleKey: 'financeiro',   icon: ShoppingCart, label: 'Compras',      roles: ['admin','administrativo'] },
      { to: '/fornecedores', moduleKey: 'fornecedores', icon: Truck,        label: 'Fornecedores', roles: ['admin','administrativo'] },
      { to: '/cotacoes',     moduleKey: 'cotacoes',     icon: ClipboardList, label: 'Cotações',     roles: ['admin','administrativo'] },
      { to: '/relatorios',   moduleKey: 'relatorios',   icon: BarChart2,    label: 'Relatórios',   roles: ['admin','administrativo'] },
      { to: '/usuarios',     moduleKey: 'usuarios',     icon: Users,        label: 'Usuários',     roles: ['admin','administrativo'] },
    ],
  },
  {
    label: 'Diretoria',
    items: [
      { to: '/kanban',     moduleKey: 'kanban',     icon: Kanban,          label: 'Kanban',     roles: ['admin','administrativo'] },
      { to: '/financeiro-diretoria', moduleKey: 'financeiro-dir', icon: DollarSign, label: 'Fin. Diretoria',     roles: ['admin'] },
      { to: '/directors',            moduleKey: 'directors',       icon: Star,       label: 'Compras Diretoria', roles: ['admin'] },
      { to: '/cofre',                moduleKey: 'cofre',           icon: Lock,       label: 'Cofre de Senhas',   roles: ['admin'] },
      { to: '/grupos-chat',          moduleKey: 'grupos-chat',     icon: MessagesSquare, label: 'Grupos de Chat', roles: ['admin'] },
      { to: '/bio-links',            moduleKey: 'bio-links',       icon: Link2,          label: 'Links da Bio',       roles: ['admin'] },
      { to: '/producao-horistas',    moduleKey: 'producao-horistas', icon: ClipboardList,  label: 'Produção Horistas',  roles: ['admin'] },
      { to: '/historico',            moduleKey: 'historico',       icon: History,    label: 'Histórico',          roles: ['admin'] },
      { to: '/acesso',               moduleKey: 'acesso',          icon: Shield,              label: 'Controle de Acesso', roles: ['admin'] },
      { to: '/cliques',              moduleKey: 'acesso',          icon: MousePointerClick,   label: 'Cliques no Site',    roles: ['admin'] },
    ],
  },
]

// Menu fixo e mínimo pro escritório (terceiros) — Dashboard + Kanban só.
// Não passa pelo canAccess() dinâmico porque escritório não tem
// permissões de módulo configuradas (não é um colaborador normal).
const ESCRITORIO_SECTIONS = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard', moduleKey: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/kanban-op', moduleKey: 'kanban-op',  icon: Kanban,         label: 'Kanban'    },
    ],
  },
]

// Cor própria por categoria — 'base' pro fundo do item ativo/realce da seção,
// 'light' pro ícone/texto do item ativo (tom mais claro da mesma cor)
const SECTION_COLORS = {
  'Principal':        { base: '#F43F5E', light: '#FCA5B8' }, // rose
  'Produção':         { base: '#F59E0B', light: '#FCD34D' }, // amber
  'Recursos Humanos': { base: '#8B5CF6', light: '#C4B5FD' }, // violeta
  'Gestão':           { base: '#0EA5E9', light: '#7DD3FC' }, // azul
  'Diretoria':        { base: '#D946EF', light: '#F0ABFC' }, // magenta
}
const DEFAULT_SECTION_COLOR = SECTION_COLORS['Principal']

const ROLE_INFO = {
  admin:          { label: 'Diretor',        bg: 'rgba(244,63,94,0.25)',  color: '#FCA5B8' },
  administrativo: { label: 'Administrativo', bg: 'rgba(139,92,246,0.25)', color: '#C4B5FD' },
  atendimento:    { label: 'Atendimento',    bg: 'rgba(14,165,233,0.25)', color: '#7DD3FC' },
  producao:       { label: 'Produção',       bg: 'rgba(245,158,11,0.25)', color: '#FCD34D' },
  equipe:         { label: 'Equipe',         bg: 'rgba(34,197,94,0.25)',  color: '#86EFAC' },
  escritorio:     { label: 'Escritório',     bg: 'rgba(139,92,246,0.25)', color: '#C4B5FD' },
}

// Verifica se o role do usuário pode ver o item (controle estático)
function canSee(itemRoles, userRole) {
  if (!itemRoles || itemRoles.length === 0) return true
  return itemRoles.includes(userRole)
}

// ── Tooltip para modo colapsado ───────────────────────────────────
function NavTooltip({ label, children }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50
        opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        <div className="bg-slate-800 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800"/>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ open, onToggle }) {
  const { user, signOut }   = useAuth()
  const { canAccess }       = usePermissions()
  const navigate            = useNavigate()
  const userRole            = user?.role ?? 'equipe'
  const roleInfo            = ROLE_INFO[userRole] ?? ROLE_INFO.equipe
  const isEscritorioRole    = userRole === 'escritorio'

  function handleLogout() { signOut(); navigate('/login') }

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'CP'

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex flex-col h-screen shrink-0
                  transition-transform duration-300 ease-in-out
                  md:relative md:z-auto md:translate-x-0 md:transition-[width]
                  ${open ? 'translate-x-0' : '-translate-x-full'} overflow-hidden`}
      style={{
        width: open ? '224px' : '56px',
        minWidth: open ? '224px' : '56px',
        maxWidth: open ? '224px' : '56px',
        backgroundColor: '#1E293B',
      }}
    >
      {/* Logo + botão toggle */}
      <div className="flex items-center gap-2.5 px-3 py-5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {open ? (
          <>
            <div className="w-8 h-8 bg-rose-400 rounded-lg flex items-center justify-center shrink-0">
              <span style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: '14px', color: 'white' }}>CP</span>
            </div>
            <div className="flex-1 min-w-0" style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: '15px', lineHeight: 1 }}>
              <span style={{ color: '#FCA5B8' }}>coisa</span>
              <span style={{ color: '#FCD34D' }}>pet</span>
            </div>
            <button onClick={onToggle}
              className="p-1.5 rounded-lg transition-colors shrink-0"
              style={{ color: 'rgba(255,255,255,0.35)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
              title="Recolher menu">
              <PanelLeftClose size={16}/>
            </button>
          </>
        ) : (
          <button onClick={onToggle}
            className="w-8 h-8 bg-rose-400 rounded-lg flex items-center justify-center mx-auto transition-all hover:bg-rose-300"
            title="Expandir menu">
            <PanelLeftOpen size={15} style={{ color: 'white' }}/>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {(isEscritorioRole ? ESCRITORIO_SECTIONS : NAV_SECTIONS).map(({ label, items }) => {
          // Filtra pela permissão dinâmica do banco (fonte da verdade)
          // canSee é ignorado — quem decide é o controle de acesso
          // Admin vê tudo sempre (canAccess já trata isso)
          // Escritório usa a lista fixa acima, sem passar pelo canAccess
          // (não tem permissões de módulo configuradas)
          const visible = isEscritorioRole ? items : items.filter(item => canAccess(item.moduleKey))
          if (visible.length === 0) return null
          const sc = SECTION_COLORS[label] ?? DEFAULT_SECTION_COLOR
          return (
            <div key={label} className="mb-3">
              {open && (
                <div className="flex items-center gap-1.5 px-4 pt-4 pb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sc.base }}/>
                  <p style={{ fontSize: '10px', fontWeight: 800, color: sc.base + 'B0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {label}
                  </p>
                </div>
              )}
              {!open && <div className="mt-3 mb-1 mx-3 h-px" style={{ background: sc.base + '40' }}/>}

              {/* Caixa da seção — dá a quebra visual entre blocos */}
              <div className={open ? 'mx-2 rounded-2xl py-1' : ''} style={open ? { backgroundColor: sc.base + '0C' } : {}}>
                {visible.map(({ to, icon: Icon, label: itemLabel }) => (
                  open ? (
                    <NavLink key={to} to={to}
                      end={to === '/rh'}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 mx-2 px-3 py-2 rounded-xl text-sm transition-all ${isActive ? 'font-semibold' : 'hover:bg-[var(--nav-hover)]'}`
                      }
                      style={({ isActive }) => ({
                        '--nav-hover': sc.base + '14',
                        ...(isActive
                          ? { backgroundColor: sc.base + '2E', color: '#fff' }
                          : { color: 'rgba(255,255,255,0.50)' })
                      })}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon size={16} style={{ color: isActive ? sc.light : sc.light + 'B3' }}/>
                          <span style={{ fontFamily: 'Nunito Sans, sans-serif' }}>{itemLabel}</span>
                          {isActive && <ChevronRight size={13} className="ml-auto" style={{ color: sc.light + '80' }}/>}
                        </>
                      )}
                    </NavLink>
                  ) : (
                    <NavTooltip key={to} label={itemLabel}>
                      <NavLink to={to}
                        end={to === '/rh'}
                        className={({ isActive }) =>
                          `flex items-center justify-center w-9 h-9 mx-auto rounded-xl transition-all ${isActive ? '' : 'hover:bg-[var(--nav-hover)]'}`
                        }
                        style={({ isActive }) => ({
                          '--nav-hover': sc.base + '14',
                          ...(isActive ? { backgroundColor: sc.base + '2E' } : {})
                        })}
                      >
                        {({ isActive }) => (
                          <Icon size={17} style={{ color: isActive ? sc.light : sc.light + 'B3' }}/>
                        )}
                      </NavLink>
                    </NavTooltip>
                  )
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Usuário + logout */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '10px' }}>
        {open ? (
          <>
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl mb-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: roleInfo.bg }}>
                <span style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: '11px', color: roleInfo.color }}>{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate" style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{user?.name ?? '...'}</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: roleInfo.bg, color: roleInfo.color }}>
                  {roleInfo.label}
                </span>
              </div>
            </div>
            <button onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl transition-all text-sm"
              style={{ color: 'rgba(255,255,255,0.35)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
            >
              <LogOut size={14}/>
              <span style={{ fontFamily: 'Nunito Sans, sans-serif' }}>Sair</span>
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <NavTooltip label={user?.name ?? '...'}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center cursor-default"
                style={{ backgroundColor: roleInfo.bg }}>
                <span style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: '10px', color: roleInfo.color }}>{initials}</span>
              </div>
            </NavTooltip>
            <NavTooltip label="Sair">
              <button onClick={handleLogout}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                style={{ color: 'rgba(255,255,255,0.35)' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
              >
                <LogOut size={14}/>
              </button>
            </NavTooltip>
          </div>
        )}
      </div>
    </aside>
  )
}