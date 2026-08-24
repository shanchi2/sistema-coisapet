import { useState, useEffect } from 'react'
import {
  Eye, EyeOff, Copy, CheckCircle2,
  RefreshCw, MessageCircle, ShieldCheck,
} from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { generateTempPassword, createSystemUser } from '../hooks/useCreateUser'
import toast from 'react-hot-toast'

// ─── Hierarquias ─────────────────────────────────────────────────
export const ROLES = [
  { value: 'admin',          label: 'Diretor',        color: 'text-rose-600 bg-rose-50'     },
  { value: 'administrativo', label: 'Administrativo', color: 'text-purple-600 bg-purple-50' },
  { value: 'atendimento',    label: 'Atendimento',    color: 'text-sky-600 bg-sky-50'       },
  { value: 'producao',       label: 'Produção',       color: 'text-amber-600 bg-amber-50'   },
]

export function getRoleInfo(role) {
  return ROLES.find(r => r.value === role)
    ?? { value: role, label: role, color: 'text-slate-600 bg-slate-100' }
}

const EMPTY = {
  name:        '',
  role:        'producao',
  job_title:   '',
  phone:       '',
  email:       '',
  cpf:         '',
  hire_date:   '',
  hourly_rate: '',
  notes:       '',
}

/**
 * EmployeeFormModal
 *
 * Cadastro:
 *  - Preenche dados do funcionário
 *  - Sistema gera senha temporária automaticamente
 *  - Ao salvar: cria funcionário no banco + usuário no Supabase Auth
 *  - Exibe modal de confirmação com mensagem pronta para WhatsApp
 *
 * Edição: só dados pessoais (sem mexer no login)
 */
