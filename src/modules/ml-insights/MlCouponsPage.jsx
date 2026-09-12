import { useEffect, useState } from 'react'
import { Ticket, Loader2, AlertTriangle, RefreshCw, ExternalLink, ChevronDown, ChevronUp, Percent, DollarSign } from 'lucide-react'
import { useMlInsights } from './hooks/useMlInsights'

function fmtMoney(v) {
  if (v == null || Number.isNaN(v)) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Status que a própria API do ML devolve — não inventamos nenhum
// estado novo, só rótulo/cor em PT-BR pra cada um já documentado.
const STATUS_INFO = {
  pending:  { label: 'Agendado',  bg: 'bg-amber-100',   text: 'text-amber-700' },
  started:  { label: 'Ativo',     bg: 'bg-emerald-100', text: 'text-emerald-700' },
  finished: { label: 'Encerrado', bg: 'bg-slate-100',   text: 'text-slate-500' },
  deleted:  { label: 'Excluído',  bg: 'bg-rose-100',    text: 'text-rose-600' },
}

// "Faltam N dias" / "começa em N dias" / "encerrado há N dias" — só
// pra dar contexto rápido sem precisar fazer conta de cabeça olhando
// as datas.
function relativeTiming(startDate, finishDate) {
  const now = new Date()
  const start = new Date(startDate)
  const finish = new Date(finishDate)
  const dayMs = 24 * 60 * 60 * 1000
  if (now < start) {
    const days = Math.ceil((start - now) / dayMs)
    return `começa em ${days} dia${days !== 1 ? 's' : ''}`
  }
  if (now > finish) {
    const days = Math.floor((now - finish) / dayMs)
    return days === 0 ? 'encerrado hoje' : `encerrado há ${days} dia${days !== 1 ? 's' : ''}`
  }
  const days = Math.ceil((finish - now) / dayMs)
  return `termina em ${days} dia${days !== 1 ? 's' : ''}`
}

function CouponItemsPanel({ coupon, fetchPromotionCandidates }) {
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try { setItems(await fetchPromotionCandidates(coupon.id, 'SELLER_COUPON_CAMPAIGN')) }
    catch { setItems([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  if (loading) return <div className="flex items-center gap-2 text-xs text-slate-400 py-3"><Loader2 size={13} className="animate-spin" /> Carregando produtos...</div>
  if (!items?.length) return <p className="text-xs text-slate-400 py-3">Nenhum produto participando ainda.</p>

  return (
    <div className="space-y-1.5 py-2">
      {items.map(it => (
        <a key={it.id} href={`https://produto.mercadolivre.com.br/${it.id}`} target="_blank" rel="noreferrer"
          className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2 hover:bg-slate-100 transition-colors">
          <span className="text-xs text-slate-600 flex items-center gap-1.5">{it.id} <ExternalLink size={10} className="text-slate-300" /></span>
          <span className="text-xs font-semibold text-slate-500">{it.status === 'started' ? 'Participando' : it.status === 'candidate' ? 'Candidato' : it.status}</span>
        </a>
      ))}
    </div>
  )
}

function CouponCard({ coupon, fetchPromotionCandidates }) {
  const [expanded, setExpanded] = useState(false)
  const st = STATUS_INFO[coupon.status] || { label: coupon.status, bg: 'bg-slate-100', text: 'text-slate-500' }
  const isPercentage = coupon.sub_type === 'FIXED_PERCENTAGE'
  const used = coupon.budget != null && coupon.remaining_budget != null ? coupon.budget - coupon.remaining_budget : null
  const usedPct = used != null && coupon.budget > 0 ? Math.min(100, Math.round((used / coupon.budget) * 100)) : null

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            {isPercentage ? <Percent size={16} className="text-amber-500" /> : <DollarSign size={16} className="text-amber-500" />}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{coupon.name || coupon.id}</p>
            <p className="text-xs text-slate-400">{coupon.id} · {relativeTiming(coupon.start_date, coupon.finish_date)}</p>
          </div>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${st.bg} ${st.text}`}>{st.label}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Desconto</p>
          <p className="text-sm font-bold text-slate-700">
            {isPercentage ? `${coupon.fixed_percentage}%` : fmtMoney(coupon.fixed_amount)}
          </p>
          {isPercentage && coupon.max_purchase_amount != null && (
            <p className="text-[10px] text-slate-400">até {fmtMoney(coupon.max_purchase_amount)}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Compra mínima</p>
          <p className="text-sm font-bold text-slate-700">{fmtMoney(coupon.min_purchase_amount)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Período</p>
          <p className="text-xs font-semibold text-slate-700">{fmtDate(coupon.start_date)} – {fmtDate(coupon.finish_date)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Código</p>
          <p className="text-xs font-semibold text-slate-700">{coupon.coupon_code || 'Sem código (automático)'}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Orçamento usado</p>
            <p className="text-[11px] font-bold text-slate-600">{fmtMoney(used)} de {fmtMoney(coupon.budget)}</p>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${usedPct ?? 0}%` }} />
          </div>
        </div>
        <div className="text-center px-3">
          <p className="text-2xl font-black text-slate-800">{coupon.used_coupons ?? 0}</p>
          <p className="text-[10px] text-slate-400 uppercase font-semibold">cupons usados</p>
        </div>
      </div>

      <button onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 mt-3 pt-3 border-t border-slate-100 w-full">
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Produtos participantes
      </button>
      {expanded && <CouponItemsPanel coupon={coupon} fetchPromotionCandidates={fetchPromotionCandidates} />}
    </div>
  )
}

export function MlCouponsPage() {
  const { loading, error, fetchCoupons, fetchPromotionCandidates } = useMlInsights()
  const [coupons, setCoupons] = useState(null)

  async function load() {
    try { setCoupons(await fetchCoupons()) } catch { /* erro já fica em `error` do hook */ }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const sorted = coupons
    ? [...coupons].sort((a, b) => {
        const order = { started: 0, pending: 1, finished: 2, deleted: 3 }
        return (order[a.status] ?? 9) - (order[b.status] ?? 9)
      })
    : null

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1100px] mx-auto space-y-6">

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-amber-200">
              <Ticket size={22} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Cupons do Mercado Livre</h1>
              <p className="text-sm text-slate-500">Controle das campanhas de cupom criadas no painel do ML — status, período, orçamento e uso</p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 hover:border-amber-300 text-slate-600 text-sm font-medium rounded-xl disabled:opacity-50 transition-colors">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Atualizar
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {coupons === null ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-10 justify-center">
            <Loader2 size={16} className="animate-spin" /> Buscando cupons na conta do Mercado Livre...
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <Ticket size={28} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Nenhum cupom encontrado nesta conta do Mercado Livre.</p>
            <p className="text-xs text-slate-400 mt-1">Cupons criados direto no painel do ML aparecem aqui automaticamente.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sorted.map(c => <CouponCard key={c.id} coupon={c} fetchPromotionCandidates={fetchPromotionCandidates} />)}
          </div>
        )}
      </div>
    </div>
  )
}
