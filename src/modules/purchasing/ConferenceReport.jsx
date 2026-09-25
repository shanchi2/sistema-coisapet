import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ClipboardCheck, Loader2, ShieldAlert, CheckCircle2, AlertTriangle, PackageCheck,
  DollarSign, Search, ChevronLeft, ChevronRight, X, Image as ImageIcon, List,
  Truck, User, RotateCcw, Camera, Boxes,
} from 'lucide-react'
import { useConferenceReport } from './hooks/useConferenceReport'
import { useSignedUrl } from '../../lib/signedUrlCache'

const PHOTO_BUCKET = 'purchase-attachments' // mesmo bucket usado na conferência (useMaterialConference)

// ─── Formatação ──────────────────────────────────────────────────────
function fmtPreco(v) {
  const n = Number(v) || 0
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtNum(v) {
  const n = Number(v) || 0
  return n % 1 === 0 ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}
function fmtQty(v, unit) {
  return `${fmtNum(v)} ${unit || ''}`.trim()
}
// Sempre no horário de Brasília, nunca no fuso do navegador
function fmtDataHora(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}
function fmtData(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
function pct(a, b) {
  if (!b) return 0
  return (a / b) * 100
}
function fmtPct(v) {
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

// Números por item — "faltou" = pediu mais do que chegou; "bom" = o que
// de fato entrou no estoque (recebido − avariado, ver useMaterialConference)
function itemMetrics(it) {
  const ordered  = Number(it.qty_ordered) || 0
  const received = Number(it.qty_received) || 0
  const damaged  = Number(it.qty_damaged) || 0
  const good     = Math.max(0, received - damaged)
  const missing  = Math.max(0, ordered - received)
  const extra    = Math.max(0, received - ordered)
  const loss     = damaged * (Number(it.unit_price) || 0)
  return { ordered, received, damaged, good, missing, extra, loss }
}

function orderMetrics(order) {
  const items = order.items || []
  const m = items.map(itemMetrics)
  return {
    itemCount:     items.length,
    damagedItems:  m.filter(x => x.damaged > 0).length,
    missingItems:  m.filter(x => x.missing > 0).length,
    extraItems:    m.filter(x => x.extra > 0).length,
    loss:          m.reduce((s, x) => s + x.loss, 0),
    openOcc:       (order.occurrences || []).filter(o => o.status === 'aberto').length,
    photoCount:    (order.occurrences || []).reduce((s, o) => s + (o.photos?.length || 0), 0),
  }
}

const PERIODS = [
  { key: '7',   label: '7 dias' },
  { key: '30',  label: '30 dias' },
  { key: '90',  label: '90 dias' },
  { key: '365', label: '12 meses' },
  { key: 'all', label: 'Tudo' },
]

// ─── Peças visuais ───────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, hint, tone = 'slate' }) {
  const tones = {
    slate:   'bg-slate-100 text-slate-600',
    rose:    'bg-rose-100 text-rose-600',
    amber:   'bg-amber-100 text-amber-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    sky:     'bg-sky-100 text-sky-600',
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

// Barra segmentada de um item: verde = entrou no estoque, rosa = avariado,
// cinza tracejado = faltou chegar. Escala = maior entre pedido e recebido.
function ItemBar({ m }) {
  const base = Math.max(m.ordered, m.received) || 1
  const seg = (v) => `${(v / base) * 100}%`
  return (
    <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-100 gap-[2px]"
      title={`Entrou no estoque: ${fmtNum(m.good)} · Avariado: ${fmtNum(m.damaged)}${m.missing ? ` · Faltou: ${fmtNum(m.missing)}` : ''}`}>
      {m.good > 0    && <div className="bg-emerald-500 rounded-l-full" style={{ width: seg(m.good) }} />}
      {m.damaged > 0 && <div className="bg-rose-500" style={{ width: seg(m.damaged) }} />}
      {m.missing > 0 && <div className="rounded-r-full" style={{ width: seg(m.missing), backgroundImage: 'repeating-linear-gradient(45deg,#CBD5E1 0 3px,transparent 3px 6px)' }} />}
    </div>
  )
}

// Ranking em barras horizontais (série única, então sem legenda — o título diz o que é)
function RankingPanel({ title, subtitle, rows, empty, valueLabel }) {
  const max = Math.max(...rows.map(r => r.value), 0) || 1
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="text-sm font-bold text-slate-800">{title}</p>
      <p className="text-xs text-slate-400 mb-3">{subtitle}</p>
      {rows.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600 py-4 justify-center">
          <CheckCircle2 size={16} /> {empty}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map(r => (
            <div key={r.key} className="group" title={r.tooltip}>
              <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
                <span className="font-semibold text-slate-700 truncate">{r.label}</span>
                <span className="text-slate-500 shrink-0">{valueLabel(r)}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-rose-500 group-hover:bg-rose-600 transition-colors" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PhotoThumb({ path, onClick, className = 'w-16 h-16' }) {
  const url = useSignedUrl(PHOTO_BUCKET, path)
  return (
    <button onClick={onClick} className={`${className} rounded-xl overflow-hidden bg-slate-100 border border-slate-200 hover:ring-2 hover:ring-rose-400 transition shrink-0 flex items-center justify-center`}>
      {url ? <img src={url} alt="Foto da avaria" className="w-full h-full object-cover" loading="lazy" />
           : <Loader2 size={14} className="animate-spin text-slate-300" />}
    </button>
  )
}

// ─── Lightbox das fotos ──────────────────────────────────────────────
function Lightbox({ photos, index, onClose, onNav }) {
  const photo = photos[index]
  const url = useSignedUrl(PHOTO_BUCKET, photo?.storage_path)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft')  onNav(-1)
      if (e.key === 'ArrowRight') onNav(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNav])

  if (!photo) return null
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-5 py-3 text-white" onClick={e => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{photo.materialName} — {fmtQty(photo.qtyDamaged, photo.unit)} avariado</p>
          <p className="text-xs text-slate-300 truncate">
            {photo.supplierName} · conferido em {fmtDataHora(photo.conferredAt)}{photo.description ? ` · "${photo.description}"` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-300">{index + 1} / {photos.length}</span>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10"><X size={20} /></button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center gap-3 px-3 pb-6 min-h-0">
        {photos.length > 1 && (
          <button onClick={e => { e.stopPropagation(); onNav(-1) }} className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white shrink-0"><ChevronLeft size={22} /></button>
        )}
        <div className="flex-1 h-full flex items-center justify-center min-w-0" onClick={e => e.stopPropagation()}>
          {url ? <img src={url} alt="Foto da avaria" className="max-h-full max-w-full object-contain rounded-xl" />
               : <Loader2 size={28} className="animate-spin text-white/50" />}
        </div>
        {photos.length > 1 && (
          <button onClick={e => { e.stopPropagation(); onNav(1) }} className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white shrink-0"><ChevronRight size={22} /></button>
        )}
      </div>
    </div>
  )
}

// ─── Card de uma conferência ─────────────────────────────────────────
function OccurrenceBlock({ occ, item, photos, onOpenPhoto, onSetStatus }) {
  const [busy, setBusy] = useState(false)
  const unit = item?.raw_material?.unit
  async function toggle() {
    setBusy(true)
    try { await onSetStatus(occ.id, occ.status === 'aberto' ? 'resolvido' : 'aberto') } catch { /* toast no hook */ }
    finally { setBusy(false) }
  }
  const open = occ.status === 'aberto'
  return (
    <div className={`rounded-xl border px-3 py-3 ${open ? 'bg-rose-50/60 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
      <div className="flex items-start gap-2.5">
        <ShieldAlert size={15} className={`shrink-0 mt-0.5 ${open ? 'text-rose-500' : 'text-slate-400'}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${open ? 'text-rose-700' : 'text-slate-600'}`}>
            {item?.raw_material?.name || 'Item'}
            {occ.qty_damaged != null && <span className="font-normal"> — {fmtQty(occ.qty_damaged, unit)} avariado</span>}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{occ.description || <span className="italic text-slate-400">Sem descrição</span>}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            {open
              ? <>Aberta em {fmtDataHora(occ.reported_at)}</>
              : <>Resolvida {occ.resolver?.name ? `por ${occ.resolver.name} ` : ''}em {fmtDataHora(occ.resolved_at)}</>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${open ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {open ? <><AlertTriangle size={11} /> Aberta</> : <><CheckCircle2 size={11} /> Resolvida</>}
          </span>
          <button onClick={toggle} disabled={busy} className={`text-[11px] font-semibold ${open ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-400 hover:text-slate-600'} disabled:opacity-50 flex items-center gap-1`}>
            {busy && <Loader2 size={10} className="animate-spin" />}
            {open ? 'Marcar resolvida' : <><RotateCcw size={10} /> Reabrir</>}
          </button>
        </div>
      </div>
      {photos.length > 0 ? (
        <div className="flex gap-2 flex-wrap mt-2.5 pl-6">
          {photos.map(p => <PhotoThumb key={p.id} path={p.storage_path} onClick={() => onOpenPhoto(p.id)} />)}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 mt-2 pl-6 flex items-center gap-1"><Camera size={11} /> Sem fotos</p>
      )}
    </div>
  )
}

function ConferenceCard({ order, photoIndex, onOpenPhoto, onSetStatus }) {
  const [expanded, setExpanded] = useState(false)
  const om = orderMetrics(order)
  const allGood = om.damagedItems === 0 && om.missingItems === 0 && om.extraItems === 0

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden ${om.openOcc > 0 ? 'border-rose-200' : 'border-slate-200'}`}>
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-4 hover:bg-slate-50/60 transition-colors">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Truck size={15} className="text-slate-400" /> {order.supplier?.name || 'Sem fornecedor definido'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
              <User size={11} /> Conferido por <b className="text-slate-600">{order.conferrer?.name || '—'}</b> em {fmtDataHora(order.conferred_at)}
              <span className="text-slate-300">·</span> pedido por {order.creator?.name || '—'} em {fmtData(order.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {allGood && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 size={12} /> Tudo certo</span>
            )}
            {om.damagedItems > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700"><ShieldAlert size={12} /> {om.damagedItems} com avaria</span>
            )}
            {(om.missingItems > 0 || om.extraItems > 0) && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700"><AlertTriangle size={12} /> Divergência de qtd</span>
            )}
            {om.photoCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600"><Camera size={12} /> {om.photoCount}</span>
            )}
          </div>
        </div>

        {/* Resumo compacto: uma barrinha por item */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-2 mt-3">
          {(order.items || []).map(it => {
            const m = itemMetrics(it)
            return (
              <div key={it.id} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-[11px] mb-1">
                  <span className="text-slate-600 font-medium truncate">{it.raw_material?.name}</span>
                  <span className={`shrink-0 ${m.damaged > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                    {fmtNum(m.received)}/{fmtNum(m.ordered)}{m.damaged > 0 ? ` · ${fmtNum(m.damaged)} avar.` : ''}
                  </span>
                </div>
                <ItemBar m={m} />
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between mt-3 text-xs">
          <span className="text-slate-400">{om.itemCount} item{om.itemCount !== 1 ? 's' : ''}{om.loss > 0 && <> · <span className="text-rose-600 font-semibold">prejuízo estimado {fmtPreco(om.loss)}</span></>}</span>
          <span className="font-semibold text-slate-500 flex items-center gap-1">{expanded ? 'Ocultar detalhes' : 'Ver detalhes'} <ChevronRight size={13} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} /></span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 flex flex-col gap-4 bg-slate-50/30">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-400 text-left">
                  <th className="font-semibold pb-2">Material</th>
                  <th className="font-semibold pb-2 text-right">Pedido</th>
                  <th className="font-semibold pb-2 text-right">Chegou</th>
                  <th className="font-semibold pb-2 text-right">Avariado</th>
                  <th className="font-semibold pb-2 text-right">Entrou no estoque</th>
                  <th className="font-semibold pb-2 text-right">Diferença</th>
                  <th className="font-semibold pb-2 text-right">Prejuízo</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map(it => {
                  const m = itemMetrics(it)
                  const unit = it.raw_material?.unit
                  return (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="py-2 font-medium text-slate-700">{it.raw_material?.name}</td>
                      <td className="py-2 text-right text-slate-500">{fmtQty(m.ordered, unit)}</td>
                      <td className="py-2 text-right text-slate-700">{fmtQty(m.received, unit)}</td>
                      <td className={`py-2 text-right ${m.damaged > 0 ? 'text-rose-600 font-semibold' : 'text-slate-300'}`}>{m.damaged > 0 ? fmtQty(m.damaged, unit) : '—'}</td>
                      <td className="py-2 text-right text-emerald-700 font-semibold">{fmtQty(m.good, unit)}</td>
                      <td className="py-2 text-right">
                        {m.missing > 0 ? <span className="text-amber-600 font-semibold">faltou {fmtNum(m.missing)}</span>
                          : m.extra > 0 ? <span className="text-sky-600 font-semibold">veio +{fmtNum(m.extra)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={`py-2 text-right ${m.loss > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{m.loss > 0 ? fmtPreco(m.loss) : (m.damaged > 0 && !it.unit_price ? 'sem preço' : '—')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-emerald-500" /> Entrou no estoque</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-rose-500" /> Avariado</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#CBD5E1 0 3px,transparent 3px 6px)' }} /> Faltou chegar</span>
          </div>

          {(order.occurrences || []).length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Ocorrências de avaria</p>
              {order.occurrences.map(occ => (
                <OccurrenceBlock key={occ.id} occ={occ}
                  item={order.items?.find(i => i.id === occ.order_item_id)}
                  photos={occ.photos || []}
                  onOpenPhoto={id => onOpenPhoto(photoIndex.get(id))}
                  onSetStatus={onSetStatus} />
              ))}
            </div>
          )}

          {order.notes && (
            <p className="text-xs text-slate-500"><b className="text-slate-600">Observações do pedido:</b> {order.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────
// Aba "Conferências" dentro de Pedidos de Matéria-Prima (MaterialOrdersPage)
export function ConferenceReport() {
  const { orders, loading, setOccurrenceStatus } = useConferenceReport()

  const [period, setPeriod]       = useState('90')
  const [supplierId, setSupplier] = useState('')
  const [filter, setFilter]       = useState('todas') // todas | avaria | abertas | divergencia | ok
  const [search, setSearch]       = useState('')
  const [tab, setTab]             = useState('lista')  // lista | galeria
  const [lightbox, setLightbox]   = useState(null)     // índice em allPhotos

  const suppliers = useMemo(() => {
    const map = new Map()
    orders.forEach(o => { if (o.supplier) map.set(o.supplier.id, o.supplier.name) })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [orders])

  const filtered = useMemo(() => {
    const since = period === 'all' ? 0 : Date.now() - Number(period) * 86400000
    const q = search.trim().toLowerCase()
    return orders.filter(o => {
      if (period !== 'all' && new Date(o.conferred_at).getTime() < since) return false
      if (supplierId && o.supplier_id !== supplierId) return false
      if (q && !(o.items || []).some(it => it.raw_material?.name?.toLowerCase().includes(q))
            && !o.supplier?.name?.toLowerCase().includes(q)) return false
      const om = orderMetrics(o)
      if (filter === 'avaria'      && om.damagedItems === 0) return false
      if (filter === 'abertas'     && om.openOcc === 0) return false
      if (filter === 'divergencia' && om.missingItems === 0 && om.extraItems === 0) return false
      if (filter === 'ok'          && (om.damagedItems > 0 || om.missingItems > 0 || om.extraItems > 0)) return false
      return true
    })
  }, [orders, period, supplierId, filter, search])

  const kpis = useMemo(() => {
    let items = 0, damagedItems = 0, loss = 0, openOcc = 0, divergences = 0, photos = 0
    filtered.forEach(o => {
      const om = orderMetrics(o)
      items += om.itemCount; damagedItems += om.damagedItems; loss += om.loss
      openOcc += om.openOcc; divergences += om.missingItems + om.extraItems; photos += om.photoCount
    })
    return { conferences: filtered.length, items, damagedItems, loss, openOcc, divergences, photos, rate: pct(damagedItems, items) }
  }, [filtered])

  // Materiais que mais chegam avariados (por qtd de conferências com avaria + prejuízo)
  const materialRanking = useMemo(() => {
    const map = new Map()
    filtered.forEach(o => (o.items || []).forEach(it => {
      const m = itemMetrics(it)
      if (m.damaged <= 0) return
      const key = it.raw_material_id
      const cur = map.get(key) || { key, label: it.raw_material?.name || '—', unit: it.raw_material?.unit, value: 0, damaged: 0, loss: 0 }
      cur.value += 1; cur.damaged += m.damaged; cur.loss += m.loss
      map.set(key, cur)
    }))
    return [...map.values()].sort((a, b) => b.value - a.value || b.damaged - a.damaged).slice(0, 6)
      .map(r => ({ ...r, tooltip: `${r.value} entrega(s) com avaria · ${fmtQty(r.damaged, r.unit)} no total · ${fmtPreco(r.loss)}` }))
  }, [filtered])

  // Taxa de avaria por fornecedor (% dos itens conferidos que vieram com avaria)
  const supplierRanking = useMemo(() => {
    const map = new Map()
    filtered.forEach(o => {
      const key = o.supplier_id || 'none'
      const cur = map.get(key) || { key, label: o.supplier?.name || 'Sem fornecedor', items: 0, damaged: 0, loss: 0 }
      const om = orderMetrics(o)
      cur.items += om.itemCount; cur.damaged += om.damagedItems; cur.loss += om.loss
      map.set(key, cur)
    })
    return [...map.values()].filter(r => r.damaged > 0)
      .map(r => ({ ...r, value: pct(r.damaged, r.items), tooltip: `${r.damaged} de ${r.items} itens com avaria · ${fmtPreco(r.loss)}` }))
      .sort((a, b) => b.value - a.value).slice(0, 6)
  }, [filtered])

  // Todas as fotos das conferências filtradas, achatadas pro lightbox/galeria
  const allPhotos = useMemo(() => {
    const list = []
    filtered.forEach(o => (o.occurrences || []).forEach(occ => {
      const item = o.items?.find(i => i.id === occ.order_item_id)
      ;(occ.photos || []).forEach(p => list.push({
        ...p,
        occurrenceStatus: occ.status,
        description:  occ.description,
        qtyDamaged:   occ.qty_damaged,
        materialName: item?.raw_material?.name || 'Item',
        unit:         item?.raw_material?.unit,
        supplierName: o.supplier?.name || 'Sem fornecedor',
        conferredAt:  o.conferred_at,
      }))
    }))
    return list
  }, [filtered])
  const photoIndex = useMemo(() => new Map(allPhotos.map((p, i) => [p.id, i])), [allPhotos])

  const navLightbox = useCallback(dir => {
    setLightbox(i => (i == null ? i : (i + dir + allPhotos.length) % allPhotos.length))
  }, [allPhotos.length])
  const closeLightbox = useCallback(() => setLightbox(null), [])

  const FILTERS = [
    { key: 'todas',       label: 'Todas' },
    { key: 'avaria',      label: 'Com avaria' },
    { key: 'abertas',     label: 'Ocorrência aberta' },
    { key: 'divergencia', label: 'Divergência de qtd' },
    { key: 'ok',          label: 'Tudo certo' },
  ]

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Filtros — uma linha só, acima de tudo */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex bg-slate-100 rounded-xl p-1 shrink-0 overflow-x-auto">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition ${period === p.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <select className="select lg:w-56" value={supplierId} onChange={e => setSupplier(e.target.value)}>
          <option value="">Todos os fornecedores</option>
          {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar material ou fornecedor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-300" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <KpiCard icon={ClipboardCheck} label="Conferências" value={kpis.conferences} hint={`${kpis.items} itens conferidos`} tone="sky" />
            <KpiCard icon={ShieldAlert} label="Itens com avaria" value={kpis.damagedItems} hint={`${fmtPct(kpis.rate)} dos itens`} tone="rose" />
            <KpiCard icon={AlertTriangle} label="Ocorrências abertas" value={kpis.openOcc} hint={kpis.openOcc ? 'aguardando fornecedor' : 'nada pendente'} tone={kpis.openOcc ? 'rose' : 'emerald'} />
            <KpiCard icon={DollarSign} label="Prejuízo estimado" value={fmtPreco(kpis.loss)} hint="avariado × preço do pedido" tone="amber" />
            <KpiCard icon={Boxes} label="Divergências" value={kpis.divergences} hint="itens com qtd diferente do pedido" tone="amber" />
            <KpiCard icon={Camera} label="Fotos de avaria" value={kpis.photos} hint="registradas no tablet" tone="slate" />
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <RankingPanel title="Materiais que mais chegam avariados" subtitle="Nº de entregas com avaria no período"
              rows={materialRanking} empty="Nenhum material avariado no período"
              valueLabel={r => `${r.value}× · ${fmtQty(r.damaged, r.unit)}`} />
            <RankingPanel title="Taxa de avaria por fornecedor" subtitle="% dos itens conferidos que vieram com avaria"
              rows={supplierRanking} empty="Nenhum fornecedor com avaria no período"
              valueLabel={r => `${fmtPct(r.value)} · ${r.damaged}/${r.items} itens`} />
          </div>

          {/* Abas + filtro rápido */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex bg-slate-100 rounded-xl p-1 self-start">
              <button onClick={() => setTab('lista')} className={`px-4 py-1.5 text-sm font-semibold rounded-lg flex items-center gap-1.5 transition ${tab === 'lista' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                <List size={14} /> Conferências <span className="text-xs text-slate-400">({filtered.length})</span>
              </button>
              <button onClick={() => setTab('galeria')} className={`px-4 py-1.5 text-sm font-semibold rounded-lg flex items-center gap-1.5 transition ${tab === 'galeria' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                <ImageIcon size={14} /> Galeria de avarias <span className="text-xs text-slate-400">({allPhotos.length})</span>
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition ${filter === f.key ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card text-center py-16">
              <PackageCheck size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
              <p className="text-slate-400">{orders.length === 0 ? 'Nenhuma conferência feita ainda' : 'Nenhuma conferência com esses filtros'}</p>
            </div>
          ) : tab === 'lista' ? (
            <div className="flex flex-col gap-3">
              {filtered.map(o => (
                <ConferenceCard key={o.id} order={o} photoIndex={photoIndex}
                  onOpenPhoto={setLightbox} onSetStatus={setOccurrenceStatus} />
              ))}
            </div>
          ) : allPhotos.length === 0 ? (
            <div className="card text-center py-16">
              <Camera size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
              <p className="text-slate-400">Nenhuma foto de avaria nesse período</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {allPhotos.map((p, i) => (
                <div key={p.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <PhotoThumb path={p.storage_path} onClick={() => setLightbox(i)} className="w-full aspect-square !rounded-none !border-0" />
                  <div className="p-2.5">
                    <p className="text-xs font-bold text-slate-700 truncate">{p.materialName}</p>
                    <p className="text-[11px] text-rose-600 font-semibold">{fmtQty(p.qtyDamaged, p.unit)} avariado</p>
                    <p className="text-[11px] text-slate-400 truncate">{p.supplierName} · {fmtData(p.conferredAt)}</p>
                    <span className={`inline-flex mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${p.occurrenceStatus === 'aberto' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {p.occurrenceStatus === 'aberto' ? 'Ocorrência aberta' : 'Resolvida'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {lightbox != null && (
        <Lightbox photos={allPhotos} index={lightbox} onClose={closeLightbox} onNav={navLightbox} />
      )}
    </div>
  )
}
