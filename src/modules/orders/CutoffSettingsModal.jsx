import { useState, useEffect } from 'react'
import { X, Settings, ShoppingCart, ShoppingBag } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// Horário de corte por plataforma — pedido feito ANTES desse horário
// (Brasília) conta pro picklist de hoje; nesse horário ou depois, pro
// próximo dia útil (sábado/domingo rolam pra segunda). Editável aqui pra
// não precisar de deploy se a plataforma mudar a política.
// - ML (default 11h): só vale quando o ML não manda o prazo real do envio
//   (buffering.date) — se manda, o prazo dele manda.
// - Shopee (default 13h, desde 30/09 — Fase 83): vale sempre, mas nunca
//   passa do prazo da própria Shopee, e se a Shopee der um prazo bem mais
//   longo que o normal (envio programado/encomenda), vale o prazo dela.
// Regra toda no banco: compute_ship_date().
const PLATFORMS = [
  { source: 'ml',     label: 'Mercado Livre', icon: ShoppingCart, def: 11, tone: 'bg-amber-50 border-amber-200 text-amber-800',
    help: 'Só vale quando o ML não informa o dia real de envio do pedido — quando informa (envio programado, volumoso), o dia do ML manda.' },
  { source: 'shopee', label: 'Shopee',        icon: ShoppingBag,  def: 13, tone: 'bg-orange-50 border-orange-200 text-orange-800',
    help: 'Nunca passa do prazo da Shopee. Se a Shopee der um prazo bem mais longo que o normal (envio programado / encomenda), vale o prazo dela.' },
]

export function CutoffSettingsModal({ open, onClose }) {
  const [hours, setHours] = useState({ ml: 11, shopee: 13 })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    supabase.from('platform_cutoff_settings').select('source, cutoff_hour')
      .then(({ data }) => {
        const next = { ml: 11, shopee: 13 }
        ;(data || []).forEach(r => { next[r.source] = r.cutoff_hour })
        setHours(next)
      })
      .finally(() => setLoading(false))
  }, [open])

  async function handleSave() {
    const { id: uid } = getSession()
    setSaving(true)
    try {
      const { error } = await supabase.from('platform_cutoff_settings').upsert(
        PLATFORMS.map(p => ({ source: p.source, cutoff_hour: hours[p.source], updated_at: new Date().toISOString(), updated_by: uid || null })),
        { onConflict: 'source' },
      )
      if (error) throw error
      toast.success('Horários de corte atualizados.')
      onClose()
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Settings size={18} /> Horário de corte
          </p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Pedido feito até o horário conta pro picklist de hoje (Brasília); a partir dele, pro próximo dia útil.
        </p>

        {loading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" /></div>
        ) : (
          <>
            <div className="flex flex-col gap-3 mb-4">
              {PLATFORMS.map(p => (
                <div key={p.source} className={`rounded-xl border px-4 py-3 ${p.tone}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black flex items-center gap-1.5"><p.icon size={15} /> {p.label}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">pedidos até</span>
                      <select className="select w-24 py-1.5 bg-white" value={hours[p.source]} onChange={e => setHours(h => ({ ...h, [p.source]: Number(e.target.value) }))}>
                        {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] mt-1.5 opacity-80">{p.help} Padrão: {String(p.def).padStart(2, '0')}h.</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2 mb-4">
              Vale pra pedido novo daqui pra frente. Pra reorganizar os pedidos em aberto na hora, use o botão <b>Atualizar pedidos</b> da Expedição (nunca mexe em pedido que já tem item separado).
            </p>
            <button onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
