import { useState, useEffect } from 'react'
import { X, Check, Minus, Plus, Package } from 'lucide-react'
import { useSignedUrl } from '../../lib/signedUrlCache'
import toast from 'react-hot-toast'
import {
  fetchCombinedOrders, fetchCombinedGathering,
  saveCombinedGatheringItem, sendCombinedShortageReport,
} from './hooks/useCombinedGathering'

function ThumbPhoto({ photoUrl, size = 52 }) {
  const url = useSignedUrl('product-photos', photoUrl)
  if (!url) return (
    <div className="rounded-xl bg-slate-100 flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <Package size={size * 0.4} className="text-slate-300" />
    </div>
  )
  return <img src={url} alt="" className="rounded-xl object-cover shrink-0 border border-slate-100" style={{ width: size, height: size }} />
}

export function FeiraCombinadaModal({ open, onClose, batchIds, targetDate, dayLabel }) {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [found, setFound] = useState({})
  const [sendingReport, setSendingReport] = useState(false)
  const [reportSent, setReportSent] = useState(false)

  useEffect(() => {
    if (!open) return
    setReportSent(false)
    setLoading(true)
    Promise.all([
      fetchCombinedOrders(batchIds, targetDate),
      fetchCombinedGathering(targetDate),
    ]).then(([os, gt]) => {
      setOrders(os)
      setFound(gt)
    }).catch(err => {
      toast.error('Erro ao carregar a feira combinada: ' + err.message)
    }).finally(() => setLoading(false))
  }, [open, targetDate, batchIds.join(',')])

  if (!open) return null

  // Soma o mesmo produto (sku+variação) entre TODOS os pedidos, de qualquer plataforma
  const aggregatedItems = (() => {
    const map = {}
    orders.forEach(o => {
      o.items.forEach(it => {
        const key = `${it.sku || it.titulo}::${it.variacao || ''}`
        if (!map[key]) map[key] = { key, titulo: it.titulo, sku: it.sku, variacao: it.variacao, photo_url: it.photo_url, qty: 0 }
        map[key].qty += it.qty
      })
    })
    return Object.values(map).sort((a, b) => a.titulo.localeCompare(b.titulo))
  })()

  function adjustFound(key, delta, max) {
    setFound(prev => {
      const current = prev[key] ?? 0
      const next = Math.max(0, Math.min(max, current + delta))
      saveCombinedGatheringItem(targetDate, key, next).catch(() => {})
      return { ...prev, [key]: next }
    })
  }

  const missingUnits = aggregatedItems.reduce((sum, it) => sum + Math.max(0, it.qty - (found[it.key] ?? 0)), 0)
  const completeCount = aggregatedItems.filter(it => (found[it.key] ?? 0) >= it.qty).length

  async function handleSendShortageReport() {
    const missing = aggregatedItems
      .map(it => ({ ...it, missing: it.qty - (found[it.key] ?? 0) }))
      .filter(it => it.missing > 0)
    if (missing.length === 0) return
    setSendingReport(true)
    try {
      await sendCombinedShortageReport(targetDate, missing)
      setReportSent(true)
      toast.success('Relatório enviado pra Produção!')
    } catch (err) {
      toast.error('Erro ao enviar relatório: ' + err.message)
    } finally {
      setSendingReport(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-xl font-black text-slate-800">🛒 Feira Combinada</p>
            <p className="text-sm text-slate-400 font-semibold capitalize">
              {dayLabel} · ML + Shopee juntos · {completeCount}/{aggregatedItems.length} completos
              {missingUnits > 0 && <span className="text-rose-500"> · faltam {missingUnits} unidade{missingUnits !== 1 ? 's' : ''}</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex justify-center py-16"><div className="w-7 h-7 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" /></div>
          ) : aggregatedItems.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-16">Nenhum item pra separar nesse dia.</p>
          ) : aggregatedItems.map(it => {
            const foundQty = found[it.key] ?? 0
            const isComplete = foundQty >= it.qty
            const isPartial = foundQty > 0 && !isComplete
            return (
              <div key={it.key}
                className={`flex items-center gap-4 rounded-2xl border-2 p-4 ${
                  isComplete ? 'bg-emerald-50 border-emerald-300' : isPartial ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'
                }`}>
                <ThumbPhoto photoUrl={it.photo_url} size={72} />
                <div className="flex-1 min-w-0">
                  <p className={`text-base font-bold leading-snug ${isComplete ? 'text-emerald-700' : 'text-slate-800'}`}>{it.titulo}</p>
                  {it.variacao && (
                    <span className="inline-block text-xs font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-lg mt-1">{it.variacao}</span>
                  )}
                  {it.sku && <p className="text-[11px] font-mono text-slate-400 mt-1">{it.sku}</p>}
                  {isPartial && <p className="text-xs font-bold text-amber-600 mt-1">⚠ Parcial — faltam {it.qty - foundQty} pra produção</p>}
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => adjustFound(it.key, -1, it.qty)}
                      className="w-8 h-8 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-slate-500"><Minus size={14} strokeWidth={3} /></button>
                    <span className={`w-14 text-center text-lg font-black ${isComplete ? 'text-emerald-600' : isPartial ? 'text-amber-600' : 'text-slate-400'}`}>
                      {foundQty}/{it.qty}
                    </span>
                    <button onClick={() => adjustFound(it.key, 1, it.qty)}
                      className="w-8 h-8 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-slate-500"><Plus size={14} strokeWidth={3} /></button>
                  </div>
                  {isComplete && <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><Check size={11} strokeWidth={3} /> Completo</span>}
                </div>
              </div>
            )
          })}
        </div>

        {!loading && aggregatedItems.length > 0 && (
          <div className="p-4 border-t border-slate-100 shrink-0">
            {reportSent ? (
              <div className="w-full h-12 rounded-2xl bg-emerald-100 text-emerald-700 font-bold text-sm flex items-center justify-center gap-2">
                <Check size={16} strokeWidth={3} /> Relatório enviado pra Produção!
              </div>
            ) : (
              <button onClick={handleSendShortageReport} disabled={sendingReport || missingUnits === 0}
                className="w-full h-12 rounded-2xl font-bold text-sm text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:bg-slate-300 transition-colors">
                {sendingReport ? 'Enviando...' : missingUnits === 0 ? 'Nada faltando — tudo encontrado! 🎉' : `Enviar relatório do que faltou pra Produção (${missingUnits} un.)`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
