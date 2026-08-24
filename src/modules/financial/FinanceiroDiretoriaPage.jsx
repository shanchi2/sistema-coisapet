import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, Lock, DollarSign, CheckCircle2, Clock,
  AlertTriangle, Pencil, Trash2, X, Check, Loader2,
  ChevronDown, ChevronUp, Eye, EyeOff, Users,
  Building2, Briefcase, Scale, Calculator, MoreHorizontal,
  FileText, Upload,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal }    from '../../components/ui/Modal'
import toast        from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────
function fmtCurrency(v) { return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(d)     { if (!d) return '—'; return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') }
function getSession()   { try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} } }
function daysUntil(dateStr) {
  const t = new Date(); t.setHours(0,0,0,0)
  return Math.round((new Date(dateStr + 'T00:00:00') - t) / 86400000)
}

// ── Categorias ────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'salario',       label: 'Salário',         icon: Users,       color: '#6366f1', bg: 'bg-indigo-50'  },
  { value: 'prestador',     label: 'Prestador',       icon: Briefcase,   color: '#f59e0b', bg: 'bg-amber-50'   },
  { value: 'contabilidade', label: 'Contabilidade',   icon: Calculator,  color: '#0ea5e9', bg: 'bg-sky-50'     },
  { value: 'advocacia',     label: 'Advocacia',       icon: Scale,       color: '#8b5cf6', bg: 'bg-violet-50'  },
  { value: 'escritorio',    label: 'Escritório',      icon: Scale,       color: '#7c3aed', bg: 'bg-violet-50'  },
  { value: 'socio',         label: 'Sócio / Pró-labore', icon: DollarSign, color: '#10b981', bg: 'bg-emerald-50'},
  { value: 'outros',        label: 'Outros',          icon: MoreHorizontal, color: '#64748b', bg: 'bg-slate-50'},
]
function getCat(v) { return CATEGORIES.find(c => c.value === v) ?? CATEGORIES[CATEGORIES.length-1] }

// ── Modal de lançamento ───────────────────────────────────────────
const EMPTY_ENTRY = {
  description: '', amount: '', due_date: '', status: 'pendente',
  category: 'salario', paid_at: '', paid_amount: '', notes: '', recurrent: false,
  recipient_name: '', recipient_pix: '', recipient_bank: '', receipt_url: '',
}

