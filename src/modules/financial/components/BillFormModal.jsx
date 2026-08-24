import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { Modal }          from '../../../components/ui/Modal'
import { maskCurrency, parseCurrency } from '../../../lib/masks'
import { FileUploadArea } from '../../../components/ui/FileUploadArea'
import { useSuppliers }         from '../hooks/useSuppliers'
import { useExpenseCategories } from '../hooks/useExpenseCategories'

// ─── Helpers ────────────────────────────────────────────────────
const INTERVALS = [
  { label: '15 dias',       days: 15 },
  { label: '30 dias',       days: 30 },
  { label: '45 dias',       days: 45 },
  { label: '60 dias',       days: 60 },
  { label: 'Personalizado', days: 0  },
]

function addDays(dateStr, days) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function fmtCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const EMPTY = {
  description:     '',
  supplier_id:     '',
  category_id:     '',
  amount:          '',
  due_date:        '',
  notes:           '',
  recurrent:       false,
  is_installment:  false,
  installment_qty: 2,
  interval_days:   30,
  custom_interval: 30,
}

export function BillFormModal({ open, onClose, onSave, initial = null, loading = false }) {
  const { suppliers }  = useSuppliers()
  const { categories } = useExpenseCategories()

  const [form,         setForm]         = useState(EMPTY)
  const [errors,       setErrors]       = useState({})
  const [installments, setInstallments] = useState([])
  // { amount, due_date, file } por parcela
  const [mainFile,     setMainFile]     = useState(null)
  // arquivo único para conta simples ou boleto geral do parcelamento

  useEffect(() => {
    if (open) {
      setErrors({})
      setMainFile(null)
      setInstallments([])
      setForm(initial ? {
        description:    initial.description    ?? '',
        supplier_id:    initial.supplier_id    ?? '',
        category_id:    initial.category_id    ?? '',
        amount:         initial.amount ? (() => { const n = Number(initial.amount); const cents = n % 1 !== 0 ? Math.round(n * 100) : n; return maskCurrency(String(cents)) })() : '',
        due_date:       initial.due_date        ?? '',
        notes:          initial.notes          ?? '',
        recurrent:      initial.recurrent      ?? false,
        is_installment: false,
        installment_qty: 2,
        interval_days:  30,
        custom_interval: 30,
      } : EMPTY)
    }
  }, [open, initial])

  function set(field, value) {
    setForm(p => ({ ...p, [field]: value }))
    setErrors(p => ({ ...p, [field]: undefined }))
  }

  // ── Recalcula parcelas ───────────────────────────────────────
  const recalcInstallments = useCallback((amount, qty, days, firstDate) => {
    const total = parseCurrency(amount) || 0
    const count = Number(qty)    || 2
    const base  = total > 0 ? parseFloat((total / count).toFixed(2)) : 0
    const diff  = total > 0 ? parseFloat((total - base * (count - 1)).toFixed(2)) : 0

    return Array.from({ length: count }, (_, i) => ({
      // Converte float → centavos inteiros → máscara pt-BR
      // Evita bug onde "411.52" era lido como "41152" pelo parseCurrency
      amount:   maskCurrency(String(Math.round((i === count - 1 ? diff : base) * 100))),
      due_date: firstDate ? addDays(firstDate, days * i) : '',
      file:     null,
    }))
  }, [])

  useEffect(() => {
    if (!form.is_installment) return
    const days = form.interval_days === 0 ? form.custom_interval : form.interval_days
    setInstallments(recalcInstallments(form.amount, form.installment_qty, days, form.due_date))
  }, [form.is_installment, form.installment_qty, form.interval_days, form.custom_interval, form.amount, form.due_date, recalcInstallments])

  function setInstallment(i, field, value) {
    setInstallments(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  // ── Totais ───────────────────────────────────────────────────
  const installmentSum = installments.reduce((acc, p) => acc + (parseCurrency(p.amount) || 0), 0)
  const totalAmount    = parseCurrency(form.amount) || 0
  const sumOk          = totalAmount === 0 || Math.abs(installmentSum - totalAmount) < 0.02

  // ── Validação ────────────────────────────────────────────────
  function validate() {
    const e = {}
    if (!form.description.trim()) e.description = 'Descrição é obrigatória.'
    if (!form.amount || parseCurrency(form.amount) <= 0) e.amount = 'Informe um valor válido.'
    if (form.is_installment) {
      if (!form.due_date) e.due_date = 'Informe a data da 1ª parcela.'
      installments.forEach((p, i) => {
        if (!p.due_date) e[`due_${i}`] = 'Informe a data.'
        if (!p.amount || parseCurrency(p.amount) <= 0) e[`amt_${i}`] = 'Informe o valor.'
      })
    } else {
      if (!form.due_date) e.due_date = 'Informe a data de vencimento.'
    }
    return e
  }

  // ── Submit ───────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    const e2 = validate()
    if (Object.keys(e2).length) { setErrors(e2); return }

    const base = {
      description: form.description.trim(),
      supplier_id: form.supplier_id || null,
      category_id: form.category_id || null,
      notes:       form.notes.trim() || null,
      recurrent:   form.recurrent,
    }

    if (form.is_installment && !initial) {
      const groupId = crypto.randomUUID()
      const bills   = installments.map((p, i) => ({
        ...base,
        description:          `${base.description} (${i + 1}/${installments.length})`,
        amount:               parseCurrency(p.amount),
        due_date:             p.due_date,
        installment_group_id: groupId,
        installment_number:   i + 1,
        installment_total:    installments.length,
        // cada parcela pode ter seu próprio arquivo, ou herda o arquivo principal
        documentFile: p.file ?? (i === 0 ? mainFile : null),
      }))
      await onSave(bills)
    } else {
      await onSave({
        ...base,
        amount:       parseCurrency(form.amount),
        due_date:     form.due_date,
        documentFile: mainFile,
      })
    }
  }

  const isEditing    = !!initial
  const intervalDays = form.interval_days === 0 ? form.custom_interval : form.interval_days

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar Conta' : 'Nova Conta a Pagar'}
      subtitle={isEditing ? `Editando: ${initial?.description}` : 'Preencha os dados da conta'}
      size={form.is_installment && !isEditing ? 'lg' : 'md'}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancelar
          </button>
          <button form="bill-form" type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : isEditing ? 'Salvar alterações'
              : form.is_installment ? `Criar ${form.installment_qty} parcelas`
              : 'Cadastrar conta'
            }
          </button>
        </>
      }
    >
      <form id="bill-form" onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Descrição */}
        <div>
          <label className="form-label">Descrição *</label>
          <input
            className={`input ${errors.description ? 'border-rose-400' : ''}`}
            placeholder="Ex: NF 123 — Chapas MDF, Aluguel Março..."
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
          {errors.description && <p className="text-xs text-rose-500 mt-1">{errors.description}</p>}
          {form.is_installment && !isEditing && (
            <p className="text-xs text-slate-400 mt-1">
              O número será adicionado automaticamente: "{form.description} (1/{form.installment_qty})"
            </p>
          )}
        </div>

        {/* Fornecedor + Categoria */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Fornecedor</label>
            <select className="select" value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
              <option value="">Selecione (opcional)</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Tipo de despesa</label>
            <select className="select" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
              <option value="">Selecione (opcional)</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Valor */}
        <div>
          <label className="form-label">
            {form.is_installment ? 'Valor total (será dividido entre as parcelas) *' : 'Valor (R$) *'}
          </label>
          <input
            className={`input ${errors.amount ? 'border-rose-400' : ''}`}
            placeholder="R$ 0,00"
            value={form.amount}
            onChange={e => set('amount', maskCurrency(e.target.value))}
            inputMode="numeric"
          />
          {errors.amount && <p className="text-xs text-rose-500 mt-1">{errors.amount}</p>}
        </div>

        {/* Toggles: Recorrente / Parcelado */}
        {!isEditing && (
          <div className="flex gap-3">
            <label className={`flex items-center gap-2.5 cursor-pointer flex-1 rounded-xl px-4 py-3 border transition-all ${
              form.recurrent && !form.is_installment ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}>
              <div className="relative">
                <input type="checkbox" className="sr-only"
                  checked={form.recurrent && !form.is_installment}
                  onChange={e => { set('recurrent', e.target.checked); if (e.target.checked) set('is_installment', false) }} />
                <div className={`w-9 h-5 rounded-full transition-colors ${form.recurrent && !form.is_installment ? 'bg-rose-400' : 'bg-slate-200'}`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.recurrent && !form.is_installment ? 'translate-x-4' : ''}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Recorrente</p>
                <p className="text-xs text-slate-400">Repete mensalmente</p>
              </div>
            </label>

            <label className={`flex items-center gap-2.5 cursor-pointer flex-1 rounded-xl px-4 py-3 border transition-all ${
              form.is_installment ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}>
              <div className="relative">
                <input type="checkbox" className="sr-only"
                  checked={form.is_installment}
                  onChange={e => { set('is_installment', e.target.checked); if (e.target.checked) set('recurrent', false) }} />
                <div className={`w-9 h-5 rounded-full transition-colors ${form.is_installment ? 'bg-sky-400' : 'bg-slate-200'}`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_installment ? 'translate-x-4' : ''}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Parcelado</p>
                <p className="text-xs text-slate-400">Divide em parcelas</p>
              </div>
            </label>
          </div>
        )}

        {/* ── Conta NORMAL: vencimento + boleto ── */}
        {!form.is_installment && (
          <>
            <div>
              <label className="form-label">Vencimento *</label>
              <input type="date" className={`input ${errors.due_date ? 'border-rose-400' : ''}`}
                value={form.due_date} onChange={e => set('due_date', e.target.value)} />
              {errors.due_date && <p className="text-xs text-rose-500 mt-1">{errors.due_date}</p>}
            </div>

            {/* Upload boleto/QR Code */}
            {!isEditing && (
              <FileUploadArea
                file={mainFile}
                onChange={setMainFile}
                label="Boleto / QR Code / NF (opcional)"
                hint="Anexe o documento para facilitar o pagamento — PDF, JPG ou PNG"
              />
            )}
          </>
        )}

        {/* ── Modo PARCELADO ── */}
        {form.is_installment && !isEditing && (
          <div className="flex flex-col gap-4 p-4 rounded-xl border border-sky-200 bg-sky-50">

            {/* Config: qtd + intervalo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Número de parcelas</label>
                <input type="number" min="2" max="60" step="1" className="input bg-white"
                  value={form.installment_qty}
                  onChange={e => set('installment_qty', Math.max(2, parseInt(e.target.value) || 2))} />
              </div>
              <div>
                <label className="form-label">Intervalo</label>
                <select className="select bg-white" value={form.interval_days}
                  onChange={e => set('interval_days', Number(e.target.value))}>
                  {INTERVALS.map(iv => (
                    <option key={iv.days} value={iv.days}>{iv.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {form.interval_days === 0 && (
              <div>
                <label className="form-label">Intervalo em dias</label>
                <input type="number" min="1" className="input bg-white"
                  value={form.custom_interval}
                  onChange={e => set('custom_interval', Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
            )}

            {/* Data da 1ª parcela */}
            <div>
              <label className="form-label">Vencimento da 1ª parcela *</label>
              <input type="date" className={`input bg-white ${errors.due_date ? 'border-rose-400' : ''}`}
                value={form.due_date} onChange={e => set('due_date', e.target.value)} />
              {errors.due_date && <p className="text-xs text-rose-500 mt-1">{errors.due_date}</p>}
            </div>

            {/* Boleto geral (vai para a 1ª parcela) */}
            <FileUploadArea
              file={mainFile}
              onChange={setMainFile}
              label="Boleto geral / documento único (opcional)"
              hint="Se tiver um único doc com todas as parcelas, anexe aqui — vai para a 1ª parcela"
            />

            {/* Alerta de soma */}
            {!sumOk && totalAmount > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <AlertCircle size={15} className="text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700">
                  Soma das parcelas ({fmtCurrency(installmentSum)}) difere do total ({fmtCurrency(totalAmount)}).
                </p>
              </div>
            )}

            {/* Tabela de parcelas */}
            {installments.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                    Parcelas — valor, vencimento e boleto individual
                  </p>
                  <button type="button"
                    onClick={() => setInstallments(recalcInstallments(form.amount, form.installment_qty, intervalDays, form.due_date))}
                    className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-semibold">
                    <RefreshCw size={12} /> Recalcular
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {installments.map((p, i) => (
                    <div key={i} className="grid gap-2 items-start"
                         style={{ gridTemplateColumns: '32px 1fr 1fr 1fr' }}>

                      {/* Número */}
                      <div className="h-10 flex items-center justify-center">
                        <span className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                      </div>

                      {/* Valor */}
                      <div>
                        <input
                          className={`input bg-white text-sm ${errors[`amt_${i}`] ? 'border-rose-400' : ''}`}
                          placeholder="R$ 0,00"
                          inputMode="numeric"
                          value={p.amount}
                          onChange={e => setInstallment(i, 'amount', maskCurrency(e.target.value))} />
                        {errors[`amt_${i}`] && <p className="text-xs text-rose-500 mt-0.5">{errors[`amt_${i}`]}</p>}
                      </div>

                      {/* Vencimento */}
                      <div>
                        <input type="date"
                          className={`input bg-white text-sm ${errors[`due_${i}`] ? 'border-rose-400' : ''}`}
                          value={p.due_date}
                          onChange={e => setInstallment(i, 'due_date', e.target.value)} />
                        {errors[`due_${i}`] && <p className="text-xs text-rose-500 mt-0.5">{errors[`due_${i}`]}</p>}
                      </div>

                      {/* Boleto individual desta parcela */}
                      <FileUploadArea
                        compact
                        file={p.file}
                        onChange={f => setInstallment(i, 'file', f)}
                      />
                    </div>
                  ))}

                  {/* Totalizador */}
                  <div className={`flex items-center justify-between mt-1 px-3 py-2 rounded-xl text-sm font-semibold ${
                    sumOk ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    <span>Total das parcelas</span>
                    <span>{fmtCurrency(installmentSum)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Observações */}
        <div>
          <label className="form-label">Observações</label>
          <textarea className="textarea" rows={2}
            placeholder="Informações adicionais..."
            value={form.notes}
            onChange={e => set('notes', e.target.value)} />
        </div>

      </form>
    </Modal>
  )
}
