// Instagram da CoisaPet dentro do sistema (19/10) — "Instagram API with
// Instagram Login" (graph.instagram.com, conta profissional, sem Página do FB).
// Deploy com --no-verify-jwt: quem chama é o front (chave pública) ou o cron,
// e a autorização é feita AQUI:
//   * front → manda `p_token` (token da sessão do sistema, fase106); conferimos
//     dono + módulo `instagram` (Diretoria sempre; Atendimento/Marketing pelo
//     Controle de Acesso). Conectar/desconectar a conta: só Diretoria.
//   * cron  → manda o `secret` guardado em ig_secrets.cron_secret.
// O token da Meta mora só em ig_secrets (ou no secret IG_ACCESS_TOKEN da
// função) e nunca sai daqui. Tokens longos valem 60 dias — renovamos sozinhos
// 1x por dia (refresh_access_token), então ele não expira enquanto o cron roda.
//
// A API não tem agendamento nativo: o post fica em ig_posts e o cron (5 em 5
// min) publica quando chega a hora. Publicar é em etapas (cria o "container",
// espera a Meta processar — vídeo demora —, publica), guardadas em
// ig_posts.containers pra continuar na próxima rodada se demorar.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const GRAPH = 'https://graph.instagram.com/v23.0'
const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const SYNC_EVERY_MIN = 55
const MAX_ATTEMPTS = 6
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ids da Meta são numéricos/alfanuméricos — nada de vírgula/parêntese (evita injeção em filtro/URL)
const metaId = (v: unknown) => {
  const s = String(v ?? '')
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(s)) throw new HttpError(400, 'Id inválido')
  return s
}
class HttpError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status } }

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Segredos ──────────────────────────────────────────────────────────
async function getSecret(sb: any, key: string) {
  const { data } = await sb.from('ig_secrets').select('value, updated_at').eq('key', key).maybeSingle()
  return data as { value: string, updated_at: string } | null
}
const setSecret = (sb: any, key: string, value: string) =>
  sb.from('ig_secrets').upsert({ key, value, updated_at: new Date().toISOString() })

// Token atual. Se alguém trocou o secret IG_ACCESS_TOKEN no painel do
// Supabase, ele passa a valer (comparamos pelo hash).
async function getToken(sb: any): Promise<string | null> {
  const env = Deno.env.get('IG_ACCESS_TOKEN')
  if (env) {
    const h = await sha256Hex(env)
    const seen = await getSecret(sb, 'token_env_hash')
    if (seen?.value !== h) {
      await setSecret(sb, 'access_token', env)
      await setSecret(sb, 'token_env_hash', h)
      await setSecret(sb, 'refreshed_at', new Date().toISOString())
      return env
    }
  }
  return (await getSecret(sb, 'access_token'))?.value || null
}

// ── Chamada à Graph API (o token NUNCA vai pro log) ───────────────────
async function ig(token: string, path: string, params: Record<string, unknown> = {}, method = 'GET') {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  qs.set('access_token', token)
  const url = path.startsWith('http') ? path : `${GRAPH}/${path.replace(/^\//, '')}`
  const r = method === 'GET' || method === 'DELETE'
    ? await fetch(`${url}${url.includes('?') ? '&' : '?'}${qs}`, { method })
    : await fetch(url, { method, body: qs })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || data?.error) {
    const e = data?.error || {}
    const msg = e.error_user_msg || e.message || `HTTP ${r.status}`
    const err: any = new Error(msg)
    err.code = e.code; err.subcode = e.error_subcode; err.http = r.status
    throw err
  }
  return data
}
const tryIg = async (token: string, path: string, params: Record<string, unknown> = {}) => {
  try { return await ig(token, path, params) } catch (e) { console.warn('[instagram-api]', path.split('?')[0], (e as Error).message); return null }
}

// ── Sessão do sistema ─────────────────────────────────────────────────
async function sessionUser(sb: any, token: unknown) {
  if (typeof token !== 'string' || token.length < 32) throw new HttpError(401, 'Sessão sem token — saia e entre de novo no sistema.')
  const { data, error } = await sb.rpc('ig_session_user', { p_token: token })
  if (error) throw error
  if (!data) throw new HttpError(401, 'Sessão expirada — saia e entre de novo no sistema.')
  if (!data.allowed) throw new HttpError(403, 'Seu perfil não tem acesso ao Instagram.')
  return data as { id: string, name: string, role: string }
}

// ── Conta ─────────────────────────────────────────────────────────────
const ME_FIELDS = 'user_id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,account_type'
async function accountId(sb: any) {
  const { data } = await sb.from('ig_account').select('ig_user_id').eq('id', 1).maybeSingle()
  return data?.ig_user_id as string | undefined
}
const spDate = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10)
// Séries "period=day" da Meta vêm com end_time = FIM do dia (meia-noite do
// Pacífico, ~07:00Z) — o valor é do dia ANTERIOR a esse carimbo.
const endDay = (endTime: string) => spDate(new Date(new Date(endTime).getTime() - 12 * 3600e3))
const spMidnight = (day: string) => Math.floor(Date.parse(day + 'T03:00:00Z') / 1000)   // 00:00 em Brasília

