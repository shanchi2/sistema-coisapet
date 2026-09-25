import { useEffect, useState } from 'react'
import { Loader2, Check, MessageSquarePlus, ArrowRight, Flag, CircleDot, CheckCircle2, RotateCcw } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { StorageImage } from '../../components/ui/StorageImage'
import {
  OCC_KIND, OCC_STATUS, OCC_RESOLUTION, fetchOccurrenceUpdates, addOccurrenceUpdate, finalizeOrder,
} from './occurrenceTracking'

const PHOTO_BUCKET = 'purchase-attachments'

function fmtNum(v) {
  const n = Number(v) || 0
  return n % 1 === 0 ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}
function fmtDataHora(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export function OccStatusBadge({ status }) {
  const s = OCC_STATUS[status] || OCC_STATUS.aberto
  return <span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full ${s.tone}`}>{s.label}</span>
}
export function OccKindBadge({ kind }) {
  const k = OCC_KIND[kind] || OCC_KIND.avaria
  return <span className={`inline-flex text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${k.tone}`}>{k.label}</span>
}

// Acompanhamento de UMA ocorrência: detalhe + fotos + linha do tempo +
// nova anotação / mudança de status. Resolver exige dizer a solução.
export function OccurrenceTrackingModal({ occurrence, item, order, onClose, onChanged }) {
  const [updates, setUpdates]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [note, setNote]         = useState('')
  const [statusTo, setStatusTo] = useState('')
  const [resolution, setResolution] = useState('')
  const [saving, setSaving]     = useState(false)

  const open = !!occurrence
  useEffect(() => {
    if (!occurrence) return
    setNote(''); setStatusTo(occurrence.status); setResolution(occurrence.resolution || '')
    setLoading(true)
    fetchOccurrenceUpdates(occurrence.id).then(u => { setUpdates(u); setLoading(false) })
  }, [occurrence])

  if (!open) return null
  const occ = occurrence
  const unit = item?.raw_material?.unit || ''
  const kind = OCC_KIND[occ.kind] || OCC_KIND.avaria
  const qty = occ.qty_affected ?? occ.qty_damaged
  const resolving = statusTo === 'resolvido' && occ.status !== 'resolvido'
  const changed = statusTo !== occ.status
  const canSave = !saving && (note.trim() || changed) && (!resolving || (resolution && note.trim()))

  async function handleSave() {
    setSaving(true)
    try {
      await addOccurrenceUpdate(occ, {
        note, statusTo,
        resolution: resolving ? resolution : undefined,
        resolutionNotes: resolving ? note.trim() : undefined,
      })
      await onChanged?.()
      onClose()
    } catch { /* toast no helper */ }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} size="xl"
      title={`${item?.raw_material?.name || 'Item'} — ${fmtNum(qty)} ${unit} ${kind.verb}`}
      subtitle={`${order?.title || order?.supplier?.name || 'Pedido'} · aberta em ${fmtDataHora(occ.reported_at)}`}
      footer={<>
        <button onClick={onClose} className="btn-secondary" disabled={saving}>Fechar</button>
        <button onClick={handleSave} className="btn-primary" disabled={!canSave}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {resolving ? 'Resolver ocorrência' : 'Salvar'}
        </button>
      </>}>
      <div className="flex flex-col gap-5">
        {/* Situação atual */}
        <div className="flex items-center gap-2 flex-wrap">
          <OccKindBadge kind={occ.kind} />
          <OccStatusBadge status={occ.status} />
          {occ.status === 'resolvido' && occ.resolution && (
            <span className="text-xs font-semibold text-emerald-700">Solução: {OCC_RESOLUTION[occ.resolution]}</span>
          )}
        </div>

        {(occ.description || occ.photos?.length > 0) && (
          <div className="bg-slate-50 rounded-xl p-3">
            {occ.description && <p className="text-sm text-slate-600 mb-2"><b className="text-slate-700">Relato da conferência:</b> {occ.description}</p>}
            {occ.photos?.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {occ.photos.map(p => (
                  <StorageImage key={p.id} bucket={PHOTO_BUCKET} path={p.storage_path} className="w-20 h-20 rounded-lg object-cover border border-slate-200" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Linha do tempo */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase mb-2">Acompanhamento</p>
          <div className="flex flex-col">
            <TimelineRow icon={<Flag size={12} />} tone="bg-rose-100 text-rose-600"
              title="Ocorrência aberta na conferência" when={occ.reported_at} />
            {loading ? (
              <div className="py-3 pl-8"><Loader2 size={14} className="animate-spin text-slate-300" /></div>
            ) : updates.map(u => (
              <TimelineRow key={u.id}
                icon={u.status_to === 'resolvido' ? <CheckCircle2 size={12} /> : u.status_to ? <ArrowRight size={12} /> : <CircleDot size={12} />}
                tone={u.status_to === 'resolvido' ? 'bg-emerald-100 text-emerald-600' : u.status_to ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}
                title={u.status_to ? `${OCC_STATUS[u.status_from]?.label || u.status_from} → ${OCC_STATUS[u.status_to]?.label || u.status_to}` : 'Anotação'}
                who={u.author?.name} when={u.created_at} note={u.note} />
            ))}
            {!loading && updates.length === 0 && (
              <p className="text-xs text-slate-400 pl-8 py-1">Nenhuma anotação ainda — registre abaixo o que foi feito (contato com fornecedor, prazo, combinado...).</p>
            )}
          </div>
        </div>

        {/* Nova atualização */}
        <div className="border border-slate-200 rounded-xl p-3 flex flex-col gap-3">
          <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><MessageSquarePlus size={13} /> Nova atualização</p>
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(OCC_STATUS).map(([key, s]) => (
              <button key={key} type="button" onClick={() => setStatusTo(key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${statusTo === key ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                {key === 'aberto' && occ.status === 'resolvido' ? <span className="flex items-center gap-1"><RotateCcw size={11} /> Reabrir</span> : s.label}
              </button>
            ))}
          </div>
          {resolving && (
            <div>
              <label className="form-label">Qual foi a solução? *</label>
              <select className="select" value={resolution} onChange={e => setResolution(e.target.value)}>
                <option value="">Selecione...</option>
                {Object.entries(OCC_RESOLUTION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
          <textarea className="input text-sm" rows={3} value={note} onChange={e => setNote(e.target.value)}
            placeholder={resolving ? 'Descreva a solução final * (ex: fornecedor mandou 1 chapa nova na NF 1234, chegou 30/09)' : 'Ex: liguei pro fornecedor, vão repor na próxima entrega'} />
          {resolving && (!resolution || !note.trim()) && (
            <p className="text-[11px] text-amber-600">Pra resolver, escolha a solução e descreva o que foi feito.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

function TimelineRow({ icon, tone, title, who, when, note }) {
  return (
    <div className="flex gap-3 relative pb-3 last:pb-0">
      <span className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200" />
      <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${tone}`}>{icon}</span>
      <div className="min-w-0 pt-0.5">
        <p className="text-xs font-semibold text-slate-700">{title}</p>
        <p className="text-[11px] text-slate-400">{who ? `${who} · ` : ''}{fmtDataHora(when)}</p>
        {note && <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{note}</p>}
      </div>
    </div>
  )
}

