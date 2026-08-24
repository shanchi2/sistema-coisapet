import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Eye, EyeOff, Check, Loader2, Upload, FileText, AlertTriangle,
  Stethoscope, FileWarning, Receipt, CreditCard, Camera, Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

export const ROLES = [
  { value: 'admin',          label: 'Diretor',        color: 'bg-rose-50 text-rose-600'    },
  { value: 'administrativo', label: 'Administrativo', color: 'bg-violet-50 text-violet-600' },
  { value: 'atendimento',    label: 'Atendimento',    color: 'bg-sky-50 text-sky-600'       },
  { value: 'producao',       label: 'Produção',       color: 'bg-amber-50 text-amber-600'   },
  { value: 'equipe',         label: 'Equipe',         color: 'bg-emerald-50 text-emerald-600'},
  { value: 'marketplace',    label: 'Marketing',      color: 'bg-orange-50 text-orange-600'  },
  { value: 'horista',        label: 'Horista',        color: 'bg-teal-50 text-teal-600'      },
]

export function getRoleInfo(role) {
  if (role === 'escritorio') return { value: 'escritorio', label: 'Escritório (leitura)', color: 'bg-violet-50 text-violet-600' }
  return ROLES.find(r => r.value === role) ?? ROLES[ROLES.length - 1]
}

// Setores do Kanban que um escritório pode enxergar — mesmos slugs
// usados em TASK_SECTORS no KanbanOperacionalPage.jsx
export const ESCRITORIO_SECTORS = [
  { value: 'advocacia',       label: 'Advocacia' },
  { value: 'marcas_patentes', label: 'Marcas e Patentes' },
]

