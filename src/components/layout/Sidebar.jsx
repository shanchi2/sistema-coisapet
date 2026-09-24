import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, Boxes, Package,
  Factory, DollarSign, Users, BarChart2, LogOut,
  ChevronRight, ChevronDown, Truck, History,
  TrendingUp, Calendar, FileSpreadsheet, MessageSquare, MessagesSquare,
  FileText, Bell, Receipt, LayoutGrid, Kanban, BookOpen, Wrench, CalendarCheck2, PackageMinus,
  PanelLeftClose, PanelLeftOpen, Shield, MousePointerClick, ShoppingCart, ShoppingBag, Lock, HardDrive, Gem, Star, QrCode, Layers, Link2, ClipboardCheck, Clock,
  HeartPulse, MessageCircleQuestion, Tag, Rocket, Store, Warehouse, Megaphone, Newspaper, Ticket, Film, Zap,
  Briefcase, Crown, Bookmark, Component, RotateCcw,
} from 'lucide-react'
import { useAuth }        from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { supabase }       from '../../lib/supabase'

// Único item fixo do grupo "Favoritos" — o resto do grupo é montado na
// hora, por usuário, a partir do que a pessoa marcar com a bandeirinha
// (ver toggleFavorite). Não faz parte de NAV_SECTIONS de propósito:
// não tem "lugar de origem" pra voltar quando não está favoritado.
const DASHBOARD_ITEM = { to: '/dashboard', moduleKey: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin','administrativo','atendimento','producao','marketplace'] }

const NAV_SECTIONS = [
  {
    label: 'Otimização ML',
    items: [
      { to: '/ml',            moduleKey: 'ml-insights', icon: LayoutDashboard,       label: 'Visão Geral',           roles: ['admin','marketplace'] },
      { to: '/ml/anuncios',   moduleKey: 'ml-insights', icon: Store,                 label: 'Anúncios',              roles: ['admin','marketplace'] },
      { to: '/ml/trafego',    moduleKey: 'ml-insights', icon: TrendingUp,            label: 'Tráfego & Conversão',   roles: ['admin','marketplace'] },
      { to: '/ml/saude',      moduleKey: 'ml-insights', icon: HeartPulse,            label: 'Saúde dos Anúncios',    roles: ['admin','marketplace'] },
      { to: '/ml/historico',  moduleKey: 'ml-historico', icon: History,              label: 'Histórico de Atualizações', roles: ['admin','marketplace','atendimento'] },
      { to: '/ml/perguntas',  moduleKey: 'ml-insights', icon: MessageCircleQuestion, label: 'Perguntas & Reputação', roles: ['admin','marketplace'] },
      { to: '/ml/promocoes',  moduleKey: 'ml-insights', icon: Tag,                   label: 'Promoções',             roles: ['admin','marketplace'] },
      { to: '/ml/cupons',     moduleKey: 'ml-insights', icon: Ticket,                label: 'Cupons',                roles: ['admin','marketplace'] },
      { to: '/ml/publicidade', moduleKey: 'ml-insights', icon: Megaphone,            label: 'Publicidade',           roles: ['admin','marketplace'] },
      { to: '/ml/oportunidades', moduleKey: 'ml-insights', icon: Rocket,             label: 'Oportunidades de Venda', roles: ['admin','marketplace'] },
      { to: '/ml/full',       moduleKey: 'ml-insights', icon: Warehouse,             label: 'Estoque Full',          roles: ['admin','marketplace'] },
      { to: '/ml/full/envios', moduleKey: 'ml-insights', icon: Truck,                label: 'Gestão de Envios Full', roles: ['admin','marketplace'] },
    ],
  },
  {
    label: 'Shopee',
    items: [
      { to: '/shopee',          moduleKey: 'shopee-insights', icon: LayoutDashboard, label: 'Visão Geral', roles: ['admin','marketplace'] },
      { to: '/shopee/anuncios', moduleKey: 'shopee-insights', icon: Store,           label: 'Anúncios',    roles: ['admin','marketplace'] },
      { to: '/shopee/saude',    moduleKey: 'shopee-insights', icon: HeartPulse,      label: 'Saúde dos Anúncios', roles: ['admin','marketplace'] },
      { to: '/shopee/retornos', moduleKey: 'shopee-insights', icon: RotateCcw,       label: 'Retornos', roles: ['admin','marketplace'] },
      { to: '/shopee/full',     moduleKey: 'shopee-insights', icon: Warehouse,       label: 'Estoque Full', roles: ['admin','marketplace'] },
      { to: '/shopee/cupons',     moduleKey: 'shopee-insights', icon: Ticket, label: 'Cupons', roles: ['admin','marketplace'] },
      { to: '/shopee/flash-sale', moduleKey: 'shopee-insights', icon: Zap,    label: 'Flash Sale', roles: ['admin','marketplace'] },
    ],
  },
  {
    label: 'Blog',
    items: [
      { to: '/blog', moduleKey: 'blog', icon: Newspaper, label: 'Posts', roles: ['admin','marketplace'] },
      { to: '/blog/gerar-lote', moduleKey: 'blog', icon: Layers, label: 'Geração em Massa', roles: ['admin','marketplace'] },
    ],
  },
  {
    label: 'Produção',
    items: [
      { to: '/pedidos',        moduleKey: 'pedidos',      icon: ClipboardList,  label: 'Pedidos',            roles: ['admin','administrativo','atendimento'] },
      { to: '/orcamentos',     moduleKey: 'orcamentos',   icon: Receipt,        label: 'Orçamentos',         roles: ['admin','administrativo','atendimento'] },
      { to: '/kanban-op',      moduleKey: 'kanban-op',    icon: Kanban,         label: 'Kanban Operacional', roles: ['admin','administrativo','atendimento','producao','marketplace'] },
      { to: '/materia-prima',  moduleKey: 'materiais',    icon: Boxes,          label: 'Matéria-Prima',     roles: ['admin','administrativo','producao','marketplace'] },
      { to: '/packaging',      moduleKey: 'packaging',    icon: Package,        label: 'Embalagem',         roles: ['admin','administrativo','producao'] },
      { to: '/produtos',       moduleKey: 'produtos',     icon: Package,        label: 'Produtos',          roles: ['admin','administrativo','producao','marketplace'] },
      { to: '/kits',           moduleKey: 'produtos',     icon: Component,      label: 'Kits',               roles: ['admin','administrativo','producao','marketplace'] },
      { to: '/variacoes',      moduleKey: 'produtos',     icon: Layers,         label: 'Variações',         roles: ['admin','administrativo','marketplace'] },
      { to: '/producao',       moduleKey: 'producao',     icon: Factory,        label: 'Produção',          roles: ['admin','administrativo','producao'] },
      { to: '/producao/chapas', moduleKey: 'producao',    icon: Layers,         label: 'Chapas',            roles: ['admin','administrativo','producao'] },
      { to: '/producao/midia',  moduleKey: 'controle-midia', icon: Film,        label: 'Atualização de Mídia', roles: ['admin','administrativo','atendimento'] },
      { to: '/checklist',      moduleKey: 'checklist',    icon: ClipboardCheck, label: 'Checklist Diário',  roles: ['admin','administrativo','atendimento'] },
      { to: '/manuais',        moduleKey: 'manuais',      icon: BookOpen,       label: 'Manuais',           roles: ['admin','administrativo','producao'] },
      { to: '/qrcode',        moduleKey: 'qrcode',       icon: QrCode,         label: 'QR Code',           roles: ['admin','administrativo','atendimento','producao'] },
      { to: '/manutencao',     moduleKey: 'manutencao',   icon: Wrench,         label: 'Manutenção',        roles: ['admin','administrativo','producao'] },
      { to: '/servicos',        moduleKey: 'manutencao',   icon: ShoppingCart,   label: 'Serviços', roles: ['admin','administrativo','producao'] },
      { to: '/baixa-diaria',   moduleKey: 'baixa-diaria', icon: PackageMinus,   label: 'Baixa Diária',      roles: ['admin','administrativo','producao'] },
      { to: '/compra-lousa',   moduleKey: 'compra-lousa', icon: ShoppingBag,    label: 'Compra da Lousa',   roles: ['admin','administrativo','producao'] },
      { to: '/producao-horistas', moduleKey: 'producao-horistas', icon: Clock, label: 'Produção Horistas', roles: ['admin'] },
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
      { to: '/blog-banners',         moduleKey: 'blog-banners',    icon: Megaphone,      label: 'Banners do Blog',    roles: ['admin'] },
      { to: '/historico',            moduleKey: 'historico',       icon: History,    label: 'Histórico',          roles: ['admin'] },
      { to: '/acesso',               moduleKey: 'acesso',          icon: Shield,              label: 'Controle de Acesso', roles: ['admin'] },
      { to: '/cliques',              moduleKey: 'acesso',          icon: MousePointerClick,   label: 'Cliques no Site',    roles: ['admin'] },
    ],
  },
]

// Rotas que têm outra rota do menu "aninhada" embaixo delas (ex: '/ml'
// e '/ml/anuncios', ou '/producao' e '/producao/chapas') — precisam de
// `end` no NavLink pra não ficarem marcadas como ativas junto com a
// filha (NavLink por padrão faz match por PREFIXO). Calculado uma vez
// aqui, a partir das rotas reais, pra nunca mais esquecer de atualizar
// isso à mão quando uma rota nova ganhar uma sub-rota.
const ALL_NAV_PATHS = NAV_SECTIONS.flatMap(s => s.items.map(i => i.to))
const PARENT_NAV_PATHS = new Set(
  ALL_NAV_PATHS.filter(to => ALL_NAV_PATHS.some(other => other !== to && other.startsWith(to + '/')))
)

// Índice plano (rota → item) pra resolver um favorito salvo (só a rota
// fica no banco) de volta pro ícone/label/roles reais do módulo.
const ITEM_BY_PATH = new Map(NAV_SECTIONS.flatMap(s => s.items).map(item => [item.to, item]))

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
  'Favoritos':        { base: '#F43F5E', light: '#FCA5B8' }, // rose
  // ML é amarelo (cor real da marca) e Produção fica com o verde que
  // era do ML antes — troca pedida pelo Raphael (16/09), faz mais
  // sentido com a identidade visual de cada marketplace.
  'Otimização ML':    { base: '#F59E0B', light: '#FCD34D' }, // amber
  'Shopee':           { base: '#EE4D2D', light: '#FDBA74' }, // laranja Shopee
  'Blog':              { base: '#6366F1', light: '#A5B4FC' }, // indigo
  'Produção':         { base: '#10B981', light: '#6EE7B7' }, // emerald
  'Recursos Humanos': { base: '#8B5CF6', light: '#C4B5FD' }, // violeta
  'Gestão':           { base: '#0EA5E9', light: '#7DD3FC' }, // azul
  'Diretoria':        { base: '#D946EF', light: '#F0ABFC' }, // magenta
}
const DEFAULT_SECTION_COLOR = SECTION_COLORS['Favoritos']

