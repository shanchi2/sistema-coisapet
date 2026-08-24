import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'
import { parseCurrency } from '../../../lib/masks'

// Retorna sessão completa do usuário logado
function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

// Registra ação passando usuário diretamente — sem depender de sessão REST
async function auditLog(action, tableName, recordId, description, oldData = null, newData = null) {
  try {
    const s = getSession()
    if (!s?.id) return
    await supabase.rpc('audit_log_with_user', {
      p_user_id:     s.id,
      p_action:      action,
      p_table_name:  tableName,
      p_record_id:   recordId,
      p_description: description,
      p_old_data:    oldData ?? null,
      p_new_data:    newData ?? null,
    })
  } catch {}
}

// Compatibilidade — não faz mais set_config (não funciona com REST)
async function setAuditContext() {}

export function useBills() {
  const [bills,    setBills]    = useState([])
  const [summary,  setSummary]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [newCount, setNewCount] = useState(0)

  // knownIds: Set de IDs que o usuário já viu
  // null = ainda não inicializado (carga inicial)
  // Set  = já inicializado, compara a cada poll
  const knownIds      = useRef(null)
  // notifiedIds: IDs que já geraram notificação — não notifica 2x o mesmo
  const notifiedIds   = useRef(new Set())

  // ── Enriquece os dados do banco ──────────────────────────────────
  function enrich(data) {
    return (data ?? []).map(bill => {
      const totalPaid = (bill.payments ?? []).reduce((acc, p) => acc + Number(p.amount), 0)
      const remaining = Number(bill.amount) - totalPaid
      const documents = (bill.attachments ?? []).filter(a => a.type === 'documento')
      const receipts  = (bill.attachments ?? []).filter(a => a.type === 'comprovante')
      return { ...bill, totalPaid, remaining, documents, receipts }
    })
  }

  // ── Busca silenciosa — usada pelo polling ────────────────────────
  const silentFetch = useCallback(async () => {
    await supabase.rpc('update_overdue_bills')

    const [billsRes, summaryRes] = await Promise.all([
      supabase
        .from('bills')
        .select(`
          *,
          supplier:suppliers(id, name),
          category:expense_categories(id, name, color),
          payments:bill_payments(id, amount, paid_at, notes, paid_by),
          attachments:bill_attachments(id, file_name, file_type, storage_path, payment_id, type)
        `)
        .order('due_date', { ascending: true }),
      supabase.from('bills_summary').select('*').single(),
    ])

    if (!billsRes.error) {
      const enriched = enrich(billsRes.data)

      // Só detecta novidades se knownIds já foi inicializado
      if (knownIds.current !== null) {
        // Novas = IDs que não estavam em knownIds E ainda não foram notificados
        const newOnes = enriched.filter(
          b => !knownIds.current.has(b.id) && !notifiedIds.current.has(b.id)
        )
        if (newOnes.length > 0) {
          // Marca como notificado para não duplicar na próxima rodada
          newOnes.forEach(b => notifiedIds.current.add(b.id))
          // Substitui o contador — não acumula, mostra só os desta rodada
          setNewCount(newOnes.length)
        }
        // Atualiza o baseline com todos os IDs atuais
        knownIds.current = new Set(enriched.map(b => b.id))
      }

      setBills(enriched)
    }

    if (summaryRes && !summaryRes.error) setSummary(summaryRes.data)
  }, [])

  // ── Fetch inicial (com loading) ──────────────────────────────────
  const fetch = useCallback(async () => {
    setLoading(true)
    await supabase.rpc('update_overdue_bills')

    const [billsRes, summaryRes] = await Promise.all([
      supabase
        .from('bills')
        .select(`
          *,
          supplier:suppliers(id, name),
          category:expense_categories(id, name, color),
          payments:bill_payments(id, amount, paid_at, notes, paid_by),
          attachments:bill_attachments(id, file_name, file_type, storage_path, payment_id, type)
        `)
        .order('due_date', { ascending: true }),
      supabase.from('bills_summary').select('*').single(),
    ])

    if (!billsRes.error) {
      const enriched = enrich(billsRes.data)
      setBills(enriched)
      // Inicializa knownIds com os IDs da carga inicial — estes não são "novos"
      knownIds.current = new Set(enriched.map(b => b.id))
    }

    if (summaryRes && !summaryRes.error) setSummary(summaryRes.data)
    setLoading(false)
  }, [])

  // ── Primeira carga + polling de 30s ─────────────────────────────
  useEffect(() => {
    fetch()
    const interval = setInterval(silentFetch, 30_000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line

  // ── Upload de arquivo (documento ou comprovante) ─────────────
  async function uploadFile(billId, file, type = 'comprovante', paymentId = null) {
    const ext  = file.name.split('.').pop()
    const path = `${billId}/${type}-${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('bill-attachments')
      .upload(path, file, { contentType: file.type, upsert: false })

    if (uploadErr) {
      toast.error('Erro ao enviar arquivo.')
      throw uploadErr
    }

    const { error: dbErr } = await supabase.from('bill_attachments').insert({
      bill_id:      billId,
      payment_id:   paymentId,
      type,
      file_name:    file.name,
      file_type:    file.type,
      file_size:    file.size,
      storage_path: path,
    })

    if (dbErr) {
      toast.error('Erro ao salvar referência do arquivo.')
      throw dbErr
    }

    return path
  }

  // ── Criar conta(s) — com suporte a arquivo de documento ──────
  // payload pode ser:
  //   - objeto único com { ...dadosConta, documentFile?: File }
  //   - array de objetos (parcelamento) com { ...dadosConta, documentFile?: File }
  async function create(payload) {
    const isArray = Array.isArray(payload)
    const items   = isArray ? payload : [payload]

    // Separa os arquivos dos dados do banco
    const files = items.map(item => item.documentFile ?? null)
    const data  = items.map(({ documentFile: _f, ...rest }) => rest)

    const { data: inserted, error } = await supabase
      .from('bills')
      .insert(isArray ? data : data[0])
      .select('id')

    if (error) {
      toast.error('Erro ao cadastrar conta.')
      throw error
    }

    // Faz upload dos documentos para cada conta criada
    const ids = isArray ? inserted.map(r => r.id) : [inserted[0].id]

    for (let i = 0; i < ids.length; i++) {
      if (files[i]) {
        try {
          await uploadFile(ids[i], files[i], 'documento')
        } catch {
          // Upload falhou mas a conta foi criada — avisa sem bloquear
          toast.error(`Conta criada, mas falha ao anexar documento da parcela ${i + 1}.`)
        }
      }
    }

    if (isArray) toast.success(`${items.length} parcelas cadastradas!`)
    else         toast.success('Conta cadastrada!')

    await fetch()
  }

  async function update(id, payload) {
    // Extrai apenas colunas válidas da tabela bills
    // (remove joins, campos computados e extras que causam erro 400)
    const {
      description, supplier_id, category_id,
      amount, due_date, notes, recurrent, status,
      installment_group_id, installment_number, installment_total,
    } = payload

    const clean = {
      ...(description  !== undefined && { description }),
      ...(supplier_id  !== undefined && { supplier_id }),
      ...(category_id  !== undefined && { category_id }),
      ...(amount       !== undefined && { amount: Number(amount) }),
      ...(due_date     !== undefined && { due_date }),
      ...(notes        !== undefined && { notes: notes || null }),
      ...(recurrent    !== undefined && { recurrent }),
      ...(status       !== undefined && { status }),
      ...(installment_group_id !== undefined && { installment_group_id }),
      ...(installment_number   !== undefined && { installment_number }),
      ...(installment_total    !== undefined && { installment_total }),
    }

    const { error } = await supabase.from('bills').update(clean).eq('id', id)
    if (error) { toast.error('Erro ao atualizar conta.'); throw error }
    toast.success('Conta atualizada!')
    await fetch()
  }

  async function cancel(id) {
    const { error } = await supabase.from('bills').update({ status: 'cancelado' }).eq('id', id)
    if (error) { toast.error('Erro ao cancelar conta.'); throw error }
    toast.success('Conta cancelada.')
    await fetch()
  }

  // Exclusao permanente — remove conta, pagamentos e arquivos do storage
  async function deletePermanently(bill) {
    const allAtts = [...(bill.documents ?? []), ...(bill.receipts ?? []), ...(bill.attachments ?? [])]
    const paths   = [...new Set(allAtts.map(a => a.storage_path).filter(Boolean))]
    if (paths.length > 0) {
      await supabase.storage.from('bill-attachments').remove(paths)
    }
    await supabase.from('bill_attachments').delete().eq('bill_id', bill.id)
    await supabase.from('bill_payments').delete().eq('bill_id', bill.id)
    const { error } = await supabase.from('bills').delete().eq('id', bill.id)
    if (error) { toast.error('Erro ao excluir conta.'); throw error }
    toast.success('Conta excluida permanentemente.')
    await fetch()
  }

  async function addPayment(billId, { amount, paid_at, notes }) {
    const { data, error } = await supabase
      .from('bill_payments')
      .insert({ bill_id: billId, amount: Number(amount), paid_at, notes: notes || null })
      .select().single()
    if (error) { toast.error('Erro ao registrar pagamento.'); throw error }
    toast.success('Pagamento registrado!')
    await fetch()
    return data
  }

  async function deletePayment(paymentId) {
    // 1. Busca comprovantes vinculados a este pagamento antes de deletar
    const { data: atts } = await supabase
      .from('bill_attachments')
      .select('id, storage_path')
      .eq('payment_id', paymentId)

    // 2. Remove arquivos do storage
    if (atts && atts.length > 0) {
      const paths = atts.map(a => a.storage_path).filter(Boolean)
      if (paths.length > 0) {
        await supabase.storage.from('bill-attachments').remove(paths)
      }
      // 3. Remove registros da tabela de anexos
      await supabase.from('bill_attachments').delete().eq('payment_id', paymentId)
    }

    // 4. Remove o pagamento
    const { error } = await supabase.from('bill_payments').delete().eq('id', paymentId)
    if (error) { toast.error('Erro ao excluir pagamento.'); throw error }
    toast.success('Pagamento removido.')
    await fetch()
  }

  // Upload de comprovante vinculado a um pagamento
  async function uploadAttachment(billId, file, paymentId = null) {
    await uploadFile(billId, file, 'comprovante', paymentId)
    toast.success('Comprovante enviado!')
    await fetch()
  }

  async function removeAttachment(attachmentId, storagePath) {
    // 1. Remove do storage (com verificação de erro explícita)
    if (storagePath) {
      const { error: storageErr } = await supabase.storage
        .from('bill-attachments')
        .remove([storagePath])
      if (storageErr) {
        console.warn('Aviso: falha ao remover arquivo do storage:', storageErr.message)
        // Continua mesmo assim para remover o registro do banco
      }
    }

    // 2. Remove o registro da tabela
    const { error: dbErr } = await supabase
      .from('bill_attachments')
      .delete()
      .eq('id', attachmentId)

    if (dbErr) {
      toast.error('Erro ao remover comprovante.')
      throw dbErr
    }

    toast.success('Comprovante removido.')
    await fetch()
  }

  async function getAttachmentUrl(storagePath) {
    const { data } = await supabase.storage
      .from('bill-attachments')
      .createSignedUrl(storagePath, 3600)
    return data?.signedUrl ?? null
  }

  // Reativa uma conta cancelada
  async function reactivate(bill) {
    const today     = new Date().toISOString().split('T')[0]
    const newStatus = bill.due_date < today ? 'vencido' : 'aberto'
    const { error } = await supabase
      .from('bills')
      .update({ status: newStatus })
      .eq('id', bill.id)
    if (error) { toast.error('Erro ao reativar conta.'); throw error }
    toast.success('Conta reativada!')
    await auditLog('UPDATE', 'bills', bill.id,
      `Reativou conta "${bill.description}" — cancelado → ${newStatus}`)
    await fetch()
  }

  // Usuário dispensou a notificação — zera contador
  // notifiedIds permanece intacto: não re-notifica os mesmos boletos
  // Mas se um NOVO boleto chegar depois, vai notificar normalmente
  function clearNewCount() { setNewCount(0) }

  return {
    bills, summary, loading, newCount, clearNewCount, refetch: fetch,
    create, update, cancel, reactivate, deletePermanently,
    addPayment, deletePayment,
    uploadAttachment, removeAttachment, getAttachmentUrl,
  }
}
