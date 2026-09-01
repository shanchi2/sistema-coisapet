import { useState, useCallback } from 'react'
import { Tag, Loader2, AlertTriangle, ExternalLink, Zap, Gift, ArrowLeft, LogOut, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { useMlInsights } from './hooks/useMlInsights'
import { ConfirmWriteModal } from './ConfirmWriteModal'

function fmtMoney(v) {
  if (v == null || Number.isNaN(v)) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function itemLink(row) {
  return row.permalink || `https://produto.mercadolivre.com.br/${row.item_id}`
}

// Só os tipos de campanha com fluxo de escrita confirmado na doc
// oficial (2026-09-01) — `DEAL` é o tipo da "9.9" e da maioria das
// campanhas tradicionais convidadas. Os outros tipos (SMART, LIGHTNING,
// PRICE_MATCHING etc.) têm regra de aceite própria, ainda não
// confirmada — mostrados na lista de convites, mas sem ação de indicar
// item por aqui ainda.
const WRITABLE_TYPES = new Set(['DEAL'])

const STATUS_LABEL = { pending: 'Pendente', started: 'Ativa', finished: 'Encerrada' }
const ITEM_STATUS_LABEL = { candidate: 'Candidato', pending: 'Aguardando início', started: 'Participando', finished: 'Encerrado' }

export function MlPromotionsPage() {
  const {
    loading, progress, error,
    fetchPromotionInvites, fetchPromotionCandidates, promotionJoinItem, promotionLeaveItem,
    fetchTrafficAudit,
  } = useMlInsights()

  const [invites, setInvites] = useState(null) // null = nunca verificado
  const [campaign, setCampaign] = useState(null) // convite DEAL aberto
  const [candidates, setCandidates] = useState(null) // merge candidatos + venda
  const [selected, setSelected] = useState({}) // { item_id: preço editável }
  const [confirmModal, setConfirmModal] = useState(null) // null | 'join' | { leave: item_id }
  const [submitting, setSubmitting] = useState(false)

  // Candidatos a relâmpago (diagnóstico já existente — estoque parado)
  const [zombieCandidates, setZombieCandidates] = useState(null)

  async function checkInvites() {
    try { setInvites(await fetchPromotionInvites()) } catch { /* erro já fica em `error` do hook */ }
  }

  async function openCampaign(inv) {
    setCampaign(inv)
    setCandidates(null)
    setSelected({})
    try {
      const [items, traffic] = await Promise.all([
        fetchPromotionCandidates(inv.id, inv.type),
        fetchTrafficAudit(30),
      ])
      const trafficMap = new Map(traffic.map(t => [t.item_id, t]))
      const merged = items.map(c => {
        const t = trafficMap.get(c.id)
        return {
          ...c, item_id: c.id,
          title: t?.title || null, permalink: t?.permalink || null,
          sales: t?.sales ?? 0, available_quantity: t?.available_quantity ?? null,
        }
      })
      setCandidates(merged)
    } catch { /* erro já fica em `error` do hook */ }
  }

  function closeCampaign() {
    setCampaign(null)
    setCandidates(null)
    setSelected({})
  }

  function toggleSelect(row, checked) {
    setSelected(sel => {
      const next = { ...sel }
      if (checked) next[row.item_id] = row.suggested_discounted_price ?? row.min_discounted_price ?? row.original_price
      else delete next[row.item_id]
      return next
    })
  }

  const selectedCount = Object.keys(selected).length

  function requestJoin() {
    if (!selectedCount) return
    setConfirmModal('join')
  }

  // Indica cada item selecionado — sucesso parcial: item que falhar (ex:
  // preço fora do "crível" pro ML) mostra erro isolado, os outros
  // continuam normalmente (mesmo espírito de `applyContent`/`create_item`).
  async function confirmJoin() {
    setSubmitting(true)
    let okCount = 0
    const failed = []
    for (const [itemId, price] of Object.entries(selected)) {
      try {
        await promotionJoinItem(itemId, campaign.id, campaign.type, Number(price))
        okCount++
      } catch (err) {
        failed.push({ itemId, message: err.message })
      }
    }
    if (okCount) toast.success(`${okCount} ite${okCount > 1 ? 'ns indicados' : 'm indicado'} pra campanha!`)
    failed.forEach(f => toast.error(`${f.itemId}: ${f.message}`, { duration: 8000 }))
    setSubmitting(false)
    setConfirmModal(null)
    setSelected({})
    openCampaign(campaign) // atualiza status dos itens
  }

  function requestLeave(itemId) {
    setConfirmModal({ leave: itemId })
  }

  async function confirmLeave() {
    const itemId = confirmModal.leave
    setSubmitting(true)
    try {
      await promotionLeaveItem(itemId, campaign.id, campaign.type)
      toast.success('Item removido da campanha.')
      openCampaign(campaign)
    } catch (err) {
      toast.error('Erro ao remover: ' + err.message)
    } finally {
      setSubmitting(false)
      setConfirmModal(null)
    }
  }

  const findZombieCandidates = useCallback(async () => {
    try {
      const data = await fetchTrafficAudit(30)
      const ranked = data
        .filter(d => (d.available_quantity ?? 0) > 0)
        .map(d => ({ ...d, stagnant_score: (d.available_quantity ?? 0) / (d.sales + 1) }))
        .sort((a, b) => b.stagnant_score - a.stagnant_score)
        .slice(0, 20)
      setZombieCandidates(ranked)
    } catch { /* erro já fica em `error` do hook */ }
  }, [fetchTrafficAudit])

  const toJoinRows = candidates ? candidates.filter(c => c.status === 'candidate').sort((a, b) => b.sales - a.sales) : []
  const joinedRows = candidates ? candidates.filter(c => c.status === 'started' || c.status === 'pending') : []

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0">
            <Tag size={20} strokeWidth={1.5} className="text-white"/>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Campanhas & Promoções</h1>
            <p className="text-sm text-slate-500">Convites reais do Mercado Livre (9.9, campanhas tradicionais...) — indicar item pra campanha é gravação real, sempre com confirmação</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {!campaign ? (
          <>
            {/* Convites */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <Gift size={15} className="text-slate-400"/>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Convites de campanha</p>
                </div>
                <button onClick={checkInvites} disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                  {loading ? <Loader2 size={13} className="animate-spin"/> : <Gift size={13}/>}
                  Verificar
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-3">Campanhas do tipo "Tradicional" (DEAL — inclui datas como 9.9, Dia das Crianças etc.) já permitem indicar item direto por aqui. Os outros tipos ainda são só consulta.</p>

              {invites === null ? (
                <p className="text-sm text-slate-400">Clique em "Verificar" pra ver os convites reais da conta.</p>
              ) : invites.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum convite ativo agora.</p>
              ) : (
                <div className="space-y-2">
                  {invites.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700 font-medium truncate">{inv.name || inv.id}</p>
                        <p className="text-xs text-slate-400">
                          {inv.type} · {STATUS_LABEL[inv.status] || inv.status}
                          {inv.finish_date && ` · até ${new Date(inv.finish_date).toLocaleDateString('pt-BR')}`}
                        </p>
                      </div>
                      {WRITABLE_TYPES.has(inv.type) && inv.status !== 'finished' ? (
                        <button onClick={() => openCampaign(inv)} disabled={loading}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                          Ver candidatos
                        </button>
                      ) : (
                        <span className="shrink-0 text-xs text-slate-400 px-2">só consulta</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Candidatos a relâmpago (estoque parado) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <Zap size={15} className="text-slate-400"/>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Candidatos a campanha relâmpago</p>
                </div>
                <button onClick={findZombieCandidates} disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                  {loading ? <Loader2 size={13} className="animate-spin"/> : <Zap size={13}/>}
                  {loading ? (progress ? `Analisando ${progress.done}/${progress.total}...` : 'Analisando...') : 'Buscar candidatos'}
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-3">Produtos com bastante estoque disponível e pouca venda nos últimos 30 dias — os que mais fazem sentido pra desovar.</p>

              {zombieCandidates === null ? (
                <p className="text-sm text-slate-400">Clique em "Buscar candidatos" — mesma varredura de Tráfego & Conversão, pode demorar um pouco.</p>
              ) : zombieCandidates.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum candidato claro encontrado.</p>
              ) : (
                <div className="space-y-2">
                  {zombieCandidates.map(c => (
                    <div key={c.item_id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
                      <a href={itemLink(c)} target="_blank" rel="noreferrer"
                        className="text-sm text-slate-700 hover:text-emerald-600 inline-flex items-center gap-1.5 min-w-0 truncate">
                        {c.title || c.item_id}<ExternalLink size={11} className="text-slate-300 shrink-0"/>
                      </a>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-800">{c.available_quantity} em estoque</p>
                        <p className="text-xs text-slate-400">{c.sales} vendidos em 30d</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <button onClick={closeCampaign} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
              <ArrowLeft size={14}/> Voltar pros convites
            </button>
            <p className="text-base font-semibold text-slate-800 mb-1">{campaign.name || campaign.id}</p>
            <p className="text-xs text-slate-400 mb-4">{campaign.type} · {STATUS_LABEL[campaign.status] || campaign.status}</p>

            {candidates === null ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-6"><Loader2 size={16} className="animate-spin"/> Carregando candidatos e cruzando com vendas...</div>
            ) : (
              <>
                {joinedRows.length > 0 && (
                  <div className="mb-5">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Já participando ({joinedRows.length})</p>
                    <div className="space-y-1.5">
                      {joinedRows.map(r => (
                        <div key={r.item_id} className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                          <a href={itemLink(r)} target="_blank" rel="noreferrer" className="text-sm text-slate-700 hover:text-emerald-700 truncate min-w-0 flex items-center gap-1.5">
                            {r.title || r.item_id}<ExternalLink size={11} className="text-slate-300 shrink-0"/>
                          </a>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-slate-500">{fmtMoney(r.price)}</span>
                            <span className="text-xs font-semibold text-emerald-700">{ITEM_STATUS_LABEL[r.status] || r.status}</span>
                            <button onClick={() => requestLeave(r.item_id)} disabled={submitting}
                              className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 disabled:opacity-50">
                              <LogOut size={12}/> Sair
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <p className="text-xs font-semibold text-slate-500 uppercase">
                    Candidatos, ordenados por venda ({toJoinRows.length})
                  </p>
                  <button onClick={requestJoin} disabled={!selectedCount || submitting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                    <Send size={13}/> Indicar selecionados{selectedCount ? ` (${selectedCount})` : ''}
                  </button>
                </div>
                {toJoinRows.length === 0 ? (
                  <p className="text-sm text-slate-400">Nenhum candidato pendente — ou não sobrou nenhum, ou já indicou todos.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[32rem] overflow-y-auto">
                    {toJoinRows.map(r => (
                      <div key={r.item_id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
                        <input type="checkbox" checked={r.item_id in selected} onChange={e => toggleSelect(r, e.target.checked)}/>
                        <a href={itemLink(r)} target="_blank" rel="noreferrer"
                          className="text-sm text-slate-700 hover:text-emerald-600 truncate min-w-0 flex-1 flex items-center gap-1.5">
                          {r.title || r.item_id}<ExternalLink size={11} className="text-slate-300 shrink-0"/>
                        </a>
                        <span className="text-xs text-slate-400 shrink-0">{r.sales} vendidos/30d</span>
                        <span className="text-xs text-slate-400 shrink-0 line-through">{fmtMoney(r.original_price)}</span>
                        <input type="number" step="0.01"
                          value={r.item_id in selected ? selected[r.item_id] : (r.suggested_discounted_price ?? '')}
                          onChange={e => setSelected(sel => ({ ...sel, [r.item_id]: e.target.value }))}
                          disabled={!(r.item_id in selected)}
                          min={r.min_discounted_price} max={r.max_discounted_price}
                          className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400 disabled:bg-slate-100 shrink-0"/>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <ConfirmWriteModal
        open={confirmModal === 'join'}
        title={`Indicar ${selectedCount} ite${selectedCount > 1 ? 'ns' : 'm'} pra "${campaign?.name || campaign?.id}"`}
        description="Vai gravar essa participação de verdade na campanha do Mercado Livre."
        confirmLabel="Sim, indicar"
        confirming={submitting}
        onConfirm={confirmJoin}
        onCancel={() => setConfirmModal(null)}
        detail={
          <ul className="text-sm text-slate-700 space-y-1">
            {Object.entries(selected).map(([itemId, price]) => {
              const row = candidates?.find(c => c.item_id === itemId)
              return <li key={itemId}><strong>{row?.title || itemId}:</strong> {fmtMoney(price)}</li>
            })}
          </ul>
        }
      />

      <ConfirmWriteModal
        open={!!confirmModal?.leave}
        title="Sair da campanha"
        description="Vai remover esse item da campanha de verdade no Mercado Livre."
        confirmLabel="Sim, sair"
        confirming={submitting}
        onConfirm={confirmLeave}
        onCancel={() => setConfirmModal(null)}
        detail={confirmModal?.leave && (
          <p className="text-sm text-slate-700">{candidates?.find(c => c.item_id === confirmModal.leave)?.title || confirmModal.leave}</p>
        )}
      />
    </div>
  )
}
