import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  ClipboardList, Receipt, ClipboardCheck, MessageSquare, AlertTriangle,
  ArrowRight, Package, Users, Calendar, PackageSearch, Wrench,
  LayoutGrid, TrendingUp, Clock, MousePointerClick,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}
function fmtPreco(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDateShort(iso) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
function localISO(d = new Date()) {
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d - tz).toISOString().slice(0, 10)
}
function isOverdue(due_date, status) {
  return due_date && status !== 'done' && due_date < localISO()
}
function fmtTaskDate(d) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const PLATFORM_COLORS = { ml: '#f59e0b', shopee: '#EE4D2D', manual: '#64748b' }

// ─── Atalhos rápidos por perfil ──────────────────────────────────
const QUICK_LINKS = {
  admin: [
    { to: '/pedidos',         label: 'Pedidos',            icon: ClipboardList, color: '#F43F5E' },
    { to: '/orcamentos',      label: 'Orçamentos',         icon: Receipt,       color: '#8B5CF6' },
    { to: '/kanban-op',       label: 'Kanban Operacional', icon: LayoutGrid,    color: '#F59E0B' },
    { to: '/kanban',          label: 'Kanban Diretoria',   icon: LayoutGrid,    color: '#D946EF' },
    { to: '/rh/mensagens',    label: 'Mensagens',          icon: MessageSquare, color: '#0EA5E9' },
    { to: '/rh/ponto-semanal',label: 'Ponto Semanal',      icon: Calendar,      color: '#10B981' },
  ],
  administrativo: [
    { to: '/kanban-op',  label: 'Kanban Operacional', icon: LayoutGrid, color: '#F59E0B' },
    { to: '/orcamentos', label: 'Orçamentos',         icon: Receipt,    color: '#8B5CF6' },
    { to: '/rh',         label: 'RH',                 icon: Users,      color: '#0EA5E9' },
    { to: '/pedidos',    label: 'Pedidos',            icon: ClipboardList, color: '#F43F5E' },
  ],
  atendimento: [
    { to: '/pedidos',    label: 'Pedidos',            icon: ClipboardList, color: '#F43F5E' },
    { to: '/orcamentos', label: 'Orçamentos',         icon: Receipt,       color: '#8B5CF6' },
    { to: '/pick-list',  label: 'Pick List',          icon: PackageSearch, color: '#F97316' },
    { to: '/kanban-op',  label: 'Kanban Operacional', icon: LayoutGrid,    color: '#F59E0B' },
  ],
  producao: [
    { to: '/kanban-op',    label: 'Kanban Operacional', icon: LayoutGrid,      color: '#F59E0B' },
    { to: '/checklist',    label: 'Checklist Diário',   icon: ClipboardCheck, color: '#10B981' },
    { to: '/baixa-diaria', label: 'Baixa Diária',       icon: Package,        color: '#0EA5E9' },
    { to: '/manutencao',   label: 'Manutenção',         icon: Wrench,         color: '#64748B' },
  ],
  marketplace: [
    { to: '/pedidos',   label: 'Pedidos',   icon: ClipboardList, color: '#F43F5E' },
    { to: '/pick-list', label: 'Pick List', icon: PackageSearch, color: '#F97316' },
  ],
}

// ─── Card de estatística ─────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, to }) {
  const content = (
    <div className="card flex items-center gap-3 hover:shadow-md transition-shadow h-full">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '15' }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide truncate">{label}</p>
        <p className="text-2xl font-black text-slate-800" style={{ fontFamily: 'Nunito,sans-serif' }}>{value}</p>
      </div>
    </div>
  )
  return to ? <Link to={to}>{content}</Link> : content
}

