// Barra de atenção do rodapé (09/10, fase103) — devolve a lista curta do
// que precisa de atenção AGORA, cada item com texto, nível, link e o
// módulo que dá acesso (a tela esconde o que a pessoa não pode abrir).
// Só contagens, nunca R$. Cache de 5 min em `attention_feed_cache`
// (pra não chamar a API do ML a cada usuário logado).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration as getMl } from '../_shared/mercadolivre.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const TZ = 'America/Sao_Paulo'
const isoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const hhmm = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const ddmm = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(new Date(iso))
const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
const TERMINAL = ['closed_ok', 'closed_with_changes', 'cancelled', 'expired']
const RETURN_DONE = ['ACCEPTED', 'CANCELLED', 'CLOSED', 'REFUND_PAID']
const TTL_MS = 5 * 60 * 1000

type Item = { key: string; level: 'critico' | 'atencao' | 'info'; text: string; to?: string; module?: string }

async function mlGet(path: string, token: string) {
  const res = await fetch(`https://api.mercadolibre.com${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`ML ${res.status}`)
  return res.json()
}

async function build(sb: any) {
  const now = new Date()
  const today = isoDay(now)
  const items: Item[] = []
  const errors: string[] = []
  const safe = async (name: string, fn: () => Promise<void>) => { try { await fn() } catch (e) { errors.push(`${name}: ${String((e as Error)?.message ?? e).slice(0, 200)}`) } }

  await Promise.all([
    // ── Coleta do Full ─────────────────────────────────────────────
    safe('full', async () => {
      const { data: settings } = await sb.from('tv_settings').select('full_warn_days').eq('id', 'default').maybeSingle()
      const warn = settings?.full_warn_days ?? 2
      const { data } = await sb.from('ml_full_inbound_shipments').select('id, appointment_date, status')
        .not('status', 'in', `(${TERMINAL.join(',')})`).not('appointment_date', 'is', null)
        .gte('appointment_date', new Date(now.getTime() - 12 * 3600e3).toISOString())
        .lte('appointment_date', new Date(addDays(today, warn + 1) + 'T03:00:00Z').toISOString())
        .order('appointment_date')
      for (const s of data || []) {
        const d = isoDay(new Date(s.appointment_date))
        const when = d === today ? `HOJE às ${hhmm(s.appointment_date)}` : d === addDays(today, 1) ? `amanhã às ${hhmm(s.appointment_date)}` : `${ddmm(s.appointment_date)} às ${hhmm(s.appointment_date)}`
        items.push({ key: `full-${s.id}`, level: d <= today ? 'critico' : 'atencao', text: `Coleta do Full ${when} (envio #${s.id})`, to: '/ml/full/envios', module: 'ml-insights' })
      }
    }),
    // ── Despacho ───────────────────────────────────────────────────
    safe('despacho', async () => {
      const valid = (o: any) => (!String(o.status_ml || '').toLowerCase().includes('cancelad') || o.needs_attention) && !o.is_full && (o.items || []).length > 0
      const complete = (o: any) => o.items.every((i: any) => i.picked)
      const [late, todayR, att] = await Promise.all([
        sb.from('orders').select('status_ml, needs_attention, is_full, items:order_items(picked)').lt('ship_date', today).gte('ship_date', addDays(today, -30)).eq('archived', false),
        sb.from('orders').select('status_ml, needs_attention, is_full, ship_by_at, items:order_items(picked)').eq('ship_date', today).eq('archived', false),
        sb.from('orders').select('id', { count: 'exact', head: true }).eq('needs_attention', true).eq('archived', false),
      ])
      const overdue = (late.data || []).filter(valid).filter((o: any) => !complete(o)).length
      if (overdue) items.push({ key: 'despacho-atrasado', level: 'critico', text: `${pl(overdue, 'pedido atrasado', 'pedidos atrasados')} pra despachar`, to: '/expedicao', module: 'pedidos' })
      const tod = (todayR.data || []).filter(valid)
      const pend = tod.filter((o: any) => !complete(o))
      if (pend.length) {
        const next = pend.map((o: any) => o.ship_by_at).filter(Boolean).sort()[0]
        items.push({ key: 'despacho-hoje', level: 'info', text: `Despacho de hoje: ${pend.length} de ${tod.length} pedidos ainda por separar${next ? ` · prazo ${hhmm(next)}` : ''}`, to: '/expedicao', module: 'pedidos' })
      }
      if (att.count) items.push({ key: 'cancelados-separados', level: 'atencao', text: `${pl(att.count, 'pedido cancelado', 'pedidos cancelados')} depois de ${att.count === 1 ? 'separado' : 'separados'} — verificar`, to: '/pedidos', module: 'pedidos' })
    }),
    // ── Estoque nos marketplaces ───────────────────────────────────
    safe('estoque', async () => {
      const { data } = await sb.from('marketplace_stock').select('platform, stock, status, sub_status, is_full')
      const zero = { ml: 0, shopee: 0 }, crit = { ml: 0, shopee: 0 }
      for (const r of data || []) {
        const p = r.platform as 'ml' | 'shopee'
        if (!(p in zero)) continue
        const pausedByHand = r.status !== 'active' && !String(r.sub_status || '').includes('out_of_stock')
        if (pausedByHand) continue
        if ((r.stock ?? 0) <= 0) zero[p]++
        else if (r.stock <= 2) crit[p]++
      }
      if (zero.ml + zero.shopee) items.push({ key: 'estoque-zero', level: 'critico', text: `Sem estoque: ${pl(zero.ml, 'variação', 'variações')} no ML · ${zero.shopee} na Shopee`, to: '/estoque-marketplaces', module: 'producao' })
      if (crit.ml + crit.shopee) items.push({ key: 'estoque-critico', level: 'atencao', text: `Estoque acabando (até 2 un.): ${crit.ml} no ML · ${crit.shopee} na Shopee`, to: '/estoque-marketplaces', module: 'producao' })
    }),
    // ── Devoluções Shopee ──────────────────────────────────────────
    safe('devolucoes', async () => {
      const { data } = await sb.from('shopee_returns').select('status, due_date').not('status', 'in', `(${RETURN_DONE.join(',')})`)
        .gte('create_time', new Date(now.getTime() - 90 * 86400e3).toISOString())
      const open = data || []
      if (open.length) {
        const due = open.map((r: any) => r.due_date).filter((d: string) => d && d > now.toISOString()).sort()[0]
        items.push({ key: 'devolucoes-shopee', level: 'atencao', text: `${pl(open.length, 'devolução', 'devoluções')} da Shopee em aberto${due ? ` · próximo prazo ${ddmm(due)}` : ''}`, to: '/shopee/retornos', module: 'shopee-retornos' })
      }
    }),
    // ── ML: reclamações e perguntas ────────────────────────────────
    safe('ml', async () => {
      const integ = await getMl(sb)
      const [claims, questions] = await Promise.allSettled([
        mlGet(`/post-purchase/v1/claims/search?status=opened&limit=50`, integ.access_token),
        mlGet(`/questions/search?seller_id=${integ.ml_user_id}&status=UNANSWERED&limit=1&api_version=4`, integ.access_token),
      ])
      if (claims.status === 'fulfilled') {
        const list = claims.value?.data ?? claims.value?.results ?? []
        const total = claims.value?.paging?.total ?? list.length
        const dispute = list.filter((c: any) => c.stage === 'dispute').length
        if (total) items.push({ key: 'ml-reclamacoes', level: 'critico', text: `${pl(total, 'reclamação aberta', 'reclamações abertas')} no ML${dispute ? ` (${dispute} em mediação)` : ''}`, to: '/ml', module: 'ml-insights' })
      } else errors.push(`ml-claims: ${claims.reason}`)
      if (questions.status === 'fulfilled') {
        const total = questions.value?.total ?? questions.value?.paging?.total ?? 0
        if (total) items.push({ key: 'ml-perguntas', level: 'atencao', text: `${pl(total, 'pergunta sem resposta', 'perguntas sem resposta')} no ML`, to: '/ml/perguntas', module: 'ml-insights' })
      } else errors.push(`ml-questions: ${questions.reason}`)
    }),
    // ── Kanban operacional atrasado ────────────────────────────────
    safe('kanban', async () => {
      const { count } = await sb.from('tasks').select('id', { count: 'exact', head: true }).eq('kanban_type', 'operacional').neq('status', 'done').lt('due_date', today)
      if (count) items.push({ key: 'kanban-atrasadas', level: 'atencao', text: `${pl(count, 'tarefa atrasada', 'tarefas atrasadas')} no Kanban Operacional`, to: '/kanban-op', module: 'kanban-op' })
    }),
    // ── Manutenção: revisão de máquina atrasada ────────────────────
    safe('manutencao', async () => {
      const [logsR, machinesR] = await Promise.all([
        sb.from('maintenance_logs').select('machine_id, next_service_at, performed_at').not('next_service_at', 'is', null).order('performed_at', { ascending: false }).limit(500),
        sb.from('machines').select('id, name, active'),
      ])
      const name = Object.fromEntries((machinesR.data || []).filter((m: any) => m.active !== false).map((m: any) => [m.id, m.name]))
      const seen = new Set()
      const late: string[] = []
      for (const l of logsR.data || []) {
        if (seen.has(l.machine_id)) continue
        seen.add(l.machine_id)
        if (name[l.machine_id] && l.next_service_at.slice(0, 10) < today) late.push(name[l.machine_id])
      }
      if (late.length) items.push({ key: 'maquinas', level: 'atencao', text: `Revisão atrasada: ${late.slice(0, 3).join(', ')}${late.length > 3 ? ` e mais ${late.length - 3}` : ''}`, to: '/manutencao', module: 'manutencao' })
    }),
    // ── Avisos críticos lançados pra TV ────────────────────────────
    safe('avisos', async () => {
      const { data } = await sb.from('tv_alerts').select('title, ends_at, level').eq('kind', 'aviso').eq('active', true).eq('level', 'critico').lte('starts_at', now.toISOString())
      for (const a of (data || []).filter((a: any) => !a.ends_at || a.ends_at > now.toISOString())) items.push({ key: `aviso-${a.title}`, level: 'critico', text: a.title })
    }),
  ])

  const order = { critico: 0, atencao: 1, info: 2 }
  items.sort((a, b) => order[a.level] - order[b.level])
  return { items, errors, generated_at: now.toISOString() }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let body: any = {}
  try { body = await req.json() } catch { /* vazio */ }
  const sb = adminClient()
  try {
    if (!body.force) {
      const { data: c } = await sb.from('attention_feed_cache').select('payload, generated_at').eq('id', 'default').maybeSingle()
      if (c && Date.now() - new Date(c.generated_at).getTime() < TTL_MS) return json({ ok: true, cached: true, ...c.payload })
    }
    const payload = await build(sb)
    await sb.from('attention_feed_cache').upsert({ id: 'default', payload, generated_at: payload.generated_at })
    return json({ ok: true, cached: false, ...payload })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
