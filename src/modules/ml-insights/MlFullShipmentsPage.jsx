import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Truck, Loader2, AlertTriangle, ExternalLink, ChevronDown, Info, PackageCheck, PackageX, Clock, Calendar, MapPin, Ban, Hourglass, RefreshCw, Search, Puzzle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { InfoTooltip } from './InfoTooltip'
import { FullSyncExtensionModal } from './FullSyncExtensionModal'

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
// "há 3 dias", "há 5 h" — pra deixar claro de quando é cada informação
function fmtAgo(iso) {
  if (!iso) return null
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `há ${Math.max(1, min)} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} dia${d > 1 ? 's' : ''}`
}
const daysSince = iso => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity)
const ML_INBOUNDS_URL = 'https://vendedores.mercadolivre.com.br/shipping/inbounds'
// Envio que ainda pode mudar de status no ML (o resto é histórico fixo)
const isOpenStatus = st => !['closed_ok', 'closed_with_changes', 'cancelled', 'expired'].includes(st)

function fmtMoney(v) {
  if (v == null) return null
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Status bruto que o Mercado Livre devolve → como mostramos pro Raphael.
// `bucket` agrupa pros filtros de aba; `action` marca os que realmente
// precisam de alguém fazer alguma coisa no painel do ML.
const STATUS_CONFIG = {
  working:              { label: 'Em preparação',           bucket: 'pending',   action: true,  badge: 'bg-amber-50 text-amber-700 border border-amber-200',   dot: 'bg-amber-500' },
  confirmed:            { label: 'Aguardando recebimento',  bucket: 'transit',   action: false, badge: 'bg-sky-50 text-sky-700 border border-sky-200',         dot: 'bg-sky-500' },
  // Achado ao vivo em 13/09 (caso real): lote chegou fisicamente mas
  // ainda está sendo processado/conferido pelo centro de distribuição —
  // status real do ML, diferente de `confirmed` (que é "ainda a
  // caminho"). Sem isso caía no rótulo genérico "received" cru.
  received:             { label: 'Recebido, processando',   bucket: 'transit',   action: false, badge: 'bg-sky-50 text-sky-700 border border-sky-200',         dot: 'bg-sky-500' },
  closed_ok:            { label: 'Finalizado',              bucket: 'done',      action: false, badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
  closed_with_changes:  { label: 'Finalizado c/ diferenças',bucket: 'done',      action: false, badge: 'bg-orange-50 text-orange-700 border border-orange-200', dot: 'bg-orange-500' },
  cancelled:            { label: 'Cancelado',               bucket: 'cancelled', action: false, badge: 'bg-slate-100 text-slate-500 border border-slate-200',  dot: 'bg-slate-400' },
  expired:              { label: 'Vencido',                 bucket: 'cancelled', action: false, badge: 'bg-rose-50 text-rose-600 border border-rose-200',     dot: 'bg-rose-400' },
}
function statusCfg(status) {
  return STATUS_CONFIG[status] || { label: status || 'Desconhecido', bucket: 'other', action: false, badge: 'bg-slate-100 text-slate-500 border border-slate-200', dot: 'bg-slate-400' }
}

const TABS = [
  { key: 'all',       label: 'Todos' },
  { key: 'pending',   label: 'Precisam de ação' },
  { key: 'transit',   label: 'Aguardando recebimento' },
  { key: 'done',      label: 'Finalizados' },
  { key: 'cancelled', label: 'Cancelados / vencidos' },
]

function ItemRow({ item }) {
  const hasDiff = item.diff_qty != null && item.diff_qty !== 0
  // Anúncios de catálogo repetem o título quase igual no campo de variação
  // (só sem o prefixo "Seleção de ") — esconde pra não poluir a linha.
  const showVariation = item.variation && item.title?.replace(/^Seleção de /, '').trim() !== item.variation.trim()
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${hasDiff ? 'bg-orange-50/60' : 'bg-slate-50'}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700 truncate">{item.title || '—'}{showVariation ? ` · ${item.variation}` : ''}</p>
        <p className="text-[11px] font-mono text-slate-400">{item.ml_code || '—'}</p>
        {item.result_text && <p className="text-xs text-orange-600 mt-0.5">{item.result_text}</p>}
      </div>
      <div className="flex items-center gap-4 shrink-0 text-right">
        <div><p className="text-[10px] text-slate-400 uppercase">Declarado</p><p className="text-sm font-semibold text-slate-700">{item.declared_qty ?? '—'}</p></div>
        <div><p className="text-[10px] text-slate-400 uppercase">Apto Full</p><p className={`text-sm font-bold ${hasDiff ? 'text-orange-600' : 'text-emerald-600'}`}>{item.apt_qty ?? '—'}</p></div>
      </div>
    </div>
  )
}

// Todas as datas que o ML devolve pro envio, em ordem cronológica
function ShipmentDates({ shipment: s }) {
  const closed = ['closed_ok', 'closed_with_changes'].includes(s.status)
  const rows = [
    s.appointment_cancel_limit && { label: 'Limite pra cancelar', value: fmtDateTime(s.appointment_cancel_limit) },
    s.appointment_date && { label: s.raw?.shipment_type === 'pickup' ? 'Coleta agendada' : 'Entrega agendada', value: fmtDateTime(s.appointment_date) },
    s.reception_date && { label: 'Recebido no centro', value: fmtDateTime(s.reception_date) },
    closed && s.last_updated_ml && { label: 'Finalizado (conferência)', value: fmtDateTime(s.last_updated_ml) },
    !closed && s.last_updated_ml && { label: 'Última mudança no ML', value: fmtDateTime(s.last_updated_ml) },
    { label: 'Lido do ML em', value: `${fmtDateTime(s.synced_at)} (${fmtAgo(s.synced_at)})${s.synced_by ? ` · ${s.synced_by}` : ''}` },
  ].filter(Boolean)
  const processing = s.reception_date && closed && s.last_updated_ml
    ? Math.max(0, Math.round((new Date(s.last_updated_ml) - new Date(s.reception_date)) / 86400000)) : null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
      {rows.map(r => (
        <div key={r.label} className="rounded-lg border border-slate-100 px-3 py-2">
          <p className="text-[10px] text-slate-400 uppercase">{r.label}</p>
          <p className="text-xs font-semibold text-slate-700">{r.value}</p>
        </div>
      ))}
      {processing != null && (
        <div className="rounded-lg border border-slate-100 px-3 py-2">
          <p className="text-[10px] text-slate-400 uppercase">Tempo de conferência</p>
          <p className="text-xs font-semibold text-slate-700">{processing === 0 ? 'mesmo dia' : `${processing} dia${processing > 1 ? 's' : ''}`}</p>
        </div>
      )}
    </div>
  )
}

