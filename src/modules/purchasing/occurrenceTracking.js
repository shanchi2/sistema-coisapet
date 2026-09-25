import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// Acompanhamento das ocorrências da conferência (fase74, 25/09) —
// compartilhado entre a aba Pedidos e a aba Conferências.

function getSession() {
  try { return JSON.parse(localStorage.getItem('coisapet_session') || '{}') }
  catch { return {} }
}

export const OCC_KIND = {
  avaria:  { label: 'Avaria',  verb: 'avariado',   tone: 'bg-rose-100 text-rose-700' },
  falta:   { label: 'Faltou',  verb: 'faltando',   tone: 'bg-amber-100 text-amber-700' },
  excesso: { label: 'Veio a mais', verb: 'a mais', tone: 'bg-sky-100 text-sky-700' },
}

export const OCC_STATUS = {
  aberto:       { label: 'Aberta',       tone: 'bg-rose-100 text-rose-700' },
  em_andamento: { label: 'Em andamento', tone: 'bg-amber-100 text-amber-700' },
  resolvido:    { label: 'Resolvida',    tone: 'bg-emerald-100 text-emerald-700' },
}

export const OCC_RESOLUTION = {
  reposicao: 'Fornecedor repôs / vai repor',
  credito:   'Crédito com o fornecedor',
  desconto:  'Desconto / abatimento no pagamento',
  devolucao: 'Devolvido ao fornecedor',
  aceito:    'Aceito assim (sem ação)',
  outro:     'Outro',
}

export function isOpenOccurrence(occ) {
  return occ?.status !== 'resolvido'
}

export async function fetchOccurrenceUpdates(occurrenceId) {
  const { data, error } = await supabase
    .from('material_occurrence_updates')
    .select('id, note, status_from, status_to, created_at, author:system_users!author_id(name)')
    .eq('occurrence_id', occurrenceId)
    .order('created_at', { ascending: true })
  if (error) { console.error(error); toast.error('Erro ao carregar o histórico.'); return [] }
  return data ?? []
}

// Uma "atualização" = anotação na linha do tempo e/ou mudança de status.
// Ao resolver, exige o tipo de solução (resolution) — é o "final" do caso.
export async function addOccurrenceUpdate(occ, { note, statusTo, resolution, resolutionNotes }) {
  const session = getSession()
  const changing = statusTo && statusTo !== occ.status

  if (changing || resolution !== undefined) {
    const patch = {}
    if (changing) patch.status = statusTo
    if (statusTo === 'resolvido') {
      patch.resolved_at = new Date().toISOString()
      patch.resolved_by = session.id || null
      patch.resolution = resolution || occ.resolution || null
      patch.resolution_notes = resolutionNotes ?? occ.resolution_notes ?? null
    } else if (changing && occ.status === 'resolvido') {
      // Reabriu: limpa o "fechamento", mas mantém o histórico
      patch.resolved_at = null
      patch.resolved_by = null
    }
    const { error } = await supabase.from('material_order_occurrences').update(patch).eq('id', occ.id)
    if (error) { toast.error('Erro ao atualizar ocorrência.'); throw error }
  }

  if (note?.trim() || changing) {
    const { error } = await supabase.from('material_occurrence_updates').insert({
      occurrence_id: occ.id,
      author_id: session.id || null,
      note: note?.trim() || null,
      status_from: changing ? occ.status : null,
      status_to: changing ? statusTo : null,
    })
    if (error) { toast.error('Erro ao salvar anotação.'); throw error }
  }
}

// Finaliza o pedido (só quando não sobra ocorrência aberta) com a
// observação final — some da lista de pendências.
export async function finalizeOrder(orderId, notes) {
  const session = getSession()
  const { error } = await supabase.from('material_orders').update({
    status: 'finalizado',
    closed_at: new Date().toISOString(),
    closed_by: session.id || null,
    closing_notes: notes?.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('id', orderId)
  if (error) { toast.error('Erro ao finalizar pedido.'); throw error }
  toast.success('Pedido finalizado.')
}

export async function reopenOrder(orderId) {
  const { error } = await supabase.from('material_orders').update({
    status: 'conferido', closed_at: null, closed_by: null, updated_at: new Date().toISOString(),
  }).eq('id', orderId)
  if (error) { toast.error('Erro ao reabrir pedido.'); throw error }
  toast.success('Pedido reaberto.')
}
