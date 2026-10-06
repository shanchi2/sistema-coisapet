import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useTheme } from '../../contexts/ThemeContext'

// Peças visuais do Dashboard (06/10). Regras de gráfico seguidas aqui:
// barras finas (≤ 24px, ponta arredondada só no topo), grade em linha fina
// sólida, uma cor só por gráfico (série única), valor em texto neutro —
// nunca na cor da série — e tooltip em toda barra.

export const fmtBRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const fmtBRLShort = v => {
  const n = Number(v) || 0
  if (n >= 1000) return 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: n >= 10000 ? 0 : 1 }) + ' mil'
  return 'R$ ' + Math.round(n).toLocaleString('pt-BR')
}
export const fmtInt = v => (Number(v) || 0).toLocaleString('pt-BR')
export const fmtDayShort = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const weekday = iso => WEEKDAY[new Date(iso + 'T12:00:00').getDay()]

// Cores do gráfico por tema (SVG do recharts não lê as variáveis CSS)
function useChartColors() {
  const { isDark } = useTheme()
  return isDark
    ? { bar: '#F43F5E', barSoft: '#5A2531', grid: '#2E2E2E', axis: '#7A7A7A', cursor: 'rgba(255,255,255,0.04)' }
    : { bar: '#E11D48', barSoft: '#FBC4D1', grid: '#F1F5F9', axis: '#94A3B8', cursor: 'rgba(15,23,42,0.04)' }
}

// ─── Card base ──────────────────────────────────────────────────────
export function Panel({ title, subtitle, to, linkLabel = 'Ver tudo', right, children, className = '' }) {
  return (
    <section className={`card flex flex-col ${className}`}>
      {(title || to || right) && (
        <header className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {title && <h3 className="font-display font-bold text-[15px] text-slate-800 leading-tight">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {right}
          {to && (
            <Link to={to} className="flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600 shrink-0">
              {linkLabel} <ArrowRight size={13} />
            </Link>
          )}
        </header>
      )}
      {children}
    </section>
  )
}

// ─── Variação vs período anterior (seta + sinal + cor) ──────────────
export function Delta({ current, previous, suffix = 'vs mês passado' }) {
  if (!previous) return <span className="text-xs text-slate-400">{suffix.replace('vs', 'sem base em')}</span>
  const pct = ((current - previous) / previous) * 100
  const flat = Math.abs(pct) < 0.5
  const up = pct > 0
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  const cls = flat ? 'bg-slate-100 text-slate-500' : up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`inline-flex items-center gap-0.5 font-bold px-1.5 py-0.5 rounded-md ${cls}`}>
        <Icon size={13} strokeWidth={2.5} />
        {flat ? '0%' : `${up ? '+' : '−'}${Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`}
      </span>
      <span className="text-slate-400">{suffix}</span>
    </span>
  )
}

// ─── Indicador pequeno (rótulo · valor · detalhe) ───────────────────
export function StatTile({ icon: Icon, label, value, detail, to, tone = 'neutral', children }) {
  const tones = {
    neutral:  'bg-slate-100 text-slate-500',
    rose:     'bg-rose-50 text-rose-500',
    critical: 'bg-red-50 text-red-600',
    warning:  'bg-amber-50 text-amber-600',
    good:     'bg-emerald-50 text-emerald-600',
    sky:      'bg-sky-50 text-sky-600',
    violet:   'bg-violet-50 text-violet-600',
  }
  const body = (
    <div className="card h-full flex flex-col gap-3 transition-shadow hover:shadow-md !p-4">
      <div className="flex items-center gap-2">
        {Icon && <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}><Icon size={16} /></span>}
        <p className="text-[13px] font-semibold text-slate-500 leading-tight">{label}</p>
      </div>
      <p className="font-display font-extrabold text-[28px] leading-none text-slate-800">{value}</p>
      {detail && <div className="text-xs text-slate-400 -mt-1">{detail}</div>}
      {children}
    </div>
  )
  return to ? <Link to={to} className="block h-full">{body}</Link> : body
}

