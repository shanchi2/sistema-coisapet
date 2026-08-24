import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'


import toast from 'react-hot-toast'

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

async function auditLog(action, tableName, recordId, description) {
  try {
    const s = getSession()
    if (!s?.id) return
    await supabase.rpc('audit_log_with_user', {
      p_user_id:     s.id,
      p_action:      action,
      p_table_name:  tableName,
      p_record_id:   recordId,
      p_description: description,
    })
  } catch {}
}


export function useSystemUsers() {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('system_users')
.select('id, name, email, notification_email, role, job_title, phone, cpf, hire_date, birthday, monthly_salary, monthly_hours, address, emergency_name, emergency_phone, notes, must_change_password, last_login_at, created_at, document_personal, photo_url, medical_certs_notes, contract_signed, warnings_notes, half_day, contract_url, cnh, employee_type, payment_day, company_name, company_cnpj, escritorio_sector').eq('active', true)
      .order('name')

    if (error) { toast.error('Erro ao carregar usuários.'); console.error(error) }
    else setUsers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // Cria usuário via RPC (senha é hasheada no banco com bcrypt)
  async function create(payload) {
    // Escritório COM acesso ao Kanban — vira um login de verdade, role='escritorio'
    if (payload.employee_type === 'escritorio' && payload.kanban_access) {
      if (!payload.email?.trim() || !payload.password?.trim()) {
        toast.error('E-mail e senha são obrigatórios para dar acesso ao Kanban.')
        throw new Error('Email/senha vazios')
      }
      const { data, error } = await supabase.rpc('create_system_user', {
        p_name:        payload.name,
        p_email:       payload.email,
        p_password:    payload.password,
        p_role:        'escritorio',
        p_job_title:   payload.job_title || null,
        p_phone:       payload.phone     || null,
        p_cpf:         null,
        p_hire_date:   null,
        p_hourly_rate: null,
        p_notes:       payload.notes || null,
      })
      if (error) { const msg = error.message || 'Erro ao cadastrar escritório.'; toast.error(msg); throw new Error(msg) }
      if (data?.error) { toast.error(data.error); throw new Error(data.error) }

      const newId = data.id
      await supabase.from('system_users').update({
        employee_type:      'escritorio',
        company_name:       payload.company_name || null,
        company_cnpj:       payload.company_cnpj  || null,
        address:            payload.address       || null,
        escritorio_sector:  payload.escritorio_sector || null,
        notification_email: payload.email,
      }).eq('id', newId)

      if (payload.contacts?.length) {
        const valid = payload.contacts.filter(ct => ct.name || ct.whatsapp || ct.email)
        if (valid.length) await supabase.from('employee_contacts').insert(valid.map((ct,i) => ({...ct, employee_id: newId, sort_order: i})))
      }
      toast.success('Escritório cadastrado com acesso ao Kanban!')
      await fetch()
      return newId
    }

    // Escritório SEM acesso ao sistema — insert direto sem senha (comportamento padrão)
    if (payload.employee_type === 'escritorio') {
      const { data, error } = await supabase.from('system_users').insert({
        name:          payload.name,
        email:         payload.email || null,
        role:          'equipe',
        job_title:     payload.job_title   || null,
        phone:         payload.phone       || null,
        address:       payload.address     || null,
        notes:         payload.notes       || null,
        employee_type: 'escritorio',
        company_name:  payload.company_name || null,
        company_cnpj:  payload.company_cnpj || null,
        active:        true,
        password_hash: 'NO_ACCESS', // sem acesso
      }).select('id').single()
      if (error) { toast.error('Erro ao cadastrar escritório: ' + error.message); throw error }
      // Salva contatos
      if (payload.contacts?.length) {
        const valid = payload.contacts.filter(ct => ct.name || ct.whatsapp || ct.email)
        if (valid.length) await supabase.from('employee_contacts').insert(valid.map((ct,i) => ({...ct, employee_id: data.id, sort_order: i})))
      }
      toast.success('Escritório cadastrado!')
      await fetch()
      return data.id
    }

    // CLT / Prestador — via RPC com senha
    console.log('[create] payload.email:', payload.email, '| payload.name:', payload.name, '| type:', payload.employee_type)
    if (!payload.email?.trim()) {
      toast.error('E-mail obrigatório para CLT e Prestador.')
      throw new Error('Email vazio')
    }
    const { data, error } = await supabase.rpc('create_system_user', {
      p_name:        payload.name,
      p_email:       payload.email,
      p_password:    payload.password,
      p_role:        payload.role        || 'equipe',
      p_job_title:   payload.job_title   || null,
      p_phone:       payload.phone       || null,
      p_cpf:         payload.cpf         || null,
      p_hire_date:   payload.hire_date   || null,  // string vazia vira null
      p_hourly_rate: payload.hourly_rate || null,
      p_notes:       payload.notes       || null,
    })

    console.log('[create] RPC result:', { data, error })
    // O Supabase retorna 400 quando a função retorna JSON com 'error'
    // Precisamos tratar isso como erro de negócio, não de rede
    if (error) {
      // Tenta extrair mensagem do corpo do erro
      const msg = error.message || error.details || 'Erro ao cadastrar usuário.'
      toast.error(msg)
      throw new Error(msg)
    }
    if (data?.error) {
      toast.error(data.error)
      throw new Error(data.error)
    }

    const newId = data.id

    // Atualiza campos que a RPC não suporta
    await supabase.from('system_users').update({
      employee_type:  payload.employee_type  || 'clt',
      payment_day:    payload.payment_day ? parseInt(payload.payment_day) : null,
      company_name:   payload.company_name   || null,
      company_cnpj:   payload.company_cnpj   || null,
      birthday:       payload.birthday       || null,
      address:        payload.address        || null,
      notification_email: payload.notification_email?.trim() || payload.email || null,
    }).eq('id', newId)

    // Salva contatos se prestador PJ
    if (payload.contacts?.length) {
      const valid = payload.contacts.filter(ct => ct.name || ct.whatsapp || ct.email)
      if (valid.length) {
        await supabase.from('employee_contacts').insert(
          valid.map((ct, i) => ({ ...ct, employee_id: newId, sort_order: i }))
        )
      }
    }

    // Gera lançamentos se tiver salário
    if (payload.monthly_salary) {
      const salary = parseFloat(String(payload.monthly_salary).replace(/\./g,'').replace(',','.'))
      if (salary > 0) await syncSalaryEntries(newId, payload.name, salary, payload.payment_day, payload.employee_type || 'clt')
    }

    await fetch()
    return newId
  }

  // Atualiza dados pessoais diretamente (todos os campos)
  async function update(id, payload) {
    const clean = {
      name:                payload.name              ?? null,
      role:                payload.role              ?? null,
      email:               payload.email             || null,
      notification_email:  payload.notification_email?.trim() || payload.email || null,
      job_title:           payload.job_title         || null,
      phone:               payload.phone             || null,
      cpf:                 payload.cpf               || null,
      hire_date:           payload.hire_date         || null,
      birthday:            payload.birthday          || null,
      address:             payload.address           || null,
      monthly_salary:      payload.monthly_salary
        ? parseFloat(String(payload.monthly_salary).replace(/\./g,'').replace(',','.'))
        : null,
      monthly_hours:       payload.monthly_hours
        ? parseInt(payload.monthly_hours)
        : 220,
      emergency_name:      payload.emergency_name   || null,
      emergency_phone:     payload.emergency_phone  || null,
      notes:               payload.notes            || null,
      // Novos campos
      document_personal:   payload.document_personal  || null,
      photo_url:           payload.photo_url          || null,
      medical_certs_notes: payload.medical_certs_notes|| null,
      contract_signed:     payload.contract_signed    ?? false,
      warnings_notes:      payload.warnings_notes     || null,
      half_day:            payload.half_day           ?? false,
      contract_url:        payload.contract_url       || null,
      cnh:                 payload.cnh                || null,
      employee_type:       payload.employee_type      || 'clt',
      payment_day:         payload.payment_day         ? parseInt(payload.payment_day) : 5,
      company_name:        payload.company_name        || null,
      company_cnpj:        payload.company_cnpj        || null,
      escritorio_sector:   payload.escritorio_sector    || null,
      // active só muda quando contract_signed é alterado explicitamente no modal de contrato
      // payload.set_active vem true/false apenas quando o toggle foi tocado
      ...(payload.set_active !== undefined ? { active: payload.set_active } : {}),
    }

    const { error } = await supabase
      .from('system_users')
      .update(clean)
      .eq('id', id)

    if (error) {
      toast.error('Erro ao atualizar colaborador: ' + error.message)
      console.error(error)
      throw error
    }

    // Salva contatos múltiplos se fornecidos
    if (payload.contacts !== undefined) {
      await supabase.from('employee_contacts').delete().eq('employee_id', id)
      const validContacts = (payload.contacts || []).filter(ct => ct.name || ct.whatsapp || ct.email)
      if (validContacts.length > 0) {
        await supabase.from('employee_contacts').insert(
          validContacts.map((ct, i) => ({ ...ct, employee_id: id, sort_order: i }))
        )
      }
    }

    // Gera/atualiza lançamentos no financeiro se salário informado
    const newSalary = clean.monthly_salary
    if (newSalary && newSalary > 0) {
      await syncSalaryEntries(id, clean.name || payload.name, newSalary, clean.payment_day, clean.employee_type)
    }

    await auditLog('UPDATE', 'system_users', id, 'Editou colaborador')
    toast.success('Colaborador atualizado!')
    await fetch()
  }

  // Calcula o Nº dia útil de um mês (seg-sex), ignorando feriados
  async function getNthWorkDay(year, month, n = 5) {
    // Busca feriados do mês
    const dateStart = `${year}-${String(month+1).padStart(2,'0')}-01`
    const dateEnd   = `${year}-${String(month+1).padStart(2,'0')}-${new Date(year, month+1, 0).getDate()}`
    const { data: hols } = await supabase.from('holidays').select('date')
      .gte('date', dateStart).lte('date', dateEnd)
    const holidayDates = (hols ?? []).map(h => h.date)

    let count = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    for (let day = 1; day <= daysInMonth; day++) {
      const d   = new Date(year, month, day)
      const dow = d.getDay()
      const ds  = d.toISOString().split('T')[0]
      if (dow === 0 || dow === 6) continue        // fds
      if (holidayDates.includes(ds)) continue     // feriado
      count++
      if (count === n) return day                 // achou o Nº dia útil
    }
    return daysInMonth // fallback: último dia do mês
  }

  // Sincroniza lançamentos de salário nos próximos 3 meses
  async function syncSalaryEntries(empId, empName, salary, payDay, empType) {
    const session = getSession()
    const today   = new Date()
    const catMap  = { clt: 'salario', prestador: 'prestador', escritorio: 'escritorio' }
    const category = catMap[empType] || 'salario'

    // Cancela lançamentos futuros existentes deste colaborador
    const { data: existing } = await supabase
      .from('director_entries')
      .select('id, due_date')
      .eq('employee_id', empId)
      .eq('status', 'pendente')
      .gte('due_date', today.toISOString().split('T')[0])

    if (existing?.length) {
      await supabase.from('director_entries')
        .update({ status: 'cancelado', updated_at: new Date().toISOString() })
        .in('id', existing.map(e => e.id))
    }

    // Gera lançamentos para os próximos 3 meses
    const entries = []
    for (let m = 0; m < 3; m++) {
      const targetYear  = today.getFullYear()
      const targetMonth = today.getMonth() + m

      // Se payDay não preenchido → calcula 5º dia útil do mês
      let dueDay
      if (!payDay) {
        dueDay = await getNthWorkDay(targetYear, targetMonth, 5)
      } else {
        dueDay = parseInt(payDay)
      }

      const d = new Date(targetYear, targetMonth, dueDay)
      // Se a data já passou neste mês, pula
      if (m === 0 && d < today) continue
      entries.push({
        description:    `${empName} — ${d.toLocaleDateString('pt-BR', { month:'long', year:'numeric' })}`,
        amount:         salary,
        due_date:       d.toISOString().split('T')[0],
        status:         'pendente',
        category,
        employee_id:    empId,
        recipient_name: empName,
        created_by:     session.id || null,
      })
    }

    if (entries.length > 0) {
      await supabase.from('director_entries').insert(entries)
      toast.success(entries.length + ' lançamento(s) gerado(s) no Financeiro Diretoria!')
    }
  }

  // Desativa usuário (soft delete)
  async function remove(id) {
    const { data, error } = await supabase.rpc('deactivate_system_user', { p_id: id })
    if (error || data?.error) { toast.error('Erro ao remover usuário.'); throw error }
    toast.success('Usuário removido.')
    await fetch()
  }

  // Reset de senha pelo admin (sem verificar a senha antiga)
  async function resetPassword(id, newPassword) {
    const { data, error } = await supabase.rpc('change_user_password', {
      p_user_id:      id,
      p_old_password: null,
      p_new_password: newPassword,
    })
    if (error || data?.error) { toast.error(data?.error ?? 'Erro ao resetar senha.'); throw error }
    toast.success('Senha resetada! O usuário deverá trocá-la no próximo login.')

    // Marca must_change_password = true novamente
    await supabase.from('system_users').update({ must_change_password: true }).eq('id', id)
    await fetch()
  }

  // Força o encerramento de qualquer sessão ativa desse usuário — o app dele
  // desloga sozinho na próxima checagem periódica (a cada ~30s), mesmo sem
  // ninguém tocar no dispositivo onde ele está logado
  async function forceLogout(id) {
    const { error } = await supabase
      .from('system_users')
      .update({ force_logout_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { toast.error('Erro ao desconectar usuário.'); throw error }
    toast.success('Sessão será encerrada em instantes, onde quer que esteja logada.')
  }

  return { users, loading, refetch: fetch, create, update, remove, resetPassword, forceLogout }
}