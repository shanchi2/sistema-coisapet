import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Truck, Loader2, AlertTriangle, ExternalLink, ChevronDown, Info, PackageCheck, PackageX, Clock, Calendar, MapPin, Ban, Hourglass, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { InfoTooltip } from './InfoTooltip'

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
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

function ShipmentCard({ shipment, highlighted }) {
  const [open, setOpen] = useState(!!highlighted)
  const cardRef = useRef(null)
  const cfg = statusCfg(shipment.status)
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

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function load() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('ml_full_inbound_shipments')
      .select('*, items:ml_full_inbound_items(*)')
      .order('id', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    setShipments(data ?? [])
    setLoading(false)
  }

  const lastSync = useMemo(() => {
    if (!shipments?.length) return null
    return shipments.reduce((max, s) => (!max || s.synced_at > max) ? s.synced_at : max, null)
  }, [shipments])

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

  const filtered = useMemo(() => {
    if (!shipments) return []
    if (tab === 'all') return shipments
    return shipments.filter(s => statusCfg(s.status).bucket === tab)
  }, [shipments, tab])

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
              <InfoTooltip source="nosso" text="Os dados aqui vêm de um favorito do navegador ('Sincronizar Full CoisaPet') que você clica enquanto está logado na Central de Vendedores do ML — ele lê a Gestão de Envios Full de lá e manda pra cá. O Mercado Livre não libera isso por API, só pelo painel logado. Esse botão 'Recarregar' só busca o que já está salvo no nosso banco (não refaz a sincronização com o ML)." />
            </div>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors disabled:opacity-50">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Recarregar
            </button>
          </div>
        </div>

        {/* Aviso: não é automático */}
        <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3.5">
          <Info size={16} className="text-sky-500 mt-0.5 shrink-0" />
          <p className="text-sm text-sky-800 leading-relaxed">
            Assim como o Estoque Full, isso aqui é uma <strong>fotografia</strong> do painel do Mercado Livre, não uma conexão ao vivo — o ML não libera a Gestão de Envios Full por nenhuma API pública, só pelo painel logado no navegador. Pra atualizar, clique no favorito <strong>"Sincronizar Full CoisaPet"</strong> na barra do navegador enquanto estiver logado na Central de Vendedores do ML (não precisa mais pedir pro Claude). Envios já cancelados/finalizados há muito tempo às vezes precisam de um segundo clique pra atualizar os itens — é seguro clicar quantas vezes quiser.
          </p>
        </div>

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
    </div>
  )
}