// ─── Medidor (trilho claro do mesmo tom + preenchimento) ────────────
export function Meter({ value, max, tone = 'rose' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const fill = { rose: 'bg-rose-500', good: 'bg-emerald-500', warning: 'bg-amber-500' }[tone]
  const track = { rose: 'bg-rose-100', good: 'bg-emerald-100', warning: 'bg-amber-100' }[tone]
  return (
    <div className={`h-1.5 rounded-full overflow-hidden ${track}`} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={`h-full rounded-full ${fill} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ─── Barras por dia (série única) ───────────────────────────────────
function DayTooltip({ active, payload, format, unit }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-display font-extrabold text-sm text-slate-800">{format(p[payload[0].dataKey])}</p>
      <p className="text-slate-400 capitalize">{weekday(p.day)}, {fmtDayShort(p.day)}{unit ? ` · ${unit}` : ''}</p>
    </div>
  )
}

export function DailyBars({ data, dataKey, format = fmtInt, axisFormat = fmtInt, height = 200, unit }) {
  const c = useChartColors()
  const lastIdx = data.length - 1
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="day" tickFormatter={fmtDayShort} tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={{ stroke: c.grid }}
            interval="preserveStartEnd" minTickGap={18} />
          <YAxis tickFormatter={axisFormat} tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} width={52} allowDecimals={false} />
          <Tooltip content={<DayTooltip format={format} unit={unit} />} cursor={{ fill: c.cursor }} />
          <Bar dataKey={dataKey} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {/* Hoje (ainda em andamento) em tom suave; dias fechados na cor cheia */}
            {data.map((d, i) => <Cell key={d.day} fill={i === lastIdx ? c.barSoft : c.bar} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Vendas por plataforma ──────────────────────────────────────────
const PLATFORMS = [
  { key: 'shopee', label: 'Shopee',        dot: '#EE4D2D' },
  { key: 'ml',     label: 'Mercado Livre', dot: '#F5A300' },
  { key: 'manual', label: 'Manual',        dot: '#94A3B8' },
]
export function PlatformShare({ platforms, money }) {
  const metric = money ? 'value' : 'orders'
  const total = PLATFORMS.reduce((s, p) => s + (platforms[p.key]?.[metric] || 0), 0)
  return (
    <div className="flex flex-col gap-4">
      {PLATFORMS.filter(p => p.key !== 'manual' || platforms.manual.orders > 0).map(p => {
        const s = platforms[p.key] || { orders: 0, value: 0 }
        const share = total > 0 ? (s[metric] / total) * 100 : 0
        return (
          <div key={p.key}>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.dot }} />{p.label}
              </span>
              <span className="text-xs text-slate-400">{share.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${share}%`, background: p.dot }} />
            </div>
            <div className="flex items-baseline justify-between mt-1.5">
              <span className="font-display font-extrabold text-base text-slate-800">{money ? fmtBRL(s.value) : `${fmtInt(s.orders)} pedidos`}</span>
              {money && <span className="text-xs text-slate-400">{fmtInt(s.orders)} pedidos · ticket {fmtBRL(s.orders ? s.value / s.orders : 0)}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Lista "precisa de atenção" (ícone + texto + número) ────────────
export function AttentionList({ items }) {
  const visible = items.filter(Boolean)
  const pending = visible.filter(i => i.count > 0)
  if (!visible.length) return null
  return (
    <ul className="flex flex-col -mx-2">
      {pending.length === 0 && (
        <li className="px-2 py-6 text-center text-sm text-slate-400">Tudo em dia por aqui 🎉</li>
      )}
      {pending.map(i => {
        const lv = {
          critical: { cls: 'bg-red-50 text-red-600', label: 'Urgente' },
          warning:  { cls: 'bg-amber-50 text-amber-600', label: 'Atenção' },
          info:     { cls: 'bg-sky-50 text-sky-600', label: 'Pendente' },
        }[i.level || 'info']
        return (
          <li key={i.key}>
            <Link to={i.to} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${lv.cls}`} title={lv.label}><i.icon size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-700 truncate">{i.label}</span>
                {i.hint && <span className="block text-[11px] text-slate-400 truncate">{i.hint}</span>}
              </span>
              <span className="font-display font-extrabold text-lg text-slate-800">{fmtInt(i.count)}</span>
              <ArrowRight size={14} className="text-slate-300 shrink-0" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Lista de tarefas ───────────────────────────────────────────────
export function TaskList({ tasks, today, showAssignee, limit = 6 }) {
  if (!tasks.length) return <p className="text-sm text-slate-400 text-center py-8">Nenhuma tarefa em aberto 🎉</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {tasks.slice(0, limit).map(t => {
        const overdue = t.due_date && t.due_date < today
        const dueToday = t.due_date === today
        const link = t.kanban_type === 'diretoria' ? `/kanban?task=${t.task_code}` : `/kanban-op?task=${t.task_code}`
        return (
          <li key={t.id}>
            <Link to={link} className="flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-slate-50 transition-colors">
              <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: t.color || '#CBD5E1' }} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-700 truncate">{t.title}</span>
                {showAssignee && t.assignee?.name && <span className="block text-[11px] text-slate-400 truncate">{t.assignee.name}</span>}
              </span>
              {t.due_date && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  overdue ? 'bg-red-50 text-red-600' : dueToday ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                  {overdue ? 'Atrasada · ' : dueToday ? 'Hoje · ' : ''}{fmtDayShort(t.due_date)}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