async function refreshTokenIfNeeded(sb: any, token: string) {
  const at = await getSecret(sb, 'refreshed_at')
  if (at && Date.now() - new Date(at.value).getTime() < 24 * 3600e3) return token
  try {
    const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`)
    const d = await r.json()
    if (!r.ok || !d.access_token) throw new Error(d?.error?.message || `HTTP ${r.status}`)
    await setSecret(sb, 'access_token', d.access_token)
    await setSecret(sb, 'refreshed_at', new Date().toISOString())
    await sb.from('ig_account').update({ token_expires_at: new Date(Date.now() + (d.expires_in || 5184000) * 1000).toISOString() }).eq('id', 1)
    return d.access_token as string
  } catch (e) {
    console.warn('[instagram-api] refresh falhou:', (e as Error).message)
    return token
  }
}

// Sincroniza perfil, métricas da conta, posts (+métricas) e comentários.
async function runSync(sb: any, token: string) {
  const me = await ig(token, 'me', { fields: ME_FIELDS })
  const igId = String(me.user_id || me.id)
  const now = new Date()
  const acc: Record<string, unknown> = {
    id: 1, ig_user_id: igId, username: me.username, name: me.name, biography: me.biography, website: me.website,
    profile_picture_url: me.profile_picture_url, followers_count: me.followers_count, follows_count: me.follows_count,
    media_count: me.media_count, last_sync_at: now.toISOString(), last_sync_error: null,
  }

  // Cota de publicação (100 posts / 24h via API)
  const lim = await tryIg(token, `${igId}/content_publishing_limit`, { fields: 'config,quota_usage' })
  if (lim?.data?.[0]) acc.publish_quota = { used: lim.data[0].quota_usage ?? 0, total: lim.data[0].config?.quota_total ?? 100 }

  // Totais dos últimos 28 dias
  const until = Math.floor(now.getTime() / 1000)
  const since28 = until - 28 * 86400
  const totals: Record<string, number> = {}
  const tv = await tryIg(token, `${igId}/insights`, {
    metric: 'reach,views,accounts_engaged,total_interactions,likes,comments,shares,saves,profile_links_taps,follows_and_unfollows',
    period: 'day', metric_type: 'total_value', since: since28, until,
  }) || await tryIg(token, `${igId}/insights`, { metric: 'reach,accounts_engaged,total_interactions', period: 'day', metric_type: 'total_value', since: since28, until })
  for (const m of tv?.data || []) {
    totals[m.name] = m.total_value?.value ?? 0
    if (m.name === 'follows_and_unfollows') {
      for (const b of m.total_value?.breakdowns?.[0]?.results || []) totals[String(b.dimension_values?.[0] || '').toLowerCase()] = b.value
    }
  }
  if (Object.keys(totals).length) acc.totals_28d = totals

  // Alcance dia a dia (30 dias) → ig_account_daily
  const series = await tryIg(token, `${igId}/insights`, { metric: 'reach', period: 'day', since: until - 29 * 86400, until })
  const reachByDay: Record<string, number> = {}
  for (const v of series?.data?.[0]?.values || []) reachByDay[endDay(v.end_time)] = v.value
  const daily = Object.entries(reachByDay).map(([day, reach]) => ({ day, reach, updated_at: now.toISOString() }))
  if (daily.length) await sb.from('ig_account_daily').upsert(daily, { onConflict: 'day', ignoreDuplicates: false })
  await sb.from('ig_account_daily').upsert({
    day: spDate(now), followers_count: me.followers_count, follows_count: me.follows_count, media_count: me.media_count,
    ...(reachByDay[spDate(now)] !== undefined ? { reach: reachByDay[spDate(now)] } : {}), updated_at: now.toISOString(),
  })

  // Seguidores ganhos/perdidos por dia (20/10, pedido do Raphael — a Isa
  // contava na mão todo fim de dia). follows_and_unfollows com breakdown
  // follow_type, um pedido por dia (dia de Brasília). A Meta guarda ~30 dias;
  // daqui pra frente o histórico fica no nosso banco. Hoje e ontem são
  // sempre rebuscados; dias fechados só se ainda não foram buscados depois
  // de fechar.
  await syncFollows(sb, token, igId, now)
  // 23/10: métricas por dia, quebras de alcance (tipo / seguidor) e período anterior
  try { await syncDailyMetrics(sb, token, igId, now) } catch (e) { console.warn('[instagram-api] daily', (e as Error).message) }
  try { acc.insights_28d = await accountInsights(token, igId, now) } catch (e) { console.warn('[instagram-api] insights28', (e as Error).message) }

  // Horário em que os seguidores estão online (média por hora)
  const of = await tryIg(token, `${igId}/insights`, { metric: 'online_followers', period: 'lifetime' })
  const sum: Record<string, number> = {}; let days = 0
  for (const v of of?.data?.[0]?.values || []) {
    if (!v.value || !Object.keys(v.value).length) continue
    days++
    for (const [h, n] of Object.entries(v.value)) sum[h] = (sum[h] || 0) + Number(n)
  }
  if (days) acc.online_followers = Object.fromEntries(Object.entries(sum).map(([h, n]) => [h, Math.round(n / days)]))

  // Público (só aparece com 100+ seguidores) — atualiza 1x por dia
  const { data: prev } = await sb.from('ig_account').select('demographics').eq('id', 1).maybeSingle()
  if (!prev?.demographics?.at || Date.now() - new Date(prev.demographics.at).getTime() > 20 * 3600e3) {
    const demo: Record<string, unknown> = { at: now.toISOString() }
    for (const bd of ['age,gender', 'city', 'country']) {
      const d = await tryIg(token, `${igId}/insights`, { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', timeframe: 'this_month', breakdown: bd })
      const rows = d?.data?.[0]?.total_value?.breakdowns?.[0]?.results || []
      demo[bd === 'age,gender' ? 'age_gender' : bd] = rows.map((r: any) => ({ k: r.dimension_values, v: r.value }))
    }
    // 23/10: quem foi ALCANÇADO e quem ENGAJOU no mês (não só quem segue)
    for (const bd of ['age', 'gender', 'city']) {
      const d = await tryIg(token, `${igId}/insights`, { metric: 'engaged_audience_demographics,reached_audience_demographics', period: 'lifetime', metric_type: 'total_value', timeframe: 'this_month', breakdown: bd })
      for (const m of d?.data || []) {
        const key = String(m.name).startsWith('engaged') ? 'engaged' : 'reached'
        const bucket = (demo[key] ||= {}) as Record<string, unknown>
        bucket[bd] = (m.total_value?.breakdowns?.[0]?.results || []).map((r: any) => ({ k: r.dimension_values, v: r.value }))
      }
    }
    acc.demographics = demo
  }
  await sb.from('ig_account').upsert(acc)

  // Posts: o histórico inteiro (até 300 mais recentes)
  const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'
  let page = await ig(token, `${igId}/media`, { fields: MEDIA_FIELDS, limit: 50 })
  const media: any[] = [...(page.data || [])]
  for (let i = 0; i < 5 && page.paging?.next && (page.data || []).length >= 50; i++) {
    page = await tryIg(token, page.paging.next) || {}
    media.push(...(page.data || []))
  }
  // Métricas (20/10): antes só os últimos 60 dias — com ~1 post/semana sobravam
  // 6 posts com métrica. Agora: posts dos últimos 30 dias sempre; os demais
  // quando ainda não têm métrica ou ela tem mais de 7 dias (máx. 60 por
  // rodada, então o histórico inteiro fica completo em poucas horas).
  const { data: known } = await sb.from('ig_media').select('id, insights')
  const seen: Record<string, number> = {}
  for (const k of known || []) seen[k.id] = k.insights?._at ? new Date(k.insights._at).getTime() : 0
  const age = (m: any) => Date.now() - new Date(m.timestamp).getTime()
  const fresh = media.filter(m => age(m) < 30 * 86400e3)
  const stale = media.filter(m => age(m) >= 30 * 86400e3 && (!seen[m.id] || Date.now() - seen[m.id] > 7 * 86400e3))
  const todo = [...fresh, ...stale].slice(0, 60)
  const METRICS: Record<string, string[]> = {
    REELS: [
      'reach,views,saved,shares,total_interactions,likes,comments,ig_reels_avg_watch_time,ig_reels_video_view_total_time',
      'reach,views,saved,shares,total_interactions,likes,comments',
      'reach,saved,shares,total_interactions',
    ],
    FEED: [
      'reach,views,saved,shares,total_interactions,likes,comments,profile_visits,follows',
      'reach,views,saved,shares,total_interactions,likes,comments',
      'reach,saved,total_interactions',
    ],
  }
  const insights: Record<string, any> = {}
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(async m => {
      for (const metric of METRICS[m.media_product_type === 'REELS' ? 'REELS' : 'FEED']) {
        const r = await tryIg(token, `${m.id}/insights`, { metric })
        if (r?.data) {
          insights[m.id] = { ...Object.fromEntries(r.data.map((x: any) => [x.name, x.values?.[0]?.value ?? x.total_value?.value ?? 0])), _at: now.toISOString() }
          break
        }
      }
    }))
  }
  const rows = media.map(m => ({
    id: m.id, caption: m.caption || null, media_type: m.media_type, media_product_type: m.media_product_type,
    media_url: m.media_url || null, thumbnail_url: m.thumbnail_url || null, permalink: m.permalink,
    posted_at: m.timestamp, like_count: m.like_count ?? null, comments_count: m.comments_count ?? null,
    updated_at: now.toISOString(), ...(insights[m.id] ? { insights: insights[m.id] } : {}),
  }))
  // posts sem métrica nova não apagam a antiga: upsert em 2 grupos
  const withIns = rows.filter(r => 'insights' in r), without = rows.filter(r => !('insights' in r))
  if (withIns.length) await sb.from('ig_media').upsert(withIns)
  if (without.length) await sb.from('ig_media').upsert(without)

  // Comentários: posts dos últimos 45 dias que têm comentário (máx. 20)
  const withComments = media.filter(m => (m.comments_count || 0) > 0 && Date.now() - new Date(m.timestamp).getTime() < 45 * 86400e3).slice(0, 20)
  await Promise.all(withComments.map(m => syncComments(sb, token, m.id, me.username)))

  // Posts de outras contas que marcaram a @coisapet na foto (20/10, aba
  // Parcerias). Collab e menção na legenda a Meta não entrega nessa conexão.
  const tags = await tryIg(token, `${igId}/tags`, { fields: 'id,username,caption,media_type,media_product_type,media_url,permalink,timestamp,like_count,comments_count', limit: 50 })
  const tagRows = (tags?.data || []).map((t: any) => ({
    id: t.id, username: t.username || null, caption: t.caption || null, media_type: t.media_type, media_product_type: t.media_product_type || null,
    media_url: t.media_url || null, permalink: t.permalink || null, posted_at: t.timestamp || null,
    like_count: t.like_count ?? null, comments_count: t.comments_count ?? null, updated_at: now.toISOString(),
  }))
  if (tagRows.length) await sb.from('ig_tagged_media').upsert(tagRows)
  let stories = 0
  try { stories = await syncStories(sb, token, igId) } catch (e) { console.warn('[instagram-api] stories', (e as Error).message) }
  return { username: me.username, media: media.length, comments_posts: withComments.length, tagged: tagRows.length, stories }
}

// ── Stories (23/10) ───────────────────────────────────────────────────
// A Meta só lista os stories NO AR (24h) e as métricas somem quando o story
// expira — por isso o cron passa aqui a cada ~15 min e guarda tudo. A imagem
// (ou a capa, se for vídeo) é copiada pro bucket: o link da Meta expira.
const STORY_METRICS = [
  'reach,views,replies,shares,total_interactions,follows,profile_visits',
  'reach,views,replies,shares,total_interactions',
  'reach,replies',
]
const isoTs = (t: string) => new Date(String(t).replace(/([+-]\d\d)(\d\d)$/, '$1:$2'))
async function copyStoryMedia(sb: any, s: any) {
  const src = s.media_type === 'VIDEO' ? s.thumbnail_url : s.media_url
  if (!src) return null
  try {
    const r = await fetch(src)
    if (!r.ok) return null
    const path = `stories/${metaId(s.id)}.jpg`
    const { error } = await sb.storage.from('instagram-media').upload(path, new Uint8Array(await r.arrayBuffer()), { contentType: r.headers.get('content-type') || 'image/jpeg', upsert: true })
    return error ? null : path
  } catch { return null }
}
async function syncStories(sb: any, token: string, igId: string) {
  const r = await tryIg(token, `${igId}/stories`, { fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp', limit: 50 })
  const list: any[] = r?.data || []
  const now = new Date().toISOString()
  if (list.length) {
    const { data: known } = await sb.from('ig_stories').select('id, media_path').in('id', list.map(s => metaId(s.id)))
    const pathOf: Record<string, string | null> = Object.fromEntries((known || []).map((k: any) => [k.id, k.media_path]))
    const withIns: any[] = [], without: any[] = []
    await Promise.all(list.map(async s => {
      let insights: Record<string, number> | null = null
      for (const metric of STORY_METRICS) {
        const x = await tryIg(token, `${s.id}/insights`, { metric })
        if (x?.data) { insights = Object.fromEntries(x.data.map((m: any) => [m.name, m.values?.[0]?.value ?? m.total_value?.value ?? 0])); break }
      }
      const nav = await tryIg(token, `${s.id}/insights`, { metric: 'navigation', breakdown: 'story_navigation_action_type' })
      const res = nav?.data?.[0]?.total_value?.breakdowns?.[0]?.results
      const navigation = res ? Object.fromEntries(res.map((x: any) => [x.dimension_values?.[0], x.value])) : null
      const posted = isoTs(s.timestamp)
      const row: any = {
        id: s.id, media_type: s.media_type, permalink: s.permalink || null,
        posted_at: posted.toISOString(), expires_at: new Date(posted.getTime() + 86400e3).toISOString(),
        media_url: (s.media_type === 'VIDEO' ? s.thumbnail_url : s.media_url) || null,
        media_path: pathOf[s.id] || await copyStoryMedia(sb, s), updated_at: now,
      }
      if (navigation) row.navigation = navigation
      if (insights) withIns.push({ ...row, insights, insights_at: now }); else without.push(row)
    }))
    // sem métrica nova não apaga a antiga
    if (withIns.length) await sb.from('ig_stories').upsert(withIns)
    if (without.length) await sb.from('ig_stories').upsert(without)
  }
  await sb.from('ig_account').update({ stories_sync_at: now }).eq('id', 1)
  return list.length
}

// ── Insights da conta (23/10) ─────────────────────────────────────────
// Últimos 28 dias quebrados por tipo de conteúdo (Reels, post, carrossel,
// story) e por seguidor × não seguidor, mais os totais dos 28 dias ANTERIORES
// pra comparação.
const TOTAL_METRICS = 'reach,views,accounts_engaged,total_interactions,likes,comments,shares,saves,profile_links_taps,follows_and_unfollows'
async function accountInsights(token: string, igId: string, now: Date) {
  const until = Math.floor(now.getTime() / 1000), s28 = until - 28 * 86400, s56 = until - 56 * 86400
  const breakdownOf = (m: any) => Object.fromEntries((m?.total_value?.breakdowns?.[0]?.results || []).map((r: any) => [String(r.dimension_values?.[0] || ''), r.value]))
  const out: Record<string, any> = { at: now.toISOString(), by_type: {}, by_follow: {}, prev: {} }
  const typed = await tryIg(token, `${igId}/insights`, { metric: 'reach,views,total_interactions', period: 'day', metric_type: 'total_value', breakdown: 'media_product_type', since: s28, until })
  for (const m of typed?.data || []) out.by_type[m.name] = breakdownOf(m)
  const fol = await tryIg(token, `${igId}/insights`, { metric: 'reach,views', period: 'day', metric_type: 'total_value', breakdown: 'follow_type', since: s28, until })
    || await tryIg(token, `${igId}/insights`, { metric: 'reach', period: 'day', metric_type: 'total_value', breakdown: 'follow_type', since: s28, until })
  for (const m of fol?.data || []) out.by_follow[m.name] = breakdownOf(m)
  const prev = await tryIg(token, `${igId}/insights`, { metric: TOTAL_METRICS, period: 'day', metric_type: 'total_value', since: s56, until: s28 })
  for (const m of prev?.data || []) {
    out.prev[m.name] = m.total_value?.value ?? 0
    if (m.name === 'follows_and_unfollows') for (const [k, v] of Object.entries(breakdownOf(m))) out.prev[k.toLowerCase()] = v
  }
  return out
}

// Métricas por dia (dia de Brasília), um pedido por dia — mesmo esquema do
// syncFollows: hoje e ontem sempre; dias fechados só até buscar depois de fechar.
const DAY_METRICS = 'views,accounts_engaged,total_interactions,likes,comments,shares,saves,profile_links_taps'
async function syncDailyMetrics(sb: any, token: string, igId: string, now: Date) {
  const nowSec = Math.floor(now.getTime() / 1000)
  const days: string[] = []
  for (let i = 0; i < 30; i++) days.push(spDate(new Date(now.getTime() - i * 86400e3)))
  const { data: have } = await sb.from('ig_account_daily').select('day, metrics_at').in('day', days)
  const at: Record<string, number> = {}
  for (const h of have || []) if (h.metrics_at) at[h.day] = new Date(h.metrics_at).getTime() / 1000
  const need = days.filter((d, i) => i < 2 || !at[d] || at[d] < spMidnight(d) + 86400 + 2 * 3600)
  const rows: any[] = []
  for (let i = 0; i < need.length; i += 6) {
    await Promise.all(need.slice(i, i + 6).map(async d => {
      const since = spMidnight(d), until = Math.min(since + 86400, nowSec)
      if (until - since < 120) return
      const r = await tryIg(token, `${igId}/insights`, { metric: DAY_METRICS, period: 'day', metric_type: 'total_value', since, until })
      if (!r?.data) return
      rows.push({ day: d, metrics: Object.fromEntries(r.data.map((m: any) => [m.name, m.total_value?.value ?? 0])), metrics_at: now.toISOString() })
    }))
  }
  if (rows.length) await sb.from('ig_account_daily').upsert(rows)
  return rows.length
}

async function syncFollows(sb: any, token: string, igId: string, now: Date) {
  const nowSec = Math.floor(now.getTime() / 1000)
  const days: string[] = []
  for (let i = 0; i < 30; i++) days.push(spDate(new Date(now.getTime() - i * 86400e3)))
  const { data: have } = await sb.from('ig_account_daily').select('day, follows_at').in('day', days)
  const fetchedAt: Record<string, number> = {}
  for (const h of have || []) if (h.follows_at) fetchedAt[h.day] = new Date(h.follows_at).getTime() / 1000
  const need = days.filter((d, i) => i < 2 || !fetchedAt[d] || fetchedAt[d] < spMidnight(d) + 86400 + 2 * 3600)
  const out: Record<string, { follows: number | null, unfollows: number | null }> = {}
  for (let i = 0; i < need.length; i += 6) {
    await Promise.all(need.slice(i, i + 6).map(async d => {
      const since = spMidnight(d), until = Math.min(since + 86400, nowSec)
      if (until - since < 120) return
      const r = await tryIg(token, `${igId}/insights`, { metric: 'follows_and_unfollows', period: 'day', metric_type: 'total_value', breakdown: 'follow_type', since, until })
      const res = r?.data?.[0]?.total_value?.breakdowns?.[0]?.results
      if (!r?.data) return
      let follows = 0, unfollows = 0
      for (const x of res || []) {
        const k = String(x.dimension_values?.[0] || '').toUpperCase()
        if (k === 'FOLLOWER') follows = x.value || 0
        else if (k === 'NON_FOLLOWER') unfollows = x.value || 0
      }
      out[d] = { follows, unfollows }
    }))
  }
  // Plano B: follower_count (só ganhos) se a métrica acima não vier
  if (!Object.keys(out).length) {
    const fc = await tryIg(token, `${igId}/insights`, { metric: 'follower_count', period: 'day', since: nowSec - 29 * 86400, until: nowSec })
    for (const v of fc?.data?.[0]?.values || []) out[endDay(v.end_time)] = { follows: v.value ?? 0, unfollows: null }
  }
  const rows = Object.entries(out).map(([day, v]) => ({ day, new_follows: v.follows, unfollows: v.unfollows, follows_at: now.toISOString() }))
  if (rows.length) await sb.from('ig_account_daily').upsert(rows)
  return rows.length
}

async function syncComments(sb: any, token: string, mediaId: string, selfUser: string) {
  const r = await tryIg(token, `${mediaId}/comments`, { fields: 'id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp,like_count,hidden}', limit: 50 })
  if (!r?.data) return
  const rows: any[] = []
  const now = new Date().toISOString()
  for (const c of r.data) {
    const replies = c.replies?.data || []
    rows.push({ id: c.id, media_id: mediaId, parent_id: null, username: c.username, text: c.text, commented_at: c.timestamp,
      like_count: c.like_count ?? 0, hidden: !!c.hidden, from_self: c.username === selfUser,
      answered: replies.some((x: any) => x.username === selfUser), updated_at: now })
    for (const x of replies) rows.push({ id: x.id, media_id: mediaId, parent_id: c.id, username: x.username, text: x.text,
      commented_at: x.timestamp, like_count: x.like_count ?? 0, hidden: !!x.hidden, from_self: x.username === selfUser,
      answered: false, updated_at: now })
  }
  if (rows.length) await sb.from('ig_comments').upsert(rows)
}

// ── Publicação (máquina de etapas) ────────────────────────────────────
type Item = { url: string, type: 'IMAGE' | 'VIDEO' }
async function containerStatus(token: string, id: string) {
  const s = await ig(token, id, { fields: 'status_code,status' })
  return { code: s.status_code as string, detail: s.status as string }
}

// Avança um post o máximo possível. Retorna o estado depois da rodada.
async function advancePost(sb: any, token: string, igId: string, post: any, budgetMs: number): Promise<string> {
  const started = Date.now()
  const save = (patch: Record<string, unknown>) => sb.from('ig_posts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', post.id)
  const items: Item[] = post.media || []
  let c = post.containers || {}
  try {
    if (!items.length) throw new Error('Post sem foto/vídeo')
    // 1) cria os containers
    if (post.kind === 'CAROUSEL') {
      if (!c.children) {
        if (items.length < 2 || items.length > 10) throw new Error('Carrossel precisa de 2 a 10 mídias')
        const children: string[] = []
        for (const it of items) {
          const r = await ig(token, `${igId}/media`, it.type === 'VIDEO'
            ? { media_type: 'VIDEO', video_url: it.url, is_carousel_item: true }
            : { image_url: it.url, is_carousel_item: true }, 'POST')
          children.push(r.id)
        }
        c = { ...c, children, created_at: new Date().toISOString() }
        await save({ containers: c, status: 'publicando' })
      }
      if (!c.parent) {
        for (const id of c.children) {
          const s = await containerStatus(token, id)
          if (s.code === 'ERROR' || s.code === 'EXPIRED') throw new Error(`Uma das mídias do carrossel falhou na Meta (${s.detail || s.code})`)
          if (s.code !== 'FINISHED') return 'publicando'
        }
        const r = await ig(token, `${igId}/media`, { media_type: 'CAROUSEL', children: c.children.join(','), caption: post.caption }, 'POST')
        c = { ...c, parent: r.id }
        await save({ containers: c })
      }
    } else if (!c.parent) {
      const it = items[0]
      const params: Record<string, unknown> =
        post.kind === 'REELS' ? { media_type: 'REELS', video_url: it.url, caption: post.caption, share_to_feed: post.share_to_feed, cover_url: post.cover_url || undefined }
        : post.kind === 'STORIES' ? (it.type === 'VIDEO' ? { media_type: 'STORIES', video_url: it.url } : { media_type: 'STORIES', image_url: it.url })
        : { image_url: it.url, caption: post.caption }
      const r = await ig(token, `${igId}/media`, params, 'POST')
      c = { ...c, parent: r.id, created_at: new Date().toISOString() }
      await save({ containers: c, status: 'publicando' })
    }
    // 2) espera a Meta processar (vídeo leva de segundos a minutos)
    while (true) {
      const s = await containerStatus(token, c.parent)
      if (s.code === 'FINISHED') break
      if (s.code === 'ERROR' || s.code === 'EXPIRED') throw new Error(`A Meta recusou a mídia (${s.detail || s.code}). Confira formato/tamanho.`)
      if (Date.now() - started > budgetMs) return 'publicando'
      await sleep(4000)
    }
    // 3) publica
    const pub = await ig(token, `${igId}/media_publish`, { creation_id: c.parent }, 'POST')
    const info = await tryIg(token, pub.id, { fields: 'permalink' })
    await save({ status: 'publicado', ig_media_id: pub.id, permalink: info?.permalink || null, published_at: new Date().toISOString(), error: null, containers: c })
    return 'publicado'
  } catch (e) {
    const msg = (e as Error).message
    const attempts = (post.attempts || 0) + 1
    // Erro de validação da Meta (código 9004/36003 etc.) ou estourou tentativas → para.
    // Erro passageiro (rede/limite) → tenta de novo na próxima rodada.
    const transient = (e as any).http >= 500 || (e as any).code === 4 || (e as any).code === 2 || (e as any).code === 17
    const giveUp = !transient || attempts >= MAX_ATTEMPTS
    // container com erro não serve mais: recomeça do zero se tentar de novo
    await save({ status: giveUp ? 'erro' : post.status === 'agendado' ? 'agendado' : 'publicando', error: msg, attempts, containers: giveUp ? null : c })
    return giveUp ? 'erro' : 'publicando'
  }
}

// ── IA (legenda e carrossel a partir do blog) ─────────────────────────
async function callOpenAI(system: string, user: string) {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada.')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0.8,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(`Erro na OpenAI: ${res.status}`)
  const data = await res.json()
  return JSON.parse(data.choices?.[0]?.message?.content || '{}')
}

const BRAND = `Você é social media da CoisaPet (@coisapet), marca brasileira que fabrica à mão terrários, tocas, gaiolas e acessórios em madeira/acrílico para pets pequenos (hamsters, gerbils, porquinhos-da-índia, coelhos, roedores em geral). Tom: carinhoso, leve, informativo, com responsabilidade sobre bem-estar animal (nunca recomende algo que prejudique o pet). Português do Brasil, frases curtas, emojis com moderação. Nunca invente preço, promoção, prazo ou produto específico que não foi informado.`

function stripHtml(html: string) {
  return String(html || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

// ── Handler ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  let body: any = {}
  try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }
  const sb = db()

  try {
    // ── cron (sem sessão; prova com o segredo) ──────────────────────────
    if (body.action === 'cron') {
      const s = await getSecret(sb, 'cron_secret')
      if (!s || typeof body.secret !== 'string' || body.secret !== s.value) return json({ error: 'Não autorizado' }, 401)
      let token = await getToken(sb)
      if (!token) return json({ ok: true, skipped: 'sem conta conectada' })
      token = await refreshTokenIfNeeded(sb, token)
      const igId = await accountId(sb)
      const out: Record<string, unknown> = {}
      if (igId) {
        const { data: due } = await sb.from('ig_posts').select('*')
          .in('status', ['agendado', 'publicando']).lte('scheduled_at', new Date().toISOString())
          .order('scheduled_at').limit(10)
        const res: string[] = []
        for (const p of due || []) res.push(await advancePost(sb, token, igId, p, 25_000))
        out.published = res
      }
      const { data: acc } = await sb.from('ig_account').select('last_sync_at, stories_sync_at').eq('id', 1).maybeSingle()
      if (!igId || !acc?.last_sync_at || Date.now() - new Date(acc.last_sync_at).getTime() > SYNC_EVERY_MIN * 60e3) {
        try { out.sync = await runSync(sb, token) }
        catch (e) { await sb.from('ig_account').upsert({ id: 1, last_sync_error: (e as Error).message, last_sync_at: new Date().toISOString() }); out.sync_error = (e as Error).message }
      } else if (igId && (!acc?.stories_sync_at || Date.now() - new Date(acc.stories_sync_at).getTime() > 14 * 60e3)) {
        // stories: métricas só existem enquanto o story está no ar
        try { out.stories = await syncStories(sb, token, igId) } catch (e) { out.stories_error = (e as Error).message }
      }
      return json({ ok: true, ...out })
    }

    const user = await sessionUser(sb, body.p_token)
    const needToken = async () => {
      const t = await getToken(sb)
      if (!t) throw new HttpError(409, 'Instagram ainda não conectado — a Diretoria precisa conectar a conta primeiro.')
      return t
    }
    const needIgId = async () => {
      const id = await accountId(sb)
      if (!id) throw new HttpError(409, 'Rode "Atualizar" uma vez depois de conectar a conta.')
      return id
    }

    switch (body.action) {
      // ── Conta ───────────────────────────────────────────────────────
      case 'connect': {
        if (user.role !== 'admin') throw new HttpError(403, 'Só a Diretoria conecta a conta.')
        const t = String(body.access_token || '').trim()
        if (t.length < 50) throw new HttpError(400, 'Token inválido — copie o token inteiro gerado no painel da Meta.')
        let me
        try { me = await ig(t, 'me', { fields: ME_FIELDS }) } catch (e) { throw new HttpError(400, `A Meta não aceitou o token: ${(e as Error).message}`) }
        await setSecret(sb, 'access_token', t)
        await setSecret(sb, 'refreshed_at', new Date(0).toISOString())   // força renovar já (vira token de 60 dias)
        await sb.from('ig_account').upsert({ id: 1, ig_user_id: String(me.user_id || me.id), username: me.username, connected_at: new Date().toISOString(), connected_by: user.name })
        const fresh = await refreshTokenIfNeeded(sb, t)
        let sync: unknown = null
        try { sync = await runSync(sb, fresh) } catch (e) { sync = { error: (e as Error).message } }
        return json({ ok: true, username: me.username, account_type: me.account_type, sync })
      }
      case 'disconnect': {
        if (user.role !== 'admin') throw new HttpError(403, 'Só a Diretoria desconecta a conta.')
        await sb.from('ig_secrets').delete().in('key', ['access_token', 'refreshed_at'])
        await sb.from('ig_account').update({ token_expires_at: null, connected_at: null }).eq('id', 1)
        return json({ ok: true })
      }
      case 'sync': {
        const t = await refreshTokenIfNeeded(sb, await needToken())
        try { return json({ ok: true, ...(await runSync(sb, t)) }) }
        catch (e) {
          await sb.from('ig_account').upsert({ id: 1, last_sync_error: (e as Error).message })
          throw new HttpError(502, `Instagram respondeu: ${(e as Error).message}`)
        }
      }

      // ── Posts do sistema ────────────────────────────────────────────
      case 'save_post': {
        const p = body.post || {}
        const kind = ['IMAGE', 'CAROUSEL', 'REELS', 'STORIES'].includes(p.kind) ? p.kind : 'IMAGE'
        const media: Item[] = (Array.isArray(p.media) ? p.media : []).filter((m: any) => typeof m?.url === 'string' && /^https:\/\//.test(m.url))
          .map((m: any) => ({ url: m.url, path: m.path || null, type: m.type === 'VIDEO' ? 'VIDEO' : 'IMAGE' }))
        const caption = String(p.caption || '')
        if (caption.length > 2200) throw new HttpError(400, 'Legenda passou de 2.200 caracteres (limite do Instagram).')
        if ((caption.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) throw new HttpError(400, 'Máximo de 30 hashtags por post.')
        const status = p.status === 'agendado' ? 'agendado' : 'rascunho'
        if (status === 'agendado') {
          if (!p.scheduled_at || isNaN(Date.parse(p.scheduled_at))) throw new HttpError(400, 'Escolha data e hora pra agendar.')
          if (!media.length) throw new HttpError(400, 'Adicione a foto/vídeo antes de agendar.')
          if (kind === 'CAROUSEL' && (media.length < 2 || media.length > 10)) throw new HttpError(400, 'Carrossel: de 2 a 10 mídias.')
          if (kind === 'REELS' && media[0].type !== 'VIDEO') throw new HttpError(400, 'Reels precisa de vídeo.')
          if (kind === 'IMAGE' && media[0].type !== 'IMAGE') throw new HttpError(400, 'Para vídeo, use Reels.')
        }
        const row = {
          kind, caption, media, status, scheduled_at: p.scheduled_at || null,
          cover_url: p.cover_url || null, share_to_feed: p.share_to_feed !== false,
          blog_post_id: p.blog_post_id || null, notes: p.notes || null,
          updated_by_name: user.name, updated_at: new Date().toISOString(),
          error: null, attempts: 0, containers: null,
        }
        if (p.id) {
          const { data: cur } = await sb.from('ig_posts').select('status').eq('id', p.id).maybeSingle()
          if (!cur) throw new HttpError(404, 'Post não encontrado')
          if (cur.status === 'publicado' || cur.status === 'publicando') throw new HttpError(409, 'Esse post já foi (ou está sendo) publicado.')
          const { data, error } = await sb.from('ig_posts').update(row).eq('id', p.id).select().single()
          if (error) throw error
          return json({ ok: true, post: data })
        }
        const { data, error } = await sb.from('ig_posts').insert({ ...row, created_by: user.id, created_by_name: user.name }).select().single()
        if (error) throw error
        return json({ ok: true, post: data })
      }
      case 'delete_post': {
        const { data: cur } = await sb.from('ig_posts').select('status, media').eq('id', body.id).maybeSingle()
        if (!cur) return json({ ok: true })
        if (cur.status === 'publicando') throw new HttpError(409, 'Está publicando agora — espere terminar.')
        await sb.from('ig_posts').delete().eq('id', body.id)
        // apaga os arquivos do bucket (o post publicado no Instagram continua lá)
        const paths = (cur.media || []).map((m: any) => m.path).filter(Boolean)
        if (paths.length && cur.status !== 'publicado') await sb.storage.from('instagram-media').remove(paths)
        return json({ ok: true })
      }
      case 'publish_now': {
        const t = await needToken(); const igId = await needIgId()
        const { data: post } = await sb.from('ig_posts').select('*').eq('id', body.id).maybeSingle()
        if (!post) throw new HttpError(404, 'Post não encontrado')
        if (post.status === 'publicado') return json({ ok: true, status: 'publicado', permalink: post.permalink })
        await sb.from('ig_posts').update({ status: 'publicando', scheduled_at: new Date().toISOString(), error: null, updated_by_name: user.name }).eq('id', post.id)
        const st = await advancePost(sb, t, igId, { ...post, status: 'publicando' }, 45_000)
        const { data: after } = await sb.from('ig_posts').select('status, permalink, error').eq('id', post.id).single()
        return json({ ok: st !== 'erro', ...after })
      }

      // ── Comentários ─────────────────────────────────────────────────
      case 'reply_comment': {
        const t = await needToken(); metaId(body.comment_id)
        const msg = String(body.message || '').trim()
        if (!msg) throw new HttpError(400, 'Escreva a resposta.')
        const r = await ig(t, `${body.comment_id}/replies`, { message: msg }, 'POST')
        const { data: acc } = await sb.from('ig_account').select('username').eq('id', 1).single()
        const { data: parent } = await sb.from('ig_comments').select('media_id').eq('id', body.comment_id).maybeSingle()
        await sb.from('ig_comments').update({ answered: true, handled_by: user.name }).eq('id', body.comment_id)
        if (parent) await sb.from('ig_comments').upsert({ id: r.id, media_id: parent.media_id, parent_id: body.comment_id, username: acc?.username, text: msg, commented_at: new Date().toISOString(), from_self: true, handled_by: user.name })
        return json({ ok: true, id: r.id })
      }
      case 'hide_comment': {
        const t = await needToken()
        await ig(t, metaId(body.comment_id), { hide: !!body.hide }, 'POST')
        await sb.from('ig_comments').update({ hidden: !!body.hide, handled_by: user.name }).eq('id', body.comment_id)
        return json({ ok: true })
      }
      case 'delete_comment': {
        const t = await needToken(); const cid = metaId(body.comment_id)
        await ig(t, cid, {}, 'DELETE')
        await sb.from('ig_comments').delete().or(`id.eq.${cid},parent_id.eq.${cid}`)
        return json({ ok: true })
      }
      case 'mark_comment': {
        metaId(body.comment_id)
        await sb.from('ig_comments').update({ done: !!body.done, handled_by: user.name }).eq('id', body.comment_id)
        return json({ ok: true })
      }

      // ── Directs (ao vivo, não ficam no banco) ───────────────────────
      case 'inbox': {
        const t = await needToken(); const igId = await needIgId()
        const r = await ig(t, `${igId}/conversations`, { platform: 'instagram', fields: 'id,updated_time,participants,messages.limit(1){id,message,from,created_time}', limit: 30 })
        return json({ ok: true, self_id: igId, conversations: r.data || [] })
      }
      case 'thread': {
        const t = await needToken(); const igId = await needIgId()
        const r = await ig(t, metaId(body.conversation_id), { fields: 'id,participants,messages.limit(40){id,message,from,to,created_time,attachments,story,shares}' })
        return json({ ok: true, self_id: igId, thread: r })
      }
      case 'send_dm': {
        const t = await needToken(); const igId = await needIgId()
        const text = String(body.text || '').trim()
        if (!text || !body.recipient_id) throw new HttpError(400, 'Mensagem vazia.')
        if (text.length > 1000) throw new HttpError(400, 'Mensagem muito longa (máx. 1.000 caracteres).')
        const r = await fetch(`${GRAPH}/${igId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ recipient: { id: metaId(body.recipient_id) }, message: { text } }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || d.error) {
          const m = d?.error?.message || `HTTP ${r.status}`
          throw new HttpError(400, /window|outside|24/i.test(m) ? 'Fora da janela de resposta do Instagram (a pessoa precisa ter mandado mensagem nas últimas 24h).' : m)
        }
        return json({ ok: true, id: d.message_id })
      }

      // ── IA ──────────────────────────────────────────────────────────
      case 'ai_caption': {
        const brief = String(body.brief || '').slice(0, 2000)
        if (!brief.trim()) throw new HttpError(400, 'Descreva o post pra IA.')
        const kind = body.kind || 'IMAGE'
        const out = await callOpenAI(BRAND, `Crie 3 opções de legenda para um post do Instagram (${kind === 'REELS' ? 'Reels' : kind === 'CAROUSEL' ? 'carrossel' : kind === 'STORIES' ? 'story (texto curtinho)' : 'foto no feed'}).
Sobre o post: ${brief}
Tom desejado: ${body.tone || 'carinhoso e informativo'}.
Cada legenda: gancho forte na 1ª linha, corpo curto, uma chamada pra ação (salvar, comentar, mandar pra um amigo ou link na bio), e no final de 5 a 12 hashtags relevantes em português (misture amplas e de nicho, sempre inclua #coisapet).
Responda em JSON: {"options":[{"title":"rótulo curtinho do estilo","caption":"legenda completa com hashtags"}]}`)
        return json({ ok: true, options: (out.options || []).slice(0, 3) })
      }
      case 'blog_carousel': {
        const { data: post } = await sb.from('blog_posts').select('id, title, slug, excerpt, content_html, cover_image_url').eq('id', body.blog_post_id).maybeSingle()
        if (!post) throw new HttpError(404, 'Post do blog não encontrado')
        const text = stripHtml(post.content_html).slice(0, 9000)
        const n = Math.min(Math.max(Number(body.slides) || 6, 4), 9)
        const out = await callOpenAI(BRAND, `Transforme este artigo do blog num carrossel educativo do Instagram com ${n} slides.
Título: ${post.title}
Resumo: ${post.excerpt || ''}
Texto: ${text}

Regras: slide 1 = capa com título chamativo (máx. 50 caracteres) e subtítulo curto; slides do meio = 1 ideia cada, título curto (máx. 40 caracteres) + texto de até 180 caracteres, prático; último slide = fechamento com chamada pra ler o artigo completo no blog (link na bio) e salvar o post.
Depois escreva a legenda do post (gancho, resumo, CTA "artigo completo no link da bio", 6 a 12 hashtags com #coisapet).
Responda em JSON: {"slides":[{"title":"...","body":"..."}],"caption":"..."}`)
        return json({ ok: true, blog: { id: post.id, title: post.title, slug: post.slug, cover: post.cover_image_url }, slides: (out.slides || []).slice(0, n), caption: out.caption || '' })
      }

      default:
        return json({ error: 'Ação desconhecida' }, 400)
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    console.error('[instagram-api] erro:', (err as Error)?.message || err)
    return json({ error: (err as Error)?.message || 'Erro no servidor' }, 500)
  }
})
