import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Megaphone, Loader2, AlertTriangle, ExternalLink, RefreshCw, Search,
  DollarSign, MousePointerClick, Eye, Percent, Target, TrendingUp,
  PauseCircle, ChevronDown, Info, X, Package,
} from 'lucide-react'
import { useMlInsights } from './hooks/useMlInsights'
import { InfoTooltip } from './InfoTooltip'

// Hub de Publicidade do próprio ML — não existe link profundo confirmado
// por campanha/anúncio individual, então toda ação de escrita (pausar
// campanha, mudar orçamento, criar anúncio novo) aponta pra cá.
const ML_ADS_HUB = 'https://vendedores.mercadolivre.com.br/publicidade/resumo-anunciante?from=seller_central&validate_user=true#from=seller-menu'

const PERIODS = [
  { key: 7,  label: '7D'  },
  { key: 15, label: '15D' },
  { key: 30, label: '30D' },
  { key: 60, label: '60D' },
]

function fmtMoney(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtNum(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR')
}
// ACOS já vem da API do ML como percentual (ex.: 24.3 = 24,3%).
function fmtPct(v) {
  if (v == null) return '—'
  return `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}
function fmtRoas(v) {
  if (v == null) return '—'
  return `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x`
}

const AD_STATUS_CONFIG = {
  active: { label: 'Ativo',  badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  idle:   { label: 'Idle',   badge: 'bg-slate-100 text-slate-500 border-slate-200' },
  paused: { label: 'Pausado',badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  hold:   { label: 'Hold',   badge: 'bg-rose-50 text-rose-600 border-rose-200' },
}
function adStatusCfg(status) {
  return AD_STATUS_CONFIG[status] || { label: status || '—', badge: 'bg-slate-100 text-slate-500 border-slate-200' }
}

const CAMPAIGN_STATUS_CONFIG = {
  active:  { label: 'Ativa',   badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  paused:  { label: 'Pausada', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
}
function campaignStatusCfg(status) {
  return CAMPAIGN_STATUS_CONFIG[status] || { label: status || '—', badge: 'bg-slate-100 text-slate-500 border-slate-200' }
}

const AD_TABS = [
  { key: 'all',    label: 'Todos' },
  { key: 'active', label: 'Ativos' },
  { key: 'idle',   label: 'Idle' },
  { key: 'paused', label: 'Pausados' },
  { key: 'hold',   label: 'Hold' },
]

const SORT_OPTIONS = [
  { key: 'cost',   label: 'Custo' },
  { key: 'roas',   label: 'ROAS' },
  { key: 'clicks', label: 'Cliques' },
  { key: 'acos',   label: 'ACOS' },
]

function KpiCard({ icon, iconBg, iconColor, label, value, sub, tooltip }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-6 h-6 rounded-md flex items-center justify-center ${iconBg}`}>{icon}</span>
        <p className="text-xs font-semibold text-slate-500 uppercase">{label}</p>
        {tooltip && <InfoTooltip source="nosso" text={tooltip} />}
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
    </div>
  )
}

// Label pequeno em caixa alta com um "?" do lado, usado nos números de
// cada campanha/anúncio (Custo, Receita, ACOS, ROAS...). `align` controla
// se o "?" fica depois do texto (esquerda) ou antes (direita, pra colunas
// alinhadas à direita não ficarem com o ícone grudado na borda).
function MetricLabel({ tooltip, align = 'left', children }) {
  return (
    <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
      {align === 'right' && tooltip && <InfoTooltip source="nosso" text={tooltip} />}
      <p className="text-[10px] text-slate-400 uppercase">{children}</p>
      {align !== 'right' && tooltip && <InfoTooltip source="nosso" text={tooltip} />}
    </div>
  )
}

