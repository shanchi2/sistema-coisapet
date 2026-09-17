import { useEffect, useState } from 'react'
import { Plus, Minus, History, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const TYPE_LABEL = {
  chapa_production:  'Produção de chapa',
  manual_adjustment: 'Ajuste manual',
}

function MovementRow({ m }) {
  const positive = m.quantity_delta > 0
  return (
    <div className="flex items-center gap-3 border border-slate-100 rounded-xl px-3.5 py-2.5 bg-white">
      {positive ? <ArrowUpCircle size={18} className="text-emerald-500 shrink-0"/> : <ArrowDownCircle size={18} className="text-rose-500 shrink-0"/>}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700">{TYPE_LABEL[m.movement_type] || m.movement_type}{m.reason ? ` — ${m.reason}` : ''}</p>
        <p className="text-xs text-slate-400">{fmtDateTime(m.created_at)}{m.created_by_user?.name ? ` · ${m.created_by_user.name}` : ''}</p>
      </div>
      <span className={`text-sm font-bold shrink-0 ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
        {positive ? '+' : ''}{m.quantity_delta}
      </span>
    </div>
  )
}

// Ajuste manual de estoque + histórico de movimentações (fase63) — abre
// pelo badge de estoque de cada produto na aba Produtos.
export function StockMovementsModal({ open, onClose, product, fetchStockMovements, adjustStock }) {
  const [movements, setMovements] = useState(null)
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    if (!product) return
    fetchStockMovements(product.id).then(setMovements).catch(() => setMovements([]))
  }
  useEffect(() => { if (open) load() }, [open, product?.id]) // eslint-disable-line

  async function handleAdjust(sign) {
    const n = Number(delta)
    if (!n || n <= 0) return
    setSaving(true)
    try {
      await adjustStock(product.id, sign * n, reason.trim() || null)
      setDelta(''); setReason('')
      load()
    } catch { /* toast já cobre */ }
    finally { setSaving(false) }
  }

  if (!product) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Estoque do produto"
      subtitle={`${product.name}${product.sku ? ` · ${product.sku}` : ''}`}
      size="md"
      footer={<button onClick={onClose} className="btn-secondary">Fechar</button>}
    >
      <div className="flex flex-col gap-5">
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-0.5">Estoque atual</p>
            <p className="text-2xl font-black text-slate-800" style={{ fontFamily: 'Nunito, sans-serif' }}>{product.stock_qty ?? 0} un.</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Ajustar manualmente</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="number" min="1" className="input w-24" placeholder="Qtd." value={delta} onChange={e => setDelta(e.target.value)}/>
            <input className="input flex-1 min-w-[160px]" placeholder="Motivo (opcional) — ex: quebra, contagem..." value={reason} onChange={e => setReason(e.target.value)}/>
            <button onClick={() => handleAdjust(1)} disabled={!delta || saving} className="btn-primary py-2 text-xs">
              <Plus size={13}/> Somar
            </button>
            <button onClick={() => handleAdjust(-1)} disabled={!delta || saving} className="btn-secondary py-2 text-xs">
              <Minus size={13}/> Subtrair
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <History size={13}/> Últimas movimentações
          </p>
          {movements === null ? (
            <div className="flex justify-center py-6"><div className="w-6 h-6 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin"/></div>
          ) : movements.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nenhuma movimentação ainda.</p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
              {movements.map(m => <MovementRow key={m.id} m={m}/>)}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
