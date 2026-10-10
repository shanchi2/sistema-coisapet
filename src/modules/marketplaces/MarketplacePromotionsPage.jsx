import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Tag, Loader2, RefreshCw, AlertTriangle, ArrowRight, Info, CalendarClock, Zap, Ticket, Flame, Hourglass } from 'lucide-react'
import { useMlInsights } from '../ml-insights/hooks/useMlInsights'
import { useShopeeInsights } from '../shopee-insights/hooks/useShopeeInsights'
import { StatTile, fmtInt } from '../dashboard/widgets'
import { PLAT, PLATFORMS, usePlatformFilter, PlatformFilter, PlatBadge, Segmented } from './shared'

// Promoções e cupons ML + Shopee (Fase 2 da unificação, 09/10): tudo que
// está rodando, vai começar ou acabou nas duas plataformas, numa lista e
// numa linha do tempo. Fontes (as mesmas das telas de cada uma):
//   ML: `promotion_invites` (todas as campanhas/convites) + `coupons_list`
//   Shopee: `flash_sale_list` + `voucher_list`
// Entrar/sair de campanha, criar cupom e flash sale continuam nas telas
// de cada plataforma.

const ML_TYPE = {
  DEAL: 'Campanha do ML', MARKETPLACE_CAMPAIGN: 'Campanha do ML', SELLER_CAMPAIGN: 'Desconto em massa', LIGHTNING: 'Oferta relâmpago',
  DOD: 'Oferta do dia', VOLUME: 'Desconto por quantidade', PRICE_DISCOUNT: 'Desconto de preço', SELLER_COUPON_CAMPAIGN: 'Cupom',
  PRE_NEGOTIATED: 'Desconto pré-negociado', SMART: 'Campanha automática', UNHEALTHY_STOCK: 'Liquidação de estoque Full', PRICE_MATCHING: 'Preço competitivo',
}
const KIND = {
  campanha: { label: 'Campanhas', icon: Tag },
  relampago: { label: 'Relâmpago / Flash Sale', icon: Zap },
  cupom: { label: 'Cupons', icon: Ticket },
}
const ST = {
  ongoing: { label: 'Rodando', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  upcoming: { label: 'Vai começar', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  pending: { label: 'Convite pendente', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  expired: { label: 'Encerrada', tone: 'bg-slate-100 text-slate-500 border-slate-200' },
}
const TZ = 'America/Sao_Paulo'
const fmtD = ms => ms ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(new Date(ms)) : '—'
const fmtDT = ms => ms ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)) : '—'
const DAY = 86400000

function statusByTime(start, end, now) {
  if (start && now < start) return 'upcoming'
  if (end && now > end) return 'expired'
  return 'ongoing'
}

function fromMlInvite(p, now) {
  const start = p.start_date ? Date.parse(p.start_date) : null, end = p.finish_date ? Date.parse(p.finish_date) : null
  // started = ativa · pending = ainda não começou (ou convite aguardando) · finished = encerrada
  const status = p.status === 'finished' ? 'expired' : p.status === 'started' ? statusByTime(start, end, now) : start && now < start ? 'upcoming' : 'pending'
  return {
    platform: 'ml', key: `ml|${p.type}|${p.id}`, name: p.name || ML_TYPE[p.type] || p.type, type: ML_TYPE[p.type] || p.type,
    kind: p.type === 'LIGHTNING' || p.type === 'DOD' ? 'relampago' : p.type === 'SELLER_COUPON_CAMPAIGN' ? 'cupom' : 'campanha',
    start, end, status, deadline: p.deadline_date ? Date.parse(p.deadline_date) : null,
    detail: p.type === 'SELLER_CAMPAIGN' || p.type === 'DEAL' ? 'entrar/sair dos itens em Promoções' : null,
    link: p.type === 'SELLER_COUPON_CAMPAIGN' ? '/ml/cupons' : '/ml/promocoes',
  }
}
function fromMlCoupon(c, now) {
  const start = c.start_date ? Date.parse(c.start_date) : null, end = c.finish_date ? Date.parse(c.finish_date) : null
  return {
    platform: 'ml', key: `ml|SELLER_COUPON_CAMPAIGN|${c.id}`, name: c.name || `Cupom ${c.coupon_code || c.id}`, type: 'Cupom', kind: 'cupom',
    start, end, status: c.status === 'finished' ? 'expired' : statusByTime(start, end, now),
    detail: [c.coupon_code ? `código ${c.coupon_code}` : 'automático', c.used_coupons != null ? `${c.used_coupons} usados` : null].filter(Boolean).join(' · '),
    link: '/ml/cupons',
  }
}
function fromShopeeVoucher(v, now) {
  const start = v.start_time * 1000, end = v.end_time * 1000
  const desc = v.reward_type === 2 || v.percentage ? `${v.percentage}% off` : null
  return {
    platform: 'shopee', key: `sh|v|${v.voucher_id}`, name: v.voucher_name || `Cupom ${v.voucher_code}`, type: 'Cupom', kind: 'cupom',
    start, end, status: statusByTime(start, end, now),
    detail: [v.voucher_code ? `código ${v.voucher_code}` : null, desc, v.usage_quantity ? `${v.current_usage ?? 0}/${v.usage_quantity} usados` : null].filter(Boolean).join(' · '),
    link: '/shopee/cupons',
  }
}
function fromShopeeFlash(f, now) {
  const start = f.start_time * 1000, end = f.end_time * 1000
  return {
    platform: 'shopee', key: `sh|fs|${f.flash_sale_id}`, name: `Flash Sale #${f.flash_sale_id}`, type: 'Flash Sale', kind: 'relampago',
    start, end, status: f.status !== 1 && statusByTime(start, end, now) !== 'expired' ? 'pending' : statusByTime(start, end, now),
    detail: `${f.enabled_item_count ?? 0} de ${f.item_count ?? 0} produtos ativos${f.status !== 1 ? ' · desabilitada' : ''}`,
    link: '/shopee/flash-sale',
  }
}

export function MarketplacePromotionsPage() {
  const ml = useMlInsights()
  const sh = useShopeeInsights()
  const [plat, setPlat] = usePlatformFilter()
  const [data, setData] = useState({ invites: null, coupons: null, vouchers: null, flash: null })
  const [errs, setErrs] = useState({})
  const [status, setStatus] = useState('live')
  const [kind, setKind] = useState('all')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setData({ invites: null, coupons: null, vouchers: null, flash: null }); setErrs({})
    const put = k => v => setData(d => ({ ...d, [k]: v }))
    const fail = (k, p) => e => { setErrs(x => ({ ...x, [p]: e.message || String(e) })); put(k)([]) }
    ml.fetchPromotionInvites().then(put('invites')).catch(fail('invites', 'ml'))
    ml.fetchCoupons().then(put('coupons')).catch(fail('coupons', 'ml'))
    sh.fetchVoucherList('all', 1, 100).then(r => put('vouchers')(r.list)).catch(fail('vouchers', 'shopee'))
    sh.fetchFlashSaleList(0, 0, 50).then(r => put('flash')(r.list)).catch(fail('flash', 'shopee'))
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = Object.values(data).some(v => v === null)
  const all = useMemo(() => {
    const now = Date.now()
    const couponIds = new Set((data.coupons || []).map(c => String(c.id)))
    return [
      ...(data.invites || []).filter(p => !(p.type === 'SELLER_COUPON_CAMPAIGN' && couponIds.has(String(p.id)))).map(p => fromMlInvite(p, now)),
      ...(data.coupons || []).map(c => fromMlCoupon(c, now)),
      ...(data.vouchers || []).map(v => fromShopeeVoucher(v, now)),
      ...(data.flash || []).map(f => fromShopeeFlash(f, now)),
    ]
  }, [data])

  const plats = plat ? [plat] : PLATFORMS
  const scoped = all.filter(r => plats.includes(r.platform) && (kind === 'all' || r.kind === kind))
  const rows = scoped.filter(r => status === 'all' || (status === 'live' ? r.status !== 'expired' : r.status === status))
    .sort((a, b) => ({ ongoing: 0, pending: 1, upcoming: 2, expired: 3 }[a.status] - { ongoing: 0, pending: 1, upcoming: 2, expired: 3 }[b.status]) || (a.end || 9e15) - (b.end || 9e15))
  const now = Date.now()
  const ongoing = scoped.filter(r => r.status === 'ongoing').length
  const soon = scoped.filter(r => r.status === 'upcoming' && r.start && r.start - now < 7 * DAY).length
  const ending = scoped.filter(r => r.status === 'ongoing' && r.end && r.end - now < 2 * DAY).length
  const pending = scoped.filter(r => r.status === 'pending').length

  // Linha do tempo: de 3 dias atrás a 21 dias pra frente
  const T0 = now - 3 * DAY, T1 = now + 21 * DAY
  const timeline = rows.filter(r => r.status !== 'expired' && (r.end || T1) > T0 && (r.start || T0) < T1).slice(0, 18)
  const xPct = t => Math.min(100, Math.max(0, ((t - T0) / (T1 - T0)) * 100))
  const ticks = Array.from({ length: 9 }, (_, i) => T0 + i * 3 * DAY)

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFE600] to-[#EE4D2D] flex items-center justify-center shrink-0 shadow-sm"><Tag size={20} className="text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Promoções e cupons</h1>
            <p className="text-sm text-slate-500">Campanhas, ofertas relâmpago, Flash Sales e cupons do ML e da Shopee num calendário só</p>
          </div>
        </div>
        <button onClick={() => setTick(t => t + 1)} disabled={loading} className="btn-secondary py-1.5 text-sm disabled:opacity-50">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar</button>
      </div>

      <div className="card !p-3 flex items-center gap-3 flex-wrap">
        <PlatformFilter value={plat} onChange={setPlat} />
        <Segmented value={kind} onChange={setKind} options={[['all', 'Tudo'], ['campanha', 'Campanhas'], ['relampago', 'Relâmpago'], ['cupom', 'Cupons']]} />
        <div className="ml-auto"><Segmented value={status} onChange={setStatus} options={[['live', 'Rodando e próximas'], ['ongoing', 'Rodando'], ['upcoming', 'Próximas'], ['pending', 'Pendentes'], ['expired', 'Encerradas'], ['all', 'Todas']]} /></div>
      </div>

      {Object.entries(errs).map(([p, e]) => <div key={p} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2"><AlertTriangle size={13} />Parte das promoções {p === 'ml' ? 'do ML' : 'da Shopee'} não carregou: {e}</div>)}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={Flame} tone={ongoing ? 'good' : 'neutral'} label="Rodando agora" value={loading && !all.length ? '…' : fmtInt(ongoing)} detail={!plat ? <span><span className="font-semibold" style={{ color: PLAT.ml.ink }}>ML {scoped.filter(r => r.status === 'ongoing' && r.platform === 'ml').length}</span> · <span className="font-semibold" style={{ color: PLAT.shopee.ink }}>Shopee {scoped.filter(r => r.status === 'ongoing' && r.platform === 'shopee').length}</span></span> : PLAT[plat].label} />
        <StatTile icon={Hourglass} tone={ending ? 'warning' : 'neutral'} label="Acabam em 48h" value={fmtInt(ending)} detail="hora de renovar ou trocar" />
        <StatTile icon={CalendarClock} tone="sky" label="Começam em 7 dias" value={fmtInt(soon)} detail="já programadas" />
        <StatTile icon={Tag} tone={pending ? 'warning' : 'neutral'} label="Pendentes" value={fmtInt(pending)} detail="convites do ML ou flash sale desabilitada" />
      </div>

      {timeline.length > 0 && (
        <div className="card">
          <p className="font-bold text-slate-800 text-[15px] mb-3">Linha do tempo <span className="text-xs font-normal text-slate-400">3 dias atrás → próximas 3 semanas · <span className="text-rose-500">|</span> = agora</span></p>
          <div className="relative">
            <div className="grid grid-cols-[minmax(160px,240px)_1fr] gap-x-3">
              <div />
              <div className="relative h-5 text-[10px] text-slate-400">
                {ticks.map(t => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${xPct(t)}%` }}>{fmtD(t)}</span>)}
              </div>
              {timeline.map(r => {
                const a = xPct(r.start || T0), b = xPct(r.end || T1)
                return [
                  <p key={r.key + 'n'} className="text-[12px] text-slate-700 truncate py-1 flex items-center gap-1.5" title={r.name}><PlatBadge p={r.platform} /><span className="truncate">{r.name}</span></p>,
                  <div key={r.key + 'b'} className="relative h-7 border-l border-slate-100">
                    {ticks.map(t => <span key={t} className="absolute top-0 bottom-0 border-l border-slate-50" style={{ left: `${xPct(t)}%` }} />)}
                    <span className="absolute top-0 bottom-0 border-l-2 border-rose-400 z-10" style={{ left: `${xPct(now)}%` }} title="agora" />
                    <div className={`absolute top-1.5 h-4 rounded-full ${r.status === 'pending' ? 'opacity-50' : ''}`} style={{ left: `${a}%`, width: `${Math.max(1.2, b - a)}%`, background: PLAT[r.platform].bar }} title={`${fmtDT(r.start)} → ${fmtDT(r.end)}`} />
                  </div>,
                ]
              })}
            </div>
          </div>
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                <th className="pl-5 pr-2 py-2.5 font-semibold">Promoção</th><th className="px-2 font-semibold">Tipo</th><th className="px-2 font-semibold">Situação</th>
                <th className="px-2 font-semibold">Período</th><th className="px-2 font-semibold">Detalhe</th><th className="px-2 pr-5" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const K = KIND[r.kind]
                const endsSoon = r.status === 'ongoing' && r.end && r.end - now < 2 * DAY
                return (
                  <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="pl-0 pr-2 py-2.5" style={{ boxShadow: `inset 4px 0 0 ${PLAT[r.platform].color}` }}><div className="pl-5 flex items-center gap-2"><PlatBadge p={r.platform} /><span className="text-slate-800 font-medium">{r.name}</span></div></td>
                    <td className="px-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><K.icon size={12} />{r.type}</span></td>
                    <td className="px-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${ST[r.status].tone}`}>{ST[r.status].label}</span></td>
                    <td className={`px-2 text-xs whitespace-nowrap ${endsSoon ? 'text-orange-600 font-semibold' : 'text-slate-500'}`}>{fmtDT(r.start)} → {fmtDT(r.end)}{endsSoon ? ' · acaba logo' : ''}{r.status !== 'expired' && r.deadline && r.deadline > now ? <span className="block text-amber-600">aceitar até {fmtD(r.deadline)}</span> : null}</td>
                    <td className="px-2 text-xs text-slate-500">{r.detail || '—'}</td>
                    <td className="px-2 pr-5 text-right"><Link to={r.link} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">Abrir <ArrowRight size={12} /></Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {loading && <p className="text-xs text-slate-400 text-center py-4"><Loader2 size={12} className="inline animate-spin mr-1" />carregando promoções das duas plataformas…</p>}
          {!loading && !rows.length && <p className="text-sm text-slate-400 text-center py-10">Nenhuma promoção com esses filtros.</p>}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-px" />
        <span>Entrar ou sair de campanha, criar cupom e montar Flash Sale continuam na tela de cada plataforma — o "Abrir" leva direto. No ML, a API não separa cupom de campanha na listagem: os cupons vêm com o detalhe (código e quantos usaram).</span>
      </p>
    </div>
  )
}