function EntryModal({ open, onClose, onSave, initial, loading }) {
  const [form, setForm] = useState(EMPTY_ENTRY)
  useEffect(() => {
    if (!open) return
    setForm(initial ? {
      description: initial.description ?? '',
      amount:      initial.amount ? String(initial.amount) : '',
      due_date:    initial.due_date ?? '',
      status:      initial.status ?? 'pendente',
      category:    initial.category ?? 'salario',
      paid_at:        initial.paid_at ?? '',
      paid_amount:    initial.paid_amount ? String(initial.paid_amount) : '',
      notes:          initial.notes ?? '',
      recurrent:      initial.recurrent ?? false,
      recipient_name: initial.recipient_name ?? '',
      recipient_pix:  initial.recipient_pix  ?? '',
      recipient_bank: initial.recipient_bank ?? '',
      receipt_url:    initial.receipt_url    ?? '',
    } : EMPTY_ENTRY)
  }, [open, initial])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <Modal open={open} onClose={onClose} size="md"
      title={initial ? 'Editar lançamento' : 'Novo lançamento confidencial'}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>Cancelar</button>
          <button onClick={() => onSave(form)} className="btn-primary" disabled={loading || !form.description.trim() || !form.amount || !form.due_date}>
            {loading ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>}
            {initial ? 'Salvar' : 'Lançar'}
          </button>
        </>
      }>
      <div className="flex flex-col gap-4">
        {/* Categoria */}
        <div>
          <label className="form-label">Categoria</label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon
              return (
                <button key={cat.value} type="button" onClick={() => set('category', cat.value)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-xs font-semibold transition-all
                    ${form.category === cat.value ? `${cat.bg} border-current` : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}
                  style={form.category === cat.value ? { color: cat.color } : {}}>
                  <Icon size={13} className="shrink-0"/> {cat.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Descrição */}
        <div>
          <label className="form-label">Descrição *</label>
          <input className="input" value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Ex: Salário - João Vitor - Maio/2026"/>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Valor (R$) *</label>
            <input className="input" type="number" step="0.01" min="0" value={form.amount}
              onChange={e => set('amount', e.target.value)} placeholder="0,00"/>
          </div>
          <div>
            <label className="form-label">Vencimento *</label>
            <input className="input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}/>
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="form-label">Status</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v:'pendente',   label:'Pendente',   cls:'border-amber-300 bg-amber-50 text-amber-700'  },
              { v:'pago',       label:'Pago',        cls:'border-emerald-300 bg-emerald-50 text-emerald-700'},
              { v:'cancelado',  label:'Cancelado',   cls:'border-slate-300 bg-slate-100 text-slate-500' },
            ].map(s => (
              <button key={s.v} type="button" onClick={() => set('status', s.v)}
                className={`p-2 rounded-xl border-2 text-xs font-semibold transition-all
                  ${form.status === s.v ? s.cls : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Campos de pagamento se pago */}
        {form.status === 'pago' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Data do pagamento</label>
              <input className="input" type="date" value={form.paid_at} onChange={e => set('paid_at', e.target.value)}/>
            </div>
            <div>
              <label className="form-label">Valor pago (R$)</label>
              <input className="input" type="number" step="0.01" min="0" value={form.paid_amount}
                onChange={e => set('paid_amount', e.target.value)} placeholder="0,00"/>
            </div>
          </div>
        )}

        {/* Dados do recebedor */}
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Dados do recebedor</p>
          <div>
            <label className="form-label">Nome / Razão social</label>
            <input className="input" value={form.recipient_name} onChange={e => set('recipient_name', e.target.value)}
              placeholder="Ex: João Vitor Matsunaga"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">PIX (chave)</label>
              <input className="input" value={form.recipient_pix} onChange={e => set('recipient_pix', e.target.value)}
                placeholder="CPF, e-mail, telefone ou aleatória"/>
            </div>
            <div>
              <label className="form-label">Banco / Conta</label>
              <input className="input" value={form.recipient_bank} onChange={e => set('recipient_bank', e.target.value)}
                placeholder="Ex: Nubank — Ag 0001 / CC 123456-7"/>
            </div>
          </div>
        </div>

        {/* Comprovante */}
        {form.status === 'pago' && (
          <div>
            <label className="form-label">Comprovante de pagamento</label>
            {form.receipt_url ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => window.open(form.receipt_url, '_blank')}
                  className="flex items-center gap-1.5 text-xs font-bold text-sky-500 hover:text-sky-600 px-3 py-2 rounded-xl border border-sky-200 hover:bg-sky-50">
                  <FileText size={13}/> Ver comprovante
                </button>
                <button type="button" onClick={() => set('receipt_url', '')}
                  className="text-xs text-slate-400 hover:text-rose-500">remover</button>
              </div>
            ) : (
              <label className="flex items-center gap-2 p-3 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors">
                <Upload size={15} className="text-slate-400 shrink-0"/>
                <span className="text-sm text-slate-500 font-semibold">Anexar comprovante (PDF ou imagem)</span>
                <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => {
                  const file = e.target.files[0]
                  if (!file) return
                  // Armazena temporariamente como objeto File para upload no handleSave
                  set('receipt_file', file)
                  set('receipt_url', URL.createObjectURL(file))
                }}/>
              </label>
            )}
          </div>
        )}

        {/* Recorrente */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => set('recurrent', !form.recurrent)}
            className={`w-11 h-6 rounded-full transition-all relative ${form.recurrent ? 'bg-indigo-500' : 'bg-slate-200'}`}>
            <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${form.recurrent ? 'left-5' : 'left-0.5'}`}/>
          </button>
          <span className={`text-sm font-semibold ${form.recurrent ? 'text-indigo-600' : 'text-slate-400'}`}>
            Lançamento recorrente (mensal)
          </span>
        </div>

        {/* Notas */}
        <div>
          <label className="form-label">Observações</label>
          <textarea className="textarea resize-none" rows={2} value={form.notes}
            onChange={e => set('notes', e.target.value)} placeholder="Informações adicionais..."/>
        </div>
      </div>
    </Modal>
  )
}

