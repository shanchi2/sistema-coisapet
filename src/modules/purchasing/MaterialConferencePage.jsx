import { useState } from 'react'
import { ArrowLeft, Minus, Plus, Check, Camera, X, ClipboardCheck, Loader2, AlertTriangle } from 'lucide-react'
import { useMaterialConference } from './hooks/useMaterialConference'
import toast from 'react-hot-toast'

function fmtQty(v, unit) {
  const n = Number(v)
  return `${n % 1 === 0 ? n : n.toFixed(3).replace(/\.?0+$/, '')} ${unit || ''}`
}

// ── Tela de checklist de 1 pedido — mesmo estilo "feira" já usado no
// Picklist de Expedição (toque grande, estoque +/-, tudo pensado pro
// tablet do galpão). ──────────────────────────────────────────────
function ConferenceChecklist({ order, onBack, onFinish }) {
  // state por item: { qty_received, item_status, occurrence_description, occurrence_photos }
  const [state, setState] = useState(() => Object.fromEntries(
    (order.items || []).map(it => [it.id, {
      qty_received: Number(it.qty_ordered),
      item_status: 'ok',
      occurrence_description: '',
      occurrence_photos: [],
    }])
  ))
  const [saving, setSaving] = useState(false)

  function update(itemId, patch) {
    setState(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }))
  }
  function adjustQty(itemId, delta, max) {
    setState(prev => {
      const next = Math.max(0, Math.min(max, Number(prev[itemId].qty_received) + delta))
      return { ...prev, [itemId]: { ...prev[itemId], qty_received: next } }
    })
  }
  function toggleAvariado(itemId) {
    setState(prev => ({ ...prev, [itemId]: { ...prev[itemId], item_status: prev[itemId].item_status === 'avariado' ? 'ok' : 'avariado' } }))
  }
  function addPhotos(itemId, files) {
    update(itemId, { occurrence_photos: [...state[itemId].occurrence_photos, ...Array.from(files)] })
  }
  function removePhoto(itemId, idx) {
    update(itemId, { occurrence_photos: state[itemId].occurrence_photos.filter((_, i) => i !== idx) })
  }

  const items = order.items || []
  const avariados = items.filter(it => state[it.id]?.item_status === 'avariado')
  const missingPhoto = avariados.some(it => !state[it.id]?.occurrence_photos?.length)

  async function handleFinish() {
    if (missingPhoto) { toast.error('Anexa pelo menos 1 foto dos itens avariados antes de finalizar.'); return }
    setSaving(true)
    try {
      const results = items.map(it => ({
        item_id: it.id,
        raw_material_id: it.raw_material_id,
        qty_received: state[it.id].qty_received,
        item_status: state[it.id].item_status,
        occurrence_description: state[it.id].occurrence_description,
        occurrence_photos: state[it.id].occurrence_photos,
      }))
      await onFinish(order, results)
    } catch (err) {
      toast.error('Erro ao finalizar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-100 px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={onBack} className="p-3 -ml-1 rounded-xl text-slate-500 bg-slate-100 shrink-0">
          <ArrowLeft size={24} />
        </button>
        <div>
          <p className="text-xl font-black text-slate-800">{order.supplier?.name || 'Conferência'}</p>
          <p className="text-sm text-slate-400 font-semibold">{items.length} item{items.length !== 1 ? 's' : ''} pra conferir</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-w-2xl mx-auto w-full">
        {items.map(it => {
          const s = state[it.id]
          const isAvariado = s.item_status === 'avariado'
          const isShort = s.qty_received < Number(it.qty_ordered)
          return (
            <div key={it.id}
              className={`rounded-2xl border-2 p-4 ${isAvariado ? 'bg-rose-50 border-rose-300' : isShort ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold leading-snug text-slate-800">{it.raw_material?.name}</p>
                  <p className="text-xs text-slate-400 mt-1">Pedido: {fmtQty(it.qty_ordered, it.raw_material?.unit)}</p>
                </div>
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => adjustQty(it.id, -1, it.qty_ordered)}
                      className="w-9 h-9 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-slate-500">
                      <Minus size={16} strokeWidth={3} />
                    </button>
                    <span className={`w-14 text-center text-xl font-black ${isShort ? 'text-amber-600' : 'text-slate-700'}`}>
                      {s.qty_received}
                    </span>
                    <button onClick={() => adjustQty(it.id, 1, it.qty_ordered)}
                      className="w-9 h-9 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-slate-500">
                      <Plus size={16} strokeWidth={3} />
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400">recebido</span>
                </div>
              </div>

              <button onClick={() => toggleAvariado(it.id)}
                className={`w-full mt-3 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                  isAvariado ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                <AlertTriangle size={15} /> {isAvariado ? 'Marcado como avariado' : 'Marcar como avariado'}
              </button>

              {isAvariado && (
                <div className="mt-3 flex flex-col gap-2.5">
                  <textarea value={s.occurrence_description} onChange={e => update(it.id, { occurrence_description: e.target.value })}
                    placeholder="O que aconteceu? (opcional, mas ajuda o César a abrir o chamado)"
                    rows={2} className="input text-sm bg-white" />

                  <div className="flex flex-wrap gap-2">
                    {s.occurrence_photos.map((f, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-rose-300">
                        <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => removePhoto(it.id, i)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center text-white">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-rose-300 flex flex-col items-center justify-center gap-0.5 text-rose-400 cursor-pointer">
                      <Camera size={18} />
                      <span className="text-[9px] font-semibold">Foto</span>
                      <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                        onChange={e => e.target.files?.length && addPhotos(it.id, e.target.files)} />
                    </label>
                  </div>
                  {!s.occurrence_photos.length && <p className="text-[11px] text-rose-500">Precisa de pelo menos 1 foto pra finalizar.</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-white border-t border-slate-100 p-4 sticky bottom-0">
        <div className="max-w-2xl mx-auto">
          <button onClick={handleFinish} disabled={saving}
            className="w-full h-14 rounded-2xl font-bold text-base text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
            {saving ? 'Salvando...' : 'Finalizar Conferência'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function MaterialConferencePage() {
  const { orders, loading, finishConference } = useMaterialConference()
  const [openOrder, setOpenOrder] = useState(null)

  if (openOrder) {
    return <ConferenceChecklist order={openOrder} onBack={() => setOpenOrder(null)}
      onFinish={async (order, results) => { await finishConference(order, results); setOpenOrder(null) }} />
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500 flex items-center justify-center shrink-0">
            <ClipboardCheck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">Conferência de Matéria-Prima</h1>
            <p className="text-sm text-slate-400">Pedidos aguardando conferência</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-300" /></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <ClipboardCheck size={32} strokeWidth={1} className="mx-auto mb-3 text-slate-200" />
            <p className="text-slate-400">Nenhum pedido aguardando conferência</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map(order => (
              <button key={order.id} onClick={() => setOpenOrder(order)}
                className="w-full text-left bg-white border-2 border-slate-200 rounded-2xl p-4 hover:border-emerald-300 transition-colors">
                <p className="text-lg font-bold text-slate-800">{order.supplier?.name || 'Sem fornecedor definido'}</p>
                <p className="text-sm text-slate-400 mt-1">{order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''} — pedido em {new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
