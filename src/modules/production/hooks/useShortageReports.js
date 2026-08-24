import { supabase } from '../../../lib/supabase'

export async function fetchShortageReports() {
  const { data, error } = await supabase
    .from('picklist_shortage_reports')
    .select('*, reporter:system_users!reported_by(name), batch:import_batches(source, filename)')
    .order('reported_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function markShortageResolved(id) {
  const { error } = await supabase.from('picklist_shortage_reports').update({ status: 'atendido' }).eq('id', id)
  if (error) throw error
}
