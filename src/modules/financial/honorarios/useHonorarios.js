import { useCallback, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { buildPixPayload, normalizePixKey } from '../../../lib/pix'

// Pagamento de Honorários (06/10, fase97). Só diretor usa.
//
// Competência = mês TRABALHADO (ex: Setembro), pago no começo do mês
// seguinte. O valor padrão de cada um é calculado aqui:
//   1. salário fixo com desconto por falta (fixed_monthly_salary) — mesma
//      conta do Relatório de Ponto;
//   2. salário mensal (monthly_salary) + horas de fim de semana × valor/hora
//      pra quem tem "fim de semana separado";
//   3. só valor/hora → horas do ponto no mês × valor/hora;
//   4. nada disso → valor do lançamento do Fin. Diretoria do mês, se houver.
// Sempre editável no modal (com motivo).

export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const fmtBRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtHours = h => { const H = Math.floor(h); const m = Math.round((h - H) * 60); return `${H}h${m ? String(m).padStart(2, '0') : ''}` }
const pad = n => String(n).padStart(2, '0')
const lastDay = (y, m) => new Date(y, m, 0).getDate() // m 1-12

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') } catch { return {} }
}

// Lançamento do Fin. Diretoria que corresponde à competência: o que vence
// no mês seguinte (padrão: dia 5) ou, se não houver, no próprio mês.
function pickEntry(entries, empId, y, m) {
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
  const same = `${y}-${pad(m)}`
  const mine = entries.filter(e => e.employee_id === empId)
  return mine.find(e => e.due_date.startsWith(next)) || mine.find(e => e.due_date.startsWith(same)) || null
}

