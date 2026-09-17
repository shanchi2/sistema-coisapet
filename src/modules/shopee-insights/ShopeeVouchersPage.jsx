import { useEffect, useMemo, useState } from 'react'
import {
  Ticket, Loader2, AlertTriangle, RefreshCw, Plus, Percent, DollarSign, Trash2, Pencil,
  Square, CheckSquare, Search, X as XIcon, Save, StopCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useShopeeInsights } from './hooks/useShopeeInsights'
import { ConfirmWriteModal } from '../ml-insights/ConfirmWriteModal'

const SHOPEE_ORANGE = '#EE4D2D'

function fmtMoney(v) {
  if (v == null || Number.isNaN(v)) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(sec) {
  if (!sec) return '—'
  return new Date(sec * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function toEpoch(datetimeLocal) {
  return Math.floor(new Date(datetimeLocal).getTime() / 1000)
}
function toDatetimeLocal(sec) {
  if (!sec) return ''
  const d = new Date(sec * 1000)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function voucherStatus(v) {
  const now = Math.floor(Date.now() / 1000)
  if (now < v.start_time) return 'upcoming'
  if (now > v.end_time) return 'expired'
  return 'ongoing'
}
const STATUS_INFO = {
  ongoing:  { label: 'Em andamento', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  upcoming: { label: 'Agendado',     bg: 'bg-amber-100',   text: 'text-amber-700' },
  expired:  { label: 'Expirado',     bg: 'bg-slate-100',   text: 'text-slate-500' },
}
const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'ongoing', label: 'Em andamento' },
  { key: 'upcoming', label: 'Agendados' },
  { key: 'expired', label: 'Expirados' },
]

const emptyForm = () => ({
  voucher_name: '', voucher_code: '', voucher_type: 1, reward_type: 2,
  percentage: 20, discount_amount: '', max_price: '', min_basket_price: '',
  usage_quantity: 100, start_time: '', end_time: '', item_id_list: [],
})

function ItemPicker({ selected, onChange, fetchActiveListings }) {
  const [items, setItems] = useState(null)
  const [search, setSearch] = useState('')
  useEffect(() => { fetchActiveListings().then(setItems).catch(() => setItems([])) }, []) // eslint-disable-line

  const filtered = (items || []).filter(i => !search.trim() || i.title?.toLowerCase().includes(search.trim().toLowerCase()))

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }

  return (
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
          <button type="button" key={it.item_id} onClick={() => toggle(it.item_id)}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left">
            {selected.includes(it.item_id) ? <CheckSquare size={15} className="text-violet-600 shrink-0"/> : <Square size={15} className="text-slate-300 shrink-0"/>}
            {it.thumbnail && <img src={it.thumbnail} alt="" className="w-7 h-7 rounded object-cover shrink-0"/>}
            <span className="text-xs text-slate-700 line-clamp-1">{it.title}</span>
          </button>
        ))}
      </div>
      {selected.length > 0 && <p className="text-[11px] text-slate-400 px-3 py-1.5 bg-slate-50 border-t border-slate-100">{selected.length} selecionado{selected.length > 1 ? 's' : ''}</p>}
    </div>
  )
}

