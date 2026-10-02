import { TrendingUp, TrendingDown } from 'lucide-react'
import { InfoTooltip } from '../../ml-insights/InfoTooltip'
import { todayISO, toISODateBR } from '../../../lib/dateBR'

export const SHOPEE_ORANGE = '#EE4D2D'
// Par validado (dataviz/validate_palette, 02/10): gasto = laranja Shopee,
// vendas = azul — passa daltonismo e contraste no fundo claro.
export const COLOR_SPEND = '#EE4D2D'
export const COLOR_SALES = '#0284C7'
export const COLOR_NEUTRAL = '#94A3B8'

// Seller Center — painel de Shopee Ads (de onde se recarrega o crédito).
// A API não tem endpoint de recarga, então o botão "Recarregar" leva pra
// cá. ⚠️ Link do painel ainda NÃO conferido clicando (02/10) — se cair em
// página errada, trocar aqui pelo endereço que aparece no navegador.
export const SELLER_ADS_URL = 'https://seller.shopee.com.br/portal/marketing/pas/index'

export function fmtMoney(v, opts = {}) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', ...opts })
}
export function fmtNum(v, digits = 0) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: digits })
}
export function fmtPct(v, digits = 1) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `${(Number(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`
}
export function fmtRoas(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x`
}
export function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
export function fmtDayShort(iso) {
  if (!iso) return ''
  const [, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}`
}
export function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
export function fmtEpoch(sec) {
  if (!sec) return null
  return new Date(sec * 1000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000) + 1
}

