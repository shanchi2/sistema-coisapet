import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Megaphone, RefreshCw, Loader2, AlertTriangle, LayoutDashboard, ListChecks,
  Package, Wallet, FileBarChart, ExternalLink,
} from 'lucide-react'
import { useShopeeAds } from './hooks/useShopeeAds'
import { PERIODS, periodRange, SHOPEE_ORANGE, SELLER_ADS_URL, fmtDate } from './ads/adsUtils'
import { AdsOverviewTab } from './ads/AdsOverviewTab'
import { AdsCampaignsTab } from './ads/AdsCampaignsTab'
import { AdsProductsTab } from './ads/AdsProductsTab'
import { AdsCreditsTab } from './ads/AdsCreditsTab'
import { AdsReportsTab } from './ads/AdsReportsTab'

const TABS = [
  { key: 'visao',      label: 'Visão Geral', icon: LayoutDashboard },
  { key: 'campanhas',  label: 'Campanhas',   icon: ListChecks },
  { key: 'produtos',   label: 'Produtos',    icon: Package },
  { key: 'creditos',   label: 'Créditos',    icon: Wallet },
  { key: 'relatorios', label: 'Relatórios',  icon: FileBarChart },
]
// Abas que dependem do período escolhido lá em cima (Créditos e
// Relatórios têm o próprio recorte de tempo).
const PERIOD_TABS = new Set(['visao', 'campanhas', 'produtos'])

// Módulo Shopee Ads (02/10) — painel completo da publicidade da Shopee:
// desempenho geral/por hora, campanhas (com pausar/retomar/orçamento/ROAS
// alvo direto daqui), produtos anunciados e sugeridos, controle de
// créditos (saldo real + recargas lançadas + previsão) e relatórios.
// Os dados de Ads vêm AO VIVO da API (edge function `shopee-ads`); o que
// é controle nosso mora nas tabelas da fase92.
export function ShopeeAdsPage() {
  const ads = useShopeeAds()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(t => t.key === params.get('aba')) ? params.get('aba') : 'visao'
  const [period, setPeriod] = useState('30')
  const range = useMemo(() => periodRange(period), [period])

  const [dash, setDash] = useState(null)
  const [camp, setCamp] = useState(null)
  const [revenue, setRevenue] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const setTab = (key) => setParams(p => { const n = new URLSearchParams(p); n.set('aba', key); return n }, { replace: true })

  const loadSettings = useCallback(() => ads.fetchSettings().then(setSettings).catch(() => {}), [ads.fetchSettings])
  useEffect(() => { loadSettings() }, [loadSettings])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.allSettled([
      ads.fetchDashboard(range.start, range.end),
      ads.fetchCampaigns(range.start, range.end),
      ads.fetchShopeeRevenueByDay(range.start, range.end),
    ]).then(([d, c, r]) => {
      if (cancelled) return
      if (d.status === 'fulfilled') setDash(d.value); else setError(d.reason?.message || 'Falha ao carregar Shopee Ads')
      if (c.status === 'fulfilled') setCamp(c.value); else setError(e => e || c.reason?.message)
      if (r.status === 'fulfilled') setRevenue(r.value)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range.start, range.end, reloadKey, ads.fetchDashboard, ads.fetchCampaigns, ads.fetchShopeeRevenueByDay])

  const reload = () => setReloadKey(k => k + 1)

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
              style={{ background: `linear-gradient(135deg, ${SHOPEE_ORANGE}, #D6431F)`, boxShadow: `0 2px 10px ${SHOPEE_ORANGE}40` }}>
              <Megaphone size={22} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Shopee Ads</h1>
              <p className="text-sm text-slate-500">Publicidade da loja — desempenho, campanhas, créditos e relatórios</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a href={SELLER_ADS_URL} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
              <ExternalLink size={14}/> Seller Center
            </a>
            <button onClick={reload} disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-white rounded-lg disabled:opacity-60 transition-colors"
              style={{ background: SHOPEE_ORANGE }}>
              {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} Atualizar
            </button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${active ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
                style={active ? { background: SHOPEE_ORANGE } : undefined}>
                <Icon size={15}/> {t.label}
              </button>
            )
          })}
        </div>

        {/* Período (só nas abas que usam) */}
        {PERIOD_TABS.has(tab) && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 flex-wrap">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${period === p.key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              {fmtDate(range.start)} a {fmtDate(range.end)}
              {dash?.period && <> · comparando com {fmtDate(dash.period.prev_start)} a {fmtDate(dash.period.prev_end)}</>}
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
            <div>
              <p className="font-semibold">Não deu pra carregar tudo da Shopee</p>
              <p className="text-xs mt-0.5 break-all">{error}</p>
            </div>
          </div>
        )}

        {loading && !dash && (
          <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
            <Loader2 size={18} className="animate-spin"/> Buscando dados da Shopee Ads…
          </div>
        )}

        {tab === 'visao' && dash && (
          <AdsOverviewTab dash={dash} camp={camp} revenue={revenue} settings={settings} range={range}
            onOpenTab={setTab}/>
        )}
        {tab === 'campanhas' && (camp || !loading) && (
          <AdsCampaignsTab camp={camp} settings={settings} range={range} onChanged={reload}/>
        )}
        {tab === 'produtos' && (camp || !loading) && (
          <AdsProductsTab camp={camp} settings={settings}/>
        )}
        {tab === 'creditos' && (
          <AdsCreditsTab settings={settings} onSettingsSaved={loadSettings} campaigns={camp?.campaigns || []}/>
        )}
        {tab === 'relatorios' && (
          <AdsReportsTab/>
        )}
      </div>
    </div>
  )
}
