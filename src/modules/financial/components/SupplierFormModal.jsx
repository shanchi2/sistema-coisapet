import { useState, useEffect } from 'react'
import { Modal }               from '../../../components/ui/Modal'
import { maskPhone, maskCNPJ } from '../../../lib/masks'

const EMPTY = { name: '', cnpj: '', phone: '', email: '', notes: '' }

export function SupplierFormModal({ open, onClose, onSave, initial = null, loading = false }) {
  const [form,   setForm]   = useState(EMPTY)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) {
      setErrors({})
      setForm(initial ? {
        name:  initial.name  ?? '',
        cnpj:  initial.cnpj  ?? '',
        phone: initial.phone ?? '',
        email: initial.email ?? '',
        notes: initial.notes ?? '',
      } : EMPTY)
    }
  }, [open, initial])

  function set(field, value) {
    setForm(p => ({ ...p, [field]: value }))
    setErrors(p => ({ ...p, [field]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setErrors({ name: 'Nome é obrigatório.' }); return }
    await onSave({
      name:  form.name.trim(),
      cnpj:  form.cnpj.trim()  || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Editar Fornecedor' : 'Novo Fornecedor'}
      subtitle={initial ? `Editando: ${initial.name}` : 'Preencha os dados do fornecedor'}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>Cancelar</button>
          <button form="supplier-form" type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : initial ? 'Salvar' : 'Cadastrar'
            }
          </button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="form-label">Nome / Razão social *</label>
          <input
            className={`input ${errors.name ? 'border-rose-400' : ''}`}
            placeholder="Ex: Madeireira São Paulo Ltda"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
          {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="form-label">CNPJ</label>
          <input
            className="input"
            placeholder="00.000.000/0000-00"
            value={form.cnpj}
            onChange={e => set('cnpj', maskCNPJ(e.target.value))}
            maxLength={18}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Telefone / WhatsApp</label>
            <input
              className="input"
              placeholder="(00) 00000-0000"
              value={form.phone}
              onChange={e => set('phone', maskPhone(e.target.value))}
              maxLength={15}
            />
          </div>
          <div>
            <label className="form-label">E-mail</label>
            <input
              type="email"
              className="input"
              placeholder="contato@fornecedor.com"
              value={form.email}
              onChange={e => set('email', e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="form-label">Observações</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Condições de pagamento, contato comercial..."
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}
