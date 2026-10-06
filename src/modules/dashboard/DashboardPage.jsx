import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { todayISO } from '../../lib/dateBR'
import {
  ClipboardList, Receipt, ClipboardCheck, MessageSquare, AlertTriangle,
  Package, Users, Calendar, PackageSearch, Wrench, LayoutGrid,
  MousePointerClick, Truck, RotateCcw, Star, MessageCircleQuestion, Factory,
  RefreshCw, Boxes, CalendarClock,
} from 'lucide-react'
import { useDashboardData } from './useDashboardData'
import {
  Panel, Delta, StatTile, Meter, DailyBars, PlatformShare, AttentionList, TaskList,
  fmtBRL, fmtBRLShort, fmtInt, fmtDayShort,
} from './widgets'

// ─────────────────────────────────────────────────────────────────────
// Dashboard (refeito 06/10, pedido do Raphael: visual novo + dados reais).
//
// QUEM VÊ O QUÊ — cada bloco aparece só se o perfil tem o módulo liberado
// no Controle de Acesso (canAccess) E está na lista de perfis daquele bloco.
// Valores em R$ (faturamento, ticket, total orçado) são SÓ do diretor
// (role 'admin'); os demais veem quantidades.
// ─────────────────────────────────────────────────────────────────────

const QUICK_LINKS = {
  admin: [
    { to: '/pedidos', mod: 'pedidos',          label: 'Pedidos',            icon: ClipboardList },
    { to: '/pick-list', mod: 'pedidos',        label: 'Pick List',          icon: PackageSearch },
    { to: '/kanban-op', mod: 'kanban-op',        label: 'Kanban Operacional', icon: LayoutGrid },
    { to: '/kanban', mod: 'kanban',           label: 'Kanban Diretoria',   icon: LayoutGrid },
    { to: '/rh/mensagens', mod: 'mensagens',     label: 'Mensagens',          icon: MessageSquare },
    { to: '/rh/ponto-semanal', mod: 'rh', label: 'Ponto Semanal',      icon: Calendar },
  ],
  administrativo: [
    { to: '/kanban-op', mod: 'kanban-op',  label: 'Kanban Operacional', icon: LayoutGrid },
    { to: '/pedidos', mod: 'pedidos',    label: 'Pedidos',            icon: ClipboardList },
    { to: '/orcamentos', mod: 'orcamentos', label: 'Orçamentos',         icon: Receipt },
    { to: '/rh', mod: 'rh',         label: 'RH',                 icon: Users },
  ],
  atendimento: [
    { to: '/pedidos', mod: 'pedidos',    label: 'Pedidos',            icon: ClipboardList },
    { to: '/pick-list', mod: 'pedidos',  label: 'Pick List',          icon: PackageSearch },
    { to: '/orcamentos', mod: 'orcamentos', label: 'Orçamentos',         icon: Receipt },
    { to: '/checklist', mod: 'checklist',  label: 'Checklist Diário',   icon: ClipboardCheck },
    { to: '/kanban-op', mod: 'kanban-op',  label: 'Kanban Operacional', icon: LayoutGrid },
  ],
  producao: [
    { to: '/kanban-op', mod: 'kanban-op',    label: 'Kanban Operacional', icon: LayoutGrid },
    { to: '/producao', mod: 'producao',     label: 'Produção',           icon: Factory },
    { to: '/baixa-diaria', mod: 'baixa-diaria', label: 'Baixa Diária',       icon: Package },
    { to: '/manutencao', mod: 'manutencao',   label: 'Manutenção',         icon: Wrench },
  ],
  marketplace: [
    { to: '/pedidos', mod: 'pedidos',   label: 'Pedidos',   icon: ClipboardList },
    { to: '/pick-list', mod: 'pedidos', label: 'Pick List', icon: PackageSearch },
  ],
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export function DashboardPage() {
  const { user } = useAuth()
  const { canAccess } = usePermissions()
  const role = user?.role || 'equipe'
  const isIn = (...roles) => roles.includes(role)
  const firstName = user?.name?.split(' ')[0] ?? 'tudo bem'

  const can = useMemo(() => ({
    money:      role === 'admin',
    orders:     isIn('admin', 'administrativo', 'atendimento', 'marketplace') && canAccess('pedidos'),
    shipping:   isIn('admin', 'administrativo', 'atendimento', 'marketplace', 'producao') && canAccess('pedidos'),
    budgets:    isIn('admin', 'administrativo', 'atendimento') && canAccess('orcamentos'),
    tasks:      true,
    allTasks:   role === 'admin',
    messages:   role === 'admin',
    materials:  isIn('admin', 'administrativo', 'producao') && canAccess('materiais'),
    production: isIn('admin', 'administrativo', 'producao') && canAccess('producao'),
    returns:    canAccess('shopee-retornos'),
    reviews:    isIn('admin', 'administrativo', 'atendimento') && canAccess('avaliacoes'),
    checklist:  role === 'atendimento' && canAccess('checklist'),
    clicks:     isIn('admin', 'administrativo'),
  }), [role, canAccess]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, loading, updatedAt, reload } = useDashboardData(can, user?.id)
  const today = todayISO()
  const monthName = MONTHS[Number(today.slice(5, 7)) - 1]
  const dateRaw = new Date(today + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const dateLabel = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1)

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" />
      </div>
    )
  }

  const s = data.sales
  const quickLinks = (QUICK_LINKS[role] || QUICK_LINKS.atendimento).filter(l => canAccess(l.mod))

  // ── Indicadores (até 4, na ordem de importância do perfil) ─────────
  const tiles = []
  if (s) {
    tiles.push(<StatTile key="hoje" icon={ClipboardList} tone="rose" label="Pedidos hoje" to="/pedidos"
      value={fmtInt(s.today)} detail={`Ontem: ${fmtInt(s.yesterday)}`} />)
  }
  if (data.shipToday) {
    const st = data.shipToday
    tiles.push(<StatTile key="enviar" icon={Truck} tone={st.total && st.done === st.total ? 'good' : 'sky'} label="Para enviar hoje" to="/pick-list"
      value={fmtInt(st.total)} detail={st.total ? `${fmtInt(st.done)} de ${fmtInt(st.total)} já separados` : 'Nada programado pra hoje'}>
      {st.total > 0 && <Meter value={st.done} max={st.total} tone={st.done === st.total ? 'good' : 'rose'} />}
    </StatTile>)
    tiles.push(<StatTile key="atrasados" icon={AlertTriangle} tone={data.overdue ? 'critical' : 'good'} label="Envios atrasados" to="/pick-list"
      value={fmtInt(data.overdue)} detail={data.overdue ? 'Dia de envio já passou e falta separar' : 'Nenhum pendente de dias anteriores'} />)
  }
  if (data.checklist) {
    const c = data.checklist
    tiles.push(<StatTile key="check" icon={ClipboardCheck} tone={c.total && c.done >= c.total ? 'good' : 'violet'} label="Meu checklist de hoje" to="/checklist"
      value={`${fmtInt(c.done)}/${fmtInt(c.total)}`} detail={c.total && c.done >= c.total ? 'Tudo feito 🎉' : 'itens concluídos'}>
      <Meter value={c.done} max={c.total} tone={c.total && c.done >= c.total ? 'good' : 'rose'} />
    </StatTile>)
  }
  if (data.production) {
    tiles.push(<StatTile key="prod" icon={Factory} tone="good" label="Produzido hoje" to="/producao"
      value={fmtInt(data.production.today)} detail={`${fmtInt(data.production.month)} peças em ${monthName}`} />)
  }
  if (data.budgets && !s) {
    tiles.push(<StatTile key="orc" icon={Receipt} tone="violet" label="Orçamentos no mês" to="/orcamentos" value={fmtInt(data.budgets.count)} />)
  }
  if (data.returns && !s) {
    tiles.push(<StatTile key="ret" icon={RotateCcw} tone={data.returns.toReceive ? 'warning' : 'good'} label="Devoluções a receber" to="/shopee/retornos"
      value={fmtInt(data.returns.toReceive)} detail="Produto voltando pra conferir" />)
  }
  if (data.materials && !s) {
    tiles.push(<StatTile key="mat" icon={Boxes} tone={data.materials.critical ? 'critical' : 'good'} label="Matéria-prima crítica" to="/materia-prima"
      value={fmtInt(data.materials.critical)} detail={data.materials.low ? `+ ${fmtInt(data.materials.low)} em nível baixo` : 'Estoque em dia'} />)
  }
  if (data.tasks && tiles.length < 4) {
    tiles.push(<StatTile key="tar" icon={CalendarClock} tone={data.tasks.overdue ? 'critical' : 'neutral'} label={can.allTasks ? 'Tarefas atrasadas (todos)' : 'Minhas tarefas atrasadas'} to="/kanban-op"
      value={fmtInt(data.tasks.overdue)} detail={`${fmtInt(data.tasks.dueToday)} vencem hoje`} />)
  }

  // ── Precisa de atenção ────────────────────────────────────────────
  const attention = [
    data.messages    && { key: 'msg', icon: MessageSquare, label: 'Mensagens de funcionários', hint: 'Aguardando resposta no app', count: data.messages.length, to: '/rh/mensagens', level: 'warning' },
    data.tasks       && { key: 'tar', icon: CalendarClock, label: can.allTasks ? 'Tarefas atrasadas (todos)' : 'Minhas tarefas atrasadas', count: data.tasks.overdue, to: '/kanban-op', level: 'critical' },
    data.materials   && { key: 'mat', icon: Boxes, label: 'Matéria-prima crítica', hint: data.materials.low ? `+ ${data.materials.low} em nível baixo` : undefined, count: data.materials.critical, to: '/materia-prima', level: 'critical' },
    data.returns     && { key: 'ret', icon: RotateCcw, label: 'Devoluções a receber', hint: 'Shopee — conferir quando chegar', count: data.returns.toReceive, to: '/shopee/retornos', level: 'warning' },
    data.returns     && { key: 'ava', icon: AlertTriangle, label: 'Devoluções com avaria', count: data.returns.damaged, to: '/shopee/retornos', level: 'info' },
    data.reviews     && { key: 'rev', icon: Star, label: 'Avaliações para aprovar', count: data.reviews.pending, to: '/avaliacoes', level: 'info' },
    data.reviews     && { key: 'per', icon: MessageCircleQuestion, label: 'Perguntas sem resposta', hint: 'Site', count: data.reviews.questions, to: '/avaliacoes', level: 'warning' },
  ]

  // ── Destaque principal ────────────────────────────────────────────
  let hero = null
  if (s && can.money) {
    hero = (
      <Panel className="lg:col-span-2" title={`Faturamento de ${monthName}`} subtitle="Vendas sem cancelados · ML, Shopee e manuais" to="/pedidos" linkLabel="Pedidos">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mb-5">
          <p className="font-display font-extrabold text-[44px] sm:text-5xl leading-none text-slate-800">{fmtBRL(s.mtd.value)}</p>
          <div className="flex flex-col gap-1 pb-1">
            <Delta current={s.mtd.value} previous={s.prev.value} suffix={`vs 1–${Number(today.slice(8, 10))} do mês passado`} />
            <span className="text-xs text-slate-400">{fmtInt(s.mtd.orders)} pedidos · ticket médio {fmtBRL(s.mtd.orders ? s.mtd.value / s.mtd.orders : 0)}</span>
          </div>
        </div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Por dia · últimos 30 dias</p>
        <DailyBars data={s.daily} dataKey="value" format={fmtBRL} axisFormat={v => fmtBRLShort(v).replace('R$ ', '')} />
      </Panel>
    )
  } else if (s) {
    hero = (
      <Panel className="lg:col-span-2" title={`Pedidos em ${monthName}`} subtitle="Sem cancelados · ML, Shopee e manuais" to="/pedidos" linkLabel="Pedidos">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mb-5">
          <p className="font-display font-extrabold text-5xl leading-none text-slate-800">{fmtInt(s.mtd.orders)}</p>
          <div className="pb-1"><Delta current={s.mtd.orders} previous={s.prev.orders} suffix={`vs 1–${Number(today.slice(8, 10))} do mês passado`} /></div>
        </div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Por dia · últimos 30 dias</p>
        <DailyBars data={s.daily} dataKey="orders" unit="pedidos" format={v => `${fmtInt(v)} pedidos`} />
      </Panel>
    )
  } else if (data.production) {
    const p = data.production
    hero = (
      <Panel className="lg:col-span-2" title="Produção" subtitle="Peças lançadas pela equipe" to="/producao" linkLabel="Produção">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mb-5">
          <div>
            <p className="font-display font-extrabold text-5xl leading-none text-slate-800">{fmtInt(p.today)}</p>
            <p className="text-xs text-slate-400 mt-1.5">peças hoje</p>
          </div>
          <div className="pb-1">
            <p className="font-display font-extrabold text-2xl leading-none text-slate-700">{fmtInt(p.month)}</p>
            <p className="text-xs text-slate-400 mt-1.5">no mês de {monthName}</p>
          </div>
        </div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Por dia · últimas 2 semanas</p>
        <DailyBars data={p.daily} dataKey="qty" unit="peças" format={v => `${fmtInt(v)} peças`} />
      </Panel>
    )
  }

  const attentionPanel = attention.some(Boolean) && (
    <Panel title="Precisa de atenção" subtitle="O que está esperando alguém agir">
      <AttentionList items={attention} />
    </Panel>
  )

  const materialsPanel = data.materials && data.materials.list.length > 0 && (
    <Panel title="Estoque de matéria-prima" subtitle="Itens no mínimo ou perto dele" to="/materia-prima">
      <ul className="flex flex-col gap-3">
        {data.materials.list.slice(0, 5).map(m => {
          const crit = m._s === 'critical'
          return (
            <li key={m.id}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-slate-700 truncate">{m.name}</span>
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${crit ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                  {crit ? '⚠ Crítico' : 'Baixo'}
                </span>
              </div>
              <Meter value={Number(m.stock_qty) || 0} max={(Number(m.stock_min) || 1) * 2} tone={crit ? 'rose' : 'warning'} />
              <p className="text-[11px] text-slate-400 mt-1">{fmtInt(m.stock_qty)} {m.unit} · mínimo {fmtInt(m.stock_min)}</p>
            </li>
          )
        })}
      </ul>
    </Panel>
  )

  return (
    <div className={`flex flex-col gap-5 animate-fade-in transition-opacity ${loading ? 'opacity-60' : ''}`}>

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400">{dateLabel}</p>
          <h2 className="font-display font-extrabold text-[26px] leading-tight text-slate-800 mt-0.5">{greeting()}, {firstName}!</h2>
        </div>
        <button onClick={reload} disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Atualizar'}
        </button>
      </div>

      {/* Atalhos */}
      <div className="flex flex-wrap gap-2">
        {quickLinks.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-600 transition-colors">
            <Icon size={15} />{label}
          </Link>
        ))}
      </div>

      {/* Indicadores */}
      {tiles.length > 0 && (
        <div className={`grid grid-cols-2 gap-3 ${tiles.length >= 4 ? 'lg:grid-cols-4' : tiles.length === 3 ? 'lg:grid-cols-3' : ''}`}>
          {tiles.slice(0, 4)}
        </div>
      )}

      {/* Destaque + lateral */}
      {hero && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {hero}
          {s
            ? <Panel title={can.money ? 'Por plataforma' : 'Pedidos por plataforma'} subtitle={`Em ${monthName}`}><PlatformShare platforms={s.platforms} money={can.money} /></Panel>
            : attentionPanel}
        </div>
      )}

      {/* Atenção + tarefas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {s && attentionPanel}
        {data.tasks && (
          <Panel className={(s ? attentionPanel : materialsPanel) ? 'lg:col-span-2' : 'lg:col-span-3'}
            title={can.allTasks ? 'Tarefas em aberto' : 'Minhas tarefas'}
            subtitle={`${fmtInt(data.tasks.list.length)} em aberto · ${fmtInt(data.tasks.overdue)} atrasada${data.tasks.overdue === 1 ? '' : 's'}`}
            to="/kanban-op">
            <TaskList tasks={data.tasks.list} today={today} showAssignee={can.allTasks} limit={can.allTasks ? 8 : 6} />
          </Panel>
        )}
        {!s && materialsPanel}
      </div>

      {/* Linha de baixo: mensagens, orçamentos, estoque, cliques */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {data.messages && data.messages.length > 0 && (
          <Panel title="Mensagens aguardando" to="/rh/mensagens">
            <ul className="flex flex-col -mx-2">
              {data.messages.slice(0, 5).map(m => (
                <li key={m.id}>
                  <Link to="/rh/mensagens" className="block px-2 py-2 rounded-xl hover:bg-slate-50">
                    <span className="block text-sm font-semibold text-slate-700">{m.employee?.name || 'Funcionário'}</span>
                    <span className="block text-xs text-slate-400 truncate">{m.message}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {data.budgets && data.budgets.count > 0 && (
          <Panel title="Orçamentos do mês" subtitle={can.money ? `${fmtInt(data.budgets.count)} · ${fmtBRL(data.budgets.total)} orçados` : `${fmtInt(data.budgets.count)} criados em ${monthName}`} to="/orcamentos">
            <ul className="flex flex-col -mx-2">
              {data.budgets.latest.map(b => (
                <li key={b.id} className="flex items-center justify-between gap-2 px-2 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-700 truncate">{b.customer_name || 'Cliente não informado'}</span>
                    <span className="block text-[11px] text-slate-400 font-mono">{b.code} · {fmtDayShort(b.created_at.slice(0, 10))}</span>
                  </span>
                  {can.money && <span className="text-sm font-bold text-slate-700 shrink-0">{fmtBRL(b.total)}</span>}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {s && materialsPanel}

      </div>

      {(data.clicks || (data.production && s)) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {data.clicks && (
            <Panel title="Cliques no site" subtitle={`${fmtInt(data.clicks.total)} nos últimos 7 dias`} to="/cliques">
              <DailyBars data={data.clicks.daily} dataKey="total" unit="cliques" format={v => `${fmtInt(v)} cliques`} height={130} />
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                {[['shopee', 'Shopee'], ['ml', 'Mercado Livre'], ['whatsapp', 'WhatsApp'], ['clo', 'Clô']].map(([k, l]) => (
                  <span key={k} className="text-xs text-slate-500"><MousePointerClick size={11} className="inline -mt-0.5 mr-1 text-slate-400" />{l} <strong className="text-slate-700">{fmtInt(data.clicks.byPlat[k] || 0)}</strong></span>
                ))}
              </div>
            </Panel>
          )}
          {data.production && s && (
            <Panel className={data.clicks ? 'lg:col-span-2' : 'lg:col-span-3'} title="Produção" subtitle={`${fmtInt(data.production.today)} peças hoje · ${fmtInt(data.production.month)} em ${monthName}`} to="/producao">
              <DailyBars data={data.production.daily} dataKey="qty" unit="peças" format={v => `${fmtInt(v)} peças`} height={180} />
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}
