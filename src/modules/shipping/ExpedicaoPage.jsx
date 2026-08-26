import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Package, PartyPopper, RefreshCw, ShoppingCart, ShoppingBag, PenLine, Minus, Plus, ClipboardList, ChevronLeft, ChevronRight, Calendar, Target, AlertTriangle, History, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/signedUrlCache'
import { fetchShippingOrders, toggleItemPicked, fetchShippingDayCounts, fetchSaturdayTarget, activateSaturdayTarget, clearNeedsAttention, closeShippingDay, fetchShippingClosures, fetchOverdueOrders, resolveBatchId } from './hooks/useShipping'
import { fetchGathering, saveGatheringItem, sendShortageReport } from './hooks/usePicklistGathering'
import { fetchPackagingBoxes, fetchOrderPackaging, confirmOrderPackaging } from './hooks/usePackaging'
import toast from 'react-hot-toast'

// ─── Thumbnail com signed URL ────────────────────────────────────
function ThumbPhoto({ photoUrl, size = 52 }) {
  const url = useSignedUrl('product-photos', photoUrl)
  if (!url) return (
    <div className="rounded-xl bg-slate-100 flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <Package size={size * 0.4} className="text-slate-300" />
    </div>
  )
  return <img src={url} alt="" className="rounded-xl object-cover shrink-0 border border-slate-100" style={{ width: size, height: size }} />
}

// Placa de Identificação sem nenhuma observação no pedido = ninguém informou
// o nome pra gravar — a Carol precisa avisar o Atendimento pra cobrar o cliente
function needsPlaquinhaAlert(item, orderNotes) {
  const isPlaquinha = item.titulo?.toLowerCase().includes('placa de identificação nome')
  const hasNotes = orderNotes && orderNotes.trim().length > 0
  return isPlaquinha && !hasNotes
}
function orderHasPlaquinhaAlert(order) {
  return (order.items || []).some(it => needsPlaquinhaAlert(it, order.notes))
}