// ─── Página principal ─────────────────────────────────────────────
export function DashboardPage() {
  const { user } = useAuth()
  const role = user?.role || 'equipe'
  const uid  = user?.id || getSession()?.id
  const firstName = user?.name?.split(' ')[0] ?? 'usuário'

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)

  useEffect(() => { load() }, [role, uid])

  async function load() {
    setLoading(true)
    try {
      const now = new Date()
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const start7d    = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const isDirector  = role === 'admin'
      const canSeeOrders  = ['admin', 'atendimento', 'administrativo', 'marketplace'].includes(role)
      const canSeeBudgets = ['admin', 'atendimento', 'administrativo'].includes(role)

      const queries = {}

      // Pedidos do mês (por plataforma) — pra quem lida com pedidos
      if (canSeeOrders) {
        queries.orders = supabase.from('orders')
          .select('id, source, data_venda, status_ml')
          .gte('data_venda', startMonth)
          .then(r => r.data ?? [])
        queries.ordersWeek = supabase.from('orders')
          .select('id, source, data_venda')
          .gte('data_venda', start7d)
          .then(r => r.data ?? [])
      }

      // Orçamentos do mês
      if (canSeeBudgets) {
        queries.budgets = supabase.from('budgets')
          .select('id, total, created_at, customer_name, code')
          .gte('created_at', startMonth)
          .order('created_at', { ascending: false })
          .then(r => r.data ?? [])
      }

      // Tarefas — todo mundo vê as próprias; admin vê o sistema inteiro
      queries.tasks = (isDirector
        ? supabase.from('tasks').select('id, title, status, due_date, priority, color, task_code, kanban_type, assignee:system_users!assigned_to(name)').neq('status', 'done')
        : supabase.from('tasks').select('id, title, status, due_date, priority, color, task_code, kanban_type').eq('assigned_to', uid).neq('status', 'done')
      ).then(r => r.data ?? [])

      // Mensagens pendentes — só diretor
      if (isDirector) {
        queries.messages = supabase.from('employee_messages')
          .select('id, message, created_at, employee:system_users!employee_id(name)')
          .eq('status', 'pendente')
          .order('created_at', { ascending: false })
          .then(r => r.data ?? [])
      }

      // Cliques no site — últimos 7 dias (Diretor + Administrativo)
      if (['admin', 'administrativo'].includes(role)) {
        queries.clicks = (async () => {
          let allData = [], from = 0
          const batchSize = 1000
          while (true) {
            const { data, error } = await supabase
              .from('product_clicks')
              .select('id, clicked_at, platform, page')
              .gte('clicked_at', start7d)
              .order('clicked_at', { ascending: true })
              .range(from, from + batchSize - 1)
            if (error || !data || data.length === 0) break
            allData = allData.concat(data)
            if (data.length < batchSize) break
            from += batchSize
          }
          return allData
        })()
      }

      // Estoque de matéria-prima — Diretor + Administrativo
      if (['admin', 'administrativo'].includes(role)) {
        queries.materials = supabase.from('raw_materials')
          .select('id, name, unit, stock_qty, stock_min')
          .eq('active', true)
          .order('stock_qty', { ascending: true })
          .then(r => r.data ?? [])
      }

      const entries = await Promise.all(Object.entries(queries).map(async ([k, p]) => [k, await p]))
      setStats(Object.fromEntries(entries))
    } finally {
      setLoading(false)
    }
  }

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" />
      </div>
    )
  }

  // ── Processa os dados brutos ────────────────────────────────────
  const orders      = stats.orders || []
  const ordersWeek   = stats.ordersWeek || []
  const budgets      = stats.budgets || []
  const tasks        = stats.tasks || []
  const messages     = stats.messages || []
  const clicks       = stats.clicks || []
  const materials    = stats.materials || []

  function materialStatus(m) {
    const min = parseFloat(m.stock_min) || 0
    const qty = parseFloat(m.stock_qty) || 0
    if (min <= 0) return 'ok'
    if (qty <= min) return 'danger'
    if (qty <= min * 1.3) return 'warn'
    return 'ok'
  }
  const materialsWithStatus = materials.map(m => ({ ...m, _status: materialStatus(m) }))
  const materialsCritical   = materialsWithStatus.filter(m => m._status === 'danger')
  const materialsLow        = materialsWithStatus.filter(m => m._status === 'warn')

  const clicksByDay = {}
  clicks.forEach(c => {
    const d = c.clicked_at.slice(0, 10)
    if (!clicksByDay[d]) clicksByDay[d] = 0
    clicksByDay[d]++
  })
  const clicksLast7 = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const key = localISO(d)
    clicksLast7.push({ date: key, total: clicksByDay[key] || 0 })
  }
  const clicksByPlatform = clicks.reduce((acc, c) => {
    const key = c.page === 'clo' ? 'clo' : c.platform
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const CLICK_PLAT_CFG = {
    shopee: { label: 'Shopee', color: '#EE4D2D', emoji: '🛍️' },
    ml: { label: 'Mercado Livre', color: '#f59e0b', emoji: '🛒' },
    whatsapp: { label: 'WhatsApp', color: '#25d366', emoji: '💬' },
    clo: { label: 'Clô', color: '#a855f7', emoji: '🐾' },
  }

  const ordersCancelled = orders.filter(o => (o.status_ml || '').toLowerCase().includes('cancelad')).length
  const ordersActive    = orders.length - ordersCancelled
  const ordersByPlatform = orders
    .filter(o => !(o.status_ml || '').toLowerCase().includes('cancelad'))
    .reduce((acc, o) => { acc[o.source] = (acc[o.source] || 0) + 1; return acc }, { ml: 0, shopee: 0, manual: 0 })

  const budgetsTotal = budgets.reduce((a, b) => a + (parseFloat(b.total) || 0), 0)

  const overdueTasks  = tasks.filter(t => isOverdue(t.due_date, t.status))
  const dueTodayTasks = tasks.filter(t => t.due_date === localISO() && t.status !== 'done')

  // Gráfico: pedidos últimos 7 dias por plataforma
  const chartMap = {}
  ordersWeek.forEach(o => {
    if (!o.data_venda) return
    const day = o.data_venda.slice(0, 10)
    if (!chartMap[day]) chartMap[day] = { date: day, ml: 0, shopee: 0, manual: 0 }
    if (chartMap[day][o.source] !== undefined) chartMap[day][o.source]++
  })
  const chartData = Object.values(chartMap).sort((a, b) => a.date.localeCompare(b.date))

  const quickLinks = QUICK_LINKS[role] || QUICK_LINKS.atendimento
  const isDirectorView = role === 'admin'

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Saudação */}
      <div>
        <h2 className="text-slate-800 leading-tight" style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 800, fontSize: '24px' }}>
          Olá, {firstName}! 👋
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          {role === 'admin' ? 'Aqui está o resumo geral da CoisaPet.' : 'Aqui está o resumo do seu dia.'}
        </p>
      </div>

      {/* Alerta de mensagens pendentes — bem visível */}
      {role === 'admin' && messages.length > 0 && (
        <Link to="/rh/mensagens" className="flex items-center gap-3 bg-sky-50 border border-sky-100 rounded-2xl px-4 py-3 hover:bg-sky-100/60 transition-colors">
          <MessageSquare size={18} className="text-sky-500 shrink-0" />
          <p className="text-sm text-sky-700">
            <strong>{messages.length}</strong> mensagem{messages.length > 1 ? 'ns' : ''} de funcionário{messages.length > 1 ? 's' : ''} aguardando resposta no app.
          </p>
          <ArrowRight size={14} className="text-sky-400 ml-auto shrink-0" />
        </Link>
      )}

      {/* Atalhos rápidos */}
      <div className="flex flex-wrap gap-2.5">
        {quickLinks.map(({ to, label, icon: Icon, color }) => (
          <Link key={to} to={to}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
            <Icon size={16} style={{ color }} />
            <span className="text-sm font-semibold text-slate-700">{label}</span>
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {['admin', 'atendimento', 'administrativo', 'marketplace'].includes(role) && (
          <>
            <StatCard icon={ClipboardList} label="Pedidos ML" value={ordersByPlatform.ml} color="#f59e0b" to="/pedidos" />
            <StatCard icon={ClipboardList} label="Pedidos Shopee" value={ordersByPlatform.shopee} color="#EE4D2D" to="/pedidos" />
            <StatCard icon={ClipboardList} label="Pedidos Manuais" value={ordersByPlatform.manual} color="#64748b" to="/pedidos" />
          </>
        )}
        {['admin', 'atendimento', 'administrativo'].includes(role) && (
          <StatCard icon={Receipt} label="Orçamentos no mês" value={budgets.length} color="#8B5CF6" to="/orcamentos" />
        )}
        <StatCard
          icon={AlertTriangle}
          label={role === 'admin' ? 'Tarefas atrasadas (todos)' : 'Minhas tarefas atrasadas'}
          value={overdueTasks.length}
          color="#EF4444"
          to="/kanban-op"
        />
        <StatCard icon={Clock} label="Vencem hoje" value={dueTodayTasks.length} color="#F59E0B" to="/kanban-op" />
        {role === 'admin' && (
          <StatCard icon={MessageSquare} label="Mensagens aguardando" value={messages.length} color="#0EA5E9" to="/rh/mensagens" />
        )}
        {isDirectorView && budgets.length > 0 && (
          <StatCard icon={TrendingUp} label="Total orçado no mês" value={fmtPreco(budgetsTotal)} color="#10B981" to="/orcamentos" />
        )}
        {['admin', 'administrativo'].includes(role) && (
          <StatCard icon={MousePointerClick} label="Cliques no site (7d)" value={clicks.length} color="#a855f7" to="/cliques" />
        )}
        {['admin', 'administrativo'].includes(role) && (
          <StatCard icon={AlertTriangle} label="Estoque crítico" value={materialsCritical.length} color="#EF4444" to="/materia-prima" />
        )}
      </div>

      {/* Painéis inferiores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Gráfico de pedidos — quem lida com pedidos */}
        {['admin', 'atendimento', 'administrativo', 'marketplace'].includes(role) && (
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-slate-800" style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 700, fontSize: '15px' }}>
                  Pedidos — últimos 7 dias
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Por plataforma</p>
              </div>
              <Link to="/pedidos" className="flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-500">
                Ver tudo <ArrowRight size={13} />
              </Link>
            </div>
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-slate-300 text-sm">Sem pedidos nos últimos 7 dias</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    {Object.entries(PLATFORM_COLORS).map(([k, c]) => (
                      <linearGradient key={k} id={`dgrad-${k}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={c} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={c} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={fmtDateShort} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={fmtDateShort} />
                  <Area type="monotone" dataKey="ml" name="Mercado Livre" stroke={PLATFORM_COLORS.ml} fill="url(#dgrad-ml)" strokeWidth={2} />
                  <Area type="monotone" dataKey="shopee" name="Shopee" stroke={PLATFORM_COLORS.shopee} fill="url(#dgrad-shopee)" strokeWidth={2} />
                  <Area type="monotone" dataKey="manual" name="Manual" stroke={PLATFORM_COLORS.manual} fill="url(#dgrad-manual)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Painel lateral — Mensagens (admin) ou Tarefas (demais) */}
        <div className={['admin', 'atendimento', 'administrativo', 'marketplace'].includes(role) ? '' : 'lg:col-span-2'}>
          {role === 'admin' ? (
            <div className="card h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-800" style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 700, fontSize: '15px' }}>
                  Mensagens aguardando
                </h3>
                <Link to="/rh/mensagens" className="text-xs font-semibold text-rose-400 hover:text-rose-500">Ver tudo</Link>
              </div>
              {messages.length === 0 ? (
                <p className="text-sm text-slate-300 text-center py-8">Nenhuma mensagem pendente 🎉</p>
              ) : (
                <div className="flex flex-col divide-y divide-slate-50">
                  {messages.slice(0, 5).map(m => (
                    <Link key={m.id} to="/rh/mensagens" className="py-2.5 flex flex-col hover:bg-slate-50/60 -mx-2 px-2 rounded-lg">
                      <p className="text-xs font-bold text-slate-700">{m.employee?.name || 'Funcionário'}</p>
                      <p className="text-xs text-slate-400 truncate">{m.message}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-800" style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 700, fontSize: '15px' }}>
                  Minhas tarefas
                </h3>
                <Link to="/kanban-op" className="text-xs font-semibold text-rose-400 hover:text-rose-500">Ver tudo</Link>
              </div>
              {tasks.length === 0 ? (
                <p className="text-sm text-slate-300 text-center py-8">Nenhuma tarefa em aberto 🎉</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {tasks
                    .slice()
                    .sort((a, b) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1)
                    .slice(0, 6)
                    .map(t => {
                    const overdue  = isOverdue(t.due_date, t.status)
                    const dueToday = t.due_date === localISO() && t.status !== 'done'
                    const link = t.kanban_type === 'diretoria' ? `/kanban?task=${t.task_code}` : `/kanban-op?task=${t.task_code}`
                    return (
                      <Link key={t.id} to={link}
                        className={`flex items-center gap-2.5 rounded-b-xl border-l-4 px-3 py-2.5 hover:shadow-sm transition-shadow ${
                          overdue ? 'bg-rose-50/50' : dueToday ? 'bg-amber-50/50' : 'bg-slate-50/60'
                        }`}
                        style={{ borderLeftColor: t.color || '#cbd5e1' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">{t.title}</p>
                          {isDirectorView && t.assignee?.name && (
                            <p className="text-[10px] text-slate-400 truncate">{t.assignee.name}</p>
                          )}
                        </div>
                        {t.due_date && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                            overdue ? 'bg-rose-100 text-rose-600' : dueToday ? 'bg-amber-100 text-amber-600' : 'bg-white text-slate-400'
                          }`}>
                            {overdue ? '⚠ ' : dueToday ? '⏰ ' : ''}{fmtTaskDate(t.due_date)}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Últimos orçamentos — quem lida com orçamentos */}
      {['admin', 'atendimento', 'administrativo'].includes(role) && budgets.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-800" style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 700, fontSize: '15px' }}>
              Últimos orçamentos
            </h3>
            <Link to="/orcamentos" className="flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-500">
              Ver tudo <ArrowRight size={13} />
            </Link>
          </div>
          <div className="flex flex-col divide-y divide-slate-50">
            {budgets.slice(0, 5).map(b => (
              <div key={b.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{b.customer_name || 'Cliente não informado'}</p>
                  <p className="text-xs text-slate-400 font-mono">{b.code}</p>
                </div>
                <p className="text-sm font-bold text-emerald-600">{isDirectorView ? fmtPreco(b.total) : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Status de estoque — matéria-prima */}
      {['admin', 'administrativo'].includes(role) && (materialsCritical.length > 0 || materialsLow.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-slate-800" style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 700, fontSize: '15px' }}>
                Status de Estoque
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Matérias-primas em nível baixo ou crítico</p>
            </div>
            <Link to="/materia-prima" className="flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-500">
              Ver tudo <ArrowRight size={13} />
            </Link>
          </div>
          <div className="flex flex-col divide-y divide-slate-50">
            {[...materialsCritical, ...materialsLow].slice(0, 6).map(m => (
              <div key={m.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{m.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{m.stock_qty} {m.unit} em estoque{m.stock_min ? ` · mínimo ${m.stock_min}` : ''}</p>
                </div>
                <span className={m._status === 'danger' ? 'badge-danger' : 'badge-warn'}>
                  {m._status === 'danger' ? 'Crítico' : 'Baixo'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cliques no site */}
      {['admin', 'administrativo'].includes(role) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-slate-800" style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 700, fontSize: '15px' }}>
                  Cliques no site — últimos 7 dias
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Total de {clicks.length} clique{clicks.length !== 1 ? 's' : ''} no período</p>
              </div>
              <Link to="/cliques" className="flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-500">
                Ver tudo <ArrowRight size={13} />
              </Link>
            </div>
            {clicks.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-300 text-sm">Sem cliques registrados</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {clicksLast7.map(d => {
                  const max = Math.max(...clicksLast7.map(x => x.total), 1)
                  return (
                    <div key={d.date} className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-500 w-10 shrink-0">{fmtDateShort(d.date)}</span>
                      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-violet-400 flex items-center justify-end pr-1.5"
                          style={{ width: `${Math.round(d.total / max * 100)}%`, minWidth: d.total > 0 ? '28px' : '0' }}>
                          {d.total > 0 && <span className="text-[9px] font-black text-white">{d.total}</span>}
                        </div>
                      </div>
                      {d.total === 0 && <span className="text-[10px] text-slate-300">0</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="text-slate-800 mb-4" style={{ fontFamily: 'Nunito,sans-serif', fontWeight: 700, fontSize: '15px' }}>
              Por plataforma
            </h3>
            <div className="flex flex-col gap-3">
              {Object.entries(CLICK_PLAT_CFG).map(([k, v]) => {
                const val = clicksByPlatform[k] || 0
                const max = Math.max(...Object.values(clicksByPlatform), 1)
                return (
                  <div key={k}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-600">{v.emoji} {v.label}</span>
                      <span className="text-xs font-black text-slate-800">{val}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(val / max * 100)}%`, background: v.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