function CreateVoucherForm({ onCancel, onCreated, createVoucher, fetchActiveListings }) {
  const [form, setForm] = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const codeValid = /^[A-Za-z0-9]{1,5}$/.test(form.voucher_code)
  const canSubmit = form.voucher_name.trim() && codeValid && form.start_time && form.end_time
    && form.min_basket_price !== '' && form.usage_quantity
    && (form.reward_type === 2 ? form.percentage : form.discount_amount)
    && (form.voucher_type === 1 || form.item_id_list.length > 0)

  async function submit() {
    setSubmitting(true)
    try {
      const payload = {
        voucher_name: form.voucher_name.trim(),
        voucher_code: form.voucher_code.toUpperCase(),
        voucher_type: form.voucher_type,
        reward_type: form.reward_type,
        min_basket_price: Number(form.min_basket_price),
        usage_quantity: Number(form.usage_quantity),
        start_time: toEpoch(form.start_time),
        end_time: toEpoch(form.end_time),
        display_channel_list: [1],
      }
      if (form.reward_type === 2) {
        payload.percentage = Number(form.percentage)
        if (form.max_price !== '') payload.max_price = Number(form.max_price)
      } else {
        payload.discount_amount = Number(form.discount_amount)
      }
      if (form.voucher_type === 2) payload.item_id_list = form.item_id_list

      const res = await createVoucher(payload)
      if (res.error) throw new Error(res.message || res.error)
      toast.success('Cupom criado na Shopee!')
      onCreated()
    } catch (err) {
      toast.error('Erro ao criar cupom: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white border-2 rounded-2xl p-5 space-y-4" style={{ borderColor: `${SHOPEE_ORANGE}60` }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">Novo cupom</p>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><XIcon size={16}/></button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Nome do cupom</label>
          <input type="text" value={form.voucher_name} onChange={e => set('voucher_name', e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"/>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Código (até 5 letras/números)</label>
          <input type="text" value={form.voucher_code} maxLength={5} onChange={e => set('voucher_code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none ${form.voucher_code && !codeValid ? 'border-rose-300' : 'border-slate-200'}`}/>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Aplica em</label>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => set('voucher_type', 1)}
              className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg border ${form.voucher_type === 1 ? 'text-white' : 'text-slate-600 bg-white border-slate-200'}`}
              style={form.voucher_type === 1 ? { background: SHOPEE_ORANGE, borderColor: SHOPEE_ORANGE } : {}}>
              Loja toda
            </button>
            <button type="button" onClick={() => set('voucher_type', 2)}
              className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg border ${form.voucher_type === 2 ? 'text-white' : 'text-slate-600 bg-white border-slate-200'}`}
              style={form.voucher_type === 2 ? { background: SHOPEE_ORANGE, borderColor: SHOPEE_ORANGE } : {}}>
              Produtos específicos
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Tipo de desconto</label>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => set('reward_type', 2)}
              className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium px-3 py-2 rounded-lg border ${form.reward_type === 2 ? 'text-white' : 'text-slate-600 bg-white border-slate-200'}`}
              style={form.reward_type === 2 ? { background: SHOPEE_ORANGE, borderColor: SHOPEE_ORANGE } : {}}>
              <Percent size={12}/> Percentual
            </button>
            <button type="button" onClick={() => set('reward_type', 1)}
              className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium px-3 py-2 rounded-lg border ${form.reward_type === 1 ? 'text-white' : 'text-slate-600 bg-white border-slate-200'}`}
              style={form.reward_type === 1 ? { background: SHOPEE_ORANGE, borderColor: SHOPEE_ORANGE } : {}}>
              <DollarSign size={12}/> Valor fixo
            </button>
          </div>
        </div>
      </div>

      {form.voucher_type === 2 && (
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Produtos participantes</label>
          <ItemPicker selected={form.item_id_list} onChange={v => set('item_id_list', v)} fetchActiveListings={fetchActiveListings}/>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {form.reward_type === 2 ? (
          <>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Desconto (%)</label>
              <input type="number" value={form.percentage} onChange={e => set('percentage', e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"/>
              <p className="text-[10px] text-slate-400 mt-0.5">Shopee costuma exigir ≥20% em cupom de loja</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Desconto máximo (R$)</label>
              <input type="number" value={form.max_price} onChange={e => set('max_price', e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"/>
            </div>
          </>
        ) : (
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Valor do desconto (R$)</label>
            <input type="number" value={form.discount_amount} onChange={e => set('discount_amount', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"/>
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Compra mínima (R$)</label>
          <input type="number" value={form.min_basket_price} onChange={e => set('min_basket_price', e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"/>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Qtd. de usos</label>
          <input type="number" value={form.usage_quantity} onChange={e => set('usage_quantity', e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"/>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Início</label>
          <input type="datetime-local" value={form.start_time} onChange={e => set('start_time', e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"/>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Fim</label>
          <input type="datetime-local" value={form.end_time} onChange={e => set('end_time', e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"/>
        </div>
      </div>

      <button onClick={submit} disabled={!canSubmit || submitting}
        className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
        style={{ background: SHOPEE_ORANGE }}>
        {submitting ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} Criar cupom na Shopee
      </button>
    </div>
  )
}

function EditVoucherForm({ voucher, onCancel, onSaved, updateVoucher }) {
  const [name, setName] = useState(voucher.voucher_name)
  const [endTime, setEndTime] = useState(toDatetimeLocal(voucher.end_time))
  const [usageQty, setUsageQty] = useState(voucher.usage_quantity)
  const [minBasket, setMinBasket] = useState(voucher.min_basket_price)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    try {
      const res = await updateVoucher({
        voucher_id: voucher.voucher_id, voucher_name: name.trim(),
        end_time: toEpoch(endTime), usage_quantity: Number(usageQty), min_basket_price: Number(minBasket),
      })
      if (res.error) throw new Error(res.message || res.error)
      toast.success('Cupom atualizado na Shopee!')
      onSaved()
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Nome</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none"/>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Fim</label>
          <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none"/>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Qtd. de usos</label>
          <input type="number" value={usageQty} onChange={e => setUsageQty(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none"/>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Compra mínima (R$)</label>
          <input type="number" value={minBasket} onChange={e => setMinBasket(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none"/>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={submitting} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg disabled:opacity-50">
          {submitting ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Salvar
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg">Cancelar</button>
      </div>
    </div>
  )
}

function VoucherCard({ voucher, onChanged, updateVoucher, endVoucher, deleteVoucher }) {
  const [editing, setEditing] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // 'end' | 'delete' | null
  const [acting, setActing] = useState(false)
  const status = voucherStatus(voucher)
  const st = STATUS_INFO[status]
  const isPercentage = voucher.reward_type === 2
  const usedPct = voucher.usage_quantity > 0 ? Math.min(100, Math.round((voucher.current_usage / voucher.usage_quantity) * 100)) : 0

  async function confirmAction() {
    setActing(true)
    try {
      if (pendingAction === 'end') {
        await endVoucher(voucher.voucher_id)
        toast.success('Cupom encerrado!')
      } else {
        await deleteVoucher(voucher.voucher_id)
        toast.success('Cupom excluído!')
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
            {isPercentage ? <Percent size={16} style={{ color: SHOPEE_ORANGE }}/> : <DollarSign size={16} style={{ color: SHOPEE_ORANGE }}/>}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{voucher.voucher_name}</p>
            <p className="text-xs text-slate-400">{voucher.voucher_code} · {voucher.voucher_type === 1 ? 'Loja toda' : 'Produtos específicos'}</p>
          </div>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${st.bg} ${st.text}`}>{st.label}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Desconto</p>
          <p className="text-sm font-bold text-slate-700">{isPercentage ? `${voucher.percentage}%` : fmtMoney(voucher.discount_amount)}</p>
          {isPercentage && voucher.max_price != null && <p className="text-[10px] text-slate-400">até {fmtMoney(voucher.max_price)}</p>}
        </div>
        <div><p className="text-[10px] text-slate-400 uppercase font-semibold">Compra mínima</p><p className="text-sm font-bold text-slate-700">{fmtMoney(voucher.min_basket_price)}</p></div>
        <div><p className="text-[10px] text-slate-400 uppercase font-semibold">Início</p><p className="text-xs font-semibold text-slate-700">{fmtDate(voucher.start_time)}</p></div>
        <div><p className="text-[10px] text-slate-400 uppercase font-semibold">Fim</p><p className="text-xs font-semibold text-slate-700">{fmtDate(voucher.end_time)}</p></div>
      </div>

      <div className="flex-1 min-w-[160px] mb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Uso</p>
          <p className="text-[11px] font-bold text-slate-600">{voucher.current_usage ?? 0} de {voucher.usage_quantity}</p>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${usedPct}%`, background: SHOPEE_ORANGE }}/>
        </div>
      </div>

      {editing ? (
        <EditVoucherForm voucher={voucher} onCancel={() => setEditing(false)} updateVoucher={updateVoucher}
          onSaved={() => { setEditing(false); onChanged() }}/>
      ) : (
        <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
            <Pencil size={12}/> Editar
          </button>
          {status === 'ongoing' && (
            <button onClick={() => setPendingAction('end')} className="flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700">
              <StopCircle size={12}/> Encerrar agora
            </button>
          )}
          {status === 'upcoming' && (voucher.current_usage ?? 0) === 0 && (
            <button onClick={() => setPendingAction('delete')} className="flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600">
              <Trash2 size={12}/> Excluir
            </button>
          )}
        </div>
      )}

      <ConfirmWriteModal
        open={!!pendingAction}
        platform="Shopee"
        title={pendingAction === 'end' ? 'Encerrar cupom' : 'Excluir cupom'}
        confirmLabel={pendingAction === 'end' ? 'Sim, encerrar' : 'Sim, excluir'}
        description={pendingAction === 'end' ? 'O cupom para de funcionar imediatamente, antes da data agendada.' : 'O cupom será removido — essa ação não pode ser desfeita.'}
        confirming={acting}
        onConfirm={confirmAction}
        onCancel={() => setPendingAction(null)}
        detail={<p className="text-sm text-slate-700">{voucher.voucher_name} ({voucher.voucher_code})</p>}
      />
    </div>
  )
}

export function ShopeeVouchersPage() {
  const {
    loading, error, fetchVoucherList, createVoucher, updateVoucher, endVoucher, deleteVoucher, fetchActiveListings,
  } = useShopeeInsights()
  const [vouchers, setVouchers] = useState(null)
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    try {
      const { list } = await fetchVoucherList('all')
      setVouchers(list || [])
    } catch { /* erro já fica em `error` do hook */ }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const counts = useMemo(() => {
    if (!vouchers) return null
    const byStatus = { ongoing: 0, upcoming: 0, expired: 0 }
    vouchers.forEach(v => { byStatus[voucherStatus(v)]++ })
    return byStatus
  }, [vouchers])

  const filtered = (vouchers || []).filter(v => filter === 'all' || voucherStatus(v) === filter)
    .sort((a, b) => a.start_time - b.start_time)

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-[1100px] mx-auto space-y-6">

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: `linear-gradient(135deg, ${SHOPEE_ORANGE}, #D6431F)`, boxShadow: `0 2px 10px ${SHOPEE_ORANGE}40` }}>
              <Ticket size={22} strokeWidth={1.5} className="text-white"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Cupons da Shopee</h1>
              <p className="text-sm text-slate-500">Criar, editar, encerrar e excluir cupons direto pela API — controle total, sem depender do Seller Center</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 hover:border-orange-300 text-slate-600 text-sm font-medium rounded-xl disabled:opacity-50 transition-colors">
              {loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
            </button>
            <button onClick={() => setShowCreate(s => !s)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-white text-sm font-medium rounded-xl transition-colors"
              style={{ background: SHOPEE_ORANGE }}>
              <Plus size={15}/> Criar cupom
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15}/> {error}
          </div>
        )}

        {showCreate && (
          <CreateVoucherForm
            createVoucher={createVoucher}
            fetchActiveListings={fetchActiveListings}
            onCancel={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); load() }}
          />
        )}

        {counts && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-emerald-200 rounded-2xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Em andamento</p><p className="text-2xl font-bold text-emerald-600">{counts.ongoing}</p></div>
            <div className="bg-white border border-amber-200 rounded-2xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Agendados</p><p className="text-2xl font-bold text-amber-600">{counts.upcoming}</p></div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Expirados</p><p className="text-2xl font-bold text-slate-500">{counts.expired}</p></div>
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

        {vouchers === null ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-10 justify-center"><Loader2 size={16} className="animate-spin"/> Buscando cupons...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <Ticket size={28} className="text-slate-300 mx-auto mb-3"/>
            <p className="text-sm text-slate-500">Nenhum cupom encontrado.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(v => (
              <VoucherCard key={v.voucher_id} voucher={v} onChanged={load}
                updateVoucher={updateVoucher} endVoucher={endVoucher} deleteVoucher={deleteVoucher}/>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