function ShipmentCard({ shipment, highlighted }) {
  const [open, setOpen] = useState(!!highlighted)
  const cardRef = useRef(null)
  const cfg = statusCfg(shipment.status)
  // Envio em aberto com leitura velha: o status mostrado pode não ser mais o real
  const stale = isOpenStatus(shipment.status) && daysSince(shipment.synced_at) > 1
  const items = shipment.items || []
  const diffItems = items.filter(i => i.diff_qty)
  const problems = [
    shipment.has_identification_problems && 'problema de identificação',
    shipment.has_unsolvable_problems && 'problema sem solução automática',
    shipment.has_fiscal_problems && 'problema fiscal',
  ].filter(Boolean)

  // Veio de um link da tela de Estoque Full ("X un. a caminho — Envio
  // #123") — abre já expandido e rola até ele (pedido do Raphael, 13/09:
  // "fazer essas 2 telas conversarem").
  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlighted])

  return (
    <div ref={cardRef} className={`bg-white border-2 rounded-2xl overflow-hidden transition-colors ${highlighted ? 'border-sky-400 ring-2 ring-sky-200' : cfg.action ? 'border-amber-300' : 'border-slate-200'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-4 p-4 hover:bg-slate-50/60 transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-800">Envio #{shipment.id}</p>
              {shipment.name && <span className="text-xs text-slate-400 truncate">{shipment.name}</span>}
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>{cfg.label}</span>
              {problems.length > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 shrink-0 inline-flex items-center gap-1">
                  <AlertTriangle size={11} /> {problems.join(', ')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-400">
              {shipment.logistic_center_id && <span className="inline-flex items-center gap-1"><MapPin size={11} />{shipment.logistic_center_id}</span>}
              {shipment.appointment_date && <span className="inline-flex items-center gap-1"><Calendar size={11} />{fmtDate(shipment.appointment_date)}</span>}
              {shipment.reception_date && <span>Recebido em {fmtDate(shipment.reception_date)}</span>}
              {stale && (
                <span className="inline-flex items-center gap-1 text-amber-600 font-semibold" title={`Informação do ML lida em ${fmtDateTime(shipment.synced_at)}`}>
                  <Clock size={11} /> status de {fmtAgo(shipment.synced_at)} — pode ter mudado
                </span>
              )}
              {shipment.total_charged > 0 && <span>Custo: {fmtMoney(shipment.total_charged)}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold text-slate-700">{shipment.products_count ?? '—'}</p>
            <p className="text-[10px] text-slate-400 uppercase">declaradas</p>
          </div>
          <a href={`https://vendedores.mercadolivre.com.br/shipping/inbounds/${shipment.id}/details`} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()} className="text-slate-300 hover:text-sky-500 transition-colors" title="Ver no Mercado Livre">
            <ExternalLink size={15} />
          </a>
          <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4 flex flex-col gap-2">
          <ShipmentDates shipment={shipment} />
          {items.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-2">Nenhum item registrado pra este envio.</p>
          ) : (
            <>
              {diffItems.length > 0 && (
                <p className="text-xs text-orange-600 font-semibold mb-1">{diffItems.length} de {items.length} produtos vieram com diferença entre o declarado e o que o centro logístico aceitou.</p>
              )}
              {items.map(i => <ItemRow key={i.id} item={i} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function MlFullShipmentsPage() {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('envio')
  const [shipments, setShipments] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Default "Todos" também cobre o caso de vir de um link específico de
  // envio ("Estoque Full" → "a caminho") — garante que o card apareça
  // independente do status dele.
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [centerFilter, setCenterFilter] = useState('all')
  const [extOpen, setExtOpen] = useState(false)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function load() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('ml_full_inbound_shipments')
      .select('*, items:ml_full_inbound_items(*)')
      .order('id', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    // Em aberto primeiro (são os que mudam), depois o histórico do mais novo pro mais velho
    const rows = (data ?? []).sort((a, b) => (isOpenStatus(b.status) - isOpenStatus(a.status)) || b.id - a.id)
    setShipments(rows)
    setLoading(false)
  }

  const lastSync = useMemo(() => {
    if (!shipments?.length) return null
    return shipments.reduce((max, s) => (!max || s.synced_at > max) ? s.synced_at : max, null)
  }, [shipments])

  const lastSyncBy = useMemo(() => shipments?.find(s => s.synced_at === lastSync)?.synced_by || null, [shipments, lastSync])

  const stats = useMemo(() => {
    if (!shipments) return null
    const byBucket = key => shipments.filter(s => statusCfg(s.status).bucket === key).length
    return {
      total: shipments.length,
      pending: byBucket('pending'),
      transit: byBucket('transit'),
      done: byBucket('done'),
      cancelled: byBucket('cancelled'),
    }
  }, [shipments])

  const centers = useMemo(() => {
    if (!shipments) return []
    return [...new Set(shipments.map(s => s.logistic_center_id).filter(Boolean))].sort()
  }, [shipments])

  const filtered = useMemo(() => {
    if (!shipments) return []
    return shipments
      .filter(s => tab === 'all' || statusCfg(s.status).bucket === tab)
      .filter(s => centerFilter === 'all' || s.logistic_center_id === centerFilter)
      .filter(s => {
        if (!search.trim()) return true
        const q = search.trim().toLowerCase()
        if (String(s.id).toLowerCase().includes(q) || s.name?.toLowerCase().includes(q)) return true
        return (s.items || []).some(i => i.title?.toLowerCase().includes(q) || i.ml_code?.toLowerCase().includes(q))
      })
  }, [shipments, tab, centerFilter, search])

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200">
              <Truck size={22} strokeWidth={1.5} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                Gestão de Envios Full
                <InfoTooltip source="nosso" text="Os envios de estoque que vocês mandam fisicamente pro centro de distribuição do Mercado Livre. Cada envio pode ter vários produtos dentro, e passa por etapas até o ML confirmar que recebeu tudo certo." />
              </h1>
              <p className="text-sm text-slate-500">Acompanhamento dos envios de mercadoria pro centro de distribuição do ML</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock size={13} />
              {lastSync ? `Última sincronização: ${fmtDateTime(lastSync)}` : 'Ainda não sincronizado'}
              <InfoTooltip source="nosso" text="Os dados aqui vêm da extensão do Chrome da CoisaPet (ou do favorito antigo 'Sincronizar Full CoisaPet'), que lê a Gestão de Envios Full do painel do ML logado e manda pra cá. O Mercado Livre não libera isso por API. O botão 'Recarregar' só busca o que já está salvo no nosso banco." />
            </div>
            <button onClick={() => setExtOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 transition-colors">
              <Puzzle size={13} /> Extensão do Chrome
            </button>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors disabled:opacity-50">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Recarregar
            </button>
          </div>
        </div>

        {/* Quão atual é isso aqui — o ML não tem API pra Envios Full */}
        {shipments && (() => {
          const age = daysSince(lastSync)
          const old = age > 1
          return (
            <div className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 border ${old ? 'bg-amber-50 border-amber-300' : 'bg-sky-50 border-sky-200'}`}>
              {old ? <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" /> : <Info size={16} className="text-sky-500 mt-0.5 shrink-0" />}
              <div className={`text-sm leading-relaxed flex-1 ${old ? 'text-amber-900' : 'text-sky-800'}`}>
                {old ? (
                  <p><strong>Estes dados são de {lastSync ? `${fmtDate(lastSync)} (${fmtAgo(lastSync)})` : 'nunca'}</strong> — status e datas dos envios em aberto podem já ter mudado no Mercado Livre. Atualize antes de confiar neles.</p>
                ) : (
                  <p>Dados lidos do Mercado Livre {fmtAgo(lastSync)}{lastSyncBy ? ` (${lastSyncBy})` : ''}.</p>
                )}
                <p className="mt-1 text-xs opacity-90">
                  Pra ficar sempre atualizado sozinho, instale a <button onClick={() => setExtOpen(true)} className="font-bold underline">extensão do Chrome</button> — ela sincroniza toda vez que alguém abre a Central de Vendedores do ML. Sem ela: abra a Gestão de envios Full no ML e clique no favorito <strong>"Sincronizar Full CoisaPet"</strong>, depois em <strong>Recarregar</strong> aqui. O ML não libera essa tela por API, só pelo painel logado.
                </p>
              </div>
              <a href={ML_INBOUNDS_URL} target="_blank" rel="noreferrer"
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white ${old ? 'bg-amber-500 hover:bg-amber-600' : 'bg-sky-500 hover:bg-sky-600'}`}>
                Abrir no ML <ExternalLink size={12} />
              </a>
            </div>
          )
        })()}

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {loading && !shipments && (
          <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-400" /></div>
        )}

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1"><Truck size={14} className="text-slate-400" /><p className="text-xs font-semibold text-slate-500 uppercase">Total</p></div>
              <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
            </div>
            <div className="bg-white border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1"><AlertTriangle size={14} className="text-amber-500" /><p className="text-xs font-semibold text-slate-500 uppercase">Precisam de ação</p></div>
              <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            </div>
            <div className="bg-white border border-sky-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1"><Hourglass size={14} className="text-sky-500" /><p className="text-xs font-semibold text-slate-500 uppercase">Aguardando</p></div>
              <p className="text-2xl font-bold text-sky-600">{stats.transit}</p>
            </div>
            <div className="bg-white border border-emerald-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1"><PackageCheck size={14} className="text-emerald-500" /><p className="text-xs font-semibold text-slate-500 uppercase">Finalizados</p></div>
              <p className="text-2xl font-bold text-emerald-600">{stats.done}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1"><Ban size={14} className="text-slate-400" /><p className="text-xs font-semibold text-slate-500 uppercase">Cancelados/vencidos</p></div>
              <p className="text-2xl font-bold text-slate-500">{stats.cancelled}</p>
            </div>
          </div>
        )}

        {shipments && shipments.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nº do envio, produto ou MLB..."
                className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white" />
            </div>
            {centers.length > 1 && (
              <select value={centerFilter} onChange={e => setCenterFilter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-600 focus:outline-none">
                <option value="all">Todos os centros</option>
                {centers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <span className="text-xs text-slate-400 ml-auto">{filtered.length} de {shipments.length} envio{shipments.length > 1 ? 's' : ''}</span>
          </div>
        )}

        {shipments && (
          <div className="flex flex-wrap gap-2">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors border ${tab === t.key ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {shipments && shipments.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <Truck size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">Nenhum envio sincronizado ainda.</p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex flex-col gap-3">
            {filtered.map(s => <ShipmentCard key={s.id} shipment={s} highlighted={String(s.id) === highlightId} />)}
          </div>
        )}
        {shipments && shipments.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-500">Nenhum envio nessa categoria.</p>
          </div>
        )}
      </div>
      <FullSyncExtensionModal open={extOpen} onClose={() => setExtOpen(false)} />
    </div>
  )
}