// ── EntryRow ──────────────────────────────────────────────────────
function EntryRow({ entry, onEdit, onDelete, onPay }) {
  const cat   = getCat(entry.category)
  const Icon  = cat.icon
  const delta = daysUntil(entry.due_date)
  const isPago = entry.status === 'pago'
  const isCanc = entry.status === 'cancelado'

  const statusBadge = isPago
    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ Pago</span>
    : isCanc
      ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Cancelado</span>
      : delta < 0
        ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">Vencido {Math.abs(delta)}d</span>
        : delta === 0
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Vence hoje</span>
          : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Vence em {delta}d</span>

  return (
    <tr className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isPago||isCanc ? 'opacity-60' : ''}`}>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cat.bg}`}>
            <Icon size={12} style={{ color: cat.color }}/>
          </div>
          <div>
            <p className={`text-sm font-semibold text-slate-800 ${isPago ? 'line-through text-slate-400' : ''}`}>{entry.description}</p>
            {entry.notes && <p className="text-xs text-slate-400 truncate max-w-[200px]">{entry.notes}</p>}
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        {entry.recipient_name
          ? <div>
              <p className="text-xs font-semibold text-slate-700">{entry.recipient_name}</p>
              {entry.recipient_pix && <p className="text-[10px] text-slate-400">PIX: {entry.recipient_pix}</p>}
            </div>
          : <span className="text-xs text-slate-300">—</span>
        }
      </td>
      <td className="py-3 px-4 text-sm text-slate-500">{fmtDate(entry.due_date)}</td>
      <td className="py-3 px-4">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cat.bg}`} style={{ color: cat.color }}>
          {cat.label}
        </span>
      </td>
      <td className="py-3 px-4 text-sm font-bold text-slate-800">{fmtCurrency(entry.amount)}</td>
      <td className="py-3 px-4">{statusBadge}</td>
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-1">
          {!isPago && !isCanc && (
            <button onClick={() => onPay(entry)}
              className="px-2 py-1 rounded-lg text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 transition-colors">
              ✓ Pagar
            </button>
          )}
          {isPago && entry.receipt_url && (
            <button onClick={() => window.open(entry.receipt_url, '_blank')}
              className="px-2 py-1 rounded-lg text-[10px] font-bold text-sky-500 hover:bg-sky-50 transition-colors flex items-center gap-1">
              <FileText size={11}/> Comprovante
            </button>
          )}
          <button onClick={() => onEdit(entry)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <Pencil size={13}/>
          </button>
          <button onClick={() => onDelete(entry.id)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
            <Trash2 size={13}/>
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Componente principal ──────────────────────────────────────────
export function FinanceiroDiretoriaPage() {
  const [entries,     setEntries]     = useState([])
  const [bills,       setBills]       = useState([]) // espelho do financeiro normal
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [modal,       setModal]       = useState(false)
  const [editing,     setEditing]     = useState(null)
  const [delTarget,   setDelTarget]   = useState(null)
  const [search,      setSearch]      = useState('')
  const [catFilter,   setCatFilter]   = useState('')
  const [showBills,   setShowBills]   = useState(true)
  const [showPaid,    setShowPaid]    = useState(false)
  const [masked,      setMasked]      = useState(true) // ocultar valores

  const load = useCallback(async () => {
    setLoading(true)
    const [entR, billR] = await Promise.all([
      supabase.from('director_entries').select('*').order('due_date', { ascending: true }),
      supabase.from('bills').select('id,description,amount,due_date,status,notes')
        .not('status', 'eq', 'cancelado').order('due_date', { ascending: true }),
    ])
    setEntries(entR.data ?? [])
    setBills(billR.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // KPIs
  const totalConfidencial  = entries.filter(e => e.status !== 'cancelado').reduce((s, e) => s + Number(e.amount), 0)
  const totalNormal        = bills.filter(b => b.status !== 'cancelado').reduce((s, b) => s + Number(b.amount), 0)
  const totalGeral         = totalConfidencial + totalNormal
  const pendentesConf      = entries.filter(e => e.status === 'pendente')
  const pagosConf          = entries.filter(e => e.status === 'pago')
  const totalPagoConf      = pagosConf.reduce((s, e) => s + Number(e.paid_amount || e.amount), 0)
  const totalPagoNormal    = bills.filter(b => b.status === 'pago').reduce((s, b) => s + Number(b.amount), 0)
  const totalPago          = totalPagoConf + totalPagoNormal
  const totalPendente      = totalGeral - totalPago

  const mv = masked ? '••••••' : null

  // Lançamentos agrupados por colaborador
  const byEmployee = entries.reduce((acc, e) => {
    const key = e.employee_id ?? '__avulso__'
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})

  // Filtra entradas confidenciais
  const filtered = entries.filter(e => {
    if (catFilter && e.category !== catFilter) return false
    if (search && !e.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const ativas = filtered.filter(e => e.status !== 'pago' && e.status !== 'cancelado')
  const pagas  = filtered.filter(e => e.status === 'pago')

  async function handleSave(form) {
    setSaving(true)
    try {
      const uid = getSession().id

      // Upload comprovante se tiver arquivo novo
      let receiptUrl = form.receipt_url || null
      if (form.receipt_file) {
        const id  = editing?.id ?? 'new_' + Date.now()
        const ext = form.receipt_file.name.split('.').pop()
        const path = `comprovantes/${id}/comprovante.${ext}`
        await supabase.storage.from('employee-docs').remove([path])
        const { error: upErr } = await supabase.storage.from('employee-docs').upload(path, form.receipt_file)
        if (!upErr) {
          const { data } = await supabase.storage.from('employee-docs').createSignedUrl(path, 60*60*24*365)
          receiptUrl = data?.signedUrl ?? receiptUrl
        }
      }

      const payload = {
        description:    form.description.trim(),
        amount:         parseFloat(form.amount),
        due_date:       form.due_date,
        status:         form.status,
        category:       form.category,
        paid_at:        form.paid_at || null,
        paid_amount:    form.paid_amount ? parseFloat(form.paid_amount) : null,
        notes:          form.notes || null,
        recurrent:      form.recurrent,
        recipient_name: form.recipient_name || null,
        recipient_pix:  form.recipient_pix  || null,
        recipient_bank: form.recipient_bank || null,
        receipt_url:    receiptUrl,
        updated_at:     new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from('director_entries').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Lançamento atualizado!')
      } else {
        const { error } = await supabase.from('director_entries').insert({ ...payload, created_by: uid })
        if (error) throw error
        toast.success('Lançamento criado!')
      }
      setModal(false); setEditing(null); load()
    } catch (e) { toast.error('Erro ao salvar: ' + e.message) }
    finally { setSaving(false) }
  }

  async function handlePay(entry) {
    // Abre o modal de edição com status=pago para preencher comprovante
    setEditing({ ...entry, status: 'pago', paid_at: new Date().toISOString().split('T')[0], paid_amount: entry.amount })
    setModal(true)
  }

  async function handleDelete(id) {
    await supabase.from('director_entries').delete().eq('id', id)
    toast.success('Lançamento removido.')
    setDelTarget(null); load()
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Lock size={16} className="text-rose-500"/>
            <h2 style={{ fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:'22px', color:'#1e293b', letterSpacing:'-.5px' }}>
              Financeiro — Diretoria
            </h2>
          </div>
          <p className="text-sm text-slate-400">Lançamentos confidenciais + consolidado geral</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMasked(m => !m)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all
              ${masked ? 'bg-slate-800 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {masked ? <EyeOff size={13}/> : <Eye size={13}/>}
            {masked ? 'Revelar valores' : 'Ocultar valores'}
          </button>
          <button onClick={() => { setEditing(null); setModal(true) }}
            className="btn-primary flex items-center gap-1.5">
            <Plus size={14}/> Novo lançamento
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Total Geral</p>
          <p className="text-2xl font-black text-slate-800">{mv ?? fmtCurrency(totalGeral)}</p>
          <p className="text-xs text-slate-400 mt-1">Conf. + Financeiro</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">A Pagar</p>
          <p className="text-2xl font-black text-rose-600">{mv ?? fmtCurrency(totalPendente)}</p>
          <p className="text-xs text-slate-400 mt-1">{pendentesConf.length} conf. pendentes</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Pago</p>
          <p className="text-2xl font-black text-emerald-600">{mv ?? fmtCurrency(totalPago)}</p>
          <p className="text-xs text-slate-400 mt-1">Conf. + Financeiro</p>
        </div>
        <div className="card p-5 bg-gradient-to-br from-rose-50 to-white border-rose-100">
          <p className="text-xs font-bold text-rose-400 uppercase tracking-wide mb-1">Lançamentos Conf.</p>
          <p className="text-2xl font-black text-rose-700">{mv ?? fmtCurrency(totalConfidencial)}</p>
          <p className="text-xs text-rose-400 mt-1">{entries.length} lançamento(s)</p>
        </div>
      </div>

      {/* Barra de distribuição */}
      {!masked && totalGeral > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Distribuição do total</p>
            <p className="text-xs text-slate-400">Total: {fmtCurrency(totalGeral)}</p>
          </div>
          <div className="h-4 rounded-full overflow-hidden bg-slate-100 flex">
            <div className="h-full bg-rose-400 transition-all" style={{ width: `${(totalConfidencial/totalGeral*100).toFixed(1)}%` }}
              title={`Confidencial: ${fmtCurrency(totalConfidencial)}`}/>
            <div className="h-full bg-sky-400 transition-all" style={{ width: `${(totalNormal/totalGeral*100).toFixed(1)}%` }}
              title={`Financeiro normal: ${fmtCurrency(totalNormal)}`}/>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-rose-400"/><span className="text-xs text-slate-500">Confidencial ({(totalConfidencial/totalGeral*100).toFixed(0)}%)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-sky-400"/><span className="text-xs text-slate-500">Financeiro ({(totalNormal/totalGeral*100).toFixed(0)}%)</span></div>
          </div>
        </div>
      )}

      {/* ── Lançamentos Confidenciais ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Lock size={13} className="text-rose-400"/> Lançamentos Confidenciais
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-500">{entries.length}</span>
          </h3>
          <div className="flex items-center gap-2">
            {/* Filtro categoria */}
            <select className="select text-xs py-1.5" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">Todas as categorias</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {/* Busca */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input className="input pl-8 py-1.5 text-xs w-44" value={search}
                onChange={e => setSearch(e.target.value)} placeholder="Buscar..."/>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card p-8 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-slate-400"/>
          </div>
        ) : ativas.length === 0 && pagas.length === 0 ? (
          <div className="card p-10 text-center">
            <Lock size={28} className="text-slate-200 mx-auto mb-2"/>
            <p className="text-sm text-slate-400">Nenhum lançamento confidencial.</p>
            <button onClick={() => { setEditing(null); setModal(true) }}
              className="btn-primary mt-4 text-sm">
              <Plus size={13}/> Criar primeiro lançamento
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {ativas.length > 0 && (
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Descrição</th><th>Recebedor</th><th>Vencimento</th><th>Categoria</th><th>Valor</th><th>Status</th><th className="text-right">Ações</th></tr></thead>
                  <tbody>
                    {ativas.map(e => (
                      <EntryRow key={e.id} entry={e}
                        onEdit={entry => { setEditing(entry); setModal(true) }}
                        onDelete={id => setDelTarget(id)}
                        onPay={handlePay}/>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pagas.length > 0 && (
              <div className={`rounded-2xl border overflow-hidden ${showPaid ? 'border-emerald-200' : 'border-slate-200'}`}>
                <button onClick={() => setShowPaid(p => !p)}
                  className={`w-full flex items-center justify-between px-5 py-3.5 gap-4 transition-colors ${showPaid ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className={showPaid ? 'text-emerald-500' : 'text-slate-300'}/>
                    <div className="text-left">
                      <p className={`text-sm font-bold ${showPaid ? 'text-emerald-800' : 'text-slate-600'}`}>Pagos</p>
                      <p className="text-xs text-slate-400">{pagas.length} lançamento(s) · {mv ?? fmtCurrency(pagosConf.reduce((s,e) => s+Number(e.paid_amount||e.amount),0))}</p>
                    </div>
                  </div>
                  {showPaid ? <ChevronUp size={15} className="text-slate-400"/> : <ChevronDown size={15} className="text-slate-400"/>}
                </button>
                {showPaid && (
                  <div className="border-t border-emerald-100">
                    <table className="table opacity-70">
                      <thead><tr><th>Descrição</th><th>Recebedor</th><th>Vencimento</th><th>Categoria</th><th>Valor</th><th>Status</th><th className="text-right">Ações</th></tr></thead>
                      <tbody>
                        {pagas.map(e => (
                          <EntryRow key={e.id} entry={e}
                            onEdit={entry => { setEditing(entry); setModal(true) }}
                            onDelete={id => setDelTarget(id)}
                            onPay={handlePay}/>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Espelho do Financeiro Normal ── */}
      <div className="flex flex-col gap-3">
        <button onClick={() => setShowBills(p => !p)}
          className="flex items-center justify-between w-full text-left">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Building2 size={13} className="text-sky-400"/> Financeiro — Contas a Pagar
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-500">{bills.length}</span>
            <span className="text-xs text-slate-400 font-normal">· somente leitura</span>
          </h3>
          {showBills ? <ChevronUp size={15} className="text-slate-400"/> : <ChevronDown size={15} className="text-slate-400"/>}
        </button>

        {showBills && (
          bills.length === 0 ? (
            <div className="card p-6 text-center text-sm text-slate-400">Nenhuma conta no financeiro.</div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead>
                <tbody>
                  {bills.map(b => {
                    const delta = daysUntil(b.due_date)
                    const isPago = b.status === 'pago'
                    return (
                      <tr key={b.id} className={`border-b border-slate-100 hover:bg-slate-50 ${isPago ? 'opacity-50' : ''}`}>
                        <td className="py-3 px-4">
                          <p className={`text-sm font-semibold text-slate-800 ${isPago ? 'line-through text-slate-400' : ''}`}>{b.description}</p>
                          {b.notes && <p className="text-xs text-slate-400 truncate max-w-[200px]">{b.notes}</p>}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-500">{fmtDate(b.due_date)}</td>
                        <td className="py-3 px-4 text-sm font-bold text-slate-800">{mv ?? fmtCurrency(b.amount)}</td>
                        <td className="py-3 px-4">
                          {isPago
                            ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ Pago</span>
                            : delta < 0
                              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">Vencido</span>
                              : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Pendente</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Modal lançamento */}
      <EntryModal open={modal} onClose={() => { setModal(false); setEditing(null) }}
        onSave={handleSave} initial={editing} loading={saving}/>

      {/* Confirm delete */}
      {delTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <p className="font-bold text-slate-800 mb-1">Remover lançamento?</p>
            <p className="text-sm text-slate-500 mb-4">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <button onClick={() => setDelTarget(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={() => handleDelete(delTarget)} className="btn-primary flex-1 bg-rose-500 hover:bg-rose-600">Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}