export function EmployeeFormModal({ open, onClose, onSave, initial = null, loading: externalLoading = false }) {
  const [form,     setForm]     = useState(EMPTY)
  const [errors,   setErrors]   = useState({})
  const [showPass, setShowPass] = useState(false)
  const [password, setPassword] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [copied,   setCopied]   = useState(null) // 'pass' | 'msg' | null
  // Tela de sucesso com dados para WhatsApp
  const [createdUser, setCreatedUser] = useState(null)

  useEffect(() => {
    if (open) {
      setErrors({})
      setCreatedUser(null)
      setCopied(null)
      if (initial) {
        setForm({
          name:        initial.name        ?? '',
          role:        initial.role        ?? 'producao',
          job_title:   initial.job_title   ?? '',
          phone:       initial.phone       ?? '',
          email:       initial.email       ?? '',
          cpf:         initial.cpf         ?? '',
          hire_date:   initial.hire_date   ?? '',
          hourly_rate: initial.hourly_rate ?? '',
          notes:       initial.notes       ?? '',
        })
      } else {
        setForm(EMPTY)
        setPassword(generateTempPassword())
      }
    }
  }, [open, initial])

  function set(field, value) {
    setForm(p => ({ ...p, [field]: value }))
    setErrors(p => ({ ...p, [field]: undefined }))
  }

  function regeneratePassword() {
    setPassword(generateTempPassword())
    setCopied(null)
  }

  function copyText(text, key) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  // ── Validação ─────────────────────────────────────────────────
  function validate() {
    const e = {}
    if (!form.name.trim())  e.name  = 'Nome é obrigatório.'
    if (!initial) {
      if (!form.email.trim())  e.email  = 'E-mail é obrigatório.'
      if (!password.trim())    e.password = 'Gere uma senha antes de salvar.'
    }
    return e
  }

  // ── Submit ────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    const e2 = validate()
    if (Object.keys(e2).length) { setErrors(e2); return }

    setSaving(true)
    try {
      const employeePayload = {
        name:        form.name.trim(),
        role:        form.role,
        job_title:   form.job_title.trim()  || null,
        phone:       form.phone.trim()      || null,
        email:       form.email.trim()      || null,
        cpf:         form.cpf.trim()        || null,
        hire_date:   form.hire_date         || null,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        notes:       form.notes.trim()      || null,
      }

      // Salva o funcionário no banco e recebe o ID
      const employeeId = await onSave(employeePayload)

      // Se é edição, fecha e pronto
      if (initial) return

      // Cria o usuário no Supabase Auth
      await createSystemUser({
        email:      form.email.trim(),
        password,
        name:       form.name.trim(),
        role:       form.role,
        employeeId,
      })

      // Mostra tela de sucesso com dados para WhatsApp
      setCreatedUser({
        name:     form.name.trim(),
        email:    form.email.trim(),
        password,
        role:     form.role,
        phone:    form.phone.trim(),
      })

    } catch (err) {
      toast.error(err.message ?? 'Erro ao cadastrar funcionário.')
    } finally {
      setSaving(false)
    }
  }

  const isEditing  = !!initial
  const isSaving   = saving || externalLoading
  const roleInfo   = getRoleInfo(form.role)

  // Mensagem pronta para WhatsApp
  const whatsappMsg = createdUser
    ? `Olá ${createdUser.name}! 👋\n\nVocê foi cadastrado no sistema interno da *CoisaPet*. Seguem seus dados de acesso:\n\n🌐 *Sistema:* ${window.location.origin}${window.location.pathname.includes('coisapet') ? '/coisapet' : ''}\n📧 *Usuário:* ${createdUser.email}\n🔑 *Senha temporária:* \`${createdUser.password}\`\n\n⚠️ No primeiro acesso o sistema irá solicitar que você crie uma nova senha pessoal.\n\nQualquer dúvida, fale com o administrador!`
    : ''

  // Link direto para abrir o WhatsApp (se tiver telefone)
  const whatsappLink = createdUser?.phone
    ? `https://wa.me/55${createdUser.phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMsg)}`
    : null

  // ── Tela de sucesso ───────────────────────────────────────────
  if (createdUser) {
    const ci = getRoleInfo(createdUser.role)
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Funcionário cadastrado!"
        subtitle="Envie as credenciais via WhatsApp"
        size="md"
        footer={
          <button onClick={onClose} className="btn-primary">
            <CheckCircle2 size={16} /> Concluir
          </button>
        }
      >
        <div className="flex flex-col gap-4">

          {/* Info do novo usuário */}
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="w-11 h-11 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
              <span className="text-rose-500 font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {createdUser.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800">{createdUser.name}</p>
              <p className="text-xs text-slate-400">{createdUser.email}</p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${ci.color}`}>
              {ci.label}
            </span>
          </div>

          {/* Credenciais */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
              <p className="text-xs text-slate-400 mb-1">E-mail / Usuário</p>
              <p className="text-sm font-semibold text-slate-700 break-all">{createdUser.email}</p>
            </div>
            <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-100 relative">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-amber-600 font-semibold">Senha temporária</p>
                <button
                  onClick={() => copyText(createdUser.password, 'pass')}
                  className={`text-xs font-semibold flex items-center gap-1 transition-colors ${copied === 'pass' ? 'text-emerald-600' : 'text-amber-600 hover:text-amber-700'}`}
                >
                  {copied === 'pass' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                  {copied === 'pass' ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="text-base font-bold font-mono tracking-wider text-amber-800">
                {createdUser.password}
              </p>
            </div>
          </div>

          {/* Aviso de troca de senha */}
          <div className="flex items-center gap-2.5 bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
            <ShieldCheck size={18} className="text-sky-500 shrink-0" />
            <p className="text-xs text-sky-700">
              No primeiro acesso, o sistema pedirá automaticamente que o funcionário defina uma nova senha pessoal.
            </p>
          </div>

          {/* Mensagem WhatsApp */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Mensagem pronta para WhatsApp
              </p>
              <button
                onClick={() => copyText(whatsappMsg, 'msg')}
                className={`text-xs font-semibold flex items-center gap-1 transition-colors ${copied === 'msg' ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {copied === 'msg' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                {copied === 'msg' ? 'Copiado!' : 'Copiar mensagem'}
              </button>
            </div>
            <div className="bg-[#ECF8F3] border border-[#B7DFC9] rounded-xl p-4">
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-mono text-xs">
                {whatsappMsg}
              </p>
            </div>
          </div>

          {/* Botão abrir WhatsApp direto (se tiver telefone) */}
          {whatsappLink ? (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.98]"
              style={{ backgroundColor: '#25D366', fontFamily: 'Nunito, sans-serif' }}
            >
              <MessageCircle size={18} />
              Abrir WhatsApp e enviar
            </a>
          ) : (
            <p className="text-xs text-slate-400 text-center">
              Copie a mensagem acima e envie para o funcionário via WhatsApp.
              Para abrir o WhatsApp direto, cadastre o telefone do funcionário.
            </p>
          )}

        </div>
      </Modal>
    )
  }

  // ── Formulário principal ──────────────────────────────────────
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar Funcionário' : 'Novo Funcionário'}
      subtitle={isEditing ? `Editando: ${initial.name}` : 'Preencha os dados do funcionário'}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>
            Cancelar
          </button>
          <button form="employee-form" type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : isEditing ? 'Salvar' : 'Cadastrar funcionário'
            }
          </button>
        </>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Nome */}
        <div>
          <label className="form-label">Nome completo *</label>
          <input className={`input ${errors.name ? 'border-rose-400' : ''}`}
            placeholder="Nome do funcionário"
            value={form.name} onChange={e => set('name', e.target.value)} />
          {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
        </div>

        {/* Hierarquia + Cargo */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Hierarquia *</label>
            <select className="select" value={form.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Cargo / Função</label>
            <input className="input" placeholder="Ex: Marceneiro, Atendente..."
              value={form.job_title} onChange={e => set('job_title', e.target.value)} />
          </div>
        </div>

        {/* Telefone + CPF */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Telefone</label>
            <input className="input" placeholder="(00) 00000-0000"
              value={form.phone} onChange={e => set('phone', e.target.value)} />
            {!isEditing && (
              <p className="text-xs text-slate-400 mt-1">Com telefone, o botão de WhatsApp fica disponível.</p>
            )}
          </div>
          <div>
            <label className="form-label">CPF</label>
            <input className="input" placeholder="000.000.000-00"
              value={form.cpf} onChange={e => set('cpf', e.target.value)} />
          </div>
        </div>

        {/* Data contratação + Valor hora */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Data de contratação</label>
            <input type="date" className="input"
              value={form.hire_date} onChange={e => set('hire_date', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Valor hora (R$)</label>
            <input type="number" min="0" step="0.01" className="input" placeholder="0,00"
              value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} />
          </div>
        </div>

        {/* Observações */}
        <div>
          <label className="form-label">Observações</label>
          <textarea className="textarea" rows={2}
            placeholder="Informações adicionais..."
            value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        {/* ── Seção de acesso — só no cadastro ── */}
        {!isEditing && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <p className="text-sm font-bold text-slate-700">Acesso ao sistema</p>
              <p className="text-xs text-slate-400 mt-0.5">Credenciais de login que serão enviadas ao funcionário</p>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">

              {/* E-mail */}
              <div>
                <label className="form-label">E-mail de acesso *</label>
                <input type="email"
                  className={`input ${errors.email ? 'border-rose-400' : ''}`}
                  placeholder="email@funcionario.com"
                  value={form.email} onChange={e => set('email', e.target.value)} />
                {errors.email && <p className="text-xs text-rose-500 mt-1">{errors.email}</p>}
              </div>

              {/* Senha gerada */}
              <div>
                <label className="form-label">Senha temporária gerada pelo sistema</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPass ? 'text' : 'password'}
                      className="input pr-10 font-mono tracking-wider"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {/* Copiar */}
                  <button type="button"
                    onClick={() => copyText(password, 'pass')}
                    title="Copiar senha"
                    className={`px-3 rounded-xl border text-sm transition-all ${copied === 'pass' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    {copied === 'pass' ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  </button>
                  {/* Regenerar */}
                  <button type="button"
                    onClick={regeneratePassword}
                    title="Gerar nova senha"
                    className="px-3 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
                    <RefreshCw size={16} />
                  </button>
                </div>
                {errors.password && <p className="text-xs text-rose-500 mt-1">{errors.password}</p>}
                <p className="text-xs text-slate-400 mt-1">
                  Senha gerada automaticamente. Após salvar, o sistema exibirá a mensagem pronta para WhatsApp.
                </p>
              </div>

              {/* Info de acesso */}
              <div className="flex items-start gap-2 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2.5">
                <ShieldCheck size={15} className="text-sky-500 shrink-0 mt-0.5" />
                <p className="text-xs text-sky-700">
                  O funcionário terá acesso restrito à hierarquia <strong>{roleInfo.label}</strong>.
                  No primeiro login, será obrigado a criar uma nova senha pessoal.
                </p>
              </div>

            </div>
          </div>
        )}

      </form>
    </Modal>
  )
}
