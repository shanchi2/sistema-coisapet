import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Package, PartyPopper, Check, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/signedUrlCache'
import {
  fetchVirtualPicklistOrders, fetchPackagingBoxes, fetchOrderPackaging, confirmOrderPackaging,
} from './hooks/usePicklistVirtual'

// ─── Thumbnail com signed URL ────────────────────────────────────
function ThumbPhoto({ photoUrl, size = 56 }) {
  const url = useSignedUrl('product-photos', photoUrl)
  if (!url) return (
    <div className="rounded-xl bg-slate-100 flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <Package size={size * 0.4} className="text-slate-300" />
    </div>
  )
  return <img src={url} alt="" className="rounded-xl object-cover shrink-0 border border-slate-100" style={{ width: size, height: size }} />
}

export function PicklistVirtualPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const batchId = searchParams.get('batch')

  const [orders,   setOrders]   = useState([])
  const [boxes,    setBoxes]    = useState([])
  const [index,    setIndex]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [selections, setSelections] = useState([]) // [{box_id, qty}] — rascunho do slide atual
  const [existing,   setExisting]   = useState([]) // já confirmado nesse pedido (se revisitar)
  const [saving,   setSaving]   = useState(false)
  const [finished, setFinished] = useState(false)

  useEffect(() => { load() }, [batchId])

  async function load() {
    if (!batchId) return
    setLoading(true)
    try {
      const [os, bx] = await Promise.all([fetchVirtualPicklistOrders(batchId), fetchPackagingBoxes()])
      setOrders(os)
      setBoxes(bx)
    } finally {
      setLoading(false)
    }
  }

  const current = orders[index]

  useEffect(() => {
    if (!current) return
    fetchOrderPackaging(current.id).then(setExisting)
    setSelections([])
  }, [current?.id])

  function toggleBox(boxId) {
    setSelections(prev => prev.some(s => s.box_id === boxId)
      ? prev.filter(s => s.box_id !== boxId)
      : [...prev, { box_id: boxId, qty: 1 }])
  }
  function setQty(boxId, qty) {
    setSelections(prev => prev.map(s => s.box_id === boxId ? { ...s, qty: Math.max(1, qty) } : s))
  }

  async function handleConfirm() {
    setSaving(true)
    try {
      if (selections.length > 0) await confirmOrderPackaging(current.id, selections)
      advance()
    } finally {
      setSaving(false)
    }
  }
  function handleSkip() { advance() }
  function advance() {
    if (index >= orders.length - 1) setFinished(true)
    else setIndex(i => i + 1)
  }
  function goBack() { if (index > 0) setIndex(i => i - 1) }

  if (!batchId) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Nenhum lote informado na URL (?batch=ID).</div>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
        <div>
          <p className="text-3xl mb-2">📭</p>
          <p className="font-bold text-slate-700">Nenhum pedido pra separar nesse lote.</p>
        </div>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50 p-6">
        <div className="text-center flex flex-col items-center gap-3">
          <PartyPopper size={48} className="text-emerald-500" />
          <h1 className="text-2xl font-black text-emerald-700" style={{ fontFamily: 'Nunito,sans-serif' }}>Picklist concluído!</h1>
          <p className="text-sm text-emerald-600">{orders.length} pedido(s) processado(s).</p>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setIndex(0); setFinished(false) }} className="btn-secondary">Revisar pedidos</button>
            <button onClick={() => navigate('/pedidos')} className="btn-primary">Voltar pra Pedidos</button>
          </div>
        </div>
      </div>
    )
  }

  const progress = Math.round(((index) / orders.length) * 100)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header fixo */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => navigate('/pedidos')} className="p-2 -ml-2 rounded-xl text-slate-400 hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <p className="text-sm font-bold text-slate-600">Pedido {index + 1} de {orders.length}</p>
          <div className="w-9" />
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-rose-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Slide do pedido */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 max-w-lg mx-auto w-full">

        <div className="card">
          {current.num_venda && (
            <p className="text-2xl font-black text-slate-900 font-mono tracking-tight leading-tight">#{current.num_venda}</p>
          )}
          <p className="text-sm font-semibold text-slate-500 mt-0.5">{current.comprador || 'Não identificado'}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {current.cidade && <span className="text-xs text-slate-400">{current.cidade}{current.estado_uf ? `, ${current.estado_uf}` : ''}</span>}
          </div>
          {current.notes && <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5 mt-2">⚠ {current.notes}</p>}
        </div>

        <div className="card">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Itens ({current.items.length})</p>
          <div className="flex flex-col gap-3">
            {current.items.map(it => (
              <div key={it.id} className="flex items-center gap-3">
                <ThumbPhoto photoUrl={it.photo_url} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-700">{it.titulo}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {it.sku && <span className="text-[10px] font-mono text-slate-400">{it.sku}</span>}
                    {it.variacao && <span className="text-[10px] text-slate-400">{it.variacao.replace(/^[^:]+:\s*/, '')}</span>}
                  </div>
                  {it.obs_item && <p className="text-[11px] text-amber-600 mt-1">⚠ {it.obs_item}</p>}
                </div>
                <span className={`text-lg font-black shrink-0 ${it.qty >= 2 ? 'bg-amber-400 text-white px-2 py-0.5 rounded-lg' : 'text-rose-400'}`}>×{it.qty}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Embalagem usada */}
        <div className="card">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Embalagem usada</p>
          {existing.length > 0 && (
            <p className="text-[11px] text-emerald-600 mb-2">✓ Já registrado: {existing.map(e => `${e.box?.code || e.box?.box_number} (${e.qty})`).join(', ')}</p>
          )}
          {boxes.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">Nenhum modelo de caixa cadastrado ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {boxes.map(b => {
                const sel = selections.find(s => s.box_id === b.id)
                const isSel = !!sel
                return (
                  <div key={b.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${isSel ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                    <button onClick={() => toggleBox(b.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border-2 ${isSel ? 'bg-rose-400 border-rose-400' : 'border-slate-300'}`}>
                        {isSel && <Check size={13} className="text-white" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{b.code || b.box_number}</p>
                        <p className="text-[10px] text-slate-400">{b.dimension} · estoque: {b.stock_qty}</p>
                      </div>
                    </button>
                    {isSel && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setQty(b.id, sel.qty - 1)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-bold text-slate-500">−</button>
                        <span className="w-6 text-center text-sm font-bold">{sel.qty}</span>
                        <button onClick={() => setQty(b.id, sel.qty + 1)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-bold text-slate-500">+</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Barra de ações fixa embaixo */}
      <div className="bg-white border-t border-slate-100 p-4 sticky bottom-0">
        <div className="max-w-lg mx-auto flex gap-2">
          <button onClick={goBack} disabled={index === 0}
            className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center disabled:opacity-30 shrink-0">
            <ChevronLeft size={22} />
          </button>
          <button onClick={handleSkip}
            className="flex-1 h-14 rounded-2xl bg-slate-100 text-slate-500 font-semibold text-sm">
            Pular
          </button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-[2] h-14 rounded-2xl bg-rose-400 hover:bg-rose-500 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
            {saving ? 'Salvando...' : <>Confirmar <ChevronRight size={20} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}
