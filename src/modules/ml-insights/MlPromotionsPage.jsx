import { useEffect, useState } from 'react'
import { Tag, Loader2, AlertTriangle, ExternalLink, Zap, Gift, ArrowLeft, LogOut, Send, Percent, Search, Clock, Trash2, Plus, Flame, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { useMlInsights } from './hooks/useMlInsights'
import { ConfirmWriteModal } from './ConfirmWriteModal'

function fmtMoney(v) {
  if (v == null || Number.isNaN(v)) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// A oferta relâmpago não fica ativa na hora que indica o item — o ML
// reserva uma janela específica (start_date/finish_date, geralmente um
// bloco de horas num dia futuro) e só aplica o preço quando ela chega.
// Sem mostrar isso na tela, "Aguardando início" parece bug (o Raphael
// reportou 13/09: "ativei vários produtos... mas nenhum foi ativo pro
// ML" — na real nenhum bug, a janela deles começava no dia seguinte).
function fmtWindow(startIso, finishIso) {
  if (!startIso) return null
  const opts = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
  const start = new Date(startIso).toLocaleString('pt-BR', opts)
  const finish = finishIso ? new Date(finishIso).toLocaleString('pt-BR', opts) : null
  return finish ? `${start} até ${finish}` : start
}

function itemLink(row) {
  return row.permalink || `https://produto.mercadolivre.com.br/${row.item_id}`
}

// Só os tipos de campanha com fluxo de escrita confirmado na doc
// oficial — `DEAL` é o tipo da "9.9" e da maioria das campanhas
// tradicionais convidadas. Os outros tipos convidados (SMART,
// PRICE_MATCHING etc.) têm regra de aceite própria, ainda não
// confirmada — mostrados na lista de convites, mas sem ação de indicar
// item por aqui ainda. LIGHTNING tem aba própria (ver abaixo).
const WRITABLE_TYPES = new Set(['DEAL'])

const STATUS_LABEL = { pending: 'Pendente', started: 'Ativa', finished: 'Encerrada' }
const ITEM_STATUS_LABEL = { candidate: 'Candidato', pending: 'Aguardando início', started: 'Participando', finished: 'Encerrado' }

function todayISODate() { return new Date().toISOString().slice(0, 10) }
function addDaysISODate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}
function daysSince(dateStr) {
  if (!dateStr) return null
  return Math.floor((new Date() - new Date(dateStr)) / 86400000)
}
// Math.round pode arredondar o preço final PRA CIMA (ex: R$62,90 a 5% off
// vira R$59,755 → arredonda pra R$59,76 → desconto real fica em 4,99%,
// não 5%) — o ML exige o desconto MAIOR que o % mínimo, então isso é
// rejeitado (MINIMUM_DISCOUNT_PERCENT). Math.floor sempre arredonda o
// preço pra baixo, garantindo que o desconto de verdade nunca fica
// abaixo do % pedido.
function computeDiscountedPrice(price, pct) {
  return Math.floor(Number(price) * (1 - Number(pct) / 100) * 100) / 100
}

const TABS = [
  { key: 'desconto',   label: 'Desconto em massa', icon: Percent },
  { key: 'campanhas',  label: 'Campanhas',          icon: Gift },
  { key: 'relampago',  label: 'Oferta relâmpago',   icon: Zap },
]

// Um card por campanha de desconto do vendedor — o ML permite várias
// SELLER_CAMPAIGN ativas ao mesmo tempo (ex: "Super Promo" 10% em uns
// itens + "Promoçãozinha" 5% em outros), então cada card carrega e
// gerencia os itens/seleção/confirmação da SUA campanha, independente
// das outras. `allItems` (catálogo ativo) é compartilhado, carregado
// uma vez só pelo componente pai.
function BulkDiscountCampaignCard({ campaign, allItems, api, onChanged }) {
  const { fetchPromotionCandidates, fetchSellerCampaignLastChange, promotionJoinItem, promotionLeaveItem, deleteSellerCampaign } = api
  const [lastChange, setLastChange] = useState(null)
  const [campaignItems, setCampaignItems] = useState(null) // null = carregando
  const [selected, setSelected] = useState({})
  const [percent, setPercent] = useState(10)
  const [search, setSearch] = useState('')
  const [confirm, setConfirm] = useState(null) // null | 'apply' | 'delete' | { leave: item_id }
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setCampaignItems(null)
    setSelected({})
    try {
      const [lc, items] = await Promise.all([
        fetchSellerCampaignLastChange(campaign.id),
        fetchPromotionCandidates(campaign.id, 'SELLER_CAMPAIGN'),
      ])
      setLastChange(lc)
      // status 'candidate' = só elegível, ainda não participando de
      // verdade (ver nota em loadBulkDiscount do componente pai).
      setCampaignItems(items.filter(c => c.status !== 'candidate'))
    } catch { /* erro global já tratado pelo hook (useMlInsights) */ }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [campaign.id])

  const alreadyIds = new Set((campaignItems || []).map(c => c.id))
  const filtered = (allItems || []).filter(it =>
    it.status === 'active' && !alreadyIds.has(it.item_id) &&
    (!search.trim() || it.title?.toLowerCase().includes(search.trim().toLowerCase())))
  const selectedCount = Object.keys(selected).length

  function toggleSelect(item, checked) {
    setSelected(sel => {
      const next = { ...sel }
      if (checked) next[item.item_id] = computeDiscountedPrice(item.price, percent)
      else delete next[item.item_id]
      return next
    })
  }

  function applyPercentToSelected() {
    setSelected(sel => {
      const next = {}
      for (const id of Object.keys(sel)) {
        const item = allItems?.find(i => i.item_id === id)
        next[id] = item ? computeDiscountedPrice(item.price, percent) : sel[id]
      }
      return next
    })
  }

  async function confirmApply() {
    setSubmitting(true)
    let okCount = 0
    const failed = []
    for (const [itemId, price] of Object.entries(selected)) {
      try {
        await promotionJoinItem(itemId, campaign.id, 'SELLER_CAMPAIGN', Number(price))
        okCount++
      } catch (err) {
        failed.push({ itemId, message: err.message })
      }
    }
    if (okCount) toast.success(`${okCount} ite${okCount > 1 ? 'ns com desconto aplicado' : 'm com desconto aplicado'}!`)
    failed.forEach(f => toast.error(`${f.itemId}: ${f.message}`, { duration: 8000 }))
    setSubmitting(false)
    setConfirm(null)
    await load()
  }

  async function confirmLeave() {
    const itemId = confirm.leave
    setSubmitting(true)
    try {
      await promotionLeaveItem(itemId, campaign.id, 'SELLER_CAMPAIGN')
      toast.success('Desconto removido desse item.')
      await load()
    } catch (err) {
      toast.error('Erro ao remover: ' + err.message)
    } finally {
      setSubmitting(false)
      setConfirm(null)
    }
  }

  async function confirmDelete() {
    setSubmitting(true)
    try {
      await deleteSellerCampaign(campaign.id)
      toast.success('Campanha excluída.')
      onChanged() // recarrega a lista de campanhas no pai (esse card some)
    } catch (err) {
      toast.error('Erro ao excluir: ' + err.message)
      setSubmitting(false)
      setConfirm(null)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="text-base font-semibold text-slate-800 mb-1">{campaign.name || campaign.id}</p>
          <p className="text-xs text-slate-400">
            Campanha do vendedor · {STATUS_LABEL[campaign.status] || campaign.status}
            {campaign.finish_date && ` · encerra em ${daysUntil(campaign.finish_date)} dia(s) (${new Date(campaign.finish_date).toLocaleDateString('pt-BR')})`}
          </p>
          <p className="text-xs text-slate-400 inline-flex items-center gap-1 mt-1">
            <Clock size={11}/>
            {lastChange ? `Última alteração há ${daysSince(lastChange)} dia(s)` : 'Nenhuma alteração registrada ainda'}
          </p>
        </div>
        <button onClick={() => setConfirm('delete')} disabled={submitting}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
          <Trash2 size={13}/> Excluir campanha
        </button>
      </div>

      {campaignItems === null ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-6"><Loader2 size={16} className="animate-spin"/> Carregando anúncios...</div>
      ) : (
        <>
          {campaignItems.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Já com desconto ({campaignItems.length})</p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {campaignItems.map(r => {
                  const listing = allItems.find(i => i.item_id === r.id)
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                      <a href={listing?.permalink || `https://produto.mercadolivre.com.br/${r.id}`} target="_blank" rel="noreferrer" className="text-sm text-slate-700 hover:text-emerald-700 truncate min-w-0 flex items-center gap-1.5">
                        {listing?.title || r.id}<ExternalLink size={11} className="text-slate-300 shrink-0"/>
                      </a>
                      <div className="flex items-center gap-2 shrink-0 text-xs">
                        <span className="text-slate-400 line-through">{fmtMoney(r.original_price)}</span>
                        <span className="font-semibold text-emerald-700">{fmtMoney(r.price)}</span>
                        <span className="text-slate-400">{ITEM_STATUS_LABEL[r.status] || r.status}</span>
                        <button onClick={() => setConfirm({ leave: r.id })} disabled={submitting}
                          className="flex items-center gap-1 text-rose-600 hover:text-rose-700 disabled:opacity-50">
                          <LogOut size={12}/> Sair
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"/>
              <input className="input pl-8" placeholder="Buscar anúncio pelo título..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Percent size={14} className="text-slate-400"/>
              <input type="number" min={5} max={70} step={1} value={percent}
                onChange={e => setPercent(e.target.value)}
                className="w-16 text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:border-emerald-400"/>
              <span className="text-sm text-slate-500">% off</span>
            </div>
            <button onClick={applyPercentToSelected} disabled={!selectedCount}
              className="px-3 py-2 border border-slate-200 hover:border-emerald-300 text-slate-600 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
              Aplicar % aos selecionados
            </button>
            <button onClick={() => selectedCount && setConfirm('apply')} disabled={!selectedCount || submitting}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
              <Send size={13}/> Aplicar desconto{selectedCount ? ` (${selectedCount})` : ''}
            </button>
          </div>

          <p className="text-xs text-slate-400 mb-2">O desconto usa a % do campo acima no momento em que você marca o item — depois disso, o preço de cada linha fica editável individualmente.</p>

          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nenhum anúncio ativo encontrado{search ? ' com esse termo' : ''}.</p>
          ) : (
            <div className="space-y-1.5 max-h-[32rem] overflow-y-auto">
              {filtered.map(item => (
                <div key={item.item_id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
                  <input type="checkbox" checked={item.item_id in selected} onChange={e => toggleSelect(item, e.target.checked)}/>
                  {item.thumbnail && <img src={item.thumbnail} alt="" className="w-8 h-8 rounded object-cover shrink-0"/>}
                  <a href={item.permalink || `https://produto.mercadolivre.com.br/${item.item_id}`} target="_blank" rel="noreferrer"
                    className="text-sm text-slate-700 hover:text-emerald-600 truncate min-w-0 flex-1 flex items-center gap-1.5">
                    {item.title || item.item_id}<ExternalLink size={11} className="text-slate-300 shrink-0"/>
                  </a>
                  <span className="text-xs text-slate-400 shrink-0 line-through">{fmtMoney(item.price)}</span>
                  <input type="number" step="0.01"
                    value={item.item_id in selected ? selected[item.item_id] : ''}
                    onChange={e => setSelected(sel => ({ ...sel, [item.item_id]: e.target.value }))}
                    disabled={!(item.item_id in selected)}
                    className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400 disabled:bg-slate-100 shrink-0"/>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmWriteModal
        open={confirm === 'apply'}
        title={`Aplicar desconto em ${selectedCount} ite${selectedCount > 1 ? 'ns' : 'm'}`}
        description="Vai gravar esse preço com desconto de verdade nos anúncios do Mercado Livre."
        confirmLabel="Sim, aplicar"
        confirming={submitting}
        onConfirm={confirmApply}
        onCancel={() => setConfirm(null)}
        detail={
          <ul className="text-sm text-slate-700 space-y-1">
            {Object.entries(selected).map(([itemId, price]) => {
              const item = allItems?.find(i => i.item_id === itemId)
              return <li key={itemId}><strong>{item?.title || itemId}:</strong> {fmtMoney(item?.price)} → {fmtMoney(price)}</li>
            })}
          </ul>
        }
      />

      <ConfirmWriteModal
        open={!!confirm?.leave}
        title="Remover desconto do item"
        description="Vai remover esse item da campanha de verdade no Mercado Livre — o preço volta ao normal."
        confirmLabel="Sim, remover"
        confirming={submitting}
        onConfirm={confirmLeave}
        onCancel={() => setConfirm(null)}
        detail={confirm?.leave && (
          <p className="text-sm text-slate-700">{allItems?.find(i => i.item_id === confirm.leave)?.title || confirm.leave}</p>
        )}
      />

      <ConfirmWriteModal
        open={confirm === 'delete'}
        title="Excluir campanha de desconto"
        description="Vai excluir a campanha de verdade no Mercado Livre — os itens que ainda estiverem participando perdem o desconto."
        confirmLabel="Sim, excluir"
        confirming={submitting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirm(null)}
        detail={<p className="text-sm text-slate-700">{campaign.name || campaign.id}</p>}
      />
    </div>
  )
}

export function MlPromotionsPage() {
  const {
    loading, progress, error,
    fetchPromotionInvites, fetchPromotionCandidates, promotionJoinItem, promotionLeaveItem,
    fetchTrafficAudit, fetchActiveListings,
    createSellerCampaign, deleteSellerCampaign, fetchSellerCampaignLastChange,
  } = useMlInsights()

  const [activeTab, setActiveTab] = useState('desconto')

  // ── Desconto em massa (Campanhas do vendedor — pode ter várias ao
  //    mesmo tempo, ex: "Super Promo" 10% + "Promoçãozinha" 5% em itens
  //    diferentes; cada `BulkDiscountCampaignCard` cuida da sua) ──────
  const [bulkCampaigns, setBulkCampaigns] = useState(null) // null=não verificado, [] = nenhuma, array = achadas
  const [bulkItems, setBulkItems] = useState(null) // catálogo ativo, compartilhado entre os cards
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [newCampaignStart, setNewCampaignStart] = useState('')
  const [newCampaignFinish, setNewCampaignFinish] = useState('')

  function resetNewCampaignForm() {
    // Nome tem que caber no limite do ML: testado ao vivo em 13/09,
    // "seller_proposition_title" aceita no máximo 25 caracteres e não
    // pode ter "/" — formato "13/09/2026" quebrava os dois limites de
    // uma vez (o padrão anterior, com toLocaleDateString, gerava um
    // nome inválido sempre).
    setNewCampaignName(`Desconto ${todayISODate().replace(/-/g, '')}`)
    setNewCampaignStart(todayISODate())
    setNewCampaignFinish(addDaysISODate(todayISODate(), 14))
  }

  async function loadBulkDiscount() {
    setBulkCampaigns(null)
    setBulkItems(null)
    setShowCreateForm(false)
    try {
      const [invites, items] = await Promise.all([fetchPromotionInvites(), fetchActiveListings()])
      const found = invites.filter(i => i.type === 'SELLER_CAMPAIGN' && i.status !== 'finished')
      setBulkItems(items)
      setBulkCampaigns(found)
      if (found.length === 0) {
        resetNewCampaignForm()
        setShowCreateForm(true)
      }
    } catch { /* erro já fica em `error` do hook */ }
  }

  async function handleCreateCampaign() {
    if (!newCampaignName.trim() || !newCampaignStart || !newCampaignFinish) return
    try {
      await createSellerCampaign(newCampaignName.trim(), newCampaignStart, newCampaignFinish)
      toast.success('Campanha criada!')
      loadBulkDiscount()
    } catch (err) {
      toast.error('Erro ao criar campanha: ' + err.message, { duration: 8000 })
    }
  }

  // ── Campanhas (convites — DEAL etc.) ──────────────────────────────
  const [invites, setInvites] = useState(null) // null = nunca verificado
  const [campaign, setCampaign] = useState(null) // convite DEAL aberto
  const [candidates, setCandidates] = useState(null) // merge candidatos + venda
  const [selected, setSelected] = useState({}) // { item_id: preço editável }
  const [confirmModal, setConfirmModal] = useState(null) // null | 'join' | { leave: item_id }
  const [submitting, setSubmitting] = useState(false)

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

  const toJoinRows = candidates ? candidates.filter(c => c.status === 'candidate').sort((a, b) => b.sales - a.sales) : []
  const joinedRows = candidates ? candidates.filter(c => c.status === 'started' || c.status === 'pending') : []

  // ── Oferta relâmpago (LIGHTNING) ──────────────────────────────────
  // Confirmado na doc oficial (13/09): mesmo padrão de escrita da DEAL
  // (`/seller-promotions/items/{id}`), só que exige também `stock` (a
  // quantidade que fica reservada pra promoção — quando esgota, encerra
  // sozinha nesse item). Candidatos vêm de
  // `/seller-promotions/promotions/{id}/items` igual a DEAL — mesmo
  // `promotionCandidates` genérico, sem precisar de nada novo no back.
  const [lightningInvite, setLightningInvite] = useState(null) // null=não verificado, false=nenhum convite, objeto=achou
  const [lightningCandidates, setLightningCandidates] = useState(null)
  const [lightningSelected, setLightningSelected] = useState({}) // { item_id: { price, stock } }
  const [lightningSort, setLightningSort] = useState('stagnant') // 'stagnant' | 'sales'
  const [lightningConfirm, setLightningConfirm] = useState(null)
  const [lightningSubmitting, setLightningSubmitting] = useState(false)

  async function loadLightning() {
    setLightningCandidates(null)
    setLightningSelected({})
    try {
      const invites = await fetchPromotionInvites()
      const found = invites.find(i => i.type === 'LIGHTNING' && i.status !== 'finished') || false
      setLightningInvite(found)
      if (found) {
        const [items, traffic] = await Promise.all([
          fetchPromotionCandidates(found.id, 'LIGHTNING'),
          fetchTrafficAudit(30),
        ])
        const trafficMap = new Map(traffic.map(t => [t.item_id, t]))
        const merged = items.map(c => {
          const t = trafficMap.get(c.id)
          const sales = t?.sales ?? 0
          const availableQty = t?.available_quantity ?? 0
          return {
            ...c, item_id: c.id,
            title: t?.title || null, permalink: t?.permalink || null,
            sales, available_quantity: availableQty,
            stagnant_score: availableQty / (sales + 1),
          }
        })
        setLightningCandidates(merged)
      }
    } catch { /* erro já fica em `error` do hook */ }
  }

  function toggleLightningSelect(row, checked) {
    setLightningSelected(sel => {
      const next = { ...sel }
      if (checked) next[row.item_id] = { price: row.price, stock: row.stock?.min ?? 5 }
      else delete next[row.item_id]
      return next
    })
  }

  const lightningSelectedCount = Object.keys(lightningSelected).length

  function requestLightningJoin() {
    if (!lightningSelectedCount) return
    setLightningConfirm('apply')
  }

  async function confirmLightningJoin() {
    setLightningSubmitting(true)
    let okCount = 0
    const failed = []
    for (const [itemId, v] of Object.entries(lightningSelected)) {
      try {
        await promotionJoinItem(itemId, lightningInvite.id, 'LIGHTNING', Number(v.price), undefined, Number(v.stock))
        okCount++
      } catch (err) {
        failed.push({ itemId, message: err.message })
      }
    }
    if (okCount) toast.success(`${okCount} ite${okCount > 1 ? 'ns indicados' : 'm indicado'} pra oferta relâmpago!`)
    failed.forEach(f => toast.error(`${f.itemId}: ${f.message}`, { duration: 8000 }))
    setLightningSubmitting(false)
    setLightningConfirm(null)
    setLightningSelected({})
    loadLightning()
  }

  function requestLightningLeave(itemId) {
    setLightningConfirm({ leave: itemId })
  }

  async function confirmLightningLeave() {
    const itemId = lightningConfirm.leave
    setLightningSubmitting(true)
    try {
      await promotionLeaveItem(itemId, lightningInvite.id, 'LIGHTNING')
      toast.success('Item removido da oferta relâmpago.')
      loadLightning()
    } catch (err) {
      toast.error('Erro ao remover: ' + err.message)
    } finally {
      setLightningSubmitting(false)
      setLightningConfirm(null)
    }
  }

  const lightningToJoin = lightningCandidates
    ? lightningCandidates.filter(c => c.status === 'candidate')
      .sort((a, b) => lightningSort === 'stagnant' ? b.stagnant_score - a.stagnant_score : b.sales - a.sales)
    : []
  const lightningJoined = lightningCandidates ? lightningCandidates.filter(c => c.status === 'started' || c.status === 'pending') : []

  // Carrega os dados de cada aba só na primeira vez que ela é aberta
  // (nunca de novo sozinho — só quando o usuário troca de aba ou pede
  // "Verificar"/"Buscar" de novo).
  useEffect(() => {
    if (activeTab === 'desconto' && bulkCampaigns === null) loadBulkDiscount()
    if (activeTab === 'relampago' && lightningInvite === null) loadLightning()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200">
            <Tag size={22} strokeWidth={1.5} className="text-white"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Campanhas & Promoções</h1>
            <p className="text-sm text-slate-500">Toda gravação aqui é real no Mercado Livre — sempre com confirmação antes</p>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-2 border-b border-slate-200">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = activeTab === t.key
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  isActive ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}>
                <Icon size={15}/> {t.label}
              </button>
            )
          })}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {/* ── Aba: Desconto em massa ── */}
        {activeTab === 'desconto' && (
          <div className="space-y-4">
            {bulkCampaigns === null ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-sm text-slate-400 py-6"><Loader2 size={16} className="animate-spin"/> Verificando campanhas...</div>
              </div>
            ) : (
              <>
                {bulkCampaigns.map(c => (
                  <BulkDiscountCampaignCard key={c.id} campaign={c} allItems={bulkItems}
                    api={{ fetchPromotionCandidates, fetchSellerCampaignLastChange, promotionJoinItem, promotionLeaveItem, deleteSellerCampaign }}
                    onChanged={loadBulkDiscount} />
                ))}

                {showCreateForm ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-md">
                    <p className="text-base font-semibold text-slate-800 mb-1">Criar campanha de desconto</p>
                    <p className="text-xs text-slate-400 mb-4">Escolha o nome e o período (máximo 14 dias, regra do Mercado Livre) — depois disso você escolhe os itens e o desconto de cada um. Pode ter várias campanhas rodando ao mesmo tempo, com itens diferentes em cada uma.</p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Nome da campanha</label>
                        <input className="input" value={newCampaignName} maxLength={25}
                          onChange={e => setNewCampaignName(e.target.value.replace(/\//g, '-'))} />
                        <p className="text-[11px] text-slate-400 mt-1">Máximo 25 caracteres, sem "/" (regra do Mercado Livre) — {25 - newCampaignName.length} restantes.</p>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-slate-500 mb-1 block">Início</label>
                          <input type="date" className="input" value={newCampaignStart} min={todayISODate()}
                            onChange={e => {
                              const v = e.target.value
                              setNewCampaignStart(v)
                              if (newCampaignFinish && daysUntil(newCampaignFinish) - daysUntil(v) > 14) setNewCampaignFinish(addDaysISODate(v, 14))
                            }} />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-slate-500 mb-1 block">Fim (máx. 14 dias do início)</label>
                          <input type="date" className="input" value={newCampaignFinish}
                            min={newCampaignStart} max={addDaysISODate(newCampaignStart || todayISODate(), 14)}
                            onChange={e => setNewCampaignFinish(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={handleCreateCampaign} disabled={loading || !newCampaignName.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                          <Plus size={14}/> Criar campanha
                        </button>
                        {bulkCampaigns.length > 0 && (
                          <button onClick={() => setShowCreateForm(false)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2">
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { resetNewCampaignForm(); setShowCreateForm(true) }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 text-sm font-medium rounded-xl transition-colors">
                    <Plus size={14}/> Nova campanha de desconto
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Aba: Campanhas (convites) ── */}
        {activeTab === 'campanhas' && (
          !campaign ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
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
              <p className="text-xs text-slate-400 mb-3">Campanhas do tipo "Tradicional" (DEAL — inclui datas como 9.9, Dia das Crianças etc.) já permitem indicar item direto por aqui. Os outros tipos ainda são só consulta (LIGHTNING tem aba própria).</p>

              {invites === null ? (
                <p className="text-sm text-slate-400">Clique em "Verificar" pra ver os convites reais da conta.</p>
              ) : invites.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum convite ativo agora.</p>
              ) : (
                <div className="space-y-2">
                  {invites.filter(inv => inv.type !== 'LIGHTNING').map(inv => (
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
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
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
          )
        )}

        {/* ── Aba: Oferta relâmpago (LIGHTNING) ── */}
        {activeTab === 'relampago' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            {lightningInvite === null ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-6"><Loader2 size={16} className="animate-spin"/> Verificando convite de oferta relâmpago...</div>
            ) : lightningInvite === false ? (
              <div className="text-center py-10">
                <Zap size={28} strokeWidth={1} className="mx-auto mb-3 text-slate-200"/>
                <p className="text-sm text-slate-500">Nenhum convite de oferta relâmpago ativo agora.</p>
                <p className="text-xs text-slate-400 mt-1">O Mercado Livre convida periodicamente — quando tiver um convite ativo, os candidatos aparecem aqui.</p>
                <button onClick={loadLightning} disabled={loading}
                  className="mt-4 flex items-center gap-1.5 mx-auto px-3 py-1.5 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                  {loading ? <Loader2 size={13} className="animate-spin"/> : <Zap size={13}/>} Verificar de novo
                </button>
              </div>
            ) : (
              <>
                <p className="text-base font-semibold text-slate-800 mb-1">{lightningInvite.name || lightningInvite.id}</p>
                <p className="text-xs text-slate-400 mb-4">Oferta relâmpago · {STATUS_LABEL[lightningInvite.status] || lightningInvite.status} — tem estoque reservado; quando esgota, a promoção encerra sozinha nesse item.</p>

                {lightningCandidates === null ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400 py-6"><Loader2 size={16} className="animate-spin"/> Carregando candidatos e cruzando com vendas...</div>
                ) : (
                  <>
                    {lightningJoined.length > 0 && (
                      <div className="mb-5">
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Já participando ({lightningJoined.length})</p>
                        <div className="space-y-1.5">
                          {lightningJoined.map(r => (
                            <div key={r.item_id} className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex-wrap">
                              <a href={itemLink(r)} target="_blank" rel="noreferrer" className="text-sm text-slate-700 hover:text-emerald-700 truncate min-w-0 flex items-center gap-1.5">
                                {r.title || r.item_id}<ExternalLink size={11} className="text-slate-300 shrink-0"/>
                              </a>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-slate-500">{fmtMoney(r.price)}</span>
                                <span className="text-xs font-semibold text-emerald-700">{ITEM_STATUS_LABEL[r.status] || r.status}</span>
                                {r.status === 'pending' && fmtWindow(r.start_date, r.finish_date) && (
                                  <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5" title="O preço só passa a valer de verdade no anúncio quando essa janela começar — reserva do ML, não depende de nada aqui.">
                                    <Clock size={10}/> ativa em {fmtWindow(r.start_date, r.finish_date)}
                                  </span>
                                )}
                                {r.status === 'pending' ? (
                                  <button onClick={() => requestLightningLeave(r.item_id)} disabled={lightningSubmitting}
                                    className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 disabled:opacity-50">
                                    <LogOut size={12}/> Sair
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-400" title="Regra do ML: promoção já ativa não pode ser removida — só pausando o anúncio">já ativa</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase mr-1">Ordenar por</p>
                        <button onClick={() => setLightningSort('stagnant')}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${lightningSort === 'stagnant' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                          <Flame size={11}/> Estoque parado
                        </button>
                        <button onClick={() => setLightningSort('sales')}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${lightningSort === 'sales' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                          <TrendingUp size={11}/> Mais vendidos
                        </button>
                      </div>
                      <button onClick={requestLightningJoin} disabled={!lightningSelectedCount || lightningSubmitting}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                        <Send size={13}/> Indicar selecionados{lightningSelectedCount ? ` (${lightningSelectedCount})` : ''}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mb-2">{lightningToJoin.length} candidatos · preço e estoque reservado vêm sugeridos, editáveis antes de confirmar.</p>

                    {lightningToJoin.length === 0 ? (
                      <p className="text-sm text-slate-400">Nenhum candidato pendente — ou não sobrou nenhum, ou já indicou todos.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-[32rem] overflow-y-auto">
                        {lightningToJoin.map(r => {
                          const sel = lightningSelected[r.item_id]
                          const checked = !!sel
                          return (
                            <div key={r.item_id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
                              <input type="checkbox" checked={checked} onChange={e => toggleLightningSelect(r, e.target.checked)}/>
                              <a href={itemLink(r)} target="_blank" rel="noreferrer"
                                className="text-sm text-slate-700 hover:text-emerald-600 truncate min-w-0 flex-1 flex items-center gap-1.5">
                                {r.title || r.item_id}<ExternalLink size={11} className="text-slate-300 shrink-0"/>
                              </a>
                              <span className="text-xs text-slate-400 shrink-0">{r.sales} vend./30d · {r.available_quantity ?? '—'} em estoque</span>
                              <span className="text-xs text-slate-400 shrink-0 line-through">{fmtMoney(r.original_price)}</span>
                              <input type="number" step="0.01" placeholder="Preço"
                                value={checked ? sel.price : ''}
                                onChange={e => setLightningSelected(s => ({ ...s, [r.item_id]: { ...s[r.item_id], price: e.target.value } }))}
                                disabled={!checked}
                                min={r.min_discounted_price}
                                className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400 disabled:bg-slate-100 shrink-0"/>
                              <input type="number" step="1" placeholder="Estoque" title="Estoque reservado pra essa promoção"
                                value={checked ? sel.stock : ''}
                                onChange={e => setLightningSelected(s => ({ ...s, [r.item_id]: { ...s[r.item_id], stock: e.target.value } }))}
                                disabled={!checked}
                                min={r.stock?.min} max={r.stock?.max}
                                className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400 disabled:bg-slate-100 shrink-0"/>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
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

      <ConfirmWriteModal
        open={lightningConfirm === 'apply'}
        title={`Indicar ${lightningSelectedCount} ite${lightningSelectedCount > 1 ? 'ns' : 'm'} pra oferta relâmpago`}
        description="Vai gravar essa participação de verdade no Mercado Livre — reserva o estoque informado pra essa promoção."
        confirmLabel="Sim, indicar"
        confirming={lightningSubmitting}
        onConfirm={confirmLightningJoin}
        onCancel={() => setLightningConfirm(null)}
        detail={
          <ul className="text-sm text-slate-700 space-y-1">
            {Object.entries(lightningSelected).map(([itemId, v]) => {
              const row = lightningCandidates?.find(c => c.item_id === itemId)
              return <li key={itemId}><strong>{row?.title || itemId}:</strong> {fmtMoney(v.price)} · estoque reservado: {v.stock}</li>
            })}
          </ul>
        }
      />

      <ConfirmWriteModal
        open={!!lightningConfirm?.leave}
        title="Remover da oferta relâmpago"
        description="Vai remover esse item da promoção de verdade no Mercado Livre."
        confirmLabel="Sim, remover"
        confirming={lightningSubmitting}
        onConfirm={confirmLightningLeave}
        onCancel={() => setLightningConfirm(null)}
        detail={lightningConfirm?.leave && (
          <p className="text-sm text-slate-700">{lightningCandidates?.find(c => c.item_id === lightningConfirm.leave)?.title || lightningConfirm.leave}</p>
        )}
      />
    </div>
  )
}