// Períodos do seletor. "Hoje" e "Ontem" são de 1 dia; o resto termina hoje.
export const PERIODS = [
  { key: 'today',     label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7',         label: '7D' },
  { key: '15',        label: '15D' },
  { key: '30',        label: '30D' },
  { key: '90',        label: '90D' },
  { key: 'month',     label: 'Este mês' },
  { key: 'lastmonth', label: 'Mês passado' },
]
export function periodRange(key) {
  const today = todayISO()
  if (key === 'today') return { start: today, end: today }
  if (key === 'yesterday') { const y = addDays(today, -1); return { start: y, end: y } }
  if (key === 'month') return { start: `${today.slice(0, 7)}-01`, end: today }
  if (key === 'lastmonth') {
    const firstThis = `${today.slice(0, 7)}-01`
    const lastPrev = addDays(firstThis, -1)
    return { start: `${lastPrev.slice(0, 7)}-01`, end: lastPrev }
  }
  const n = Number(key) || 30
  return { start: addDays(today, -(n - 1)), end: today }
}
export { todayISO, toISODateBR }

// Métricas derivadas — SEMPRE calculadas aqui a partir dos números brutos
// (a API manda ctr/cpc/roas prontos mas com significados que variam entre
// endpoints; ver comentário do normMetrics na edge function).
export function derive(t) {
  if (!t) return {}
  const expense = t.expense || 0
  const gmv = t.broad_gmv || 0
  return {
    ...t,
    roas:        expense > 0 ? gmv / expense : null,
    acos:        gmv > 0 ? expense / gmv : null,               // fração (0.07 = 7%)
    ctr:         t.impression > 0 ? t.clicks / t.impression : null,
    cpc:         t.clicks > 0 ? expense / t.clicks : null,
    conv_rate:   t.clicks > 0 ? t.broad_order / t.clicks : null,
    cost_per_order: t.broad_order > 0 ? expense / t.broad_order : null,
    ticket:      t.broad_order > 0 ? gmv / t.broad_order : null,
    direct_roas: expense > 0 ? (t.direct_gmv || 0) / expense : null,
  }
}
export function pctChange(cur, prev) {
  if (cur == null || prev == null || !Number.isFinite(prev) || prev === 0) return null
  return (cur - prev) / Math.abs(prev)
}

// Textos dos "?" — mesma explicação em todo canto do módulo.
export const HELP = {
  expense: 'Quanto a Shopee descontou do crédito de Ads pelos cliques no período selecionado.',
  gmv: 'Vendas atribuídas aos anúncios (“GMV amplo” da Shopee): a pessoa clicou no anúncio e comprou em até 7 dias — o produto anunciado OU outro produto da loja.',
  direct_gmv: 'Vendas diretas: a pessoa clicou no anúncio e comprou EXATAMENTE o produto anunciado.',
  roas: 'Retorno sobre o investimento em Ads: vendas ÷ gasto. 10x = cada R$1 gasto trouxe R$10 em vendas. Quanto MAIOR, melhor.',
  acos: 'Custo de Ads sobre as vendas: gasto ÷ vendas. 10% = a cada R$100 vendidos pelos anúncios, R$10 foram de Ads. Quanto MENOR, melhor. (A Shopee chama de "ACOS/CIR").',
  orders: 'Pedidos feitos depois de um clique no anúncio (atribuição ampla, 7 dias).',
  clicks: 'Quantas vezes alguém clicou num anúncio.',
  impression: 'Quantas vezes os anúncios apareceram na tela de alguém.',
  ctr: 'Taxa de cliques: cliques ÷ impressões. Mostra se quem VÊ o anúncio se interessa.',
  cpc: 'Custo médio por clique: gasto ÷ cliques.',
  conv_rate: 'Taxa de conversão: pedidos ÷ cliques. De cada 100 cliques, quantos viraram pedido.',
  cost_per_order: 'Quanto de Ads custou, em média, cada pedido gerado pelos anúncios.',
  ads_share: 'Quanto do faturamento TOTAL da Shopee (nossa tabela de pedidos, sem cancelados) veio de anúncio. O resto é venda orgânica.',
  balance: 'Saldo de crédito de Ads agora, lido direto da Shopee (pago + bônus/grátis).',
  runway: 'Estimativa de quantos dias o saldo atual dura, dividindo pelo gasto médio dos últimos 7 dias.',
  budget_daily: 'Soma dos orçamentos diários das campanhas em andamento — o máximo que a Shopee pode gastar num dia.',
}

export function ChangeBadge({ pct, invert = false }) {
  if (pct == null) return null
  const up = pct >= 0
  const good = invert ? !up : up
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${good ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
      {Math.abs(pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
    </span>
  )
}

export function KpiCard({ icon: Icon, label, value, sub, help, change, invertChange, tone = 'slate' }) {
  const tones = {
    slate:   'bg-slate-100 text-slate-600',
    orange:  'bg-orange-50 text-orange-600',
    sky:     'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet:  'bg-violet-50 text-violet-600',
    amber:   'bg-amber-50 text-amber-600',
    rose:    'bg-rose-50 text-rose-600',
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <span className={`w-6 h-6 rounded-md flex items-center justify-center ${tones[tone]}`}><Icon size={13}/></span>}
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        {help && <InfoTooltip source="nosso" text={help}/>}
      </div>
      <p className="text-xl font-bold text-slate-800">{value}</p>
      <div className="flex items-center gap-2 mt-1 min-h-[16px]">
        <ChangeBadge pct={change} invert={invertChange}/>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

export const CAMPAIGN_STATUS = {
  ongoing:   { label: 'Em andamento', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  paused:    { label: 'Pausada',      badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  scheduled: { label: 'Agendada',     badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  ended:     { label: 'Encerrada',    badge: 'bg-slate-100 text-slate-500 border-slate-200' },
  closed:    { label: 'Encerrada',    badge: 'bg-slate-100 text-slate-500 border-slate-200' },
  deleted:   { label: 'Excluída',     badge: 'bg-slate-100 text-slate-400 border-slate-200' },
}
export function campaignStatusCfg(s) {
  return CAMPAIGN_STATUS[s] || { label: s || '—', badge: 'bg-slate-100 text-slate-500 border-slate-200' }
}
export const PLACEMENT_LABEL = { search: 'Busca', discovery: 'Descoberta', all: 'Busca + Descoberta' }
export const BIDDING_LABEL = { auto: 'Lance automático (ROAS alvo)', manual: 'Lance manual (por palavra-chave)' }

export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter = fmtMoney }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm text-xs space-y-0.5">
      <p className="text-slate-500 font-medium">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-slate-700">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }}/>
          {p.name}: <span className="font-semibold">{(p.payload?.__fmt?.[p.dataKey] || valueFormatter)(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

export function Legend({ items }) {
  return (
    <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
      {items.map(i => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }}/>{i.label}
        </span>
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text }) {
  return (
    <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center">
      {Icon && <Icon size={28} className="mx-auto text-slate-300 mb-2"/>}
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {text && <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">{text}</p>}
    </div>
  )
}

// Exporta linhas como .xlsx (lib `xlsx` já é dependência do projeto).
export async function exportXlsx(filename, sheets) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  Object.entries(sheets).forEach(([name, rows]) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31))
  })
  XLSX.writeFile(wb, filename)
}
