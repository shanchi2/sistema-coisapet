// TV da Produção (07/10, fase100) — devolve, numa chamada só, tudo que a
// TV do andar de cima mostra: alertas, coleta do Full, despacho do dia,
// produção, avisos, passagem de turno, kanban, manutenção, checklist,
// observações de mídia, aniversariantes e o foco do dia por funcionário.
// 20/10: + mural de elogios (avaliações 5★ ML/Shopee), o que acabou nos
// marketplaces, motivos de devolução, concluídos do dia anterior e um
// cartão do Instagram. Os pesados ficam em `tv_cache` (refeitos a cada
// 15–30 min, não a cada minuto que a TV pergunta).
// 21/10: + "Envios pro Full" — TODOS os envios agendados (sem limite de
// dias), com foto, SKU e quantidade de cada item, e as pré-listas abertas.
//
// Público (deploy --no-verify-jwt): quem chama é a TV, sem login. Cada
// aparelho manda o seu código (gerado por diretor na tela "TV da
// Produção", revogável — aqui só existe o hash, ver ml_full_sync_tokens
// pra o mesmo esquema). NUNCA devolve valor em R$: a TV fica na produção.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidIntegration, shopeeFetch } from '../_shared/shopee.ts'

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
  'kanban', 'manutencao', 'checklist', 'midia', 'aniversariantes', 'foco_dia',
  'elogios', 'estoque_mkt', 'pos_venda', 'concluidos', 'instagram', 'envios_full',
]
const TERMINAL = ['closed_ok', 'closed_with_changes', 'cancelled', 'expired']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let body: any = {}
  try { body = await req.json() } catch { /* vazio */ }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) return json({ error: 'Falta o código da TV' }, 401)

  const sb = db()
  const { data: screen } = await sb.from('tv_screens').select('id, label, last_seen_at, font_scale')
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
    // Turno da noite (20/10): depois das 19h a TV usa a lista `modules_night`
    const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
    const nStart = settings?.night_start || '19:00', nEnd = settings?.night_end || '06:00'
    const isNight = nStart > nEnd ? (hhmm >= nStart || hhmm < nEnd) : (hhmm >= nStart && hhmm < nEnd)
    const dayMods = settings?.modules?.length ? settings.modules : MODULES.map(key => ({ key, enabled: true }))
    const activeMods = isNight && settings?.modules_night?.length ? settings.modules_night : dayMods

    const [shipR, manualR, ordersR, overdueR, attR, prodR, entriesR, annR, tvAlertsR, handR,
      tasksR, maintR, logsR, machinesR, ckTasksR, ckEntriesR, ckUsersR, notesR, bdayR, focusR] = await Promise.all([
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
      sb.from('daily_focus').select('employee_name, task, urgent, done, position, id').eq('date', today).order('position').order('id'),
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

    // ── Foco do dia por funcionário (aba em /servicos) ───────────────
    const focusBy: Record<string, any[]> = {}
    ;(focusR.data || []).forEach((f: any) => (focusBy[f.employee_name] ||= []).push({ task: f.task, urgent: f.urgent, done: f.done }))
    const foco_dia = Object.entries(focusBy)
      .map(([name, tasks]) => ({ name, tasks: tasks.sort((a, b) => (Number(a.done) - Number(b.done)) || (Number(b.urgent) - Number(a.urgent))) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // ── Blocos de 20/10 (cada um falha sozinho, sem derrubar a TV) ──
    const safe = async (f: () => Promise<any>) => { try { return await f() } catch (e) { console.error('[tv-feed] bloco:', e); return null } }
    const [elogios, estoque_mkt, pos_venda, concluidos, instagram, envios_full] = await Promise.all([
      safe(() => cached(sb, 'elogios', 30, () => buildElogios(sb))),
      safe(() => cached(sb, 'estoque_mkt', 15, () => buildEstoque(sb))),
      safe(() => cached(sb, 'pos_venda', 30, () => buildPosVenda(sb))),
      safe(() => buildConcluidos(sb, today)),
      safe(() => buildInstagram(sb)),
      safe(() => buildEnviosFull(sb, now)),
    ])

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
        font_scale: screen.font_scale || 100, // tamanho do texto desta TV (20/10)
        shift: isNight ? 'noite' : 'dia',
        modules: activeMods,
      },
      data: {
        alertas: alerts,
        coleta_full: { list: coletas, last_sync: lastSyncRow?.synced_at || null, warn_days: warnDays },
        despacho, producao, avisos, passagem_turno: passagem, kanban, manutencao, checklist, midia, aniversariantes, foco_dia,
        elogios, estoque_mkt, pos_venda, concluidos, instagram, envios_full,
      },
    })
  } catch (err) {
    console.error('[tv-feed] erro:', err)
    return json({ error: String(err) }, 500)
  }
})

