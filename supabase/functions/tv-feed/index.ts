// TV da Produção (07/10, fase100) — devolve, numa chamada só, tudo que a
// TV do andar de cima mostra: alertas, coleta do Full, despacho do dia,
// produção, avisos, passagem de turno, kanban, manutenção, checklist,
// observações de mídia e aniversariantes.
//
// Público (deploy --no-verify-jwt): quem chama é a TV, sem login. Cada
// aparelho manda o seu código (gerado por diretor na tela "TV da
// Produção", revogável — aqui só existe o hash, ver ml_full_sync_tokens
// pra o mesmo esquema). NUNCA devolve valor em R$: a TV fica na produção.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const TZ = 'America/Sao_Paulo'
const isoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d) // AAAA-MM-DD
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const stripHtml = (s: string | null) => (s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim()

export const MODULES = [
  'alertas', 'coleta_full', 'despacho', 'producao', 'avisos', 'passagem_turno',
  'kanban', 'manutencao', 'checklist', 'midia', 'aniversariantes',
]
const TERMINAL = ['closed_ok', 'closed_with_changes', 'cancelled', 'expired']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let body: any = {}
  try { body = await req.json() } catch { /* vazio */ }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) return json({ error: 'Falta o código da TV' }, 401)

  const sb = db()
  const { data: screen } = await sb.from('tv_screens').select('id, label, last_seen_at')
    .eq('token_hash', await sha256Hex(token)).is('revoked_at', null).maybeSingle()
  if (!screen) return json({ error: 'Código da TV inválido ou revogado' }, 401)
  // "Visto por último" — no máx. 1 escrita por minuto
  if (!screen.last_seen_at || Date.now() - new Date(screen.last_seen_at).getTime() > 60000) {
    await sb.from('tv_screens').update({ last_seen_at: new Date().toISOString() }).eq('id', screen.id)
  }

  try {
    const now = new Date()
    const today = isoDay(now)
    const { data: settings } = await sb.from('tv_settings').select('*').eq('id', 'default').maybeSingle()
    const warnDays = settings?.full_warn_days ?? 2

    const [shipR, manualR, ordersR, overdueR, attR, prodR, entriesR, annR, tvAlertsR, handR,
      tasksR, maintR, logsR, machinesR, ckTasksR, ckEntriesR, ckUsersR, notesR, bdayR] = await Promise.all([
      sb.from('ml_full_inbound_shipments')
        .select('id, name, status, shipment_type, appointment_date, logistic_center_id, products_count, synced_at, items:ml_full_inbound_items(title, variation, declared_qty)')
        .not('status', 'in', `(${TERMINAL.join(',')})`).not('appointment_date', 'is', null)
        .gte('appointment_date', new Date(now.getTime() - 12 * 3600e3).toISOString())
        .lte('appointment_date', new Date(addDays(today, warnDays + 1) + 'T03:00:00Z').toISOString())
        .order('appointment_date'),
      sb.from('tv_alerts').select('*').eq('kind', 'coleta').eq('active', true)
        .gte('event_at', new Date(now.getTime() - 12 * 3600e3).toISOString()).order('event_at'),
      sb.from('orders').select('id, source, num_venda, status_ml, needs_attention, is_full, ship_by_at, items:order_items(qty, picked)')
        .eq('ship_date', today).eq('archived', false),
      sb.from('orders').select('id, source, num_venda, status_ml, needs_attention, is_full, ship_date, items:order_items(qty, picked)')
        .lt('ship_date', today).gte('ship_date', addDays(today, -30)).eq('archived', false),
      sb.from('orders').select('id, source, num_venda').eq('needs_attention', true).eq('archived', false).limit(20),
      sb.from('production_orders').select('source, items:production_order_items(product_name, sku, qty_ordered, status)').eq('date', today),
      sb.from('production_entries').select('quantity').eq('date', today),
      sb.from('announcements').select('id, title, body, priority, expires_at, created_at')
        .eq('show_on_tv', true).is('employee_id', null).order('created_at', { ascending: false }).limit(10),
      sb.from('tv_alerts').select('*').eq('kind', 'aviso').eq('active', true).lte('starts_at', now.toISOString()).order('created_at', { ascending: false }),
      sb.from('shift_handovers').select('date, turno, destino, notes, items, created_at').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(1),
      sb.from('tasks').select('title, priority, due_date, status, task_sector').eq('kanban_type', 'operacional').neq('status', 'done')
        .not('due_date', 'is', null).lte('due_date', addDays(today, 1)).order('due_date').limit(30),
      sb.from('maintenance_tasks').select('title, status, category, created_at').eq('type', 'servico').in('status', ['pendente', 'prioridade']).order('created_at', { ascending: false }).limit(30),
      sb.from('maintenance_logs').select('machine_id, next_service_at, performed_at').not('next_service_at', 'is', null).order('performed_at', { ascending: false }).limit(500),
      sb.from('machines').select('id, name, active'),
      sb.from('checklist_tasks').select('id').eq('active', true),
      sb.from('checklist_entries').select('employee_id, done').eq('date', today).eq('done', true),
      sb.from('system_users').select('id, name').eq('active', true).eq('role', 'atendimento'),
      sb.from('product_media_notes').select('product_id, body, created_at, created_by_name').eq('status', 'aberto').order('created_at', { ascending: false }).limit(50),
      sb.from('system_users').select('name, birthday').eq('active', true).not('birthday', 'is', null),
    ])

    // ── Coleta do Full ────────────────────────────────────────────────
    const coletas = [
      ...(shipR.data || []).map((s: any) => ({
        source: 'ml', id: s.id, at: s.appointment_date, type: s.shipment_type, center: s.logistic_center_id,
        units: s.products_count, synced_at: s.synced_at,
        items: (s.items || []).map((i: any) => ({ title: i.title, variation: i.variation, qty: i.declared_qty })),
      })),
      ...(manualR.data || []).map((a: any) => ({ source: 'manual', id: a.id, at: a.event_at, title: a.title, body: a.body, items: [] })),
    ].sort((a, b) => a.at.localeCompare(b.at))
    const { data: lastSyncRow } = await sb.from('ml_full_inbound_shipments').select('synced_at').order('synced_at', { ascending: false }).limit(1).maybeSingle()

    // ── Despacho (mesma regra da Expedição) ──────────────────────────
    const valid = (o: any) => (!String(o.status_ml || '').toLowerCase().includes('cancelad') || o.needs_attention) && !o.is_full && (o.items || []).length > 0
    const complete = (o: any) => o.items.every((i: any) => i.picked)
    const todayOrders = (ordersR.data || []).filter(valid)
    const bySource: Record<string, { total: number, done: number }> = {}
    todayOrders.forEach((o: any) => {
      const s = bySource[o.source] ||= { total: 0, done: 0 }
      s.total++; if (complete(o)) s.done++
    })
    const pendingDeadlines = todayOrders.filter((o: any) => !complete(o) && o.ship_by_at).map((o: any) => o.ship_by_at).sort()
    const overdue = (overdueR.data || []).filter(valid).filter((o: any) => !complete(o))
    const despacho = {
      total: todayOrders.length,
      done: todayOrders.filter(complete).length,
      by_source: bySource,
      next_deadline: pendingDeadlines[0] || null,
      overdue: overdue.length,
      overdue_by_source: overdue.reduce((m: any, o: any) => (m[o.source] = (m[o.source] || 0) + 1, m), {}),
    }

    // ── Produção do dia (só quantidade) ──────────────────────────────
    const sum = { pendente: 0, em_producao: 0, pronto: 0, enviado: 0 }
    const pendingByProduct: Record<string, number> = {}
    ;(prodR.data || []).forEach((po: any) => (po.items || []).forEach((i: any) => {
      if (['arquivado', 'coberto_estoque'].includes(i.status)) return
      const q = Number(i.qty_ordered) || 0
      if (i.status === 'pendente') { sum.pendente += q; const k = i.product_name || i.sku || '—'; pendingByProduct[k] = (pendingByProduct[k] || 0) + q }
      else if (i.status === 'em_producao' || i.status === 'embalagem') sum.em_producao += q
      else if (i.status === 'pronto') sum.pronto += q
      else if (i.status === 'enviado') sum.enviado += q
    }))
    const producao = {
      ...sum,
      total: sum.pendente + sum.em_producao + sum.pronto + sum.enviado,
      produced_today: (entriesR.data || []).reduce((t: number, e: any) => t + (Number(e.quantity) || 0), 0),
      top_pending: Object.entries(pendingByProduct).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, qty]) => ({ name, qty })),
    }

    // ── Avisos (RH marcados pra TV + avisos lançados direto) ─────────
    const nowIso = now.toISOString()
    const avisos = [
      ...(tvAlertsR.data || []).filter((a: any) => !a.ends_at || a.ends_at > nowIso)
        .map((a: any) => ({ id: a.id, title: a.title, body: a.body || '', level: a.level, by: a.created_by_name, at: a.created_at })),
      ...(annR.data || []).filter((a: any) => !a.expires_at || a.expires_at > nowIso)
        .map((a: any) => ({ id: a.id, title: a.title, body: stripHtml(a.body), level: a.priority === 'urgente' ? 'critico' : a.priority === 'importante' ? 'atencao' : 'info', at: a.created_at })),
    ]

    // ── Passagem de turno ────────────────────────────────────────────
    const h = handR.data?.[0]
    const passagem = h ? {
      date: h.date, turno: h.turno, destino: h.destino, notes: h.notes, created_at: h.created_at,
      items: (h.items || []).map((i: any) => ({ text: i.text, urgent: i.priority === 'urgente', done: !!i.done })),
    } : null

    // ── Kanban operacional (atrasadas / hoje / amanhã) ───────────────
    const kanban = (tasksR.data || []).map((t: any) => ({
      title: t.title, priority: t.priority, sector: t.task_sector, due: t.due_date,
      when: t.due_date < today ? 'atrasada' : t.due_date === today ? 'hoje' : 'amanha',
    }))

    // ── Manutenção (serviços em aberto + máquinas com revisão vencendo)
    const lastByMachine: Record<string, any> = {}
    ;(logsR.data || []).forEach((l: any) => { if (!lastByMachine[l.machine_id]) lastByMachine[l.machine_id] = l })
    const machineName = Object.fromEntries((machinesR.data || []).filter((m: any) => m.active !== false).map((m: any) => [m.id, m.name]))
    const in7 = addDays(today, 7)
    const machines = Object.values(lastByMachine)
      .filter((l: any) => machineName[l.machine_id] && l.next_service_at.slice(0, 10) <= in7)
      .map((l: any) => ({ name: machineName[l.machine_id], next: l.next_service_at.slice(0, 10), late: l.next_service_at.slice(0, 10) < today }))
      .sort((a: any, b: any) => a.next.localeCompare(b.next))
    const manutencao = {
      services: (maintR.data || []).map((m: any) => ({ title: m.title, urgent: m.status === 'prioridade', category: m.category })),
      machines,
    }

    // ── Checklist do atendimento ─────────────────────────────────────
    const ckTotal = (ckTasksR.data || []).length
    const doneBy: Record<string, number> = {}
    ;(ckEntriesR.data || []).forEach((e: any) => { doneBy[e.employee_id] = (doneBy[e.employee_id] || 0) + 1 })
    const checklist = {
      total: ckTotal,
      people: (ckUsersR.data || []).map((u: any) => ({ name: u.name.split(' ')[0], done: Math.min(doneBy[u.id] || 0, ckTotal) })),
    }

    // ── Observações de mídia em aberto ───────────────────────────────
    const notes = notesR.data || []
    const pids = [...new Set(notes.map((n: any) => n.product_id).filter(Boolean))]
    const { data: prods } = pids.length ? await sb.from('products').select('id, name').in('id', pids) : { data: [] }
    const pName = Object.fromEntries((prods || []).map((p: any) => [p.id, p.name]))
    const midia = {
      open: notes.length,
      latest: notes.slice(0, 4).map((n: any) => ({ product: pName[n.product_id] || 'Produto', body: n.body, by: n.created_by_name, at: n.created_at })),
    }

    // ── Aniversariantes (próximos 7 dias) ────────────────────────────
    const md = (iso: string) => iso.slice(5, 10)
    const window7 = Array.from({ length: 8 }, (_, i) => md(addDays(today, i)))
    const aniversariantes = (bdayR.data || [])
      .filter((u: any) => window7.includes(md(u.birthday)))
      .map((u: any) => ({ name: u.name, day: md(u.birthday), today: md(u.birthday) === md(today) }))
      .sort((a: any, b: any) => window7.indexOf(a.day) - window7.indexOf(b.day))

    // ── Alertas (o que pinta a TV de vermelho/amarelo) ───────────────
    const alerts: any[] = []
    coletas.forEach((c: any) => {
      const day = isoDay(new Date(c.at))
      const level = day <= today ? 'critico' : 'atencao'
      alerts.push({ kind: 'coleta', level, at: c.at, title: `Coleta do Full${c.source === 'ml' ? ` — envio #${c.id}` : ''}`, detail: c.title || null })
    })
    if (despacho.overdue) alerts.push({ kind: 'atrasados', level: 'critico', title: `${despacho.overdue} pedido${despacho.overdue > 1 ? 's' : ''} atrasado${despacho.overdue > 1 ? 's' : ''} pra despachar` })
    if ((attR.data || []).length) alerts.push({ kind: 'atencao', level: 'atencao', title: `${attR.data!.length} pedido${attR.data!.length > 1 ? 's' : ''} cancelado${attR.data!.length > 1 ? 's' : ''} depois de separado — verificar`, orders: attR.data!.map((o: any) => `${o.source === 'shopee' ? 'Shopee' : o.source === 'ml' ? 'ML' : ''} ${o.num_venda}`.trim()) })
    if (passagem?.items?.some((i: any) => i.urgent && !i.done) && passagem.date >= addDays(today, -1)) alerts.push({ kind: 'turno', level: 'atencao', title: 'Passagem de turno com item urgente pendente' })
    machines.filter((m: any) => m.late).forEach((m: any) => alerts.push({ kind: 'maquina', level: 'atencao', title: `Revisão atrasada: ${m.name}` }))
    avisos.filter(a => a.level === 'critico').forEach(a => alerts.push({ kind: 'aviso', level: 'critico', title: a.title, detail: a.body }))

    return json({
      ok: true,
      screen: screen.label,
      generated_at: nowIso,
      today,
      settings: {
        mode: settings?.mode || 'consultorio',
        slide_seconds: settings?.slide_seconds || 10,
        modules: settings?.modules?.length ? settings.modules : MODULES.map(key => ({ key, enabled: true })),
      },
      data: {
        alertas: alerts,
        coleta_full: { list: coletas, last_sync: lastSyncRow?.synced_at || null, warn_days: warnDays },
        despacho, producao, avisos, passagem_turno: passagem, kanban, manutencao, checklist, midia, aniversariantes,
      },
    })
  } catch (err) {
    console.error('[tv-feed] erro:', err)
    return json({ error: String(err) }, 500)
  }
})