// Textos das explicações — reaproveitados nos cartões de resumo, nas
// campanhas e nos anúncios, pra manter a mesma explicação em todo canto.
const METRIC_HELP = {
  cost: 'Quanto foi gasto pagando pelos cliques, só dentro do período selecionado ali em cima (7/15/30/60 dias) — não é o total desde sempre, nem o orçamento diário configurado na campanha.',
  revenue: 'Quanto foi vendido através desse anúncio/campanha especificamente (a pessoa clicou e comprou) — não é a receita geral da loja. Conta a venda do próprio produto anunciado e também de outro produto seu que a mesma pessoa comprou depois de clicar.',
  clicks: 'Quantas vezes alguém clicou no anúncio no período selecionado.',
  prints: 'Quantas vezes o anúncio apareceu nas telas de possíveis compradores — nem todo mundo que vê, clica.',
  ctr: 'Taxa de cliques: cliques ÷ vezes que apareceu. Mostra se quem VÊ o anúncio está clicando nele ou passando direto.',
  acos: 'Custo de Publicidade sobre Vendas: quanto do que esse anúncio vendeu foi gasto em Ads (custo ÷ receita × 100). Quanto MENOR, melhor — 10% quer dizer que a cada R$100 vendidos pelo anúncio, R$10 foram gastos pra vender.',
  roas: 'Retorno sobre o investimento em Ads: quanto voltou em vendas pra cada R$1 gasto (receita ÷ custo). Quanto MAIOR, melhor — 20x quer dizer que cada R$1 investido trouxe R$20 em vendas atribuídas ao anúncio.',
}

function CampaignCard({ c, adsCount, onOpenProducts }) {
  const cfg = campaignStatusCfg(c.status)
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => onOpenProducts(c)}
              className="font-semibold text-slate-800 hover:text-sky-600 truncate transition-colors text-left underline decoration-slate-200 decoration-dotted underline-offset-4 hover:decoration-sky-400">
              {c.name || `Campanha ${c.id}`}
            </button>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${cfg.badge}`}>{cfg.label}</span>
            {c.strategy && <span className="text-[11px] text-slate-400 shrink-0">{c.strategy}</span>}
            {adsCount > 0 && (
              <button onClick={() => onOpenProducts(c)}
                className="text-[11px] text-slate-400 hover:text-sky-600 inline-flex items-center gap-1 shrink-0 transition-colors">
                <Package size={11} /> {adsCount} produto{adsCount === 1 ? '' : 's'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-slate-400">
            {c.daily_budget != null && <span>Orçamento diário: {fmtMoney(c.daily_budget)}</span>}
            {c.acos_target != null && <span>Meta ACOS: {fmtPct(c.acos_target)}</span>}
            {c.roas_target != null && <span>Meta ROAS: {fmtRoas(c.roas_target)}</span>}
          </div>
        </div>
        <a href={ML_ADS_HUB} target="_blank" rel="noreferrer"
          className="text-slate-300 hover:text-sky-500 transition-colors shrink-0" title="Ver no Mercado Livre">
          <ExternalLink size={15} />
        </a>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3 pt-3 border-t border-slate-100">
        <div><MetricLabel tooltip={METRIC_HELP.cost}>Custo</MetricLabel><p className="text-sm font-bold text-slate-700">{fmtMoney(c.cost)}</p></div>
        <div><MetricLabel tooltip={METRIC_HELP.revenue}>Receita</MetricLabel><p className="text-sm font-bold text-emerald-600">{fmtMoney(c.revenue)}</p></div>
        <div><MetricLabel tooltip={METRIC_HELP.clicks}>Cliques</MetricLabel><p className="text-sm font-bold text-slate-700">{fmtNum(c.clicks)}</p></div>
        <div><MetricLabel tooltip={METRIC_HELP.acos}>ACOS</MetricLabel><p className="text-sm font-bold text-slate-700">{fmtPct(c.acos)}</p></div>
        <div><MetricLabel tooltip={METRIC_HELP.roas}>ROAS</MetricLabel><p className="text-sm font-bold text-sky-600">{fmtRoas(c.roas)}</p></div>
      </div>
    </div>
  )
}

// Largura fixa reaproveitada pelo cabeçalho e por cada linha — garante
// que as colunas de número alinhem certinho embaixo do cabeçalho.
const AD_METRICS_COL = 'hidden md:grid grid-cols-5 gap-4 w-[480px] shrink-0 text-right'

function AdsColumnHeader() {
  return (
    <div className="hidden md:flex items-center gap-3 px-3">
      <div className="w-12 shrink-0" />
      <div className="min-w-0 flex-1" />
      <div className={AD_METRICS_COL}>
        <MetricLabel align="right" tooltip={METRIC_HELP.cost}>Custo</MetricLabel>
        <MetricLabel align="right" tooltip={METRIC_HELP.clicks}>Cliques</MetricLabel>
        <MetricLabel align="right" tooltip={METRIC_HELP.ctr}>CTR</MetricLabel>
        <MetricLabel align="right" tooltip={METRIC_HELP.acos}>ACOS</MetricLabel>
        <MetricLabel align="right" tooltip={METRIC_HELP.roas}>ROAS</MetricLabel>
      </div>
    </div>
  )
}

function AdRow({ a }) {
  const cfg = adStatusCfg(a.status)
  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
      <img src={a.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-100 shrink-0 bg-slate-50" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <a href={a.permalink} target="_blank" rel="noreferrer" className="text-sm text-slate-800 font-medium truncate hover:text-sky-600 max-w-[420px]">
            {a.title || a.item_id}
          </a>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${cfg.badge}`}>{cfg.label}</span>
        </div>
        <p className="text-xs text-slate-400 truncate mt-0.5">{a.campaign_name || 'Sem campanha'} · {fmtMoney(a.price)}</p>
      </div>
      {/* Valores puros — os títulos das colunas (com "?" de explicação) já
          ficam no <AdsColumnHeader/>, uma vez só, acima da lista inteira. */}
      <div className={AD_METRICS_COL}>
        <p className="text-sm font-semibold text-slate-700 self-center">{fmtMoney(a.cost)}</p>
        <p className="text-sm font-semibold text-slate-700 self-center">{fmtNum(a.clicks)}</p>
        <p className="text-sm font-semibold text-slate-700 self-center">{a.ctr != null ? fmtPct(a.ctr) : '—'}</p>
        <p className="text-sm font-semibold text-slate-700 self-center">{fmtPct(a.acos)}</p>
        <p className="text-sm font-bold text-sky-600 self-center">{fmtRoas(a.roas)}</p>
      </div>
    </div>
  )
}