function fmtSalary(v) {
  if (!v) return ''
  const digits = String(v).replace(/\D/g,'')
  if (!digits) return ''
  const num = parseInt(digits, 10) / 100
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

const EMPTY = {
  name: '', email: '', notification_email: '', password: '', role: 'producao',
  job_title: '', phone: '', cpf: '', hire_date: '', birthday: '',
  address: '', monthly_salary: '', monthly_hours: '220',
  emergency_name: '', emergency_phone: '',
  notes: '',
  // Novos campos
  document_personal: '', photo_url: '', contract_url: '',
  medical_certs_notes: '', contract_signed: false, warnings_notes: '',
  half_day: false,
  employee_type: 'clt',
  payment_day:   '5',
  company_name:  '',
  company_cnpj:  '',
  kanban_access:     false,
  escritorio_sector: '',
}

// ─── Field — fora do componente para não recriar a cada render ───
function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="form-label">{label}{required && <span className="text-rose-400 ml-0.5">*</span>}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

export function UserFormModal({ open, onClose, onSave, initial, loading }) {
  const isEditing = !!initial
  const [form,         setForm]         = useState(EMPTY)
  const [notifTouched, setNotifTouched] = useState(false)
  const justLoaded = useRef(false)
  const [contractChanged, setContractChanged] = useState(false)
  const [showPwd,   setShowPwd]   = useState(false)
  const [tab,       setTab]       = useState('basico')
  const [payslips,   setPayslips]   = useState([])
  const [atestados,  setAtestados]  = useState([])
  const [uploading,  setUploading]  = useState(false)
  const [contacts,   setContacts]   = useState([]) // contatos múltiplos para prestador/escritório
  const [empDocs,    setEmpDocs]    = useState([]) // documentos físicos do colaborador
  const [docUploading, setDocUploading] = useState(false)
  const [ferias,     setFerias]     = useState([]) // histórico de férias

  const loadExtras = useCallback(async (id) => {
    if (!id) return
    const [psR, atR, ctR, edR, vrR] = await Promise.all([
      supabase.from('payslips').select('id,reference,month,year,file_url,mirror_url,receipt_url')
        .eq('employee_id', id).order('year',{ascending:false}).order('month',{ascending:false}),
      supabase.from('medical_certificates').select('id,date,days_off,notes,file_url')
        .eq('employee_id', id).order('date',{ascending:false}),
      supabase.from('employee_contacts').select('*')
        .eq('employee_id', id).order('sort_order',{ascending:true}),
      supabase.from('employee_documents').select('*')
        .eq('employee_id', id).order('created_at',{ascending:false}),
      supabase.from('vacation_requests').select('id,date_start,date_end,days,status,notes,receipt_url,voucher_url,created_at')
        .eq('employee_id', id).order('date_start',{ascending:false}),
    ])
    setPayslips(psR.data ?? [])
    setAtestados(atR.data ?? [])
    setContacts(ctR.data ?? [])
    setEmpDocs(edR.data ?? [])
    setFerias(vrR.data ?? [])
  }, [])

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({
        name:                initial.name               ?? '',
        email:               initial.email              ?? '',
        notification_email:  initial.notification_email ?? initial.email ?? '',
        password:            '',
        role:                initial.role               ?? 'producao',
        job_title:           initial.job_title          ?? '',
        phone:               initial.phone              ?? '',
        cpf:                 initial.cpf                ?? '',
        hire_date:           initial.hire_date          ?? '',
        birthday:            initial.birthday           ?? '',
        address:             initial.address            ?? '',
        monthly_salary:      initial.monthly_salary
          ? fmtSalary(String(Math.round(initial.monthly_salary * 100)))
          : '',
        monthly_hours:       initial.monthly_hours ? String(initial.monthly_hours) : '220',
        emergency_name:      initial.emergency_name     ?? '',
        emergency_phone:     initial.emergency_phone    ?? '',
        notes:               initial.notes              ?? '',
        document_personal:   initial.document_personal  ?? '',
        photo_url:           initial.photo_url          ?? '',
        medical_certs_notes: initial.medical_certs_notes ?? '',
        contract_signed:     initial.contract_signed    ?? false,
        warnings_notes:      initial.warnings_notes     ?? '',
        half_day:            initial.half_day           ?? false,
        contract_url:        initial.contract_url       ?? '',
        employee_type:       initial.employee_type      ?? 'clt',
        payment_day:         initial.payment_day ? String(initial.payment_day) : '5',
        company_name:        initial.company_name       ?? '',
        company_cnpj:        initial.company_cnpj       ?? '',
        kanban_access:       initial.role === 'escritorio',
        escritorio_sector:   initial.escritorio_sector  ?? '',
      })
    } else {
      setForm(EMPTY)
    }
    setTab('basico')
    setContractChanged(false)
    setNotifTouched(!!(initial?.notification_email && initial.notification_email !== (initial?.email ?? '')))
    justLoaded.current = true
    if (initial?.id) loadExtras(initial.id)
  }, [open, initial, loadExtras])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Enquanto o email de notificação não for editado manualmente, ele
  // acompanha o email de login — assim que o admin digitar algo diferente
  // nele, paramos de sincronizar (fica fixo no que foi escolhido).
  useEffect(() => {
    if (!open) return
    if (justLoaded.current) { justLoaded.current = false; return } // pula o ciclo logo após abrir/carregar
    if (notifTouched) return
    setForm(f => f.email === f.notification_email ? f : { ...f, notification_email: f.email })
  }, [form.email, open, notifTouched])

  async function uploadFile(file, path) {
    setUploading(true)
    try {
      await supabase.storage.from('employee-docs').remove([path])
      const { error } = await supabase.storage.from('employee-docs').upload(path, file)
      if (error) throw error
      // Usa signed URL para garantir acesso mesmo em bucket privado
      const { data: signed } = await supabase.storage.from('employee-docs').createSignedUrl(path, 60 * 60 * 24 * 365)
      return signed?.signedUrl ?? null
    } catch (e) {
      toast.error('Erro no upload: ' + e.message)
      return null
    } finally {
      setUploading(false)
    }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0]
    if (!file || !initial?.id) return
    const ext  = file.name.split('.').pop()
    const url  = await uploadFile(file, `fotos/${initial.id}/foto.${ext}`)
    if (url) { set('photo_url', url); toast.success('Foto enviada!') }
  }

  async function handleDocUpload(e, docType, docName) {
    const file = e.target.files[0]
    if (!file || !initial?.id) return
    if (file.size > 10 * 1024 * 1024) { toast.error('Máximo 10MB por documento.'); return }
    setDocUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `documentos/${initial.id}/${docType}_${Date.now()}.${ext}`
      await supabase.storage.from('employee-docs').remove([path])
      const { error: upErr } = await supabase.storage.from('employee-docs').upload(path, file)
      if (upErr) throw upErr
      await supabase.from('employee_documents').insert({
        employee_id:  initial.id,
        name:         docName || file.name,
        doc_type:     docType,
        storage_path: path,
      })
      toast.success('Documento enviado!')
      loadExtras(initial.id)
    } catch(e) { toast.error('Erro: ' + e.message) }
    finally { setDocUploading(false) }
  }

  async function deleteDoc(doc) {
    await supabase.storage.from('employee-docs').remove([doc.storage_path])
    await supabase.from('employee_documents').delete().eq('id', doc.id)
    toast.success('Documento removido.')
    loadExtras(initial.id)
  }

  async function handleContractUpload(e) {
    const file = e.target.files[0]
    if (!file || !initial?.id) return
    const url = await uploadFile(file, `contratos/${initial.id}/contrato.pdf`)
    if (url) { set('contract_url', url); toast.success('Contrato enviado!') }
  }

  async function viewStorageFile(path) {
    if (!path) return
    if (path.startsWith('http')) { window.open(path, '_blank'); return }
    const { data } = await supabase.storage.from('employee-docs').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else toast.error('Erro ao abrir arquivo.')
  }

  function handleSalary(e) {
    const digits = e.target.value.replace(/\D/g,'')
    if (!digits) { set('monthly_salary',''); return }
    const num = parseInt(digits, 10) / 100
    set('monthly_salary', num.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
  }

  function handleSubmit() {
    if (!form.name.trim()) { return }
    // Escritório sem acesso ao Kanban não precisa de email/senha
    const needsLogin = form.employee_type !== 'escritorio' || form.kanban_access
    if (!isEditing && needsLogin && !form.email.trim()) { return }
    if (!isEditing && form.employee_type === 'escritorio' && form.kanban_access && !form.password.trim()) { return }
    onSave({
      ...form,
      // Escritório: role vira 'escritorio' se tiver acesso ao Kanban, senão 'equipe' (sem acesso)
      ...(form.employee_type === 'escritorio' ? { role: form.kanban_access ? 'escritorio' : 'equipe' } : {}),
      contacts,
      // só muda active se o toggle de contrato foi tocado conscientemente
      ...(contractChanged ? { set_active: form.contract_signed } : {}),
    })
  }

  const TABS = [
    { id: 'basico',     label: 'Dados básicos' },
    { id: 'contrato',   label: 'Contrato'      },
    { id: 'documentos', label: 'Documentos'    },
    { id: 'holerites',  label: 'Holerites'     },
    { id: 'ferias',     label: 'Férias'        },
    { id: 'atestados',  label: 'Atestados'     },
    { id: 'avisos',     label: 'Avisos'        },
    { id: 'emergencia', label: 'Emergência'    },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={isEditing ? `Editar — ${initial?.name}` : 'Novo colaborador'}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>Cancelar</button>
          <button onClick={handleSubmit} className="btn-primary"
            disabled={loading || !form.name.trim() ||
              (!isEditing && (form.employee_type !== 'escritorio' || form.kanban_access) && !form.email.trim()) ||
              (!isEditing && form.employee_type === 'escritorio' && form.kanban_access && !form.password.trim())}>
            {loading ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>}
            {isEditing ? 'Salvar alterações' : 'Cadastrar colaborador'}
          </button>
        </>
      }
    >
      {/* Honeypot — engana o autocomplete do browser */}
      <input type="text" name="username" autoComplete="username" style={{display:'none'}} readOnly/>
      <input type="password" name="password" autoComplete="current-password" style={{display:'none'}} readOnly/>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1
              ${tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Dados básicos ── */}
      {tab === 'basico' && (
        <div className="flex flex-col gap-4">

          {/* Tipo de colaborador — PRIMEIRO campo */}
          <Field label="Tipo de colaborador">
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[
                { v:'clt',        label:'CLT',        icon:'🏢', desc:'Funcionário registrado'      },
                { v:'prestador',  label:'Prestador',  icon:'🔧', desc:'Prestador de serviço / PJ'   },
                { v:'escritorio', label:'Escritório', icon:'⚖️', desc:'Contabilidade, advocacia...' },
              ].map(t => (
                <button key={t.v} type="button" onClick={() => set('employee_type', t.v)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-all
                    ${form.employee_type === t.v
                      ? 'bg-rose-50 text-rose-700 border-rose-300'
                      : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                  <span className="text-xl">{t.icon}</span>
                  <span className="font-bold">{t.label}</span>
                  <span className="text-[9px] font-normal opacity-60 text-center leading-tight">{t.desc}</span>
                </button>
              ))}
            </div>
          </Field>

          {/* ══ ESCRITÓRIO ══ */}
          {form.employee_type === 'escritorio' ? (<>
            {form.kanban_access ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-xs font-semibold text-emerald-700">✓ Este escritório vai ter login próprio, com acesso somente-leitura ao setor escolhido no Kanban Operacional.</p>
              </div>
            ) : (
              <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl">
                <p className="text-xs font-semibold text-violet-700">⚖️ Por padrão, escritórios não têm acesso ao sistema ou app — apenas dados cadastrais e financeiros.</p>
              </div>
            )}

            {/* Toggle de acesso ao Kanban */}
            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-slate-300 transition-colors">
              <input type="checkbox" className="w-4 h-4 accent-rose-500" checked={form.kanban_access}
                onChange={e => set('kanban_access', e.target.checked)}/>
              <div>
                <p className="text-xs font-bold text-slate-700">Dar acesso ao Kanban Operacional (somente leitura)</p>
                <p className="text-[11px] text-slate-400">O escritório vai poder logar e ver só as tarefas do setor dele, sem editar nada.</p>
              </div>
            </label>

            {form.kanban_access && (
              <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-xl flex flex-col gap-4">
                <Field label="Setor do Kanban" required hint="Define quais tarefas esse escritório vai enxergar.">
                  <select className="select" value={form.escritorio_sector} onChange={e => set('escritorio_sector', e.target.value)}>
                    <option value="">Selecione...</option>
                    {ESCRITORIO_SECTORS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label={isEditing ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial'} required={!isEditing}
                  hint={isEditing ? 'Pra trocar a senha, use o botão de resetar senha na ficha do escritório.' : undefined}>
                  <div className="relative">
                    <input className="input pr-10" type={showPwd ? 'text' : 'password'}
                      value={form.password} onChange={e => set('password', e.target.value)}
                      placeholder={isEditing ? 'Nova senha...' : 'Senha de acesso'} autoComplete="new-password"
                      disabled={isEditing}/>
                    <button type="button" onClick={() => setShowPwd(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPwd ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                </Field>
              </div>
            )}

            <Field label="Nome do escritório / Razão social" required>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Silva & Associados Advocacia"/>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="CNPJ">
                <input className="input" value={form.company_cnpj || ''} onChange={e => set('company_cnpj', e.target.value)} placeholder="00.000.000/0000-00"/>
              </Field>
              <Field label="Área de atuação">
                <input className="input" value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="Ex: Advocacia Trabalhista"/>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Telefone / WhatsApp">
                <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(14) 99999-9999"/>
              </Field>
              <Field label={form.kanban_access ? 'E-mail de contato / login' : 'E-mail de contato'} required={form.kanban_access}>
                <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contato@escritorio.com.br" autoComplete="off"/>
              </Field>
            </div>
            <Field label="Endereço">
              <input className="input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Rua, número, bairro, cidade — SP"/>
            </Field>
            {/* Contatos múltiplos */}
            <div className="p-4 bg-violet-50 border border-violet-100 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-violet-600 uppercase tracking-wide">Contatos / Responsáveis</p>
                <button type="button" onClick={() => setContacts(prev => [...prev, {name:'',whatsapp:'',email:'',role:''}])}
                  className="text-xs font-bold text-violet-500 hover:text-violet-700 flex items-center gap-1">
                  <Plus size={11}/> Adicionar
                </button>
              </div>
              {contacts.length === 0
                ? <p className="text-xs text-slate-400 italic">Nenhum contato adicionado ainda.</p>
                : contacts.map((ct, i) => (
                  <div key={i} className="p-3 bg-white border border-violet-100 rounded-xl flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input text-xs py-1.5" placeholder="Nome" value={ct.name}
                        onChange={e => setContacts(p => p.map((x,j) => j===i?{...x,name:e.target.value}:x))}/>
                      <input className="input text-xs py-1.5" placeholder="Função (ex: Sócio)" value={ct.role}
                        onChange={e => setContacts(p => p.map((x,j) => j===i?{...x,role:e.target.value}:x))}/>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input text-xs py-1.5" placeholder="WhatsApp" value={ct.whatsapp}
                        onChange={e => setContacts(p => p.map((x,j) => j===i?{...x,whatsapp:e.target.value}:x))}/>
                      <input className="input text-xs py-1.5" placeholder="E-mail" value={ct.email}
                        onChange={e => setContacts(p => p.map((x,j) => j===i?{...x,email:e.target.value}:x))}/>
                    </div>
                    <button type="button" onClick={() => setContacts(p => p.filter((_,j) => j!==i))}
                      className="text-[10px] text-rose-400 hover:text-rose-600 self-end">remover</button>
                  </div>
                ))
              }
            </div>
          </>) : (<>
            {/* ══ CLT / PRESTADOR — pessoa física com acesso ══ */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome completo" required>
                <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome do colaborador"/>
              </Field>
              <Field label="Hierarquia">
                <select className="select" value={form.role} onChange={e => set('role', e.target.value)}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="E-mail" required={!isEditing}>
                <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="email@coisapet.com.br"
                  autoComplete="off"/>
              </Field>
              <Field label={isEditing ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial'} required={!isEditing}>
                <div className="relative">
                  <input className="input pr-10" type={showPwd ? 'text' : 'password'}
                    value={form.password} onChange={e => set('password', e.target.value)}
                    placeholder={isEditing ? 'Nova senha...' : 'Senha de acesso'} autoComplete="new-password"/>
                  <button type="button" onClick={() => setShowPwd(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPwd ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
              </Field>
            </div>
            <Field label="E-mail de notificação"
              hint={notifTouched
                ? 'Personalizado — os e-mails do sistema (tarefas, avisos, etc.) vão pra esse endereço em vez do e-mail de login.'
                : 'Por padrão, igual ao e-mail de login. Mude aqui se quiser centralizar em outra caixa (ex: administrativo@coisapet.com.br).'}>
              <div className="relative">
                <input className={notifTouched ? "input pr-20" : "input"} type="email"
                  value={form.notification_email}
                  onChange={e => { set('notification_email', e.target.value); setNotifTouched(true) }}
                  placeholder="mesmo que o e-mail de login"
                  autoComplete="off"/>
                {notifTouched && (
                  <button type="button"
                    onClick={() => { setNotifTouched(false); set('notification_email', form.email) }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-rose-400 hover:text-rose-600">
                    usar padrão
                  </button>
                )}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cargo / função">
                <input className="input" value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="Ex: Operador de Produção"/>
              </Field>
              <Field label="Telefone">
                <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(14) 99999-9999"/>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="CPF">
                <input className="input" value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00"/>
              </Field>
              <Field label="Data de nascimento">
                <input className="input" type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)}/>
              </Field>
            </div>
            <Field label="Endereço completo">
              <input className="input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Rua, número, bairro, cidade — SP"/>
            </Field>
            {/* Dados empresa para Prestador PJ */}
            {form.employee_type === 'prestador' && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex flex-col gap-3">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">🔧 Dados da empresa / PJ</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Razão social">
                    <input className="input" value={form.company_name || ''} onChange={e => set('company_name', e.target.value)} placeholder="Ex: João Vitor ME"/>
                  </Field>
                  <Field label="CNPJ" hint="Opcional">
                    <input className="input" value={form.company_cnpj || ''} onChange={e => set('company_cnpj', e.target.value)} placeholder="00.000.000/0000-00"/>
                  </Field>
                </div>
              </div>
            )}
          </>)}
          <Field label="Foto do colaborador">
            <div className="flex items-center gap-3">
              {form.photo_url ? (
                <div className="relative w-16 h-16 shrink-0">
                  <img src={form.photo_url} alt="foto" className="w-16 h-16 rounded-2xl object-cover border border-slate-200"/>
                  <button type="button" onClick={() => set('photo_url','')}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center">
                    <X size={10} className="text-white"/>
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center shrink-0">
                  <Camera size={20} className="text-slate-300"/>
                </div>
              )}
              <div className="flex flex-col gap-1.5 flex-1">
                {isEditing && (
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 cursor-pointer hover:border-rose-300 hover:bg-rose-50/30 transition-colors text-xs font-semibold text-slate-500">
                    <Upload size={13}/> {uploading ? 'Enviando...' : 'Upload de foto'}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading}/>
                  </label>
                )}
                <input className="input text-xs" value={form.photo_url} onChange={e => set('photo_url', e.target.value)} placeholder="Ou cole a URL da foto..."/>
              </div>
            </div>
          </Field>
          <Field label="Observações">
            <textarea className="textarea resize-none" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Informações adicionais..."/>
          </Field>
        </div>
      )}

      {/* ── Contrato ── */}
      {tab === 'contrato' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Data de contratação">
              <input className="input" type="date" value={form.hire_date} onChange={e => set('hire_date', e.target.value)}/>
            </Field>
            <Field label="Carga horária mensal" hint="Padrão: 220h">
              <input className="input" type="number" value={form.monthly_hours} onChange={e => set('monthly_hours', e.target.value)} placeholder="220"/>
            </Field>
          </div>
          {/* Salário movido para o bloco de pagamento acima */}
          <Field label="Documento pessoal" hint="RG, CTPS, etc.">
            <input className="input" value={form.document_personal} onChange={e => set('document_personal', e.target.value)} placeholder="Ex: RG 12.345.678-9"/>
          </Field>
          {/* Dia de pagamento */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Dia de pagamento" hint={!form.payment_day ? '📅 Vazio = 5º dia útil do mês (automático)' : 'Dia fixo do mês'}>
              <div className="relative">
                <input className="input" type="number" min="1" max="31"
                  value={form.payment_day} onChange={e => set('payment_day', e.target.value)}
                  placeholder="Vazio = 5º dia útil"/>
                {form.payment_day && (
                  <button type="button" onClick={() => set('payment_day', '')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-rose-400">
                    limpar
                  </button>
                )}
              </div>
            </Field>
            <Field label="Salário / Pagamento mensal (R$)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">R$</span>
                <input className="input pl-9" value={form.monthly_salary} onChange={handleSalary} placeholder="0,00"/>
              </div>
              {form.monthly_salary && (
                <p className="text-[10px] text-amber-600 mt-1 font-semibold">
                  ⚡ Ao salvar, lançamentos serão gerados no Financeiro Diretoria
                </p>
              )}
            </Field>
          </div>

          <Field label="Arquivo do contrato (PDF)">
            <div className="flex items-center gap-2">
              {form.contract_url && (
                <button type="button" onClick={() => viewStorageFile(form.contract_url)}
                  className="flex items-center gap-1.5 text-xs font-bold text-sky-500 hover:text-sky-600 px-3 py-2 rounded-xl border border-sky-200 hover:bg-sky-50">
                  <FileText size={13}/> Ver contrato
                </button>
              )}
              {isEditing && (
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 cursor-pointer hover:border-sky-300 hover:bg-sky-50/30 transition-colors text-xs font-semibold text-slate-500">
                  <Upload size={13}/> {uploading ? 'Enviando...' : form.contract_url ? 'Substituir PDF' : 'Upload contrato'}
                  <input type="file" accept=".pdf" className="hidden" onChange={handleContractUpload} disabled={uploading}/>
                </label>
              )}
              {!form.contract_url && !isEditing && <span className="text-xs text-slate-300">Salve o colaborador primeiro para fazer upload</span>}
            </div>
          </Field>

          <Field label="Contrato de trabalho">
            <div className={`flex items-center justify-between gap-3 p-3 rounded-xl border-2 transition-all mt-1
              ${form.contract_signed ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              <div className="flex flex-col">
                <span className={`text-sm font-bold ${form.contract_signed ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {form.contract_signed ? '✓ Contrato assinado' : '⚠️ Contrato pendente'}
                </span>
                <span className={`text-[10px] font-semibold ${form.contract_signed ? 'text-emerald-500' : 'text-rose-400'}`}>
                  {form.contract_signed ? 'Colaborador com acesso ao sistema' : 'Acesso ao sistema bloqueado'}
                </span>
              </div>
              <button type="button" onClick={() => { set('contract_signed', !form.contract_signed); setContractChanged(true) }}
                className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${form.contract_signed ? 'bg-emerald-500' : 'bg-rose-300'}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${form.contract_signed ? 'left-6' : 'left-0.5'}`}/>
              </button>
            </div>
          </Field>

          <Field label="Regime de trabalho" hint="Define a meta diária no relatório de ponto">
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button type="button" onClick={() => set('half_day', false)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-semibold transition-all
                  ${!form.half_day ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                <span className="text-lg">🕗</span>
                <span>Período integral</span>
                <span className="text-[10px] font-normal opacity-70">Meta: 8h44m/dia</span>
              </button>
              <button type="button" onClick={() => set('half_day', true)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-semibold transition-all
                  ${form.half_day ? 'bg-amber-50 text-amber-700 border-amber-300' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                <span className="text-lg">🕓</span>
                <span>Meio período</span>
                <span className="text-[10px] font-normal opacity-70">Meta: 5h/dia</span>
              </button>
            </div>
          </Field>
        </div>
      )}

      {/* ── Documentos pessoais ── */}
      {tab === 'documentos' && (
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <p className="text-xs font-semibold text-slate-500">Documentos de identificação do colaborador.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="CPF">
              <input className="input" value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00"/>
            </Field>
            <Field label="RG / Identidade">
              <input className="input" value={form.document_personal} onChange={e => set('document_personal', e.target.value)} placeholder="Ex: 12.345.678-9"/>
            </Field>
          </div>
          <Field label="CNH (número e categoria)">
            <input className="input" value={form.cnh ?? ''} onChange={e => set('cnh', e.target.value)} placeholder="Ex: 12345678901 — Categoria B"/>
          </Field>
          {/* ── Documentos físicos ── */}
          {isEditing && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="form-label mb-0">Arquivos de documentos</label>
                {docUploading && <span className="text-xs text-indigo-500 font-semibold animate-pulse">Enviando...</span>}
              </div>

              {/* Uploads rápidos por tipo */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type:'rg',   label:'RG / Identidade' },
                  { type:'cpf',  label:'CPF'             },
                  { type:'cnh',  label:'CNH'             },
                  { type:'ctps', label:'CTPS'            },
                  { type:'comp', label:'Comprovante res.' },
                  { type:'outro',label:'Outro documento' },
                ].map(dt => (
                  <label key={dt.type}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-slate-200 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-xs font-semibold text-slate-500">
                    <Upload size={12} className="shrink-0 text-indigo-400"/>
                    {dt.label}
                    <input type="file" accept=".pdf,image/*" className="hidden"
                      onChange={e => handleDocUpload(e, dt.type, dt.label)} disabled={docUploading}/>
                  </label>
                ))}
              </div>

              {/* Lista de documentos enviados */}
              {empDocs.length > 0 ? (
                <div className="flex flex-col divide-y divide-slate-100 mt-1 border border-slate-100 rounded-xl overflow-hidden">
                  {empDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                      <FileText size={14} className="text-indigo-400 shrink-0"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{doc.name}</p>
                        <p className="text-[10px] text-slate-400">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <button onClick={() => viewStorageFile(doc.storage_path)}
                        className="text-[10px] font-bold text-sky-500 hover:text-sky-600 px-2 py-1 rounded-lg hover:bg-sky-50 shrink-0">
                        Ver
                      </button>
                      <button onClick={() => deleteDoc(doc)}
                        className="p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 shrink-0">
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-300 text-center py-2 italic">Nenhum documento enviado ainda.</p>
              )}
            </div>
          )}
          {!isEditing && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-xs text-amber-600 font-semibold">💡 Salve o colaborador primeiro para fazer upload de documentos.</p>
            </div>
          )}

          <Field label="Observações documentais">
            <textarea className="textarea resize-none" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Validade CNH, documentos pendentes, etc..."/>
          </Field>
        </div>
      )}

      {/* ── Holerites ── */}
      {tab === 'holerites' && (
        <div className="flex flex-col gap-3">
          {!isEditing ? (
            <div className="p-8 text-center text-slate-400 text-sm">Salve o colaborador primeiro para ver holerites.</div>
          ) : payslips.length === 0 ? (
            <div className="p-8 text-center">
              <Receipt size={32} className="text-slate-200 mx-auto mb-2"/>
              <p className="text-sm text-slate-400">Nenhum holerite cadastrado.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400 font-semibold">{payslips.length} holerite(s) encontrado(s)</p>
              <div className="flex flex-col divide-y divide-slate-100">
                {payslips.map(p => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-700">{p.reference}</p>
                      <p className="text-xs text-slate-400">{String(p.month).padStart(2,'0')}/{p.year}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {p.file_url && (
                        <button onClick={() => viewStorageFile(p.file_url)}
                          className="flex items-center gap-1.5 text-xs font-bold text-sky-500 hover:text-sky-600 px-2.5 py-1.5 rounded-lg border border-sky-100 hover:bg-sky-50">
                          <FileText size={12}/> Holerite
                        </button>
                      )}
                      {p.mirror_url && (
                        <button onClick={() => viewStorageFile(p.mirror_url)}
                          className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 hover:text-emerald-600 px-2.5 py-1.5 rounded-lg border border-emerald-100 hover:bg-emerald-50">
                          <FileText size={12}/> Espelho
                        </button>
                      )}
                      {/* Recibo */}
                      {p.receipt_url ? (
                        <button onClick={() => viewStorageFile(p.receipt_url)}
                          className="flex items-center gap-1.5 text-xs font-bold text-violet-500 hover:text-violet-600 px-2.5 py-1.5 rounded-lg border border-violet-100 hover:bg-violet-50">
                          <FileText size={12}/> Recibo
                        </button>
                      ) : (
                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-200 hover:border-slate-300 cursor-pointer transition-colors">
                          <Upload size={11}/> Recibo
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                            onChange={async e => {
                              const file = e.target.files[0]
                              if (!file) return
                              if (file.size > 10*1024*1024) { toast.error('Máximo 10MB'); return }
                              try {
                                const ext  = file.name.split('.').pop()
                                const path = `holerites/${initial.id}/recibo_${p.year}_${p.month}.${ext}`
                                const { error: upErr } = await supabase.storage.from('employee-docs').upload(path, file, {upsert:true})
                                if (upErr) throw upErr
                                const { data: sd } = await supabase.storage.from('employee-docs').createSignedUrl(path, 60*60*24*365)
                                await supabase.from('payslips').update({ receipt_url: sd?.signedUrl }).eq('id', p.id)
                                toast.success('Recibo enviado!')
                                loadExtras(initial.id)
                              } catch(err) { toast.error('Erro: ' + err.message) }
                            }}/>
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Férias ── */}
      {tab === 'ferias' && (
        <div className="flex flex-col gap-3">
          {!isEditing ? (
            <div className="p-8 text-center text-slate-400 text-sm">Salve o colaborador primeiro.</div>
          ) : ferias.length === 0 ? (
            <div className="p-8 text-center">
              <FileText size={28} className="text-slate-200 mx-auto mb-2"/>
              <p className="text-sm text-slate-400 mt-2">Nenhum pedido de férias registrado.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400 font-semibold">{ferias.length} pedido(s) encontrado(s)</p>
              <div className="flex flex-col divide-y divide-slate-100">
                {ferias.map(v => {
                  const statusCfg = {
                    aprovado:  { label:'Aprovado',  cls:'bg-emerald-50 text-emerald-600' },
                    pendente:  { label:'Pendente',  cls:'bg-amber-50 text-amber-600'    },
                    reprovado: { label:'Reprovado', cls:'bg-rose-50 text-rose-600'      },
                  }[v.status] ?? { label: v.status, cls:'bg-slate-100 text-slate-500' }
                  const fmtD = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}) : '—'
                  const isAprovado = v.status === 'aprovado'

                  async function handleReceiptUpload(e, vacId) {
                    const file = e.target.files[0]
                    if (!file) return
                    if (file.size > 10*1024*1024) { toast.error('Máximo 10MB'); return }
                    try {
                      const ext  = file.name.split('.').pop()
                      const path = `ferias/${initial.id}/${vacId}.${ext}`
                      const { error: upErr } = await supabase.storage.from('employee-docs').upload(path, file, {upsert:true})
                      if (upErr) throw upErr
                      const { data: signedData } = await supabase.storage.from('employee-docs').createSignedUrl(path, 60*60*24*365)
                      await supabase.from('vacation_requests').update({ receipt_url: signedData?.signedUrl }).eq('id', vacId)
                      toast.success('Recibo enviado!')
                      loadExtras(initial.id)
                    } catch(err) { toast.error('Erro: ' + err.message) }
                  }

                  async function removeReceipt(vacId) {
                    await supabase.from('vacation_requests').update({ receipt_url: null }).eq('id', vacId)
                    toast.success('Recibo removido.')
                    loadExtras(initial.id)
                  }

                  return (
                    <div key={v.id} className="py-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <p className="text-sm font-bold text-slate-700">
                              {fmtD(v.date_start)} → {fmtD(v.date_end)}
                            </p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg.cls}`}>
                              {statusCfg.label}
                            </span>
                          </div>
                          {v.days > 0 && <p className="text-xs text-slate-400">{v.days} dia(s) corridos</p>}
                          {v.notes && <p className="text-xs text-slate-400 italic mt-0.5">"{v.notes}"</p>}
                        </div>
                      </div>

                      {/* Anexos — só para férias aprovadas */}
                      {isAprovado && (
                        <div className="flex flex-col gap-2">
                          {/* Recibo */}
                          {v.receipt_url ? (
                            <div className="flex items-center gap-2 p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
                              <FileText size={13} className="text-emerald-500 shrink-0"/>
                              <span className="text-xs font-semibold text-emerald-700 flex-1">Recibo anexado</span>
                              <a href={v.receipt_url} target="_blank" rel="noopener"
                                className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-100">Ver</a>
                              <button onClick={() => removeReceipt(v.id)}
                                className="p-1 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50">
                                <X size={12}/>
                              </button>
                            </div>
                          ) : (
                            <label className="flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-colors">
                              <Upload size={12} className="text-slate-400 shrink-0"/>
                              <span className="text-xs text-slate-400 font-semibold">Anexar recibo de férias</span>
                              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                                onChange={e => handleReceiptUpload(e, v.id)}/>
                            </label>
                          )}
                          {/* Comprovante */}
                          {v.voucher_url ? (
                            <div className="flex items-center gap-2 p-2.5 bg-violet-50 rounded-xl border border-violet-100">
                              <FileText size={13} className="text-violet-500 shrink-0"/>
                              <span className="text-xs font-semibold text-violet-700 flex-1">Comprovante anexado</span>
                              <a href={v.voucher_url} target="_blank" rel="noopener"
                                className="text-[10px] font-bold text-violet-600 hover:text-violet-700 px-2 py-1 rounded-lg hover:bg-violet-100">Ver</a>
                              <button onClick={async () => {
                                  await supabase.from('vacation_requests').update({ voucher_url: null }).eq('id', v.id)
                                  toast.success('Comprovante removido.')
                                  loadExtras(initial.id)
                                }}
                                className="p-1 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50">
                                <X size={12}/>
                              </button>
                            </div>
                          ) : (
                            <label className="flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-slate-200 hover:border-violet-300 hover:bg-violet-50/30 cursor-pointer transition-colors">
                              <Upload size={12} className="text-slate-400 shrink-0"/>
                              <span className="text-xs text-slate-400 font-semibold">Anexar comprovante</span>
                              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                                onChange={async e => {
                                  const file = e.target.files[0]
                                  if (!file) return
                                  if (file.size > 10*1024*1024) { toast.error('Máximo 10MB'); return }
                                  try {
                                    const ext  = file.name.split('.').pop()
                                    const path = `ferias/${initial.id}/${v.id}_voucher.${ext}`
                                    const { error: upErr } = await supabase.storage.from('employee-docs').upload(path, file, {upsert:true})
                                    if (upErr) throw upErr
                                    const { data: sd } = await supabase.storage.from('employee-docs').createSignedUrl(path, 60*60*24*365)
                                    await supabase.from('vacation_requests').update({ voucher_url: sd?.signedUrl }).eq('id', v.id)
                                    toast.success('Comprovante enviado!')
                                    loadExtras(initial.id)
                                  } catch(err) { toast.error('Erro: ' + err.message) }
                                }}/>
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Atestados ── */}
      {tab === 'atestados' && (
        <div className="flex flex-col gap-3">
          {!isEditing ? (
            <div className="p-8 text-center text-slate-400 text-sm">Salve o colaborador primeiro para ver atestados.</div>
          ) : atestados.length === 0 ? (
            <div className="p-8 text-center">
              <Stethoscope size={32} className="text-slate-200 mx-auto mb-2"/>
              <p className="text-sm text-slate-400">Nenhum atestado cadastrado.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400 font-semibold">{atestados.length} atestado(s) encontrado(s)</p>
              <div className="flex flex-col divide-y divide-slate-100">
                {atestados.map(a => (
                  <div key={a.id} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-bold text-slate-700">
                          {a.date ? new Date(a.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}) : '—'}
                        </p>
                        {a.days_off > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">
                            {a.days_off} dia(s) afastado
                          </span>
                        )}
                      </div>
                      {a.notes && <p className="text-xs text-slate-400 mt-0.5">{a.notes}</p>}
                    </div>
                    {a.file_url && (
                      <button onClick={() => viewStorageFile(a.file_url)}
                        className="flex items-center gap-1.5 text-xs font-bold text-sky-500 hover:text-sky-600 px-2.5 py-1.5 rounded-lg border border-sky-100 hover:bg-sky-50 shrink-0">
                        <FileText size={12}/> Ver PDF
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Avisos ── */}
      {tab === 'avisos' && (
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
            <p className="text-xs font-semibold text-amber-700">Registro de promoções, advertências e observações formais.</p>
          </div>
          <Field label="Promoções e reconhecimentos">
            <textarea className="textarea resize-none" rows={4}
              value={form.warnings_notes?.split('---AVISOS---')[0] ?? ''}
              onChange={e => set('warnings_notes', e.target.value + '---AVISOS---' + (form.warnings_notes?.split('---AVISOS---')[1] ?? ''))}
              placeholder="Ex: 01/06/2026 — Promovido a Líder de Produção"/>
          </Field>
          <Field label="Advertências formais">
            <textarea className="textarea resize-none" rows={4}
              value={form.warnings_notes?.split('---AVISOS---')[1] ?? ''}
              onChange={e => set('warnings_notes', (form.warnings_notes?.split('---AVISOS---')[0] ?? '') + '---AVISOS---' + e.target.value)}
              placeholder="Ex: 15/03/2026 — Advertência verbal por atraso recorrente"/>
          </Field>
        </div>
      )}

      {/* ── Emergência ── */}
      {tab === 'emergencia' && (
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl">
            <p className="text-sm font-semibold text-rose-700 mb-1">Contato de emergência</p>
            <p className="text-xs text-rose-500">Pessoa a ser contatada em caso de emergência com o colaborador.</p>
          </div>
          <Field label="Nome do contato">
            <input className="input" value={form.emergency_name} onChange={e => set('emergency_name', e.target.value)} placeholder="Nome completo"/>
          </Field>
          <Field label="Telefone do contato">
            <input className="input" value={form.emergency_phone} onChange={e => set('emergency_phone', e.target.value)} placeholder="(14) 99999-9999"/>
          </Field>
        </div>
      )}
    </Modal>
  )
}