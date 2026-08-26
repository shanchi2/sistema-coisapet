import { useState, useEffect } from 'react'
import { X, Settings } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// Horário de corte do Mercado Livre — pedido feito ANTES desse horário
// (Brasília) conta pro picklist de hoje; feito nesse horário ou depois
// conta pro de amanhã. Editável aqui pra não precisar de deploy se o ML
// mudar a própria política. Shopee usa a "Data prevista de envio" que a
// própria Shopee manda no arquivo — não tem corte por horário, por isso
// não aparece um campo pra ela aqui.
export function CutoffSettingsModal({ open, onClose }) {
  const [cutoffHour, setCutoffHour] = useState(11)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    supabase.from('platform_cutoff_settings').select('cutoff_hour').eq('source', 'ml').maybeSingle()
      .then(({ data }) => setCutoffHour(data?.cutoff_hour ?? 11))
      .finally(() => setLoading(false))
  }, [open])

  async function handleSave() {
    const { id: uid } = getSession()
    setSaving(true)
    try {
      const { error } = await supabase.from('platform_cutoff_settings').upsert({
        source: 'ml', cutoff_hour: cutoffHour, updated_at: new Date().toISOString(), updated_by: uid || null,
      }, { onConflict: 'source' })
      if (error) throw error
      toast.success('Corte de dia do Mercado Livre atualizado.')
      onClose()
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Settings size={18} /> Corte de dia
          </p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" /></div>
        ) : (
          <>
            <label className="form-label">Mercado Livre — pedidos feitos até</label>
            <div className="flex items-center gap-2 mb-2">
              <select className="select w-24" value={cutoffHour} onChange={e => setCutoffHour(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
              <span className="text-sm text-slate-500">contam pro picklist de hoje (Brasília)</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Pedido feito a partir desse horário conta pro picklist de amanhã. Só afeta pedido novo daí pra frente — não recalcula pedido já importado.
            </p>
            <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2 mb-4">
              Shopee usa a própria "Data prevista de envio" que vem no arquivo — não tem corte por horário, por isso não tem campo aqui.
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