function CampaignProductsModal({ campaign, ads, onClose }) {
  if (!campaign) return null
  const cfg = campaignStatusCfg(campaign.status)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-base font-bold text-slate-800 truncate">{campaign.name || `Campanha ${campaign.id}`}</p>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${cfg.badge}`}>{cfg.label}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{ads.length} produto{ads.length === 1 ? '' : 's'} anunciado{ads.length === 1 ? '' : 's'} nessa campanha</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-2">
          {ads.length === 0 ? (
            <div className="text-center py-10">
              <Package size={28} strokeWidth={1} className="mx-auto mb-2 text-slate-200" />
              <p className="text-slate-400 text-sm">Nenhum produto encontrado pra essa campanha.</p>
            </div>
          ) : (
            ads
              .slice()
              .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
              .map(a => {
                const adCfg = adStatusCfg(a.status)
                return (
                  <div key={a.item_id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <img src={a.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-100 shrink-0 bg-white" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={a.permalink} target="_blank" rel="noreferrer" className="text-sm text-slate-800 font-medium truncate hover:text-sky-600">
                          {a.title || a.item_id}
                        </a>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${adCfg.badge}`}>{adCfg.label}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{fmtMoney(a.price)}</p>
                    </div>
                    <div className="grid grid-cols-5 gap-3 shrink-0 text-right">
                      <div><p className="text-[9px] text-slate-400 uppercase">Custo</p><p className="text-xs font-semibold text-slate-700">{fmtMoney(a.cost)}</p></div>
                      <div><p className="text-[9px] text-slate-400 uppercase">Receita</p><p className="text-xs font-semibold text-emerald-600">{fmtMoney(a.revenue)}</p></div>
                      <div><p className="text-[9px] text-slate-400 uppercase">Cliques</p><p className="text-xs font-semibold text-slate-700">{fmtNum(a.clicks)}</p></div>
                      <div><p className="text-[9px] text-slate-400 uppercase">ACOS</p><p className="text-xs font-semibold text-slate-700">{fmtPct(a.acos)}</p></div>
                      <div><p className="text-[9px] text-slate-400 uppercase">ROAS</p><p className="text-xs font-bold text-sky-600">{fmtRoas(a.roas)}</p></div>
                    </div>
                  </div>
                )
              })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-100 shrink-0">
          <p className="text-xs text-slate-400">Os valores são do mesmo período selecionado na tela.</p>
          <a href={ML_ADS_HUB} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0">
            Ver no Mercado Livre <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}

export function MlAdsPage() {
  const { loading, error, fetchAdsDashboard } = useMlInsights()
  const [period, setPeriod] = useState(30)
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('cost')
  const [showPaused, setShowPaused] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState(null)

  const load = useCallback(() => {
    fetchAdsDashboard(period).then(setData).catch(() => {})
  }, [fetchAdsDashboard, period])

  useEffect(() => { load() }, [load])

  const filteredAds = useMemo(() => {
    if (!data?.ads) return []
    return data.ads
      .filter(a => statusFilter === 'all' || a.status === statusFilter)
      .filter(a => !search.trim() || a.title?.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0))
  }, [data, search, statusFilter])

  const s = data?.summary

  const selectedCampaignAds = useMemo(() => {
    if (!selectedCampaign || !data?.ads) return []
    return data.ads.filter(a => String(a.campaign_id) === String(selectedCampaign.id))
  }, [selectedCampaign, data])

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-sky-200">
              <Megaphone size={22} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                Publicidade
                <InfoTooltip source="nosso" text="Todas as campanhas e anúncios patrocinados (Product Ads) da conta no Mercado Livre — quanto você investe, quanto volta em vendas, e o desempenho de cada anúncio impulsionado." />
              </h1>
              <p className="text-sm text-slate-500">Campanhas, anúncios patrocinados e investimento em Ads no Mercado Livre</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${period === p.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl disabled:opacity-60 transition-colors shadow-sm">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            </button>
            <a href={ML_ADS_HUB} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm">
              Ver no Mercado Livre <ExternalLink size={14} />
            </a>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-400" /></div>
        )}

        {data && !data.available && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5">
            <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 leading-relaxed">{data.reason || 'Não foi possível carregar os dados de Publicidade.'}</p>
          </div>
        )}

        {data?.available && (
          <>
            {/* Cartões de resumo */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              <KpiCard icon={<DollarSign size={13} className="text-sky-600" />} iconBg="bg-sky-100"
                label="Investido" value={fmtMoney(s.cost)} sub={`${s.campaigns_active} campanha${s.campaigns_active === 1 ? '' : 's'} ativa${s.campaigns_active === 1 ? '' : 's'}`}
                tooltip={METRIC_HELP.cost} />
              <KpiCard icon={<TrendingUp size={13} className="text-emerald-600" />} iconBg="bg-emerald-100"
                label="Receita de Ads" value={fmtMoney(s.revenue)} tooltip={METRIC_HELP.revenue} />
              <KpiCard icon={<Target size={13} className="text-violet-600" />} iconBg="bg-violet-100"
                label="ROAS médio" value={fmtRoas(s.roas_avg)} sub="receita ÷ investido" tooltip={METRIC_HELP.roas} />
              <KpiCard icon={<MousePointerClick size={13} className="text-amber-600" />} iconBg="bg-amber-100"
                label="Cliques" value={fmtNum(s.clicks)} tooltip={METRIC_HELP.clicks} />
              <KpiCard icon={<Eye size={13} className="text-slate-500" />} iconBg="bg-slate-100"
                label="Impressões" value={fmtNum(s.prints)} tooltip={METRIC_HELP.prints} />
              <KpiCard icon={<Percent size={13} className="text-rose-600" />} iconBg="bg-rose-100"
                label="CTR médio" value={s.ctr_avg != null ? `${(s.ctr_avg * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—'} tooltip={METRIC_HELP.ctr} />
            </div>

            {/* Campanhas */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                Campanhas ({data.campaigns.length})
                <InfoTooltip source="nosso" text="Cada campanha agrupa vários anúncios patrocinados sob uma mesma estratégia de orçamento e meta de ACOS/ROAS. Pausar ou mudar orçamento só é possível direto no Mercado Livre." />
              </h2>
              {data.campaigns.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-slate-200">
                  <p className="text-slate-400 text-sm">Nenhuma campanha encontrada.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {data.campaigns.map(c => (
                    <CampaignCard key={c.id} c={c}
                      adsCount={data.ads.filter(a => String(a.campaign_id) === String(c.id)).length}
                      onOpenProducts={setSelectedCampaign} />
                  ))}
                </div>
              )}
            </div>

            {/* Anúncios patrocinados */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  Anúncios patrocinados ({data.ads.length})
                  <InfoTooltip source="nosso" text="Todo item que já passou pelo Ads em algum momento aparece aqui — 'Idle' significa que está disponível pra impulsionar mas sem campanha ativa agora." />
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{s.ads_active} ativos</span>
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />{s.ads_idle} idle</span>
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{s.ads_paused} pausados</span>
                  <span>· {s.ads_with_spend} com gasto no período</span>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por título..."
                    className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-sky-400 bg-white" />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {AD_TABS.map(t => (
                    <button key={t.key} onClick={() => setStatusFilter(t.key)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        statusFilter === t.key ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 ml-auto">
                  Ordenar por
                  <select value={sortKey} onChange={e => setSortKey(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:border-sky-400">
                    {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {filteredAds.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-slate-200">
                  <p className="text-slate-400 text-sm">Nenhum anúncio bate com o filtro.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <AdsColumnHeader />
                  {filteredAds.map(a => <AdRow key={a.item_id} a={a} />)}
                </div>
              )}
            </div>

            {/* Anúncios parados sem Ads */}
            {data.paused_without_ads.length > 0 && (
              <div className="space-y-2">
                {/* `role="button"` num <div>, não um <button> de verdade — o
                    InfoTooltip já renderiza um <button> ("?") por dentro, e
                    <button> dentro de <button> é HTML inválido (o navegador
                    "corrige" sozinho quebrando a estrutura e o clique). */}
                <div role="button" tabIndex={0} onClick={() => setShowPaused(v => !v)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowPaused(v => !v) } }}
                  className="w-full flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <PauseCircle size={16} className="text-slate-400" />
                    Anúncios parados fora do Ads ({data.paused_without_ads.length})
                    <span onClick={e => e.stopPropagation()}>
                      <InfoTooltip source="nosso" text="Anúncios pausados na listagem normal (não relacionado a Ads) — reative pela tela de Anúncios pra voltar a vender e, se quiser, colocar em Ads depois." />
                    </span>
                  </span>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${showPaused ? 'rotate-180' : ''}`} />
                </div>
                {showPaused && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.paused_without_ads.map(l => (
                      <a key={l.item_id} href={l.permalink} target="_blank" rel="noreferrer"
                        className="flex items-center gap-3 bg-white border border-slate-200 hover:border-sky-300 rounded-xl p-3 transition-colors">
                        <img src={l.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-100 shrink-0 bg-slate-50" />
                        <p className="text-sm text-slate-700 truncate flex-1">{l.title}</p>
                        <ExternalLink size={14} className="text-slate-300 shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3.5">
              <Info size={16} className="text-sky-500 mt-0.5 shrink-0" />
              <p className="text-sm text-sky-800 leading-relaxed">
                Pausar/ativar campanha, mudar orçamento ou criar um anúncio patrocinado novo ainda não tem API pública do Mercado Livre — use o botão "Ver no Mercado Livre" acima pra fazer isso direto no painel deles.
              </p>
            </div>
          </>
        )}
      </div>

      <CampaignProductsModal
        campaign={selectedCampaign}
        ads={selectedCampaignAds}
        onClose={() => setSelectedCampaign(null)}
      />
    </div>
  )
}