function isOrderComplete(order) {
  return order.items.length > 0 && order.items.every(it => it.picked)
}
function pickedCount(order) {
  return order.items.filter(it => it.picked).length
}
function platformBadge(source) {
  if (source === 'ml') return {
    label: 'Mercado Livre',
    icon: ShoppingCart,
    badge: 'bg-amber-100 text-blue-700 border border-blue-200',
    accent: 'border-l-amber-400',
    headerBg: 'bg-amber-50',
  }
  if (source === 'shopee') return {
    label: 'Shopee',
    icon: ShoppingBag,
    badge: 'bg-orange-100 text-orange-800 border border-orange-200',
    accent: 'border-l-orange-500',
    headerBg: 'bg-orange-50',
  }
  return {
    label: 'Manual',
    icon: PenLine,
    badge: 'bg-slate-200 text-slate-700 border border-slate-300',
    accent: 'border-l-slate-400',
    headerBg: 'bg-slate-50',
  }
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDayLong(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}
function addDays(dateStr, delta) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ExpedicaoPage() {
  const [searchParams] = useSearchParams()
  const batchId = searchParams.get('batch')

  const [source,   setSource]   = useState(null) // plataforma do lote da URL — resolvida uma vez
  const [orders,   setOrders]   = useState([])
  const [boxes,    setBoxes]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [openId,   setOpenId]   = useState(null) // id do pedido aberto (detalhe) ou null (visão geral)
  const [showChecklist, setShowChecklist] = useState(false)
  const [found, setFound] = useState({}) // { [chave]: quantidade encontrada } — só nessa sessão
  const [sendingReport, setSendingReport] = useState(false)
  const [reportSent, setReportSent] = useState(false)
  const [existing, setExisting] = useState([])
  const [selections, setSelections] = useState([])
  const [saving,   setSaving]   = useState(false)
  const [viewDate, setViewDate] = useState(todayISO()) // qual dia está sendo visualizado
  const [dayCounts, setDayCounts] = useState({}) // { 'AAAA-MM-DD': quantidade } — só pra avisar visualmente
  const [satTarget, setSatTarget] = useState(null) // meta de sábado ativada pra essa segunda-feira (ou null)
  const [activatingTarget, setActivatingTarget] = useState(false)
  const [closingDay, setClosingDay] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [closures, setClosures] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [overdue, setOverdue] = useState([]) // "Atrasados" — independente de qual dia está aberto
  const [showOverdue, setShowOverdue] = useState(false)
  // Lote "canônico" pra esse source+dia — só usado pelas ações que ainda
  // dependem de batch_id (Fechar o Dia, Meta de Sábado, Fazer a Feira),
  // enquanto a consolidação de import_batches (Fase 3) não torna batch_id
  // exato por (source, ship_date). Cai pro batchId da URL se não achar nada.
  const [resolvedBatchId, setResolvedBatchId] = useState(null)
  const activeBatchId = resolvedBatchId || batchId

  const isMonday = new Date(viewDate + 'T12:00:00').getDay() === 1

  // Resolve a plataforma do lote da URL uma única vez — a partir daqui a
  // busca de pedidos é sempre por (source, ship_date), não mais por batch_id.
  useEffect(() => {
    if (!batchId) return
    supabase.from('import_batches').select('source').eq('id', batchId).single()
      .then(({ data }) => setSource(data?.source ?? null))
      .catch(() => setSource(null))
  }, [batchId])

  useEffect(() => { if (source) load() }, [source, viewDate])

  useEffect(() => {
    if (!source) return
    fetchShippingDayCounts(source).then(setDayCounts).catch(() => {})
  }, [source])

  useEffect(() => {
    fetchOverdueOrders().then(setOverdue).catch(() => {})
  }, [])

  useEffect(() => {
    if (!source) return
    resolveBatchId(source, viewDate).then(setResolvedBatchId).catch(() => setResolvedBatchId(null))
  }, [source, viewDate])

  useEffect(() => {
    if (!activeBatchId || !isMonday) { setSatTarget(null); return }
    fetchSaturdayTarget(activeBatchId, viewDate).then(setSatTarget).catch(() => {})
  }, [activeBatchId, viewDate, isMonday])

  async function handleActivateSaturdayTarget() {
    setActivatingTarget(true)
    try {
      const target = await activateSaturdayTarget(activeBatchId, viewDate, orders.length)
      setSatTarget(target)
      toast.success(`Meta de sábado ativada: pelo menos ${target.target_count} pedido(s)!`)
    } catch (err) {
      toast.error('Erro ao ativar meta: ' + err.message)
    } finally {
      setActivatingTarget(false)
    }
  }

  // Quantos pedidos dessa segunda foram fechados DEPOIS de ativar a meta —
  // é o contador dedicado do sábado, não mistura com nada de antes
  const satProgress = satTarget
    ? orders.filter(o => {
        if (!isOrderComplete(o)) return false
        const lastPicked = Math.max(...o.items.map(it => it.picked_at ? new Date(it.picked_at).getTime() : 0))
        return lastPicked >= new Date(satTarget.activated_at).getTime()
      }).length
    : 0

  async function load() {
    if (!source) return
    setLoading(true)
    try {
      // Cada busca é isolada — se uma falhar (ex: tabela ainda não criada),
      // as outras continuam funcionando e a tela não quebra inteira.
      const [osResult, bxResult, gtResult] = await Promise.allSettled([
        fetchShippingOrders(source, viewDate),
        fetchPackagingBoxes(),
        activeBatchId ? fetchGathering(activeBatchId, viewDate) : Promise.resolve({}),
      ])

      if (osResult.status === 'fulfilled') setOrders(osResult.value)
      else console.error('[Expedição] Erro ao carregar pedidos:', osResult.reason)

      if (bxResult.status === 'fulfilled') setBoxes(bxResult.value)
      else console.error('[Expedição] Erro ao carregar embalagens:', bxResult.reason)

      if (gtResult.status === 'fulfilled') setFound(gtResult.value)
      else console.error('[Expedição] "Fazer a Feira" indisponível (tabela picklist_gathering existe?):', gtResult.reason)

      if (osResult.status === 'rejected') {
        toast.error('Erro ao carregar os pedidos. Veja o console pra detalhes.')
      }
    } finally {
      setLoading(false)
    }
  }

  const openOrder = orders.find(o => o.id === openId)

  // Soma a quantidade do mesmo produto (mesmo SKU + variação) entre TODOS os pedidos do lote
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

  useEffect(() => {
    if (!openOrder) return
    fetchOrderPackaging(openOrder.id).then(data => {
      setExisting(data)
      // Pré-marca os checkboxes com o que já foi escolhido antes,
      // em vez de sempre abrir "em branco" — assim fica visível de verdade
      setSelections(data.map(d => ({ box_id: d.box_id, qty: d.qty })))
    })
  }, [openId])

  // Marca como revisado — some o aviso até (se ainda estiver cancelado E
  // com item separado) um novo sync do ML trazer o aviso de volta.
  async function handleClearAttention(orderId) {
    try {
      await clearNeedsAttention(orderId)
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, needs_attention: false } : o))
      toast.success('Marcado como revisado.')
    } catch (err) {
      toast.error('Erro ao marcar como revisado: ' + err.message)
    }
  }

  // Fechamento do dia — histórico permanente (nunca sobrescreve, sempre
  // cria uma nova versão) de quantos pedidos fecharam/ficaram incompletos
  // e exatamente quais itens faltaram em cada um.
  async function handleCloseDay() {
    if (!activeBatchId) { toast.error('Nenhum lote encontrado pra esse dia ainda.'); return }
    setClosingDay(true)
    try {
      await closeShippingDay(activeBatchId, viewDate, orders)
      toast.success(`Dia fechado! ${doneCount}/${orders.length} pedido(s) completos.`)
    } catch (err) {
      toast.error('Erro ao fechar o dia: ' + err.message)
    } finally {
      setClosingDay(false)
    }
  }

  async function openHistory() {
    setShowHistory(true)
    setLoadingHistory(true)
    try {
      setClosures(activeBatchId ? await fetchShippingClosures(activeBatchId) : [])
    } catch (err) {
      toast.error('Erro ao carregar histórico: ' + err.message)
    } finally {
      setLoadingHistory(false)
    }
  }

  async function handleToggleItem(item) {
    const newVal = !item.picked
    // Otimista: atualiza a tela na hora, sem esperar o banco
    setOrders(prev => prev.map(o => o.id !== openId ? o : {
      ...o, items: o.items.map(it => it.id === item.id ? { ...it, picked: newVal } : it),
    }))
    try { await toggleItemPicked(item.id, newVal) }
    catch { load() } // se der erro, recarrega do banco pra corrigir
  }

  function toggleBox(boxId) {
    setSelections(prev => prev.some(s => s.box_id === boxId) ? prev.filter(s => s.box_id !== boxId) : [...prev, { box_id: boxId, qty: 1 }])
  }
  function setQty(boxId, qty) {
    setSelections(prev => prev.map(s => s.box_id === boxId ? { ...s, qty: Math.max(1, qty) } : s))
  }

  async function handleFinish() {
    setSaving(true)
    try {
      if (selections.length > 0) {
        await confirmOrderPackaging(openOrder.id, selections)
        // Atualiza o estoque das caixas localmente — evita recarregar o lote inteiro
        setBoxes(prev => prev.map(b => {
          const sel = selections.find(s => s.box_id === b.id)
          if (!sel) return b
          return { ...b, stock_qty: Math.max(0, (parseFloat(b.stock_qty) || 0) - sel.qty) }
        }))
      }
      setOpenId(null)
    } finally {
      setSaving(false)
    }
  }

  if (!batchId) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 p-6 text-center">Nenhum lote informado na URL (?batch=ID).</div>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-rose-100 border-t-rose-400 rounded-full animate-spin" />
      </div>
    )
  }

  function adjustFound(key, delta, max) {
    if (!activeBatchId) return
    setFound(prev => {
      const current = prev[key] ?? 0
      const next = Math.max(0, Math.min(max, current + delta))
      saveGatheringItem(activeBatchId, key, next, viewDate).catch(() => {}) // salva em segundo plano
      return { ...prev, [key]: next }
    })
  }

  async function handleSendShortageReport() {
    if (!activeBatchId) return
    const missing = aggregatedItems
      .map(it => ({ ...it, missing: it.qty - (found[it.key] ?? 0) }))
      .filter(it => it.missing > 0)
    if (missing.length === 0) return
    setSendingReport(true)
    try {
      await sendShortageReport(activeBatchId, missing, viewDate)
      setReportSent(true)
      toast.success('Relatório enviado pra Produção!')
    } catch (err) {
      toast.error('Erro ao enviar relatório. Veja o console pra detalhes.')
      console.error('[Expedição] Erro ao enviar relatório de falta:', err)
    } finally {
      setSendingReport(false)
    }
  }

  const doneCount = orders.filter(isOrderComplete).length

  // ══════════════════════ HISTÓRICO DE FECHAMENTOS ══════════════════════
  if (showHistory) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="bg-white border-b border-slate-100 px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
          <button onClick={() => setShowHistory(false)} className="p-3 -ml-1 rounded-xl text-slate-500 bg-slate-100 shrink-0">
            <ArrowLeft size={24} />
          </button>
          <p className="text-xl font-black text-slate-800">Histórico de fechamentos</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-w-2xl mx-auto w-full">
          {loadingHistory ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin" /></div>
          ) : closures.length === 0 ? (
            <p className="text-center text-slate-400 py-16">Nenhum fechamento registrado ainda pra esse lote.</p>
          ) : closures.map(c => (
            <div key={c.id} className={`rounded-2xl border-2 p-4 ${c.superseded ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-black text-slate-700">
                  {fmtDayLong(c.target_date)} <span className="text-slate-400 font-bold">· v{c.version}</span>
                  {c.superseded && <span className="ml-2 text-[10px] font-bold text-slate-400 uppercase">substituído</span>}
                </p>
                <p className="text-xs text-slate-400">{new Date(c.closed_at).toLocaleString('pt-BR')}</p>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Fechado por {c.closer?.name || '—'} · {c.closed_orders_count}/{c.total_orders} completo(s)
                {c.incomplete_orders_count > 0 && <span className="text-rose-500 font-bold"> · {c.incomplete_orders_count} incompleto(s)</span>}
              </p>
              {c.orders.filter(o => o.status === 'incomplete').length > 0 && (
                <div className="flex flex-col gap-1.5 mt-2">
                  {c.orders.filter(o => o.status === 'incomplete').map(o => (
                    <div key={o.id} className="text-xs bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">
                      <p className="font-bold text-rose-700">#{o.num_venda || '—'} — {o.comprador || 'Não identificado'}</p>
                      <p className="text-rose-500 mt-0.5">
                        Faltou: {(o.missing_items || []).map(it => `${it.titulo}${it.variacao ? ` (${it.variacao})` : ''} ×${it.missing_qty}`).join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ══════════════════════ ATRASADOS ══════════════════════
  // Independente de qual dia/lote está aberto — pedido cujo ship_date já
  // passou e ainda tem item não separado. É isso que garante que nada
  // fica esquecido pra trás só porque ninguém voltou a olhar um dia antigo.
  if (showOverdue) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="bg-rose-600 px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
          <button onClick={() => setShowOverdue(false)} className="p-3 -ml-1 rounded-xl text-white bg-white/20 shrink-0">
            <ArrowLeft size={24} />
          </button>
          <p className="text-xl font-black text-white">⚠️ Pedidos atrasados</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-w-2xl mx-auto w-full">
          {overdue.length === 0 ? (
            <p className="text-center text-slate-400 py-16">Nenhum pedido atrasado. 🎉</p>
          ) : overdue.map(o => {
            const plat = platformBadge(o.source)
            const sameSource = o.source === source
            return (
              <button key={o.id} disabled={!sameSource}
                onClick={() => { if (sameSource) { setViewDate(o.ship_date); setShowOverdue(false) } }}
                className={`text-left rounded-2xl border-2 border-rose-200 bg-rose-50 p-4 ${sameSource ? 'active:scale-[0.98]' : 'opacity-80 cursor-default'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${plat.badge}`}>
                    <plat.icon size={13} strokeWidth={2.5} /> {plat.label}
                  </span>
                  <span className="text-xs font-bold text-rose-600">devia ter ido em {fmtDayLong(o.ship_date)}</span>
                </div>
                {o.num_venda && <p className="text-lg font-black text-slate-800 font-mono">#{o.num_venda}</p>}
                <p className="text-sm font-semibold text-slate-600">{o.comprador || 'Não identificado'}</p>
                {!sameSource && <p className="text-xs text-slate-400 mt-1">Abra a Expedição de {plat.label} pra ver esse.</p>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ══════════════════════ CHECKLIST DE ITENS (agregado) ══════════════════════
  if (showChecklist) {
    const completeCount = aggregatedItems.filter(it => (found[it.key] ?? 0) >= it.qty).length
    const missingUnits = aggregatedItems.reduce((sum, it) => sum + Math.max(0, it.qty - (found[it.key] ?? 0)), 0)
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="bg-white border-b border-slate-100 px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
          <button onClick={() => setShowChecklist(false)} className="p-3 -ml-1 rounded-xl text-slate-500 bg-slate-100 shrink-0">
            <ArrowLeft size={24} />
          </button>
          <div>
            <p className="text-xl font-black text-slate-800">Lista de Itens</p>
            <p className="text-sm text-slate-400 font-semibold">
              {completeCount}/{aggregatedItems.length} produtos completos
              {missingUnits > 0 && <span className="text-rose-500"> · faltam {missingUnits} unidade{missingUnits !== 1 ? 's' : ''}</span>}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-w-2xl mx-auto w-full">
          {aggregatedItems.map(it => {
            const foundQty = found[it.key] ?? 0
            const isComplete = foundQty >= it.qty
            const isPartial = foundQty > 0 && !isComplete
            return (
              <div key={it.key}
                className={`flex items-center gap-4 rounded-2xl border-2 p-4 ${
                  isComplete ? 'bg-emerald-50 border-emerald-300' : isPartial ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'
                }`}>
                <ThumbPhoto photoUrl={it.photo_url} size={80} />
                <div className="flex-1 min-w-0">
                  <p className={`text-lg font-bold leading-snug ${isComplete ? 'text-emerald-700' : 'text-slate-800'}`}>{it.titulo}</p>
                  {it.variacao && (
                    <span className="inline-block text-sm font-bold text-violet-700 bg-violet-100 px-2.5 py-1 rounded-lg mt-1.5">{it.variacao}</span>
                  )}
                  {it.sku && <p className="text-xs font-mono text-slate-400 mt-1.5">{it.sku}</p>}
                  {isPartial && <p className="text-xs font-bold text-amber-600 mt-1.5">⚠ Parcial — faltam {it.qty - foundQty} pra produção</p>}
                  {foundQty === 0 && <p className="text-xs text-slate-400 mt-1.5">Necessário: {it.qty}</p>}
                </div>
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => adjustFound(it.key, -1, it.qty)}
                      className="w-9 h-9 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-slate-500">
                      <Minus size={16} strokeWidth={3} />
                    </button>
                    <span className={`w-14 text-center text-xl font-black ${isComplete ? 'text-emerald-600' : isPartial ? 'text-amber-600' : 'text-slate-400'}`}>
                      {foundQty}/{it.qty}
                    </span>
                    <button onClick={() => adjustFound(it.key, 1, it.qty)}
                      className="w-9 h-9 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-slate-500">
                      <Plus size={16} strokeWidth={3} />
                    </button>
                  </div>
                  {isComplete && <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><Check size={13} strokeWidth={3} /> Completo</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Rodapé fixo — envia o que faltou pra Produção */}
        <div className="bg-white border-t border-slate-100 p-4 sticky bottom-0">
          <div className="max-w-2xl mx-auto">
            {reportSent ? (
              <div className="w-full h-14 rounded-2xl bg-emerald-100 text-emerald-700 font-bold text-base flex items-center justify-center gap-2">
                <Check size={18} strokeWidth={3} /> Relatório enviado pra Produção!
              </div>
            ) : (
              <button onClick={handleSendShortageReport} disabled={sendingReport || missingUnits === 0}
                className="w-full h-14 rounded-2xl font-bold text-base text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:bg-slate-300 transition-colors">
                {sendingReport ? 'Enviando...' : missingUnits === 0 ? 'Nada faltando — tudo encontrado! 🎉' : `Enviar relatório do que faltou pra Produção (${missingUnits} un.)`}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════ DETALHE DO PEDIDO ══════════════════════
  if (openOrder) {
    const complete = isOrderComplete(openOrder)
    const plat = platformBadge(openOrder.source)
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className={`${plat.headerBg} border-b border-slate-100 border-l-[10px] ${plat.accent} px-4 py-4 sticky top-0 z-10 flex items-center gap-3`}>
          <button onClick={() => setOpenId(null)} className="p-3 -ml-1 rounded-xl text-slate-600 bg-white/70 shrink-0">
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`flex items-center gap-1.5 text-sm font-black px-3 py-1 rounded-full w-fit ${plat.badge}`}>
                <plat.icon size={15} strokeWidth={2.5} /> {plat.label}
              </span>
            </div>
            {openOrder.num_venda && <p className="text-2xl font-black text-slate-900 font-mono tracking-tight leading-tight">#{openOrder.num_venda}</p>}
            <p className="text-sm font-semibold text-slate-500 truncate">{openOrder.comprador || 'Não identificado'}</p>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">{pickedCount(openOrder)}/{openOrder.items.length} itens separados</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 max-w-2xl mx-auto w-full">
          {openOrder.needs_attention && (
            <div className="rounded-xl bg-rose-600 text-white px-4 py-3">
              <p className="text-sm font-black flex items-center gap-1.5"><AlertTriangle size={16} strokeWidth={3} /> Cancelado após já ter item separado</p>
              <p className="text-xs text-white/80 mt-1">O status mudou pra "cancelado" depois que algum item daqui já tinha sido separado. Confira com o Atendimento antes de prosseguir.</p>
              <button onClick={() => handleClearAttention(openOrder.id)}
                className="mt-2 text-xs font-bold bg-white text-rose-700 px-3 py-1.5 rounded-lg">
                Marcar como revisado
              </button>
            </div>
          )}
          {openOrder.notes && <p className="text-base text-amber-700 bg-amber-50 rounded-xl px-4 py-3 font-semibold">⚠ {openOrder.notes}</p>}

          <div className="flex flex-col gap-3">
            {openOrder.items.map(it => {
              const alertaNome = needsPlaquinhaAlert(it, openOrder.notes)
              return (
              <button key={it.id} onClick={() => handleToggleItem(it)}
                className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all ${
                  alertaNome ? 'bg-rose-50 border-rose-400' : it.picked ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'
                }`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border-2 ${
                  it.picked ? 'bg-emerald-400 border-emerald-400' : 'border-slate-300'
                }`}>
                  {it.picked && <Check size={24} className="text-white" strokeWidth={3} />}
                </div>
                <ThumbPhoto photoUrl={it.photo_url} size={100} />
                <div className="flex-1 min-w-0">
                  {alertaNome && (
                    <span className="flex items-center gap-1 text-xs font-black px-2.5 py-1.5 rounded-full bg-rose-500 text-white w-fit mb-1.5 animate-pulse">
                      ⚠️ SEM NOME — avisar Atendimento pra cobrar o cliente
                    </span>
                  )}
                  <p className={`text-lg font-bold leading-snug ${alertaNome ? 'text-rose-700' : it.picked ? 'text-emerald-700 line-through decoration-2' : 'text-slate-800'}`}>{it.titulo}</p>
                  {it.variacao && (
                    <span className="inline-block text-sm font-bold text-violet-700 bg-violet-100 px-2.5 py-1 rounded-lg mt-1.5">
                      {it.variacao}
                    </span>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {it.sku && <span className="text-xs font-mono text-slate-400">{it.sku}</span>}
                  </div>
                  {it.obs_item && <p className="text-sm text-amber-600 mt-1.5 font-medium">⚠ {it.obs_item}</p>}
                </div>
                <span className={`text-2xl font-black shrink-0 ${it.qty >= 2 ? 'bg-amber-400 text-white px-2.5 py-1 rounded-xl' : 'text-rose-400'}`}>×{it.qty}</span>
              </button>
              )
            })}
          </div>

          {/* Embalagem já registrada — só leitura, sem risco de reenviar/duplicar */}
          {complete && existing.length > 0 && (
            <div className="card border-2 border-emerald-200 bg-emerald-50/40">
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-2">📦 Embalagem usada nesse pedido</p>
              <div className="flex flex-wrap gap-2">
                {existing.map(e => (
                  <span key={e.id} className="text-sm font-bold text-emerald-700 bg-white border border-emerald-200 px-3 py-1.5 rounded-xl">
                    {e.box?.code || e.box?.box_number} <span className="text-emerald-500 font-black">×{e.qty}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Embalagem — seletor editável, só na primeira vez (antes de registrar) */}
          {complete && existing.length === 0 && (
            <div className="card border-2 border-emerald-200">
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-1">🎉 Tudo separado! Qual embalagem foi usada?</p>
              <div className="flex flex-col gap-2 mt-2">
                {boxes.map(b => {
                  const sel = selections.find(s => s.box_id === b.id)
                  const isSel = !!sel
                  return (
                    <div key={b.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${isSel ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                      <button onClick={() => toggleBox(b.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border-2 ${isSel ? 'bg-rose-400 border-rose-400' : 'border-slate-300'}`}>
                          {isSel && <Check size={13} className="text-white" />}
                        </div>
                        <p className="text-sm font-semibold text-slate-700 truncate">{b.code || b.box_number}</p>
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
            </div>
          )}
        </div>

        <div className="bg-white border-t border-slate-100 p-4 sticky bottom-0">
          <div className="max-w-lg mx-auto">
            {complete && existing.length > 0 ? (
              <button onClick={() => setOpenId(null)}
                className="w-full h-14 rounded-2xl font-bold text-base text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-colors">
                ✓ Pedido já fechado — Voltar
              </button>
            ) : (
              <button onClick={complete ? handleFinish : () => setOpenId(null)} disabled={saving}
                className={`w-full h-14 rounded-2xl font-bold text-base text-white transition-colors disabled:opacity-50 ${
                  complete ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-300'
                }`}>
                {saving ? 'Salvando...' : complete ? 'Finalizar pedido ✓' : `Faltam ${openOrder.items.length - pickedCount(openOrder)} item(ns)`}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════ VISÃO GERAL ══════════════════════
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-slate-800">Expedição</h1>
            <p className="text-xs text-slate-400">
              {doneCount} de {orders.length} pedidos fechados · {orders.reduce((s, o) => s + o.items.reduce((si, it) => si + it.qty, 0), 0)} item(ns) no total
            </p>
          </div>
          <div className="flex items-center gap-2">
            {overdue.length > 0 && (
              <button onClick={() => setShowOverdue(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-600 text-white font-black text-sm animate-pulse">
                <AlertTriangle size={16} strokeWidth={2.5} /> {overdue.length} atrasado{overdue.length !== 1 ? 's' : ''}
              </button>
            )}
            {isMonday && !satTarget && (
              <button onClick={handleActivateSaturdayTarget} disabled={activatingTarget || orders.length === 0}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-100 text-amber-700 font-bold text-sm disabled:opacity-50">
                <Target size={16} strokeWidth={2.5} /> {activatingTarget ? 'Calculando...' : 'Envios de Sábado'}
              </button>
            )}
            <button onClick={() => { setReportSent(false); setShowChecklist(true) }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-violet-100 text-violet-700 font-bold text-sm">
              <ClipboardList size={16} strokeWidth={2.5} /> Lista de Itens
            </button>
            <button onClick={openHistory}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm">
              <History size={16} strokeWidth={2.5} /> Histórico
            </button>
            <button onClick={handleCloseDay} disabled={closingDay || orders.length === 0}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-100 text-rose-700 font-bold text-sm disabled:opacity-50">
              <Lock size={16} strokeWidth={2.5} /> {closingDay ? 'Fechando...' : 'Fechar o Dia'}
            </button>
            <button onClick={() => { load(); fetchShippingDayCounts(source).then(setDayCounts).catch(() => {}); fetchOverdueOrders().then(setOverdue).catch(() => {}) }} className="p-2.5 rounded-xl bg-slate-100 text-slate-500"><RefreshCw size={18} /></button>
          </div>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-3">
          <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${orders.length ? (doneCount / orders.length) * 100 : 0}%` }} />
        </div>

        {/* Navegação por dia */}
        <div className="flex items-center gap-2 mt-3">
          <button onClick={() => setViewDate(addDays(viewDate, -1))}
            className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"><ChevronLeft size={16} /></button>
          <button onClick={() => setViewDate(todayISO())}
            disabled={viewDate === todayISO()}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${viewDate === todayISO() ? 'bg-slate-100 text-slate-300' : 'bg-rose-100 text-rose-600'}`}>
            Hoje
          </button>
          <input type="date" value={viewDate} onChange={e => setViewDate(e.target.value)}
            className="flex-1 text-xs px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600" />
          <button onClick={() => setViewDate(addDays(viewDate, 1))}
            className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Faixa de resumo do dia — avisa claramente que dia está sendo visto */}
      <div className={`px-4 py-3 border-b ${viewDate === todayISO() ? 'bg-white border-slate-100' : 'bg-amber-50 border-amber-100'}`}>
        <div className="flex items-center gap-2">
          <Calendar size={15} className={viewDate === todayISO() ? 'text-slate-400' : 'text-amber-500'} />
          <p className={`text-sm font-bold capitalize ${viewDate === todayISO() ? 'text-slate-700' : 'text-amber-700'}`}>
            {fmtDayLong(viewDate)}
          </p>
        </div>
        <p className="text-xs text-slate-400 mt-0.5 pl-[23px]">
          {orders.length} pedido(s)
        </p>
        {(() => {
          const tomorrow = addDays(todayISO(), 1)
          const tomorrowCount = dayCounts[tomorrow]
          return viewDate === todayISO() && tomorrowCount > 0 && (
            <button onClick={() => setViewDate(tomorrow)}
              className="mt-2 ml-[23px] text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg hover:bg-amber-100">
              📦 {tomorrowCount} pedido(s) de amanhã já esperando pra adiantar →
            </button>
          )
        })()}
      </div>

      {/* Painel da meta de sábado — bem visual, é isso que o Marlon confere */}
      {satTarget && (
        <div className="px-4 py-4 bg-gradient-to-r from-amber-400 to-orange-400">
          <div className="flex items-center gap-2 mb-2">
            <Target size={18} className="text-white" />
            <p className="text-white font-black text-sm">Meta de Envios de Sábado</p>
          </div>
          <div className="flex items-end justify-between mb-2">
            <p className="text-white text-3xl font-black">
              {satProgress} <span className="text-lg font-bold text-white/80">/ {satTarget.target_count}</span>
            </p>
            <p className="text-white/90 text-xs font-semibold text-right">
              20% de {satTarget.total_orders_at_activation} + 1<br/>
              {satProgress >= satTarget.target_count ? '✅ Meta batida!' : `Faltam ${satTarget.target_count - satProgress}`}
            </p>
          </div>
          <div className="h-3 bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all"
              style={{ width: `${Math.min(100, (satProgress / satTarget.target_count) * 100)}%` }} />
          </div>
          <p className="text-white/70 text-[11px] mt-2">
            Ativada por {satTarget.activator?.name || '—'} às {new Date(satTarget.activated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-slate-400 text-center px-6">
          {viewDate === todayISO() ? 'Nenhum pedido pra separar hoje.' : `Nenhum pedido de ${fmtDayLong(viewDate)} ainda.`}
        </div>
      ) : doneCount === orders.length ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 px-6 text-center">
          <PartyPopper size={48} className="text-emerald-500" />
          <p className="text-xl font-black text-emerald-700">Tudo separado! 🎉</p>
        </div>
      ) : null}

      <div className="p-3 flex flex-col gap-3">
        {[...orders].sort((a, b) => Number(isOrderComplete(a)) - Number(isOrderComplete(b))).map(o => {
          const complete = isOrderComplete(o)
          const done = pickedCount(o)
          const plat = platformBadge(o.source)
          return (
            <button key={o.id} onClick={() => setOpenId(o.id)}
              className={`rounded-2xl p-4 text-left border-t-2 border-r-2 border-b-2 border-l-[10px] transition-transform active:scale-[0.98] ${plat.accent} ${
                complete ? 'bg-emerald-100 border-t-emerald-300 border-r-emerald-300 border-b-emerald-300' : 'bg-amber-50 border-t-amber-300 border-r-amber-300 border-b-amber-300'
              }`}>
              {/* Cabeçalho do card */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full w-fit mb-1 ${plat.badge}`}>
                    <plat.icon size={13} strokeWidth={2.5} /> {plat.label}
                  </span>
                  {o.num_venda && <p className="text-2xl font-black text-slate-800 font-mono tracking-tight">#{o.num_venda}</p>}
                  <p className={`text-sm font-semibold truncate mt-0.5 ${complete ? 'text-emerald-700' : 'text-amber-800'}`}>{o.comprador || 'Não identificado'}</p>
                  {o.needs_attention && (
                    <span className="flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-full bg-rose-600 text-white w-fit mt-1.5">
                      <AlertTriangle size={12} strokeWidth={3} /> CANCELADO APÓS SEPARADO — VERIFICAR
                    </span>
                  )}
                  {orderHasPlaquinhaAlert(o) && (
                    <span className="flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-full bg-rose-500 text-white w-fit mt-1.5 animate-pulse">
                      ⚠️ SEM NOME — avisar Atendimento
                    </span>
                  )}
                </div>
                <span className={`text-sm font-bold px-3 py-1.5 rounded-full shrink-0 flex items-center gap-1.5 ${complete ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                  {complete ? <>✓ Fechado</> : `${done}/${o.items.length}`}
                </span>
              </div>

              {/* Itens do pedido — pra Carol já ver o que é, sem abrir */}
              <div className={`rounded-xl p-3 flex flex-col gap-2 ${complete ? 'bg-white/60' : 'bg-white/70'}`}>
                {o.items.map(it => {
                  const alertaNome = needsPlaquinhaAlert(it, o.notes)
                  return (
                  <div key={it.id} className={`flex items-center gap-2 ${alertaNome ? 'bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5' : ''}`}>
                    {it.picked
                      ? <Check size={16} className="text-emerald-500 shrink-0" strokeWidth={3} />
                      : <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
                    }
                    <p className={`text-sm flex-1 min-w-0 truncate ${alertaNome ? 'text-rose-700 font-bold' : it.picked ? 'text-slate-400 line-through' : 'text-slate-700 font-semibold'}`}>
                      {alertaNome && '⚠️ '}{it.titulo}
                    </p>
                    <span className={`text-sm font-black shrink-0 ${it.qty >= 2 ? 'bg-amber-400 text-white px-2 py-0.5 rounded-lg' : 'text-slate-500'}`}>×{it.qty}</span>
                  </div>
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