export function useHonorarios() {
  const load = useCallback(async (y, m) => {
    const start = `${y}-${pad(m)}-01`
    const end = `${y}-${pad(m)}-${pad(lastDay(y, m))}`
    const nextEnd = m === 12 ? `${y + 1}-01-31` : `${y}-${pad(m + 1)}-${pad(lastDay(y, m + 1))}`

    const [usersR, recsR, holsR, entriesR, paysR] = await Promise.all([
      supabase.from('system_users')
        .select('id, name, role, job_title, employee_type, monthly_salary, fixed_monthly_salary, hourly_rate, weekend_hours_separate, pix_key, pix_key_type, pix_holder')
        .eq('active', true).order('name'),
      supabase.from('time_records').select('employee_id, date, punch_type, hours_worked')
        .gte('date', start).lte('date', end).limit(20000),
      supabase.from('holidays').select('date').gte('date', start).lte('date', end),
      supabase.from('director_entries').select('id, employee_id, amount, due_date, status, paid_amount, paid_at')
        .not('employee_id', 'is', null).in('status', ['pendente', 'pago'])
        .gte('due_date', start).lte('due_date', nextEnd).order('due_date'),
      supabase.from('employee_payments').select('*').eq('ref_year', y).eq('ref_month', m),
    ])
    for (const r of [usersR, recsR, holsR, entriesR, paysR]) if (r.error) throw r.error

    const today = new Date().toISOString().slice(0, 10)
    const hol = new Set((holsR.data || []).map(h => h.date))
    const days = []
    for (let d = 1; d <= lastDay(y, m); d++) {
      const date = `${y}-${pad(m)}-${pad(d)}`
      const wd = new Date(date + 'T12:00:00').getDay()
      days.push({ date, isWeekend: wd === 0 || wd === 6, isHoliday: hol.has(date) })
    }
    // Por funcionário: dias com batida e horas (horas ficam na batida de saída)
    const byEmp = {}
    ;(recsR.data || []).forEach(r => {
      const e = byEmp[r.employee_id] ||= { daysWithPunch: new Set(), hours: 0, weekendHours: 0 }
      e.daysWithPunch.add(r.date)
      if (r.punch_type === 'saida' && r.hours_worked) {
        const h = Number(r.hours_worked) || 0
        e.hours += h
        const day = days.find(x => x.date === r.date)
        if (day && (day.isWeekend || day.isHoliday)) e.weekendHours += h
      }
    })
    const pays = Object.fromEntries((paysR.data || []).map(p => [p.employee_id, p]))
    const entries = entriesR.data || []

    const rows = (usersR.data || []).map(u => {
      const st = byEmp[u.id] || { daysWithPunch: new Set(), hours: 0, weekendHours: 0 }
      const entry = pickEntry(entries, u.id, y, m)
      let amount = 0, note = ''
      if (Number(u.fixed_monthly_salary) > 0) {
        // Mesma regra do Relatório de Ponto (calcFixedSalaryStats)
        const sal = Number(u.fixed_monthly_salary)
        const uteis = days.filter(d => !d.isWeekend && !d.isHoliday)
        const valorDia = uteis.length ? sal / uteis.length : 0
        const esperados = uteis.filter(d => d.date <= today)
        const trabalhados = esperados.filter(d => st.daysWithPunch.has(d.date)).length
        const compensados = days.filter(d => (d.isWeekend || d.isHoliday) && d.date <= today && st.daysWithPunch.has(d.date)).length
        const faltas = Math.max(0, Math.max(0, esperados.length - trabalhados) - compensados)
        amount = Math.max(0, sal - faltas * valorDia)
        note = faltas ? `Salário fixo ${fmtBRL(sal)} − ${faltas} falta${faltas > 1 ? 's' : ''} (${fmtBRL(faltas * valorDia)})` : `Salário fixo ${fmtBRL(sal)}, sem faltas`
      } else if (Number(u.monthly_salary) > 0) {
        amount = Number(u.monthly_salary)
        note = `Salário ${fmtBRL(amount)}`
        if (u.weekend_hours_separate && Number(u.hourly_rate) > 0 && st.weekendHours > 0) {
          const extra = st.weekendHours * Number(u.hourly_rate)
          amount += extra
          note += ` + ${fmtHours(st.weekendHours)} fim de semana × ${fmtBRL(u.hourly_rate)}`
        }
      } else if (Number(u.hourly_rate) > 0) {
        amount = st.hours * Number(u.hourly_rate)
        note = `${fmtHours(st.hours)} no ponto × ${fmtBRL(u.hourly_rate)}/h`
      } else if (entry) {
        amount = Number(entry.amount) || 0
        note = 'Valor do lançamento no Fin. Diretoria'
      }
      amount = Math.round(amount * 100) / 100
      return { user: u, amount, note, entry, payment: pays[u.id] || null }
    })
      // Só quem tem algo a receber (valor, chave Pix ou lançamento) ou já tem pagamento no mês
      .filter(r => r.amount > 0 || r.user.pix_key || r.entry || r.payment)

    return rows
  }, [])

  // Gera (ou regera) o Pix do mês — grava o registro como "gerado"
  const generatePix = useCallback(async ({ row, y, m, amount, reason, description }) => {
    const u = row.user
    const key = normalizePixKey(u.pix_key, u.pix_key_type)
    const payload = buildPixPayload({
      key,
      name: u.pix_holder || u.name,
      city: 'BRASIL',
      amount,
      description,
      txid: `HON${y}${pad(m)}${u.id.replace(/-/g, '').slice(0, 10)}`,
    })
    const me = getSession()
    const rec = {
      employee_id: u.id, ref_month: m, ref_year: y,
      default_amount: row.amount, amount, calc_note: row.note,
      edit_reason: Math.abs(amount - row.amount) > 0.004 ? (reason || null) : null,
      pix_key: key, pix_payload: payload, status: 'gerado',
      created_by: me.id || null, created_by_name: me.name || null, updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('employee_payments')
      .upsert(rec, { onConflict: 'employee_id,ref_month,ref_year' }).select().single()
    if (error) throw error
    return data
  }, [])

  // Comprovante (opcional na hora — pode anexar depois). Vai pro bucket
  // employee-docs e aparece como "Recibo" no mês da ficha do funcionário.
  const uploadReceipt = useCallback(async ({ payment, file, y, m }) => {
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
    const path = `pagamentos/${payment.employee_id}/${y}-${pad(m)}-comprovante.${ext}`
    const { error: upErr } = await supabase.storage.from('employee-docs').upload(path, file, { upsert: true })
    if (upErr) throw upErr
    await supabase.from('employee_payments').update({ receipt_path: path, updated_at: new Date().toISOString() }).eq('id', payment.id)

    // Ficha: recibo do mês (payslips da competência; cria o mês se não existir)
    const { data: slips } = await supabase.from('payslips').select('id, label')
      .eq('employee_id', payment.employee_id).eq('month', m).eq('year', y).order('created_at')
    const slip = (slips || []).find(s => !s.label) || (slips || [])[0]
    if (slip) await supabase.from('payslips').update({ receipt_url: path }).eq('id', slip.id)
    else await supabase.from('payslips').insert({ employee_id: payment.employee_id, month: m, year: y, reference: `${MONTHS[m - 1]}/${y}`, receipt_url: path, created_by: getSession().id || null })

    // Fin. Diretoria: comprovante no lançamento
    if (payment.director_entry_id) await supabase.from('director_entries').update({ receipt_url: path }).eq('id', payment.director_entry_id)
    return path
  }, [])

  // Marca como pago e dá baixa no lançamento do Fin. Diretoria (ou cria um já pago)
  const markPaid = useCallback(async ({ row, payment, y, m }) => {
    const me = getSession()
    const todayStr = new Date().toISOString().slice(0, 10)
    const u = row.user
    const noteTxt = `Honorários ${MONTHS[m - 1]}/${y} pago via Pix pela tela de Pagamento de Honorários`
      + (payment.edit_reason ? ` — valor ajustado: ${payment.edit_reason}` : '')
    let entryId = row.entry?.id || null
    const patch = {
      status: 'pago', paid_at: todayStr, paid_amount: payment.amount,
      recipient_pix: payment.pix_key, notes: noteTxt, updated_at: new Date().toISOString(),
      ...(payment.receipt_path ? { receipt_url: payment.receipt_path } : {}),
    }
    if (entryId) {
      const { error } = await supabase.from('director_entries').update(patch).eq('id', entryId)
      if (error) throw error
    } else {
      const catMap = { clt: 'salario', horista: 'prestador', prestador: 'prestador', escritorio: 'escritorio' }
      const { data, error } = await supabase.from('director_entries').insert({
        ...patch,
        description: `${u.name} — ${MONTHS[m - 1].toLowerCase()} de ${y}`,
        amount: payment.amount, due_date: todayStr,
        category: catMap[u.employee_type] || 'salario',
        employee_id: u.id, recipient_name: u.name, created_by: me.id || null,
      }).select('id').single()
      if (error) throw error
      entryId = data.id
    }
    const { error } = await supabase.from('employee_payments').update({
      status: 'pago', paid_at: new Date().toISOString(), paid_by: me.id || null, paid_by_name: me.name || null,
      director_entry_id: entryId, updated_at: new Date().toISOString(),
    }).eq('id', payment.id)
    if (error) throw error
  }, [])

  // Objeto estável: sem o useMemo, cada render devolvia um objeto novo e o
  // useEffect da página (que depende dele) recarregava em loop infinito.
  return useMemo(() => ({ load, generatePix, uploadReceipt, markPaid }), [load, generatePix, uploadReceipt, markPaid])
}