// ═══ Blocos de 20/10 ═══════════════════════════════════════════════════

// Cache simples em `tv_cache` (só service role lê/grava)
async function cached(sb: any, key: string, ttlMin: number, build: () => Promise<any>) {
  const { data } = await sb.from('tv_cache').select('data, updated_at').eq('key', key).maybeSingle()
  if (data && Date.now() - new Date(data.updated_at).getTime() < ttlMin * 60e3) return data.data
  try {
    const fresh = await build()
    await sb.from('tv_cache').upsert({ key, data: fresh, updated_at: new Date().toISOString() })
    return fresh
  } catch (e) {
    if (data) return data.data // API fora do ar: segue com o último
    throw e
  }
}

async function readAll(build: () => any) {
  const all: any[] = []
  for (let p = 0; p < 20; p++) {
    const { data, error } = await build().range(p * 1000, p * 1000 + 999)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}
const norm = (s: string | null) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const splitVar = (v: string | null) => norm(v).split(/[,/;|]|\s-\s/).map(p => p.replace(/^[^:]*:\s*/, '').trim()).filter(Boolean)
const varParts = (v: string | null) => splitVar(v).map(p => p.replace(/-/g, ' ').replace(/\s+/g, ' ').trim())
const normVar = (v: string | null) => splitVar(v).sort().join('|')
const mlImg = (id: string) => `https://http2.mlstatic.com/D_NQ_NP_${id}-F.jpg`

// ⭐ Mural de elogios: 5★ com texto ou foto, últimos 30 dias, ML + Shopee
async function buildElogios(sb: any) {
  const since = new Date(Date.now() - 30 * 86400e3)
  const [mlR, stock] = await Promise.all([
    sb.from('ml_reviews').select('id, item_id, rate, title, content, created_at_ml, raw').eq('rate', 5).gte('created_at_ml', since.toISOString()).order('created_at_ml', { ascending: false }).limit(200),
    readAll(() => sb.from('marketplace_stock').select('platform, item_id, title, thumbnail').order('id')),
  ])
  const titleOf: Record<string, { title: string, thumb: string | null }> = {}
  stock.forEach((r: any) => { titleOf[`${r.platform}|${r.item_id}`] ||= { title: r.title, thumb: r.thumbnail } })
  const list: any[] = []
  ;(mlR.data || []).forEach((r: any) => {
    const photos = (r.raw?.media || []).filter((m: any) => m.type === 'photo').map((m: any) => mlImg(m.id))
    const text = (r.content || r.title || '').trim()
    if (text.length < 8 && !photos.length) return
    const p = titleOf[`ml|${r.item_id}`]
    list.push({ platform: 'ml', text, photos: photos.slice(0, 3), product: p?.title || null, thumb: p?.thumb || null, at: r.created_at_ml })
  })
  try {
    const integ = await getValidIntegration(sb)
    let cursor = ''
    for (let i = 0; i < 3; i++) {
      const r = await shopeeFetch('/api/v2/product/get_comment', integ, { page_size: '100', cursor })
      const page = r?.response?.item_comment_list ?? []
      for (const c of page) {
        if (c.rating_star !== 5 || c.hidden) continue
        const at = c.create_time ? new Date(c.create_time * 1000) : null
        if (!at || at < since) continue
        const text = (c.comment || '').trim()
        const photos = c.media?.image_url_list ?? []
        if (text.length < 8 && !photos.length) continue
        const p = titleOf[`shopee|${c.item_id}`]
        list.push({ platform: 'shopee', text, photos: photos.slice(0, 3), product: p?.title || null, thumb: p?.thumb || null, at: at.toISOString() })
      }
      cursor = r?.response?.next_cursor ?? ''
      const last = page[page.length - 1]
      if (!r?.response?.more || !cursor || (last?.create_time && last.create_time * 1000 < since.getTime())) break
    }
  } catch (e) { console.error('[tv-feed] elogios shopee:', e) }
  list.sort((a, b) => b.at.localeCompare(a.at))
  // Com foto primeiro (mais bonito na TV), sem perder os mais novos
  const withPhoto = list.filter(x => x.photos.length), noPhoto = list.filter(x => !x.photos.length)
  const mixed: any[] = []
  while (mixed.length < 16 && (withPhoto.length || noPhoto.length)) {
    if (withPhoto.length) mixed.push(withPhoto.shift())
    if (withPhoto.length) mixed.push(withPhoto.shift())
    if (noPhoto.length) mixed.push(noPhoto.shift())
  }
  return { total: list.length, by_platform: { ml: list.filter(x => x.platform === 'ml').length, shopee: list.filter(x => x.platform === 'shopee').length }, list: mixed.slice(0, 16) }
}

// 📦 Acabou nos marketplaces: mesma régua da tela Estoque nos Marketplaces
// (ativos, fora do Full, sem as cores ocultas), mas só o que AINDA VENDE
// (vendas nos últimos 60 dias) — zerado parado há meses não interessa pra
// produção. Zerado → acabando (< 7 dias) → baixo (< 15 dias).
const DEFAULT_HIDDEN_TITLES = ['casa cama toca de gato nicho mdf com almofada e pes luxo']
async function buildEstoque(sb: any) {
  const since = new Date(Date.now() - 60 * 86400e3).toISOString()
  const [stock, sales, hiddenR] = await Promise.all([
    readAll(() => sb.from('marketplace_stock').select('platform, item_id, variation_id, title, variation, sku, stock, status, is_full, thumbnail').order('id')),
    readAll(() => sb.from('orders').select('source, status_ml, marketplace_status, items:order_items(qty, sku, titulo, variacao)').in('source', ['ml', 'shopee']).gte('data_venda', since).order('data_venda')),
    sb.from('marketplace_stock_hidden_variations').select('term'),
  ])
  const bySku: Record<string, number> = {}, byTV: Record<string, number> = {}, byT: Record<string, number> = {}
  for (const o of sales) {
    const st = String(o.status_ml || '').toLowerCase()
    if (st.startsWith('cancel') || ['CANCELLED', 'IN_CANCEL'].includes(o.marketplace_status)) continue
    for (const it of o.items || []) {
      const q = Number(it.qty) || 0
      if (it.sku) { const k = `${o.source}|${norm(it.sku)}`; bySku[k] = (bySku[k] || 0) + q }
      const kt = `${o.source}|${norm(it.titulo)}`
      byT[kt] = (byT[kt] || 0) + q
      byTV[`${kt}|${normVar(it.variacao)}`] = (byTV[`${kt}|${normVar(it.variacao)}`] || 0) + q
    }
  }
  const hidden = new Set((hiddenR.data || []).map((h: any) => h.term))
  const varCount: Record<string, number> = {}
  stock.forEach((r: any) => { varCount[`${r.platform}|${r.item_id}`] = (varCount[`${r.platform}|${r.item_id}`] || 0) + 1 })
  const rows = stock
    .filter((r: any) => r.status === 'active' && !r.is_full)
    .filter((r: any) => !DEFAULT_HIDDEN_TITLES.some(h => norm(r.title).includes(h)))
    .filter((r: any) => !varParts(r.variation).some(p => hidden.has(p)))
    .map((r: any) => {
      const kt = `${r.platform}|${norm(r.title)}`
      let sold = 0
      if (r.sku && bySku[`${r.platform}|${norm(r.sku)}`] != null) sold = bySku[`${r.platform}|${norm(r.sku)}`]
      else if (byTV[`${kt}|${normVar(r.variation)}`] != null) sold = byTV[`${kt}|${normVar(r.variation)}`]
      else if (varCount[`${r.platform}|${r.item_id}`] === 1 && byT[kt] != null) sold = byT[kt]
      const st = r.stock ?? 0
      const days = sold ? st / (sold / 60) : null
      const level = st <= 0 ? 'zero' : (days != null && days < 7) || st <= 2 ? 'crit' : (days != null && days < 15) || st <= 5 ? 'low' : null
      return { platform: r.platform, title: r.title, variation: r.variation && r.variation !== '(variações não lidas)' ? r.variation : null, stock: st, sold60: sold, days: days != null ? Math.floor(days) : null, level, thumb: r.thumbnail }
    })
    .filter((r: any) => r.level && r.sold60 > 0)
  const count = (l: string) => rows.filter((r: any) => r.level === l).length
  const rank: Record<string, number> = { zero: 0, crit: 1, low: 2 }
  return {
    zero: count('zero'), crit: count('crit'), low: count('low'),
    list: rows.sort((a: any, b: any) => rank[a.level] - rank[b.level] || b.sold60 - a.sold60).slice(0, 12),
  }
}

// 🛠️ O que está voltando: motivos de reclamação (ML) e devolução (Shopee)
// nos últimos 30 dias, nas mesmas categorias do Pós-venda. Sem cliente, sem R$.
const CATS: Record<string, { label: string, codes: string[] }> = {
  defeito:        { label: 'Quebrado, danificado ou com defeito', codes: ['broken_item', 'not_working_item', 'broken_or_in_bad_condition', 'BROKEN_PRODUCTS', 'PHYSICAL_DMG', 'FUNCTIONAL_DMG', 'DAMAGED_OTHERS'] },
  faltando:       { label: 'Faltando peça ou item', codes: ['missing_accessories', 'empty_box', 'damaged_package_missing_item', 'ITEM_MISSING', 'MISSING_PARTS'] },
  diferente:      { label: 'Diferente do anúncio / produto errado', codes: ['different_item', 'WRONG_ITEM', 'DIFFERENT_DESCRIPTION', 'EXPECTATION_FAILED', 'WRONG_DAMAGED_PRODUCT'] },
  nao_serviu:     { label: 'Não serviu / tamanho', codes: ['ITEM_NOT_FIT'] },
  arrependimento: { label: 'Se arrependeu / mudou de ideia', codes: ['repentant_buyer', 'CHANGE_MIND'] },
  nao_recebeu:    { label: 'Diz que não recebeu', codes: ['delivered_but_not_receive_package', 'NOT_RECEIPT'] },
  outros:         { label: 'Outros motivos', codes: [] },
}
const catOf = (code: string | null) => Object.keys(CATS).find(k => CATS[k].codes.includes(code || '')) || 'outros'
async function buildPosVenda(sb: any) {
  const since = new Date(Date.now() - 30 * 86400e3).toISOString()
  const [mlR, shR] = await Promise.all([
    sb.from('ml_claims').select('type, reason_name, order_info, date_created').gte('date_created', since).neq('type', 'cancel_purchase'),
    sb.from('shopee_returns').select('reason, items, create_time').gte('create_time', since),
  ])
  const cases = [
    ...(mlR.data || []).map((c: any) => ({ cat: catOf(c.reason_name), product: c.order_info?.items?.[0]?.title || null, platform: 'ml' })),
    ...(shR.data || []).map((r: any) => ({ cat: catOf(r.reason), product: r.items?.[0]?.name || null, platform: 'shopee' })),
  ]
  const byCat: Record<string, number> = {}
  cases.forEach(c => { byCat[c.cat] = (byCat[c.cat] || 0) + 1 })
  // Produtos que mais voltaram por problema nosso (defeito, faltando, diferente)
  const ours = ['defeito', 'faltando', 'diferente']
  const byProd: Record<string, { n: number, cats: Record<string, number> }> = {}
  cases.filter(c => ours.includes(c.cat) && c.product).forEach(c => {
    const x = byProd[c.product] ||= { n: 0, cats: {} }
    x.n++; x.cats[c.cat] = (x.cats[c.cat] || 0) + 1
  })
  return {
    total: cases.length,
    ours: cases.filter(c => ours.includes(c.cat)).length,
    cats: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: CATS[k].label, n, ours: ours.includes(k) })),
    products: Object.entries(byProd).sort((a, b) => b[1].n - a[1].n).slice(0, 5)
      .map(([name, v]) => ({ name, n: v.n, cat: CATS[Object.entries(v.cats).sort((a, b) => b[1] - a[1])[0][0]].label })),
  }
}

