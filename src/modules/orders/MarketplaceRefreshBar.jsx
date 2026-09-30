import { useEffect, useState } from 'react'
import { CloudDownload, Settings, X, ShoppingCart, ShoppingBag, CalendarClock } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { refreshMarketplaceOrders } from '../shipping/hooks/useShipping'
import { CutoffSettingsModal } from './CutoffSettingsModal'

// Controle de atualização dos pedidos com as plataformas (30/09, Fase 83 —
// movido da Expedição pra cá a pedido do Raphael: quem cuida disso é o
// administrativo, a Expedição só separa).
// Cada botão antecipa na hora o cron de recheck (roda sozinho a cada 3h):
// consulta a API, atualiza status/prazo/nome/transportadora dos pedidos
// em aberto e reorganiza o dia de quem ainda não tem item separado
// (corte de horário + prazo real da plataforma), nunca pra antes de hoje.
const TZ = 'America/Sao_Paulo'
const fmtTime = ts => ts ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)).replace(',', '') : null
const fmtDay = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : ''

const PLATFORMS = [
  { source: 'ml',     label: 'Mercado Livre', short: 'ML',     icon: ShoppingCart, btn: 'bg-amber-400 hover:bg-amber-500 text-slate-900' },
  { source: 'shopee', label: 'Shopee',        short: 'Shopee', icon: ShoppingBag,  btn: 'bg-orange-500 hover:bg-orange-600 text-white' },
]

export function MarketplaceRefreshBar({ canConfigure, onRefreshed }) {
  const [busy, setBusy] = useState(null)
  const [last, setLast] = useState({})
  const [cutoffs, setCutoffs] = useState({ ml: 11, shopee: 13 })
  const [result, setResult] = useState(null)
  const [cutoffOpen, setCutoffOpen] = useState(false)

  async function loadMeta() {
    const next = {}
    await Promise.all(PLATFORMS.map(async p => {
      const { data } = await supabase.from('orders').select('marketplace_refreshed_at')
        .eq('source', p.source).not('marketplace_refreshed_at', 'is', null)
        .order('marketplace_refreshed_at', { ascending: false }).limit(1).maybeSingle()
      next[p.source] = data?.marketplace_refreshed_at || null
    }))
    setLast(next)
    const { data: cs } = await supabase.from('platform_cutoff_settings').select('source, cutoff_hour')
    const c = { ml: 11, shopee: 13 }
    ;(cs || []).forEach(r => { c[r.source] = r.cutoff_hour })
    setCutoffs(c)
  }
  useEffect(() => { loadMeta() }, [])

  async function run(p) {
    setBusy(p.source)
    try {
      const r = await refreshMarketplaceOrders(p.source)
      setResult({ ...r, platform: p, at: new Date().toISOString() })
      toast.success(`${p.label}: ${r.checked ?? 0} pedido(s) conferidos`)
      onRefreshed?.()
      loadMeta()
    } catch (err) {
      toast.error(`Não consegui atualizar ${p.label}: ${err.message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card py-3 flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
            <CloudDownload size={17} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-700">Atualizar pedidos com as plataformas</p>
            <p className="text-[11px] text-slate-400">
              Automático a cada 3h · corte ML {String(cutoffs.ml).padStart(2, '0')}h · Shopee {String(cutoffs.shopee).padStart(2, '0')}h · envio programado sempre tem prioridade
            </p>
          </div>
        </div>
        {PLATFORMS.map(p => (
          <button key={p.source} onClick={() => run(p)} disabled={!!busy}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold disabled:opacity-60 transition-colors ${p.btn}`}
            title={last[p.source] ? `Última atualização: ${fmtTime(last[p.source])}` : 'Ainda não atualizado'}>
            <p.icon size={15} className={busy === p.source ? 'animate-bounce' : ''} />
            <span className="flex flex-col items-start leading-tight">
              <span>{busy === p.source ? 'Atualizando...' : `Atualizar ${p.short}`}</span>
              {last[p.source] && <span className="text-[10px] font-semibold opacity-75">última: {fmtTime(last[p.source])}</span>}
            </span>
          </button>
        ))}
        {canConfigure && (
          <button onClick={() => setCutoffOpen(true)} title="Horário de corte"
            className="p-2.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
            <Settings size={16} />
          </button>
        )}
      </div>

      {result && (
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
          <CalendarClock size={16} className="text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm text-slate-600">
            <p>
              <b className="text-slate-800">{result.platform.label} atualizado às {fmtTime(result.at)}</b> — {result.checked ?? 0} pedido(s) em aberto conferido(s)
              {result.names ? ` · ${result.names} nome(s) de comprador novo(s)` : ''}
              {result.cancelled ? ` · ${result.cancelled} cancelado(s) na plataforma` : ''}
              {!result.moved?.length && ' · nenhum pedido mudou de dia'}.
            </p>
            {result.moved?.length > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                Mudaram de dia ({result.moved.length}): {result.moved.map(m => `#${m.num_venda} ${fmtDay(m.from)} → ${fmtDay(m.to)}`).join(' · ')}
              </p>
            )}
          </div>
          <button onClick={() => setResult(null)} className="p-1 text-slate-300 hover:text-slate-500"><X size={15} /></button>
        </div>
      )}

      <CutoffSettingsModal open={cutoffOpen} onClose={() => { setCutoffOpen(false); loadMeta() }} />
    </div>
  )
}
