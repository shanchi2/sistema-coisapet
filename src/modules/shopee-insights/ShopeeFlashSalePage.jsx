import { useEffect, useMemo, useState } from 'react'
import {
  Zap, Loader2, AlertTriangle, RefreshCw, Plus, Trash2, Play, Pause, ChevronDown, ChevronUp,
  Square, CheckSquare, Search, X as XIcon, Info, MousePointerClick, Bell, ImageOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useShopeeInsights } from './hooks/useShopeeInsights'
import { ConfirmWriteModal } from '../ml-insights/ConfirmWriteModal'

const SHOPEE_ORANGE = '#EE4D2D'

function fmtMoney(v) {
  if (v == null || Number.isNaN(v)) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDateTime(sec) {
  if (!sec) return '—'
  return new Date(sec * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const TYPE_INFO = {
  1: { label: 'Agendado',     bg: 'bg-amber-100',   text: 'text-amber-700' },
  2: { label: 'Em andamento', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  3: { label: 'Expirado',     bg: 'bg-slate-100',   text: 'text-slate-500' },
}
const FILTERS = [
  { key: 0, label: 'Todos' },
  { key: 1, label: 'Agendados' },
  { key: 2, label: 'Em andamento' },
  { key: 3, label: 'Expirados' },
]

function CriteriaPanel({ criteria }) {
  const [open, setOpen] = useState(false)
  if (!criteria) return null
  return (
    <div className="bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3.5">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-sm text-sky-800 w-full">
        <Info size={16} className="text-sky-500 shrink-0"/>
        <span className="flex-1 text-left">Critérios que a Shopee exige pra um produto entrar em Flash Sale</span>
        <ChevronDown size={14} className={open ? 'rotate-180' : ''}/>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(criteria.criteria || []).map((c, i) => (
            <div key={i} className="bg-white rounded-lg border border-sky-100 px-3 py-2 text-xs text-slate-600 space-y-0.5">
              <p className="font-semibold text-slate-700">Critério #{c.criteria_id}</p>
              {c.min_discount >= 0 && <p>Desconto entre {c.min_discount}% e {c.max_discount}%</p>}
              {c.min_promo_stock >= 0 && <p>Estoque de campanha entre {c.min_promo_stock} e {c.max_promo_stock}</p>}
              {c.min_repetition_day >= 0 && <p>Intervalo mínimo entre participações: {c.min_repetition_day} dia(s)</p>}
              {c.must_not_pre_order && <p>Não pode ser pré-venda</p>}
              {c.need_lowest_price && <p>Precisa ser o menor preço dos últimos 30 dias</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemPickerWithPrice({ picks, setPicks, fetchActiveListings }) {
  const [items, setItems] = useState(null)
  const [search, setSearch] = useState('')
  useEffect(() => { fetchActiveListings().then(setItems).catch(() => setItems([])) }, []) // eslint-disable-line

  const filtered = (items || []).filter(i => !search.trim() || i.title?.toLowerCase().includes(search.trim().toLowerCase()))

  function toggle(it) {
    setPicks(p => p.some(x => x.item_id === it.item_id)
      ? p.filter(x => x.item_id !== it.item_id)
      : [...p, { item_id: it.item_id, title: it.title, thumbnail: it.thumbnail, original_price: it.price, promo_price: '', stock: '', purchase_limit: 0 }])
  }
  function setField(itemId, field, value) {
    setPicks(p => p.map(x => x.item_id === itemId ? { ...x, [field]: value } : x))
  }

  return (
    <div className="space-y-3">
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="relative p-2 border-b border-slate-100 bg-slate-50">
          <Search size={13} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar anúncio..."
            className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 focus:outline-none bg-white"/>
        </div>
        <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
          {items === null ? (
            <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin"/> Carregando anúncios...</div>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-400">Nenhum anúncio encontrado.</p>
          ) : filtered.map(it => (
            <button type="button" key={it.item_id} onClick={() => toggle(it)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left">
              {picks.some(x => x.item_id === it.item_id) ? <CheckSquare size={15} className="text-violet-600 shrink-0"/> : <Square size={15} className="text-slate-300 shrink-0"/>}
              {it.thumbnail ? <img src={it.thumbnail} alt="" className="w-7 h-7 rounded object-cover shrink-0"/> : <div className="w-7 h-7 rounded bg-slate-100 shrink-0"/>}
              <span className="text-xs text-slate-700 line-clamp-1 flex-1">{it.title}</span>
              <span className="text-[11px] text-slate-400 shrink-0">{fmtMoney(it.price)}</span>
            </button>
          ))}
        </div>
      </div>

      {picks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase">Preço e estoque da campanha</p>
          {picks.map(p => (
            <div key={p.item_id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 flex-wrap">
              <span className="text-xs text-slate-700 flex-1 min-w-[140px] line-clamp-1">{p.title}</span>
              <span className="text-[11px] text-slate-400">de {fmtMoney(p.original_price)}</span>
              <input type="number" placeholder="Preço promo" value={p.promo_price} onChange={e => setField(p.item_id, 'promo_price', e.target.value)}
                className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"/>
              <input type="number" placeholder="Estoque" value={p.stock} onChange={e => setField(p.item_id, 'stock', e.target.value)}
                className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"/>
              <button onClick={() => setPicks(ps => ps.filter(x => x.item_id !== p.item_id))} className="text-rose-400 hover:text-rose-600"><XIcon size={14}/></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CreateFlashSaleFlow({ onCancel, onCreated, fetchFlashSaleTimeSlots, createFlashSale, addFlashSaleItems, fetchActiveListings }) {
  const [slots, setSlots] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [flashSaleId, setFlashSaleId] = useState(null)
  const [picks, setPicks] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [creatingSale, setCreatingSale] = useState(false)
  const [submittingItems, setSubmittingItems] = useState(false)
  const [slotsError, setSlotsError] = useState(null)

  async function loadSlots() {
    setLoadingSlots(true)
    setSlotsError(null)
    try {
      const now = Math.floor(Date.now() / 1000)
      const res = await fetchFlashSaleTimeSlots(now, now + 7 * 86400)
      setSlots(res || [])
    } catch (err) {
      setSlotsError(err.message.includes('not_meet_shop_criteria')
        ? 'Essa loja ainda não atende aos critérios da Shopee pra criar Flash Sale de loja (costuma depender de reputação/tempo de conta) — não é um problema daqui, é uma regra da própria Shopee.'
        : err.message)
    } finally {
      setLoadingSlots(false)
    }
  }
  useEffect(() => { loadSlots() }, []) // eslint-disable-line

  async function pickSlot(slot) {
    setSelectedSlot(slot)
    setCreatingSale(true)
    try {
      const res = await createFlashSale(slot.timeslot_id)
      if (res.error) throw new Error(res.message || res.error)
      setFlashSaleId(res.response.flash_sale_id)
      toast.success('Flash Sale criada — agora escolha os produtos.')
    } catch (err) {
      toast.error('Erro ao criar Flash Sale: ' + err.message)
      setSelectedSlot(null)
    } finally {
      setCreatingSale(false)
    }
  }

  async function submitItems() {
    setSubmittingItems(true)
    try {
      const items = picks.map(p => ({ item_id: p.item_id, purchase_limit: Number(p.purchase_limit) || 0, item_input_promo_price: Number(p.promo_price), item_stock: Number(p.stock) }))
      const res = await addFlashSaleItems(flashSaleId, items)
      if (res.response?.failed_items?.length) {
        toast.error(`${res.response.failed_items.length} produto(s) não entraram — confira os critérios de elegibilidade`, { duration: 6000 })
      } else {
        toast.success('Produtos adicionados à Flash Sale!')
      }
      onCreated()
    } catch (err) {
      toast.error('Erro ao adicionar produtos: ' + err.message)
    } finally {
      setSubmittingItems(false)
    }
  }

  return (
    <div className="bg-white border-2 rounded-2xl p-5 space-y-4" style={{ borderColor: `${SHOPEE_ORANGE}60` }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">Nova Flash Sale</p>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><XIcon size={16}/></button>
      </div>

      {!flashSaleId ? (
        <>
          <p className="text-xs text-slate-500">Passo 1 — escolha um horário disponível nos próximos 7 dias</p>
          {loadingSlots ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center"><Loader2 size={16} className="animate-spin"/> Buscando horários...</div>
          ) : slotsError ? (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle size={15} className="mt-0.5 shrink-0"/> {slotsError}
            </div>
          ) : !slots?.length ? (
            <p className="text-sm text-slate-400 py-4 text-center">Nenhum horário disponível nos próximos 7 dias.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {slots.map(s => (
                <button key={s.timeslot_id} onClick={() => pickSlot(s)} disabled={creatingSale}
                  className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                    selectedSlot?.timeslot_id === s.timeslot_id ? 'text-white' : 'text-slate-600 bg-white border-slate-200 hover:border-orange-300'
                  }`}
                  style={selectedSlot?.timeslot_id === s.timeslot_id ? { background: SHOPEE_ORANGE, borderColor: SHOPEE_ORANGE } : {}}>
                  {fmtDateTime(s.start_time)}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500">Passo 2 — escolha os produtos e defina preço/estoque da campanha (Flash Sale #{flashSaleId})</p>
          <ItemPickerWithPrice picks={picks} setPicks={setPicks} fetchActiveListings={fetchActiveListings}/>
          <button onClick={submitItems} disabled={!picks.length || picks.some(p => !p.promo_price || !p.stock) || submittingItems}
            className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
            style={{ background: SHOPEE_ORANGE }}>
            {submittingItems ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} Adicionar {picks.length || ''} produto{picks.length !== 1 ? 's' : ''} à Flash Sale
          </button>
        </>
      )}
    </div>
  )
}

function FlashSaleItemsPanel({ flashSaleId, fetchFlashSaleItems, deleteFlashSaleItems, onChanged }) {
  const [data, setData] = useState(null)
  const [removing, setRemoving] = useState(null)

  const load = () => fetchFlashSaleItems(flashSaleId).then(setData).catch(() => setData({ item_info: [], models: [] }))
  useEffect(() => { load() }, []) // eslint-disable-line

  async function remove(itemId) {
    setRemoving(itemId)
    try {
      await deleteFlashSaleItems(flashSaleId, [itemId])
      toast.success('Produto removido da Flash Sale!')
      load()
      onChanged()
    } catch (err) {
      toast.error('Erro ao remover: ' + err.message)
    } finally {
      setRemoving(null)
    }
  }

  if (!data) return <div className="flex items-center gap-2 text-xs text-slate-400 py-4 justify-center"><Loader2 size={13} className="animate-spin"/> Carregando produtos...</div>
  const items = data.item_info || []
  if (!items.length) return <p className="text-xs text-slate-400 py-3 text-center">Nenhum produto nessa Flash Sale ainda.</p>

  return (
    <div className="space-y-1.5 py-2">
      {items.map(it => (
        <div key={it.item_id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
          {it.image ? <img src={it.image} alt="" className="w-8 h-8 rounded object-cover shrink-0"/> : <ImageOff size={16} className="text-slate-300 shrink-0"/>}
          <span className="text-xs text-slate-700 flex-1 line-clamp-1">{it.name}</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">
            {it.status === 1 ? 'Ativo' : it.status === 0 ? 'Desativado' : it.status === 2 ? 'Excluído' : 'Rejeitado'}
          </span>
          <button onClick={() => remove(it.item_id)} disabled={removing === it.item_id} className="text-rose-400 hover:text-rose-600 disabled:opacity-50">
            {removing === it.item_id ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
          </button>
        </div>
      ))}
    </div>
  )
}

function FlashSaleCard({ fs, fetchFlashSaleItems, deleteFlashSaleItems, updateFlashSaleStatus, deleteFlashSale, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // 'toggle' | 'delete' | null
  const [acting, setActing] = useState(false)
  const info = TYPE_INFO[fs.type] || { label: fs.type, bg: 'bg-slate-100', text: 'text-slate-500' }

  async function confirmAction() {
    setActing(true)
    try {
      if (pendingAction === 'toggle') {
        await updateFlashSaleStatus(fs.flash_sale_id, fs.status === 1 ? 2 : 1)
        toast.success(fs.status === 1 ? 'Flash Sale desativada!' : 'Flash Sale ativada!')
      } else {
        await deleteFlashSale(fs.flash_sale_id)
        toast.success('Flash Sale excluída!')
      }
      onChanged()
    } catch (err) {
      toast.error('Erro: ' + err.message)
    } finally {
      setActing(false)
      setPendingAction(null)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
            <Zap size={16} style={{ color: SHOPEE_ORANGE }}/>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Flash Sale #{fs.flash_sale_id}</p>
            <p className="text-xs text-slate-400">{fmtDateTime(fs.start_time)} – {fmtDateTime(fs.end_time)}</p>
          </div>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${info.bg} ${info.text}`}>{info.label}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div><p className="text-[10px] text-slate-400 uppercase font-semibold">Produtos</p><p className="text-sm font-bold text-slate-700">{fs.enabled_item_count ?? 0} / {fs.item_count ?? 0} ativos</p></div>
        <div><p className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1"><MousePointerClick size={10}/> Cliques</p><p className="text-sm font-bold text-slate-700">{fs.click_count ?? 0}</p></div>
        <div><p className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1"><Bell size={10}/> Lembretes</p><p className="text-sm font-bold text-slate-700">{fs.remindme_count ?? 0}</p></div>
        <div><p className="text-[10px] text-slate-400 uppercase font-semibold">Status interno</p><p className="text-sm font-bold text-slate-700">{fs.status === 1 ? 'Habilitada' : 'Desabilitada'}</p></div>
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-slate-100 flex-wrap">
        <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
          {expanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>} Produtos
        </button>
        {fs.type !== 3 && (
          <button onClick={() => setPendingAction('toggle')} className={`flex items-center gap-1 text-xs font-semibold ${fs.status === 1 ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'}`}>
            {fs.status === 1 ? <><Pause size={12}/> Desativar</> : <><Play size={12}/> Ativar</>}
          </button>
        )}
        <button onClick={() => setPendingAction('delete')} className="flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600">
          <Trash2 size={12}/> Excluir
        </button>
      </div>

      {expanded && (
        <FlashSaleItemsPanel flashSaleId={fs.flash_sale_id} fetchFlashSaleItems={fetchFlashSaleItems}
          deleteFlashSaleItems={deleteFlashSaleItems} onChanged={onChanged}/>
      )}

      <ConfirmWriteModal
        open={!!pendingAction}
        platform="Shopee"
        title={pendingAction === 'toggle' ? (fs.status === 1 ? 'Desativar Flash Sale' : 'Ativar Flash Sale') : 'Excluir Flash Sale'}
        confirmLabel="Sim, confirmar"
        description={pendingAction === 'delete' ? 'A Flash Sale e seus produtos serão removidos — essa ação não pode ser desfeita.' : 'Isso muda a visibilidade da campanha na Shopee agora mesmo.'}
        confirming={acting}
        onConfirm={confirmAction}
        onCancel={() => setPendingAction(null)}
        detail={<p className="text-sm text-slate-700">Flash Sale #{fs.flash_sale_id}</p>}
      />
    </div>
  )
}

export function ShopeeFlashSalePage() {
  const {
    loading, error, fetchFlashSaleList, fetchFlashSaleItemCriteria, fetchFlashSaleTimeSlots,
    createFlashSale, addFlashSaleItems, fetchFlashSaleItems, deleteFlashSaleItems,
    updateFlashSaleStatus, deleteFlashSale, fetchActiveListings,
  } = useShopeeInsights()
  const [sales, setSales] = useState(null)
  const [filter, setFilter] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [criteria, setCriteria] = useState(null)

  async function load() {
    try {
      const { list } = await fetchFlashSaleList(0, 0, 50)
      setSales(list || [])
    } catch { /* erro já fica em `error` do hook */ }
  }
  useEffect(() => {
    load()
    fetchFlashSaleItemCriteria().then(setCriteria).catch(() => {})
  }, []) // eslint-disable-line

  const counts = useMemo(() => {
    if (!sales) return null
    return { 1: sales.filter(s => s.type === 1).length, 2: sales.filter(s => s.type === 2).length, 3: sales.filter(s => s.type === 3).length }
  }, [sales])

  const filtered = (sales || []).filter(s => filter === 0 || s.type === filter).sort((a, b) => a.start_time - b.start_time)

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1100px] mx-auto space-y-6">

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: `linear-gradient(135deg, ${SHOPEE_ORANGE}, #D6431F)`, boxShadow: `0 2px 10px ${SHOPEE_ORANGE}40` }}>
              <Zap size={22} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Flash Sale da Shopee</h1>
              <p className="text-sm text-slate-500">Criar e gerenciar campanhas relâmpago de loja, com produtos, preço e estoque de campanha</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 hover:border-orange-300 text-slate-600 text-sm font-medium rounded-xl disabled:opacity-50 transition-colors">
              {loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
            </button>
            <button onClick={() => setShowCreate(s => !s)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-white text-sm font-medium rounded-xl transition-colors"
              style={{ background: SHOPEE_ORANGE }}>
              <Plus size={15}/> Criar Flash Sale
            </button>
          </div>
        </div>

        <CriteriaPanel criteria={criteria}/>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {showCreate && (
          <CreateFlashSaleFlow
            fetchFlashSaleTimeSlots={fetchFlashSaleTimeSlots} createFlashSale={createFlashSale}
            addFlashSaleItems={addFlashSaleItems} fetchActiveListings={fetchActiveListings}
            onCancel={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); load() }}
          />
        )}

        {counts && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-amber-200 rounded-2xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Agendadas</p><p className="text-2xl font-bold text-amber-600">{counts[1]}</p></div>
            <div className="bg-white border border-emerald-200 rounded-2xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Em andamento</p><p className="text-2xl font-bold text-emerald-600">{counts[2]}</p></div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Expiradas</p><p className="text-2xl font-bold text-slate-500">{counts[3]}</p></div>
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
              style={filter === f.key ? { background: SHOPEE_ORANGE, borderColor: SHOPEE_ORANGE, color: '#fff' } : { background: '#fff', borderColor: '#E2E8F0', color: '#475569' }}>
              {f.label}
            </button>
          ))}
        </div>

        {sales === null ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-10 justify-center"><Loader2 size={16} className="animate-spin"/> Buscando Flash Sales...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <Zap size={28} className="text-slate-300 mx-auto mb-3"/>
            <p className="text-sm text-slate-500">Nenhuma Flash Sale encontrada.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(fs => (
              <FlashSaleCard key={fs.flash_sale_id} fs={fs}
                fetchFlashSaleItems={fetchFlashSaleItems} deleteFlashSaleItems={deleteFlashSaleItems}
                updateFlashSaleStatus={updateFlashSaleStatus} deleteFlashSale={deleteFlashSale} onChanged={load}/>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