// ✅ Concluídos: o último dia antes de hoje (até 7 dias atrás) com algo
// concluído no Foco do dia ou nos Serviços do barracão, por pessoa
async function buildConcluidos(sb: any, today: string) {
  const from = addDays(today, -7)
  const [focusR, tasksR, usersR] = await Promise.all([
    sb.from('daily_focus').select('employee_name, task, date, done_at').eq('done', true).gte('date', addDays(from, -7)),
    sb.from('maintenance_tasks').select('title, assigned_to, completed_at').eq('status', 'concluido').gte('completed_at', from).lt('completed_at', today),
    sb.from('system_users').select('id, name'),
  ])
  const nameOf = Object.fromEntries((usersR.data || []).map((u: any) => [u.id, u.name]))
  const items = [
    ...(focusR.data || []).map((f: any) => ({ who: f.employee_name, what: f.task, day: f.done_at ? isoDay(new Date(f.done_at)) : f.date })),
    ...(tasksR.data || []).filter((t: any) => t.assigned_to && nameOf[t.assigned_to]).map((t: any) => ({ who: nameOf[t.assigned_to], what: t.title, day: t.completed_at })),
  ].filter(x => x.day >= from && x.day < today)
  const day = items.map(x => x.day).sort().pop() || null
  if (!day) return { day: null, total: 0, people: [] }
  const by: Record<string, string[]> = {}
  items.filter(x => x.day === day).forEach(x => (by[x.who] ||= []).push(String(x.what || '').replace(/;\s*$/, '')))
  const people = Object.entries(by).map(([name, tasks]) => ({ name, n: tasks.length, tasks: tasks.slice(0, 4) })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
  return { day, total: people.reduce((t, p) => t + p.n, 0), people }
}

// 📸 Instagram: seguidores, saldo do último dia fechado, último post e a
// última publicação em que marcaram a @coisapet (influencers/clientes)
async function buildInstagram(sb: any) {
  const [accR, dailyR, mediaR, tagR] = await Promise.all([
    sb.from('ig_account').select('username, followers_count, connected_at, last_sync_at').eq('id', 1).maybeSingle(),
    sb.from('ig_account_daily').select('day, followers_count, new_follows, unfollows, follows_at').order('day', { ascending: false }).limit(10),
    sb.from('ig_media').select('caption, media_type, media_url, thumbnail_url, permalink, posted_at, like_count, comments_count, insights').order('posted_at', { ascending: false }).limit(1),
    sb.from('ig_tagged_media').select('username, caption, media_type, media_url, posted_at, like_count, comments_count').gte('posted_at', new Date(Date.now() - 30 * 86400e3).toISOString()).order('posted_at', { ascending: false }).limit(3),
  ])
  const acc = accR.data
  if (!acc?.last_sync_at) return null
  const daily = dailyR.data || []
  // Último dia que o Instagram já fechou (ganhos/perdas chegam com 1–2 dias)
  const closed = daily.find((d: any) => d.follows_at && ((d.new_follows || 0) + (d.unfollows || 0)) > 0)
  // 7 dias: soma ganhos − perdas dos últimos 7 dias já fechados
  const closedDays = daily.filter((d: any) => d.follows_at && ((d.new_follows || 0) + (d.unfollows || 0)) > 0).slice(0, 7)
  const last7 = closedDays.length ? closedDays.reduce((t: number, d: any) => t + (d.new_follows || 0) - (d.unfollows || 0), 0) : null
  const m = (mediaR.data || [])[0]
  const reach = m?.insights?.reach ?? null
  return {
    username: acc.username, followers: acc.followers_count,
    last_day: closed ? { day: closed.day, gained: closed.new_follows || 0, lost: closed.unfollows || 0 } : null,
    week_net: last7,
    post: m ? { caption: (m.caption || '').split('\n')[0].slice(0, 140), image: m.thumbnail_url || m.media_url, type: m.media_type, at: m.posted_at, likes: m.like_count, comments: m.comments_count, reach } : null,
    tagged: (tagR.data || []).filter((t: any) => t.media_url && t.media_type !== 'VIDEO').map((t: any) => ({ username: t.username, caption: (t.caption || '').split('\n')[0].slice(0, 120), image: t.media_url, type: t.media_type, at: t.posted_at, likes: t.like_count })),
  }
}

// 🚚 Envios pro Full (21/10): tudo que está agendado no ML (qualquer data
// futura, não só os próximos dias), com os itens de cada envio, mais as
// coletas lançadas à mão e as pré-listas ainda abertas. Só quantidades.
async function buildEnviosFull(sb: any, now: Date) {
  const [shipR, manualR, preR] = await Promise.all([
    sb.from('ml_full_inbound_shipments')
      .select('id, name, status, shipment_type, appointment_date, appointment_cancel_limit, logistic_center_id, products_count, items:ml_full_inbound_items(title, variation, declared_qty, raw)')
      .not('status', 'in', `(${TERMINAL.join(',')})`)
      .or(`appointment_date.is.null,appointment_date.gte.${new Date(now.getTime() - 12 * 3600e3).toISOString()}`)
      .order('appointment_date', { ascending: true, nullsFirst: false }).limit(10),
    sb.from('tv_alerts').select('id, title, body, event_at').eq('kind', 'coleta').eq('active', true)
      .gte('event_at', new Date(now.getTime() - 12 * 3600e3).toISOString()).order('event_at'),
    sb.from('full_prelists').select('id, platform, name, status, updated_at, items:full_prelist_items(title, variation, sku, thumbnail, qty, added, position)')
      .neq('status', 'concluida').order('updated_at', { ascending: false }).limit(5),
  ])
  const shipments = (shipR.data || []).map((s: any) => {
    const items = (s.items || []).map((i: any) => ({
      title: i.title, variation: i.variation || null, qty: i.declared_qty || 0,
      sku: i.raw?.sku || null, photo: i.raw?.pictures?.[0]?.secureUrl || null,
    })).sort((a: any, b: any) => b.qty - a.qty)
    return {
      source: 'ml', id: s.id, name: s.name, status: s.status, type: s.shipment_type, at: s.appointment_date,
      cancel_limit: s.appointment_cancel_limit, center: s.logistic_center_id,
      units: items.reduce((t: number, i: any) => t + i.qty, 0) || s.products_count || 0, items,
    }
  })
  const manual = (manualR.data || []).map((a: any) => ({ source: 'manual', id: a.id, name: a.title, note: a.body, at: a.event_at, units: 0, items: [] }))
  const prelists = (preR.data || []).map((p: any) => {
    const items = (p.items || []).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      .map((i: any) => ({ title: i.title, variation: i.variation, sku: i.sku, photo: i.thumbnail, qty: i.qty || 0, added: !!i.added }))
    return { id: p.id, platform: p.platform, name: p.name, items, units: items.reduce((t: number, i: any) => t + i.qty, 0) }
  }).filter((p: any) => p.items.length)
  const all = [...shipments, ...manual].sort((a: any, b: any) => String(a.at || '9').localeCompare(String(b.at || '9')))
  return { shipments: all, prelists, units: all.reduce((t: number, s: any) => t + (s.units || 0), 0) }
}