// "Final" do pedido: só com todas as ocorrências resolvidas, com observação final.
export function FinalizeOrderModal({ order, onClose, onDone }) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (order) setNotes('') }, [order])
  if (!order) return null

  const occs = order.occurrences || []
  async function handleSave() {
    setSaving(true)
    try { await finalizeOrder(order.id, notes); await onDone?.(); onClose() }
    catch { /* toast no helper */ }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} size="md" title="Finalizar pedido"
      subtitle={order.title || order.supplier?.name || ''}
      footer={<>
        <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={handleSave} className="btn-primary" disabled={saving || !notes.trim()}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Finalizar
        </button>
      </>}>
      <div className="flex flex-col gap-3">
        {occs.length > 0 ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
            <p className="text-xs font-bold text-emerald-700 mb-1.5">Todas as {occs.length} ocorrência(s) resolvidas:</p>
            <ul className="text-xs text-slate-600 flex flex-col gap-1">
              {occs.map(o => {
                const it = order.items?.find(i => i.id === o.order_item_id)
                return <li key={o.id}>• {it?.raw_material?.name} ({OCC_KIND[o.kind]?.label || 'Avaria'}) — {OCC_RESOLUTION[o.resolution] || 'resolvida'}</li>
              })}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3">Pedido chegou sem nenhuma ocorrência.</p>
        )}
        <div>
          <label className="form-label">Observação final *</label>
          <textarea className="input" rows={4} value={notes} onChange={e => setNotes(e.target.value)} autoFocus
            placeholder="Ex: tudo certo, avaria reposta pelo fornecedor na entrega seguinte, crédito de R$ 22 usado no pedido 78..." />
        </div>
      </div>
    </Modal>
  )
}