// Ícone próprio por grupo — usado no cabeçalho do acordeão, no lugar do
// pontinho colorido antigo (dá mais peso visual sem precisar de cor forte)
const SECTION_ICONS = {
  'Favoritos':        Bookmark,
  'Otimização ML':    TrendingUp,
  'Shopee':           ShoppingBag,
  'Blog':              Newspaper,
  'Produção':         Factory,
  'Recursos Humanos': Users,
  'Gestão':           Briefcase,
  'Diretoria':        Crown,
}

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

const SIDEBAR_SECTIONS_KEY = 'coisapet_sidebar_sections'

export function Sidebar({ open, onToggle }) {
  const { user, signOut }   = useAuth()
  const { canAccess }       = usePermissions()
  const navigate            = useNavigate()
  const location             = useLocation()
  const userRole            = user?.role ?? 'equipe'
  const roleInfo            = ROLE_INFO[userRole] ?? ROLE_INFO.equipe
  const isEscritorioRole    = userRole === 'escritorio'

  // Preferência de grupos abertos/fechados no menu — só existe quando o
  // usuário mexe manualmente; padrão (sem preferência salva) é só
  // "Principal" aberto. Fica no localStorage (por navegador), não no
  // banco — é só conveniência visual, não precisa sincronizar entre PCs.
  const [manualSections, setManualSections] = useState(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_SECTIONS_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })

  function toggleSection(label, currentlyOpen) {
    setManualSections(prev => {
      const next = { ...prev, [label]: !currentlyOpen }
      try { localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }

  // Favoritos — bandeirinha por módulo, salva por USUÁRIO (não por
  // navegador, ao contrário da preferência de grupo aberto/fechado
  // acima) pra acompanhar a pessoa entre os PCs de casa/escritório.
  // O item favoritado continua aparecendo no grupo original também —
  // isso aqui é um atalho fixado no topo, não uma mudança de lugar.
  const [favorites, setFavorites] = useState([])
  useEffect(() => {
    if (!user?.id || isEscritorioRole) return
    let cancelled = false
    supabase.from('user_sidebar_favorites').select('nav_to').eq('user_id', user.id)
      .then(({ data }) => { if (!cancelled) setFavorites((data ?? []).map(r => r.nav_to)) })
    return () => { cancelled = true }
  }, [user?.id, isEscritorioRole])

  async function toggleFavorite(to) {
    if (!user?.id) return
    const isFav = favorites.includes(to)
    setFavorites(prev => isFav ? prev.filter(t => t !== to) : [...prev, to])
    if (isFav) {
      await supabase.from('user_sidebar_favorites').delete().eq('user_id', user.id).eq('nav_to', to)
    } else {
      await supabase.from('user_sidebar_favorites').insert({ user_id: user.id, nav_to: to })
    }
  }

  const favoritosItems = [DASHBOARD_ITEM, ...favorites.map(to => ITEM_BY_PATH.get(to)).filter(Boolean)]
  const renderSections = isEscritorioRole ? ESCRITORIO_SECTIONS : [{ label: 'Favoritos', items: favoritosItems }, ...NAV_SECTIONS]

  // Fecha sozinho o grupo que você acabou de sair, quando o clique leva
  // pra um módulo de OUTRO grupo — só o grupo "antigo" fecha, qualquer
  // outro que você tenha deixado aberto de propósito continua do jeito
  // que estava. Baseado só nos grupos "de verdade" (não no Favoritos,
  // que é um atalho — ele não deve fechar sozinho por causa disso).
  const sectionsForRole = isEscritorioRole ? ESCRITORIO_SECTIONS : NAV_SECTIONS
  const activeSectionLabel = sectionsForRole.find(({ items }) =>
    items.some(({ to }) => location.pathname === to || location.pathname.startsWith(to + '/'))
  )?.label ?? null
  const prevActiveSectionRef = useRef(null)
  useEffect(() => {
    const prevLabel = prevActiveSectionRef.current
    if (prevLabel && prevLabel !== activeSectionLabel) {
      setManualSections(prev => {
        const next = { ...prev, [prevLabel]: false }
        try { localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(next)) } catch { /* noop */ }
        return next
      })
    }
    prevActiveSectionRef.current = activeSectionLabel
  }, [activeSectionLabel])

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
        {renderSections.map(({ label, items }) => {
          // Filtra pela permissão dinâmica do banco (fonte da verdade)
          // canSee é ignorado — quem decide é o controle de acesso
          // Admin vê tudo sempre (canAccess já trata isso)
          // Escritório usa a lista fixa acima, sem passar pelo canAccess
          // (não tem permissões de módulo configuradas)
          const visible = isEscritorioRole ? items : items.filter(item => canAccess(item.moduleKey))
          if (visible.length === 0) return null
          const sc = SECTION_COLORS[label] ?? DEFAULT_SECTION_COLOR
          const containsActive = visible.some(({ to }) => location.pathname === to || location.pathname.startsWith(to + '/'))
          const manualOpen = manualSections[label]
          const isSectionOpen = (manualOpen !== undefined ? manualOpen : label === 'Favoritos') || containsActive
          const SectionIcon = SECTION_ICONS[label] ?? LayoutGrid
          return (
            <div key={label} className="mb-2">
              {open && (
                <button type="button" onClick={() => toggleSection(label, isSectionOpen)}
                  className="w-[calc(100%-16px)] mx-2 mt-3 mb-1 flex items-center gap-2 px-2 py-2 rounded-xl transition-colors hover:bg-[var(--sec-hover)]"
                  style={{ '--sec-hover': sc.base + '16' }}>
                  <SectionIcon size={15} className="shrink-0" style={{ color: sc.light }}/>
                  <span className="flex-1 text-left truncate" style={{ fontSize: '12.5px', fontWeight: 700, color: sc.base + 'DD', fontFamily: 'Nunito Sans, sans-serif' }}>
                    {label}
                  </span>
                  {!isSectionOpen && (
                    <span className="shrink-0 text-[10px] font-bold leading-none px-1.5 py-1 rounded-full"
                      style={{ color: sc.light, backgroundColor: sc.base + '22' }}>
                      {visible.length}
                    </span>
                  )}
                  <ChevronDown size={13} className="shrink-0 transition-transform duration-200"
                    style={{ color: sc.base + '90', transform: isSectionOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}/>
                </button>
              )}
              {!open && <div className="mt-3 mb-1 mx-3 h-px" style={{ background: sc.base + '40' }}/>}

              {/* Caixa da seção — dá a quebra visual entre blocos; recolhe/expande no toggle acima */}
              <div className={open ? 'mx-2 rounded-2xl overflow-hidden transition-all duration-200' : ''}
                style={open ? {
                  backgroundColor: sc.base + '0C',
                  maxHeight: isSectionOpen ? `${visible.length * 40 + 16}px` : '0px',
                  opacity: isSectionOpen ? 1 : 0,
                  paddingTop: isSectionOpen ? '4px' : 0,
                  paddingBottom: isSectionOpen ? '4px' : 0,
                } : {}}>
                {visible.map(({ to, icon: Icon, label: itemLabel }) => {
                  const canFavorite = !isEscritorioRole && to !== '/dashboard'
                  const isFav = favorites.includes(to)
                  return open ? (
                    <div key={to} className="relative group/row mx-2">
                      <NavLink to={to}
                        end={PARENT_NAV_PATHS.has(to)}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${canFavorite ? 'pr-8' : ''} ${isActive ? 'font-semibold' : 'hover:bg-[var(--nav-hover)]'}`
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
                            <Icon size={16} className="shrink-0" style={{ color: isActive ? sc.light : sc.light + 'B3' }}/>
                            <span className="truncate" style={{ fontFamily: 'Nunito Sans, sans-serif' }}>{itemLabel}</span>
                            {isActive && !canFavorite && <ChevronRight size={13} className="ml-auto shrink-0" style={{ color: sc.light + '80' }}/>}
                          </>
                        )}
                      </NavLink>
                      {canFavorite && (
                        <button type="button"
                          onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(to) }}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-opacity ${isFav ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}
                          title={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}>
                          <Bookmark size={13} fill={isFav ? sc.light : 'none'} style={{ color: sc.light }}/>
                        </button>
                      )}
                    </div>
                  ) : (
                    <NavTooltip key={to} label={itemLabel}>
                      <NavLink to={to}
                        end={PARENT_NAV_PATHS.has(to)}
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
                })}
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