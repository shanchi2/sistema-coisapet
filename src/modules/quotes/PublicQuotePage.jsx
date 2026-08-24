import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Package } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function PublicQuotePage() {
  const { token } = useParams()
  const [quote,     setQuote]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)
  const [drafts,    setDrafts]    = useState({}) // { [itemId]: {unit_price, min_qty, lead_time_days} }
  const [submitting,setSubmitting]= useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('quote_requests')
      .select('*, supplier:suppliers(name), items:quote_request_items(*)')
      .eq('public_token', token)
      .maybeSingle()

    if (error || !data) { setNotFound(true); setLoading(false); return }

    data.items = (data.items || []).sort((a, b) => a.sort_order - b.sort_order)
    setQuote(data)
    const d = {}
    data.items.forEach(it => {
      d[it.id] = {
        unit_price: it.unit_price ?? '',
        min_qty: it.min_qty ?? '',
        lead_time_days: it.lead_time_days ?? '',
      }
    })
    setDrafts(d)
    setSubmitted(data.status === 'respondido' || data.status === 'aprovado')
    setLoading(false)
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await Promise.all(quote.items.map(it => {
        const d = drafts[it.id]
        return supabase.from('quote_request_items').update({
          unit_price: d.unit_price === '' ? null : parseFloat(d.unit_price),
          min_qty: d.min_qty === '' ? null : parseFloat(d.min_qty),
          lead_time_days: d.lead_time_days === '' ? null : parseInt(d.lead_time_days),
        }).eq('id', it.id)
      }))
      await supabase.from('quote_requests').update({
        status: 'respondido', responded_at: new Date().toISOString(),
      }).eq('id', quote.id)
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdf8f3]">
        <div className="w-8 h-8 border-4 border-[#C4956A]/30 border-t-[#3D1F0D] rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdf8f3] p-6">
        <div className="text-center">
          <p className="text-2xl mb-2">🔍</p>
          <h1 className="text-lg font-bold text-[#3D1F0D]">Cotação não encontrada</h1>
          <p className="text-sm text-[#8B7355] mt-1">Esse link pode ter expirado ou estar incorreto.</p>
        </div>
      </div>
    )
  }

  const isFinalStatus = quote.status === 'aprovado' || quote.status === 'recusado' || quote.status === 'cancelado'

  return (
    <div className="min-h-screen bg-[#fdf8f3] py-8 px-4" style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="bg-[#3D1F0D] rounded-t-2xl px-6 py-6 text-center">
          <p className="text-[#C4956A] text-xl font-black">CoisaPet</p>
          <p className="text-white/70 text-sm mt-1">Pedido de Cotação {quote.code}</p>
        </div>

        <div className="bg-white rounded-b-2xl shadow-sm px-6 py-6 flex flex-col gap-6">

          {submitted ? (
            <div className="flex flex-col items-center text-center py-10 gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-emerald-500" />
              </div>
              <h2 className="text-lg font-bold text-[#3D1F0D]">Cotação recebida, obrigado!</h2>
              <p className="text-sm text-[#8B7355] max-w-sm">
                Recebemos os valores enviados por <strong>{quote.supplier?.name}</strong>. Nossa equipe vai analisar e retornar em breve.
              </p>
              {!isFinalStatus && (
                <button onClick={() => setSubmitted(false)} className="text-xs text-[#C4956A] font-semibold underline mt-2">
                  Preciso corrigir algum valor
                </button>
              )}
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-bold text-[#8B7355] uppercase tracking-wide">Para</p>
                <p className="text-base font-bold text-[#3D1F0D]">{quote.supplier?.name}</p>
              </div>

              <p className="text-sm text-[#5C4A3A] leading-relaxed">
                Olá! Gostaríamos de solicitar uma cotação para os itens abaixo. Preencha o preço unitário,
                a quantidade mínima de pedido e o prazo de entrega de cada item, e envie quando terminar.
              </p>

              <div className="flex flex-col gap-4">
                {quote.items.map(it => (
                  <div key={it.id} className="border border-[#f0e8df] rounded-2xl p-4">
                    <div className="flex items-start gap-2 mb-3">
                      <Package size={16} className="text-[#C4956A] mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-[#3D1F0D]">{it.material_name_snap}</p>
                        {it.material_notes_snap && <p className="text-xs text-[#8B7355] mt-0.5">{it.material_notes_snap}</p>}
                        {it.requested_qty != null && (
                          <p className="text-xs text-[#C4956A] font-semibold mt-1">
                            Quantidade desejada: {it.requested_qty} {it.unit_snap || ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-[#8B7355] uppercase">Preço unit. (R$)</label>
                        <input type="number" step="0.01" min="0"
                          className="w-full text-sm border border-[#e8ddd0] rounded-lg px-2.5 py-2 mt-1 focus:outline-none focus:border-[#C4956A]"
                          value={drafts[it.id]?.unit_price ?? ''}
                          onChange={e => setDrafts(d => ({ ...d, [it.id]: { ...d[it.id], unit_price: e.target.value } }))}
                          placeholder="0,00" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-[#8B7355] uppercase">Qtd. mínima</label>
                        <input type="number" min="0"
                          className="w-full text-sm border border-[#e8ddd0] rounded-lg px-2.5 py-2 mt-1 focus:outline-none focus:border-[#C4956A]"
                          value={drafts[it.id]?.min_qty ?? ''}
                          onChange={e => setDrafts(d => ({ ...d, [it.id]: { ...d[it.id], min_qty: e.target.value } }))}
                          placeholder="—" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-[#8B7355] uppercase">Prazo (dias)</label>
                        <input type="number" min="0"
                          className="w-full text-sm border border-[#e8ddd0] rounded-lg px-2.5 py-2 mt-1 focus:outline-none focus:border-[#C4956A]"
                          value={drafts[it.id]?.lead_time_days ?? ''}
                          onChange={e => setDrafts(d => ({ ...d, [it.id]: { ...d[it.id], lead_time_days: e.target.value } }))}
                          placeholder="—" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-3 rounded-xl font-bold text-white bg-[#3D1F0D] hover:bg-[#2A1509] transition-colors disabled:opacity-50">
                {submitting ? 'Enviando...' : 'Enviar cotação'}
              </button>
            </>
          )}
        </div>

        <p className="text-center text-[11px] text-[#C4956A]/70 mt-4">
          CoisaPet® · Solicitado em {fmtDate(quote.created_at)}
        </p>
      </div>
    </div>
  )
}
