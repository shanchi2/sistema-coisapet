// MinhaCoisaPet — API do jogo. Pública (deploy --no-verify-jwt): quem chama é
// o jogo, sem chave do Supabase. Só esta função mexe nas tabelas game_*
// (service role); a chave pública não tem acesso a elas (fase110/fase120).
// O jogo NÃO usa o Supabase Auth.
//
// 0.4 (17/10): login por código no e-mail + save na nuvem.
// 0.5 (21/10): login OBRIGATÓRIO com cadastro (nome, WhatsApp, autorização de
// novidades) e tudo que dá propósito ao jogo. As regras que valem ponto (XP,
// ofensiva, missões, pergunta do dia, recordes, ligas, metas com prêmio) ficam
// AQUI no servidor — o celular só pede; quem decide quanto vale é o servidor.
//
// Ações (POST JSON { action, ... }):
//   request_code { email, age_ok } · verify_code { email, code } → { token, save, me }
//   profile { token, tutor_name, whatsapp, marketing_ok, terms }  (cadastro / editar)
//   load { token } → { email, save, me } · save { token, pet, pub } · me { token }
//   checkin · claim_mission { id } · quiz_today · quiz_answer { choice }
//   run_start → { run_id } · run_submit { run_id, score, ms, seeds }
//   ranking · friends · friend_add { code } · visit { code }
//   contest · contest_enter · contest_vote { entry_id } · redeem { code }
//   logout · delete_account
// `now` = hora do servidor: o jogo usa pra não depender do relógio do aparelho.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg) } }
const fail = (status: number, msg: string): never => { throw new HttpError(status, msg) }

const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const RESEND_KEY = Deno.env.get('RESEND_KEY')
const RUN_SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // só pra assinar o "início da corrida"
const FROM = 'MinhaCoisaPet <noreply@coisapet.com.br>'
const CODE_TTL_MIN = 15
const MAX_ATTEMPTS = 5
const SESSION_DAYS = 180
const MAX_SAVE_BYTES = 60_000

// ── Regras do jogo ──────────────────────────────────────────────────
// Nível: total de XP pra chegar no nível L = 50·L·(L−1) → 2:100 · 3:300 · 5:1000 · 10:4500
const levelOf = (xp: number) => { let l = 1; while (50 * (l + 1) * l <= xp) l++; return l }
const levelInfo = (xp: number) => {
  const level = levelOf(xp), from = 50 * level * (level - 1), to = 50 * (level + 1) * level
  return { level, xp, from, to }
}
// Ligas: pela XP da SEMANA PASSADA (seg–dom, horário de Brasília)
const LEAGUES = [
  { key: 'bronze', label: 'Bronze', icon: '🥉', min: 0 },
  { key: 'prata', label: 'Prata', icon: '🥈', min: 150 },
  { key: 'ouro', label: 'Ouro', icon: '🥇', min: 350 },
  { key: 'diamante', label: 'Diamante', icon: '💎', min: 600 },
]
const leagueOf = (lastWeekXp: number) => [...LEAGUES].reverse().find(l => lastWeekXp >= l.min)!

// Missões do dia: iguais pra todo mundo, sorteadas pela data
const MISSIONS: Record<string, { label: string, icon: string, target: number, server?: boolean }> = {
  feed2:  { label: 'Dê ração 2 vezes', icon: '🌾', target: 2 },
  water1: { label: 'Troque a água', icon: '💧', target: 1 },
  clean1: { label: 'Limpe o terrário', icon: '🧹', target: 1 },
  pet5:   { label: 'Faça 5 carinhos', icon: '🤚', target: 5 },
  treat1: { label: 'Dê um petisco', icon: '🌻', target: 1 },
  run300: { label: 'Faça 300 pontos na Corrida', icon: '🏃', target: 300, server: true },
  run3:   { label: 'Jogue 3 Corridas', icon: '🏁', target: 3, server: true },
  quiz:   { label: 'Responda a pergunta do dia', icon: '❓', target: 1, server: true },
  games2: { label: 'Jogue 2 minijogos diferentes', icon: '🕹️', target: 2, server: true },
  sementes200: { label: 'Faça 200 pontos na Chuva de Sementes', icon: '🌻', target: 200, server: true },
}
const CARE = ['feed2', 'water1', 'clean1', 'pet5', 'treat1']
const PLAY = ['run300', 'run3', 'quiz', 'games2', 'sementes200']
const MISSION_XP = 20, MISSION_ALL_XP = 20

// Conquistas (+25 XP cada, viram figurinha no álbum)
const ACH_XP = 25
const ACHIEVEMENTS: Record<string, (c: any) => boolean> = {
  primeiros_passos: () => true,
  ofensiva_3:  c => c.p.best_streak >= 3,
  ofensiva_7:  c => c.p.best_streak >= 7,
  ofensiva_30: c => c.p.best_streak >= 30,
  nivel_5:     c => levelOf(c.p.xp) >= 5,
  nivel_10:    c => levelOf(c.p.xp) >= 10,
  corredor_500:  c => c.bestRun >= 500,
  corredor_1500: c => c.bestRun >= 1500,
  explorador:  c => Object.keys(GAMES).every(g => c.bests[g] > 0),
  sementeiro:  c => (c.bests.sementes || 0) >= 400,
  labirinteiro: c => (c.bests.labirinto || 0) >= 600,
  maratonista: c => (c.bests.rodinha || 0) >= 250,
  memoria_boa: c => (c.bests.memoria || 0) >= 1500,
  estrategista: c => (c.bests.velha || 0) >= 900,
  mestre_mahjong: c => (c.bests.mahjong || 0) >= 800,
  sabichao_10: c => c.p.quiz_right >= 10,
  lar_doce_lar: c => c.p.pet_public?.habitat === 'terrario',
  colecionador: c => (c.p.pet_public?.owned?.length || 0) >= 8,
  amigo:       c => c.friends >= 1,
  visitante:   c => c.visits >= 1,
  concurso:    c => c.contest >= 1,
}
// Metas com prêmio (a Diretoria liga e define o prêmio no sistema)
const GOALS: Record<string, (c: any) => boolean> = {
  ofensiva_7:  c => c.p.best_streak >= 7,
  ofensiva_30: c => c.p.best_streak >= 30,
  nivel_10:    c => levelOf(c.p.xp) >= 10,
  sabichao_20: c => c.p.quiz_right >= 20,
  liga_diamante: c => c.lastWeekXp >= LEAGUES[3].min,
}
const RUN_XP_DAY = 60 // teto de XP por dia vindo dos minijogos (somando todos)
// Minijogos (0.6): limites anti-trapaça — pontos por segundo + base, teto
// absoluto e duração mínima/máxima. Pontuação fora disso é recusada.
const GAMES: Record<string, { rate: number, base: number, max?: number, minMs?: number, maxMs?: number }> = {
  corrida:   { rate: 40, base: 60 },
  sementes:  { rate: 45, base: 60 },
  labirinto: { rate: 60, base: 200 },
  rodinha:   { rate: 15, base: 30, maxMs: 45000 },
  memoria:   { rate: 200, base: 0, max: 4000, minMs: 6000 },  // 5 níveis
  velha:     { rate: 150, base: 0, max: 1500, minMs: 5000 },  // 5 rodadas × até 300
  mahjong:   { rate: 30, base: 300, max: 1500, minMs: 8000 },  // 1 fase: 15/par + bônus de tempo (máx. 300)
}

// ── Utilitários ─────────────────────────────────────────────────────
async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
async function hmac(text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(RUN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return 'mcp_' + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const randomCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const randomChars = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => CHARS[b % CHARS.length]).join('')
const normEmail = (e: unknown) => String(e || '').trim().toLowerCase()
const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString()
// WhatsApp do Brasil: DDD + 8/9 dígitos → guarda "55" + DDD + número
function normWhats(raw: unknown) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return null
  if (+d.slice(0, 2) < 11) return null
  if (d.length === 11 && d[2] !== '9') return null
  return '55' + d
}
const firstName = (s: string | null) => (s || '').trim().split(/\s+/)[0]?.slice(0, 16) || 'Tutor'
// Dia e semana no horário de Brasília
const spDay = (t = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(t))
const addDays = (day: string, n: number) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const weekStart = (day: string) => { const d = new Date(day + 'T12:00:00Z'); return addDays(day, -((d.getUTCDay() + 6) % 7)) }
const dayNum = (day: string) => Math.floor(new Date(day + 'T12:00:00Z').getTime() / 86400e3)
function hash(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function missionsOn(day: string) {
  const h = hash('missoes:' + day)
  const a = CARE[h % CARE.length]
  const rest = CARE.filter(k => k !== a)
  const b = rest[(h >>> 8) % rest.length]
  const c = PLAY[(h >>> 16) % PLAY.length]
  return [a, b, c]
}

function emailHtml(code: string) {
  return `<!doctype html><html><body style="margin:0;background:#2b1d14;font-family:Arial,sans-serif">
  <div style="max-width:420px;margin:0 auto;padding:28px 20px">
    <div style="background:#fbeedd;border:3px solid #3b2314;border-radius:10px;padding:24px;text-align:center;color:#3b2314">
      <p style="margin:0;font-size:20px;font-weight:bold;color:#c0392b">MinhaCoisaPet 🐹</p>
      <p style="margin:14px 0 6px;font-size:15px">Seu código pra entrar no jogo:</p>
      <p style="margin:0;font-size:38px;letter-spacing:8px;font-weight:bold">${code}</p>
      <p style="margin:14px 0 0;font-size:13px;color:#6b4a32">Vale por ${CODE_TTL_MIN} minutos. Se não foi você que pediu, é só ignorar este e-mail.</p>
    </div>
    <p style="text-align:center;color:#d9bfa0;font-size:11px;margin-top:14px">CoisaPet · coisapet.com.br</p>
  </div></body></html>`
}

async function sessionFrom(sb: any, token: unknown) {
  if (typeof token !== 'string' || !token.startsWith('mcp_')) return null
  const { data } = await sb.from('game_sessions').select('id, player_id, last_used_at, created_at')
    .eq('token_hash', await sha256Hex(token)).is('revoked_at', null).maybeSingle()
  if (!data) return null
  if (Date.now() - new Date(data.last_used_at).getTime() > SESSION_DAYS * 86400e3) return null
  if (Date.now() - new Date(data.last_used_at).getTime() > 600e3) {
    const now = new Date().toISOString()
    await sb.from('game_sessions').update({ last_used_at: now }).eq('id', data.id)
    await sb.from('game_players').update({ last_seen_at: now }).eq('id', data.player_id)
  }
  return data
}
async function mustSession(sb: any, token: unknown) {
  const s = await sessionFrom(sb, token)
  if (!s) fail(401, 'Sessão expirada')
  return s!
}
async function getPlayer(sb: any, id: string) {
  const { data, error } = await sb.from('game_players').select('*').eq('id', id).single()
  if (error) throw error
  return data
}
// Jogador com cadastro completo (WhatsApp) — sem isso não joga
async function mustPlayer(sb: any, token: unknown) {
  const s = await mustSession(sb, token)
  const p = await getPlayer(sb, s.player_id)
  if (!p.whatsapp) fail(403, 'Complete seu cadastro pra jogar')
  return p
}

async function loadSave(sb: any, playerId: string) {
  const { data } = await sb.from('game_saves').select('pet, updated_at').eq('player_id', playerId).maybeSingle()
  return data ? { pet: data.pet, updated_at: data.updated_at } : null
}

// Dá XP (idempotente por dia/fonte/ref). Devolve quanto realmente entrou.
async function giveXp(sb: any, p: any, source: string, ref: string, xp: number, day = spDay()) {
  if (xp <= 0) return 0
  const { error } = await sb.from('game_xp').insert({ player_id: p.id, day, source, ref, xp })
  if (error) { if (error.code === '23505') return 0; throw error }
  const { data: total } = await sb.rpc('game_xp_sync', { p_id: p.id })
  p.xp = typeof total === 'number' ? total : p.xp + xp
  return xp
}

async function friendCodeFor(sb: any, p: any) {
  if (p.friend_code) return p.friend_code
  for (let i = 0; i < 5; i++) {
    const code = randomChars(6)
    const { error } = await sb.from('game_players').update({ friend_code: code }).eq('id', p.id).is('friend_code', null)
    if (!error) { p.friend_code = code; return code }
  }
  return null
}

// Confere conquistas e metas com prêmio; devolve as novas pra mostrar no jogo
async function checkAwards(sb: any, p: any) {
  const today = spDay(), ws = weekStart(today)
  const [{ data: bestRows }, { count: friends }, { count: visits }, { count: contest }, { data: board }] = await Promise.all([
    sb.rpc('game_player_bests', { p_id: p.id, p_day: today }),
    sb.from('game_friends').select('friend_id', { count: 'exact', head: true }).eq('player_id', p.id),
    sb.from('game_visits').select('host_id', { count: 'exact', head: true }).eq('visitor_id', p.id),
    sb.from('game_contest_entries').select('id', { count: 'exact', head: true }).eq('player_id', p.id),
    sb.rpc('game_week_board', { p_start: ws }),
  ])
  const mine = (board || []).find((r: any) => r.player_id === p.id)
  const bests: Record<string, number> = {}, todayBy: Record<string, { best: number, count: number }> = {}
  for (const r of bestRows || []) { bests[r.game] = r.best; todayBy[r.game] = { best: r.today_best, count: r.today_count } }
  const ctx = { p, bests, todayBy, bestRun: bests.corrida || 0, friends: friends || 0, visits: visits || 0, contest: contest || 0, lastWeekXp: mine?.xp_last || 0 }
  const fresh: string[] = []
  const ach = { ...(p.achievements || {}) }
  for (const [k, test] of Object.entries(ACHIEVEMENTS)) {
    if (ach[k] || !test(ctx)) continue
    ach[k] = today; fresh.push(k)
  }
  if (fresh.length) {
    p.achievements = ach
    await sb.from('game_players').update({ achievements: ach }).eq('id', p.id)
    for (const k of fresh) await giveXp(sb, p, 'achievement', k, ACH_XP)
  }
  // metas: só as ligadas pela Diretoria
  const newRewards: any[] = []
  const { data: goals } = await sb.from('game_reward_goals').select('*').eq('active', true)
  if (goals?.length) {
    const { data: got } = await sb.from('game_rewards').select('goal_key').eq('player_id', p.id)
    const have = new Set((got || []).map((r: any) => r.goal_key))
    for (const g of goals) {
      if (have.has(g.key) || !GOALS[g.key]?.(ctx)) continue
      const code = `PET-${randomChars(4)}-${randomChars(4)}`
      const { error } = await sb.from('game_rewards').insert({ player_id: p.id, goal_key: g.key, code, reward: g.reward })
      if (!error) newRewards.push({ key: g.key, label: g.label, reward: g.reward, code })
    }
  }
  return { achievements: fresh, rewards: newRewards, ctx }
}

// Tudo que a tela de progresso precisa
async function meOf(sb: any, p: any, awards?: any) {
  const today = spDay(), ws = weekStart(today)
  const aw = awards || await checkAwards(sb, p)
  const [{ data: xpToday }, { data: quiz }, { data: goals }, { data: rewards }] = await Promise.all([
    sb.from('game_xp').select('source, ref, xp').eq('player_id', p.id).eq('day', today),
    sb.from('game_quiz_answers').select('correct').eq('player_id', p.id).eq('day', today).maybeSingle(),
    sb.from('game_reward_goals').select('key, label, descr, reward').eq('active', true).order('sort'),
    sb.from('game_rewards').select('goal_key, code, reward, created_at, used_at').eq('player_id', p.id),
  ])
  const claimed = (xpToday || []).filter((x: any) => x.source === 'mission').map((x: any) => x.ref)
  const tb = aw.ctx.todayBy
  const runBest = tb.corrida?.best || 0
  const serverProgress: Record<string, number> = {
    run300: runBest, run3: tb.corrida?.count || 0, quiz: quiz ? 1 : 0,
    games2: Object.values(tb).filter((x: any) => x.count > 0).length, sementes200: tb.sementes?.best || 0,
  }
  const missions = missionsOn(today).map(id => ({
    id, ...MISSIONS[id], claimed: claimed.includes(id),
    progress: MISSIONS[id].server ? serverProgress[id] : null,
  }))
  const lastWeekXp = aw.ctx.lastWeekXp
  const league = leagueOf(lastWeekXp)
  const live = p.last_day === today || p.last_day === addDays(today, -1)
  return {
    today, week_start: ws,
    profile: { tutor_name: p.tutor_name, whatsapp: p.whatsapp, marketing_ok: p.marketing_ok, friend_code: await friendCodeFor(sb, p), email: p.email },
    ...levelInfo(p.xp),
    streak: live ? p.streak : 0, best_streak: p.best_streak, cared_today: p.last_day === today,
    achievements: p.achievements || {},
    quiz: { answered: !!quiz, correct: quiz?.correct ?? null, right: p.quiz_right, total: p.quiz_total },
    missions, all_bonus: claimed.includes('all'),
    runs_today: tb.corrida?.count || 0, run_best_today: runBest, run_best: aw.ctx.bestRun,
    bests: aw.ctx.bests, today_games: tb,
    run_xp_today: (xpToday || []).filter((x: any) => x.source === 'run').reduce((s: number, x: any) => s + x.xp, 0), run_xp_cap: RUN_XP_DAY,
    xp_today: (xpToday || []).reduce((s: number, x: any) => s + x.xp, 0),
    league: { ...league, last_week_xp: lastWeekXp, next: LEAGUES[LEAGUES.indexOf(league) + 1] || null },
    goals: (goals || []).map((g: any) => ({ ...g, earned: (rewards || []).find((r: any) => r.goal_key === g.key) || null })),
    rewards: rewards || [],
    new_achievements: aw.achievements, new_rewards: aw.rewards,
  }
}

// Vitrine pública do pet (o que os outros veem): sem nada pessoal
const PLACEABLE = ['terrario', 'substrato', 'roda', 'toca', 'bebedouro', 'banheira', 'pedra', 'plaquinha']
const STATUS = ['feliz', 'ok', 'triste', 'doente', 'dormindo']
function publicPet(pet: any, pub: any) {
  const owned = PLACEABLE.filter(k => pet.owned?.[k])
  const placed = owned.filter(k => pet.placed?.[k])
  return {
    name: String(pet.name).slice(0, 16), species: ['sirio', 'anao', 'panda'].includes(pet.species) ? pet.species : 'sirio',
    habitat: placed.includes('terrario') ? 'terrario' : 'gaiola', placed, owned,
    born: Number(pet.born) || null,
    status: STATUS.includes(pub?.status) ? pub.status : 'ok',
    comfort: Math.max(0, Math.min(100, Math.round(Number(pub?.comfort) || 0))),
  }
}
function publicCard(p: any) {
  return {
    code: p.friend_code, tutor: firstName(p.tutor_name), pet: p.pet_public || { name: p.pet_name, species: p.pet_species },
    level: levelOf(p.xp), streak: p.streak, best_streak: p.best_streak,
    achievements: Object.keys(p.achievements || {}),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  let body: any = {}
  try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }
  const sb = db()
  const now = () => Date.now()
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null

  try {
    switch (body.action) {
      case 'request_code': {
        const email = normEmail(body.email)
        if (!validEmail(email)) return json({ error: 'E-mail inválido' }, 400)
        if (!body.age_ok) return json({ error: 'Confirme a idade (ou que um responsável está junto)' }, 400)
        const { data: recent } = await sb.from('game_login_codes').select('created_at').eq('email', email).gte('created_at', isoAgo(3600e3)).order('created_at', { ascending: false })
        if (recent?.length && now() - new Date(recent[0].created_at).getTime() < 60e3) return json({ error: 'Espere um minutinho pra pedir outro código' }, 429)
        if ((recent?.length || 0) >= 6) return json({ error: 'Muitos códigos pedidos — tente de novo daqui a pouco' }, 429)
        if (ip) {
          const { count } = await sb.from('game_login_codes').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', isoAgo(3600e3))
          if ((count || 0) >= 20) return json({ error: 'Muitas tentativas — tente de novo daqui a pouco' }, 429)
        }
        if (!RESEND_KEY) return json({ error: 'Envio de e-mail não configurado' }, 500)
        const code = randomCode()
        await sb.from('game_login_codes').insert({
          email, code_hash: await sha256Hex(`${email}:${code}`), ip,
          expires_at: new Date(now() + CODE_TTL_MIN * 60e3).toISOString(),
        })
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: [email], subject: `${code} é o seu código do MinhaCoisaPet`, html: emailHtml(code), text: `Seu código do MinhaCoisaPet: ${code} (vale ${CODE_TTL_MIN} minutos).` }),
        })
        if (!r.ok) { console.error('[game-api] resend', r.status, await r.text()); return json({ error: 'Não consegui mandar o e-mail agora' }, 502) }
        await sb.from('game_players').update({ age_ok: true }).eq('email', email)
        return json({ ok: true })
      }

      case 'verify_code': {
        const email = normEmail(body.email)
        const code = String(body.code || '').replace(/\D/g, '')
        if (!validEmail(email) || code.length !== 6) return json({ error: 'Código inválido' }, 400)
        const { data: row } = await sb.from('game_login_codes').select('id, code_hash, attempts, expires_at')
          .eq('email', email).is('used_at', null).gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (!row) return json({ error: 'Código expirado — peça outro' }, 400)
        if (row.attempts >= MAX_ATTEMPTS) return json({ error: 'Muitas tentativas — peça outro código' }, 429)
        if (row.code_hash !== await sha256Hex(`${email}:${code}`)) {
          await sb.from('game_login_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id)
          return json({ error: 'Código errado', left: MAX_ATTEMPTS - row.attempts - 1 }, 400)
        }
        await sb.from('game_login_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id)
        let { data: player } = await sb.from('game_players').select('id').eq('email', email).maybeSingle()
        if (!player) {
          const ins = await sb.from('game_players').insert({ email, age_ok: true }).select('id').single()
          if (ins.error) throw ins.error
          player = ins.data
        }
        const token = randomToken()
        await sb.from('game_sessions').insert({ player_id: player.id, token_hash: await sha256Hex(token), user_agent: (req.headers.get('user-agent') || '').slice(0, 200) })
        await sb.from('game_players').update({ last_seen_at: new Date().toISOString() }).eq('id', player.id)
        const p = await getPlayer(sb, player.id)
        return json({ token, email, save: await loadSave(sb, player.id), needs_profile: !p.whatsapp, me: p.whatsapp ? await meOf(sb, p) : null, now: now() })
      }

      case 'profile': {
        const s = await mustSession(sb, body.token)
        const p = await getPlayer(sb, s.player_id)
        const name = String(body.tutor_name || '').trim().replace(/\s+/g, ' ').slice(0, 60)
        if (name.length < 2) return json({ error: 'Digite seu nome' }, 400)
        const whats = normWhats(body.whatsapp)
        if (!whats) return json({ error: 'WhatsApp inválido — use DDD + número, ex.: (11) 91234-5678' }, 400)
        if (!p.terms_at && !body.terms) return json({ error: 'Aceite os termos pra continuar' }, 400)
        const { data: other } = await sb.from('game_players').select('id').eq('whatsapp', whats).neq('id', p.id).maybeSingle()
        if (other) return json({ error: 'Esse WhatsApp já está em outra conta do jogo' }, 409)
        const mk = !!body.marketing_ok
        const upd: any = { tutor_name: name, whatsapp: whats, marketing_ok: mk }
        if (mk !== p.marketing_ok || !p.marketing_at) upd.marketing_at = new Date().toISOString()
        if (!p.terms_at) upd.terms_at = new Date().toISOString()
        const { error } = await sb.from('game_players').update(upd).eq('id', p.id)
        if (error) { if (error.code === '23505') return json({ error: 'Esse WhatsApp já está em outra conta do jogo' }, 409); throw error }
        return json({ ok: true, me: await meOf(sb, { ...p, ...upd }), now: now() })
      }

      case 'load': {
        const s = await mustSession(sb, body.token)
        const p = await getPlayer(sb, s.player_id)
        return json({ email: p.email, save: await loadSave(sb, s.player_id), needs_profile: !p.whatsapp, me: p.whatsapp ? await meOf(sb, p) : null, now: now() })
      }

      case 'me': {
        const p = await mustPlayer(sb, body.token)
        return json({ me: await meOf(sb, p), now: now() })
      }

      case 'save': {
        const s = await mustSession(sb, body.token)
        const pet = body.pet
        if (!pet || typeof pet !== 'object' || pet.v !== 1 || typeof pet.name !== 'string') return json({ error: 'Save inválido' }, 400)
        if (JSON.stringify(pet).length > MAX_SAVE_BYTES) return json({ error: 'Save grande demais' }, 413)
        const { error } = await sb.from('game_saves').upsert({ player_id: s.player_id, pet, updated_at: new Date().toISOString() })
        if (error) throw error
        const pub = publicPet(pet, body.pub)
        await sb.from('game_players').update({ pet_name: pub.name, pet_species: pub.species, pet_public: pub }).eq('id', s.player_id)
        return json({ ok: true, now: now() })
      }

      // Primeiro cuidado do dia → conta a ofensiva
      case 'checkin': {
        const p = await mustPlayer(sb, body.token)
        const today = spDay()
        let gained = 0
        if (p.last_day !== today) {
          const streak = p.last_day === addDays(today, -1) ? p.streak + 1 : 1
          const best = Math.max(p.best_streak, streak)
          await sb.from('game_players').update({ streak, best_streak: best, last_day: today }).eq('id', p.id)
          Object.assign(p, { streak, best_streak: best, last_day: today })
          gained = await giveXp(sb, p, 'checkin', '', 10 + Math.min(streak, 10) * 2)
        }
        return json({ gained, me: await meOf(sb, p), now: now() })
      }

      case 'claim_mission': {
        const p = await mustPlayer(sb, body.token)
        const today = spDay()
        const id = String(body.id || '')
        const list = missionsOn(today)
        if (!list.includes(id)) return json({ error: 'Essa missão não é de hoje' }, 400)
        const m = MISSIONS[id]
        if (m.server) {
          const me0 = await meOf(sb, p)
          const prog = me0.missions.find((x: any) => x.id === id)?.progress || 0
          if (prog < m.target) return json({ error: 'Ainda não deu — falta um pouquinho!' }, 400)
        }
        let gained = await giveXp(sb, p, 'mission', id, MISSION_XP)
        // completou as 3 → bônus
        const { data: done } = await sb.from('game_xp').select('ref').eq('player_id', p.id).eq('day', today).eq('source', 'mission')
        if (list.every(k => (done || []).some((d: any) => d.ref === k))) gained += await giveXp(sb, p, 'mission', 'all', MISSION_ALL_XP)
        return json({ gained, me: await meOf(sb, p), now: now() })
      }

      case 'quiz_today': {
        const p = await mustPlayer(sb, body.token)
        const today = spDay()
        const { data: qs } = await sb.from('game_quiz').select('id').eq('active', true).order('id')
        if (!qs?.length) return json({ quiz: null })
        const qid = qs[dayNum(today) % qs.length].id
        const { data: q } = await sb.from('game_quiz').select('id, question, options, answer, explain').eq('id', qid).single()
        const { data: ans } = await sb.from('game_quiz_answers').select('choice, correct').eq('player_id', p.id).eq('day', today).maybeSingle()
        return json({ quiz: { id: q.id, question: q.question, options: q.options, ...(ans ? { choice: ans.choice, correct: ans.correct, answer: q.answer, explain: q.explain } : {}) } })
      }

      case 'quiz_answer': {
        const p = await mustPlayer(sb, body.token)
        const today = spDay()
        const { data: qs } = await sb.from('game_quiz').select('id').eq('active', true).order('id')
        if (!qs?.length) return json({ error: 'Sem pergunta hoje' }, 400)
        const qid = qs[dayNum(today) % qs.length].id
        const { data: q } = await sb.from('game_quiz').select('answer, explain').eq('id', qid).single()
        const choice = Number(body.choice)
        const correct = choice === q.answer
        const { error } = await sb.from('game_quiz_answers').insert({ player_id: p.id, day: today, quiz_id: qid, choice, correct })
        if (error) { if (error.code === '23505') return json({ error: 'Você já respondeu a pergunta de hoje' }, 400); throw error }
        p.quiz_total += 1; if (correct) p.quiz_right += 1
        await sb.from('game_players').update({ quiz_total: p.quiz_total, quiz_right: p.quiz_right }).eq('id', p.id)
        const gained = await giveXp(sb, p, 'quiz', '', correct ? 15 : 5)
        return json({ correct, answer: q.answer, explain: q.explain, gained, me: await meOf(sb, p), now: now() })
      }

      // Minijogo: o servidor assina o início; no fim confere se o tempo e os pontos fazem sentido
      case 'run_start': {
        const p = await mustPlayer(sb, body.token)
        const game = GAMES[body.game] ? body.game : 'corrida'
        const payload = `${p.id}.${game}.${now()}`
        return json({ run_id: `${payload}.${await hmac(payload)}`, now: now() })
      }

      case 'run_submit': {
        const p = await mustPlayer(sb, body.token)
        const parts = String(body.run_id || '').split('.')
        // formato novo: id.jogo.início.assinatura (o antigo, sem jogo, é a Corrida)
        const [pid, game, t, sig] = parts.length === 4 ? parts : [parts[0], 'corrida', parts[1], parts[2]]
        const signed = parts.length === 4 ? `${pid}.${game}.${t}` : `${pid}.${t}`
        if (pid !== p.id || !t || !GAMES[game] || sig !== await hmac(signed)) return json({ error: 'Partida inválida' }, 400)
        const G = GAMES[game]
        const ms = Math.round(Number(body.ms) || 0), score = Math.round(Number(body.score) || 0)
        const elapsed = now() - Number(t)
        if (ms < (G.minMs || 1000) || ms > (G.maxMs || 20 * 60e3) || elapsed + 3000 < ms || elapsed > 30 * 60e3) return json({ error: 'Partida inválida' }, 400)
        if (score < 0 || score > ms / 1000 * G.rate + G.base || (G.max && score > G.max)) return json({ error: 'Pontuação inválida' }, 400)
        const today = spDay()
        const { data: prevBest } = await sb.from('game_scores').select('score').eq('player_id', p.id).eq('game', game).order('score', { ascending: false }).limit(1).maybeSingle()
        // a mesma partida não conta 2x (run_ref é único)
        const ins = await sb.from('game_scores').insert({ player_id: p.id, game, score, ms, day: today, run_ref: signed })
        if (ins.error) { if (ins.error.code === '23505') return json({ error: 'Partida já enviada' }, 400); throw ins.error }
        const { data: runXp } = await sb.from('game_xp').select('xp').eq('player_id', p.id).eq('day', today).eq('source', 'run')
        const used = (runXp || []).reduce((s: number, x: any) => s + x.xp, 0)
        const gained = await giveXp(sb, p, 'run', t, Math.min(Math.floor(score / 100) + 2, 15, RUN_XP_DAY - used))
        return json({ gained, record: score > (prevBest?.score || 0), me: await meOf(sb, p), now: now() })
      }

      case 'ranking': {
        const p = await mustPlayer(sb, body.token)
        const ws = weekStart(spDay())
        const { data: board } = await sb.rpc('game_week_board', { p_start: ws })
        const rows = board || []
        const ids = rows.map((r: any) => r.player_id)
        const { data: players } = ids.length ? await sb.from('game_players').select('id, friend_code, tutor_name, pet_name, pet_species, pet_public, xp, streak, best_streak, achievements').in('id', ids) : { data: [] }
        const byId = new Map((players || []).map((x: any) => [x.id, x]))
        const mine = rows.find((r: any) => r.player_id === p.id)
        const myLeague = leagueOf(mine?.xp_last || 0)
        const card = (r: any) => {
          const x: any = byId.get(r.player_id) || {}
          return { code: x.friend_code, tutor: firstName(x.tutor_name), pet: x.pet_name || '—', species: x.pet_species || 'sirio',
            level: levelOf(x.xp || 0), streak: x.streak || 0, xp_week: r.xp_week, best_run: r.best_run, me: r.player_id === p.id,
            league: leagueOf(r.xp_last).key }
        }
        const league = rows.filter((r: any) => leagueOf(r.xp_last).key === myLeague.key).sort((a: any, b: any) => b.xp_week - a.xp_week).map(card)
        // recordes da semana de um minijogo (padrão: Corrida)
        const game = GAMES[body.game] ? body.game : 'corrida'
        const { data: bestRows } = await sb.rpc('game_week_best', { p_start: ws, p_game: game })
        const rowById = new Map(rows.map((r: any) => [r.player_id, r]))
        const runs = (bestRows || []).map((b: any) => ({ ...card(rowById.get(b.player_id) || { player_id: b.player_id, xp_week: 0, xp_last: 0 }), best_run: b.best }))
        const general = [...rows].sort((a: any, b: any) => b.xp_week - a.xp_week).slice(0, 50).map(card)
        const end = new Date(addDays(ws, 7) + 'T03:00:00Z').getTime() // segunda 00h de Brasília
        return json({ week_start: ws, ends_at: end, league: myLeague, leagues: LEAGUES, board: league.slice(0, 50), runs, game, general, now: now() })
      }

      case 'friends': {
        const p = await mustPlayer(sb, body.token)
        const { data: fr } = await sb.from('game_friends').select('friend_id').eq('player_id', p.id)
        const ids = (fr || []).map((f: any) => f.friend_id)
        const { data: players } = ids.length ? await sb.from('game_players').select('id, friend_code, tutor_name, pet_name, pet_species, pet_public, xp, streak, best_streak, achievements').in('id', ids) : { data: [] }
        const { data: vis } = ids.length ? await sb.from('game_visits').select('host_id').eq('visitor_id', p.id).eq('day', spDay()) : { data: [] }
        const visited = new Set((vis || []).map((v: any) => v.host_id))
        return json({ my_code: await friendCodeFor(sb, p), friends: (players || []).map((x: any) => ({ ...publicCard(x), visited: visited.has(x.id) })) })
      }

      case 'friend_add': {
        const p = await mustPlayer(sb, body.token)
        const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
        const { data: f } = await sb.from('game_players').select('id, whatsapp').eq('friend_code', code).maybeSingle()
        if (!f || !f.whatsapp) return json({ error: 'Não achei ninguém com esse código' }, 404)
        if (f.id === p.id) return json({ error: 'Esse é o seu próprio código 😄' }, 400)
        const { count } = await sb.from('game_friends').select('friend_id', { count: 'exact', head: true }).eq('player_id', p.id)
        if ((count || 0) >= 100) return json({ error: 'Limite de 100 amigos' }, 400)
        await sb.from('game_friends').upsert([{ player_id: p.id, friend_id: f.id }, { player_id: f.id, friend_id: p.id }], { ignoreDuplicates: true })
        const aw = await checkAwards(sb, p)
        return json({ ok: true, me: await meOf(sb, p, aw), now: now() })
      }

      // Ver o pet de alguém (amigo ou do ranking). Carinho: 1x por dia por pet
      case 'visit': {
        const p = await mustPlayer(sb, body.token)
        const code = String(body.code || '').trim().toUpperCase()
        const { data: h } = await sb.from('game_players').select('id, friend_code, tutor_name, pet_name, pet_species, pet_public, xp, streak, best_streak, achievements, whatsapp').eq('friend_code', code).maybeSingle()
        if (!h || !h.whatsapp) return json({ error: 'Pet não encontrado' }, 404)
        let gained = 0, cheered = false
        if (body.cheer && h.id !== p.id) {
          const { error } = await sb.from('game_visits').insert({ visitor_id: p.id, host_id: h.id, day: spDay() })
          if (!error) {
            cheered = true
            gained = await giveXp(sb, p, 'visit', h.id, 5)
            await giveXp(sb, h, 'visited', p.id, 3)
          } else if (error.code !== '23505') throw error
        }
        const { data: v } = await sb.from('game_visits').select('day').eq('visitor_id', p.id).eq('host_id', h.id).eq('day', spDay()).maybeSingle()
        const { data: fr } = await sb.from('game_friends').select('friend_id').eq('player_id', p.id).eq('friend_id', h.id).maybeSingle()
        const { data: best } = await sb.from('game_scores').select('score').eq('player_id', h.id).eq('game', 'corrida').order('score', { ascending: false }).limit(1).maybeSingle()
        const { count: cheers } = await sb.from('game_visits').select('day', { count: 'exact', head: true }).eq('host_id', h.id)
        const aw = cheered ? await checkAwards(sb, p) : null
        return json({ host: { ...publicCard(h), best_run: best?.score || 0, cheers: cheers || 0, is_friend: !!fr, is_me: h.id === p.id },
          cheered_today: !!v, gained, me: aw ? await meOf(sb, p, aw) : undefined, now: now() })
      }

      case 'contest': {
        const p = await mustPlayer(sb, body.token)
        const month = spDay().slice(0, 7)
        const prev = addDays(month + '-01', -1).slice(0, 7)
        const { data: entries } = await sb.from('game_contest_entries').select('id, player_id, snapshot, votes, created_at').eq('month', month).order('votes', { ascending: false }).order('created_at').limit(200)
        const { data: myVotes } = entries?.length ? await sb.from('game_contest_votes').select('entry_id').eq('voter_id', p.id).in('entry_id', entries.map((e: any) => e.id)) : { data: [] }
        const voted = new Set((myVotes || []).map((v: any) => v.entry_id))
        const { data: last } = await sb.from('game_contest_entries').select('snapshot, votes').eq('month', prev).order('votes', { ascending: false }).order('created_at').limit(3)
        return json({
          month, prev_month: prev,
          entries: (entries || []).map((e: any) => ({ id: e.id, snapshot: e.snapshot, votes: e.votes, mine: e.player_id === p.id, voted: voted.has(e.id) })),
          winners: (last || []).filter((w: any) => w.votes > 0), now: now(),
        })
      }

      case 'contest_enter': {
        const p = await mustPlayer(sb, body.token)
        if (!p.pet_public) return json({ error: 'Cuide um pouquinho do seu pet antes de inscrever' }, 400)
        if (p.pet_public.habitat !== 'terrario') return json({ error: 'O concurso é de terrário: monte o seu primeiro 🏡' }, 400)
        const month = spDay().slice(0, 7)
        const snapshot = { ...p.pet_public, tutor: firstName(p.tutor_name), code: p.friend_code }
        const { error } = await sb.from('game_contest_entries').upsert({ month, player_id: p.id, snapshot }, { onConflict: 'month,player_id' })
        if (error) throw error
        const gained = await giveXp(sb, p, 'contest', month, 20)
        const aw = await checkAwards(sb, p)
        return json({ ok: true, gained, me: await meOf(sb, p, aw), now: now() })
      }

      case 'contest_vote': {
        const p = await mustPlayer(sb, body.token)
        const id = Number(body.entry_id)
        const { data: e } = await sb.from('game_contest_entries').select('id, player_id, month, votes').eq('id', id).maybeSingle()
        if (!e || e.month !== spDay().slice(0, 7)) return json({ error: 'Inscrição não encontrada' }, 404)
        if (e.player_id === p.id) return json({ error: 'Não vale votar no seu 😉' }, 400)
        const { error } = await sb.from('game_contest_votes').insert({ entry_id: id, voter_id: p.id })
        if (error) { if (error.code === '23505') return json({ error: 'Você já votou nesse' }, 400); throw error }
        const { count } = await sb.from('game_contest_votes').select('voter_id', { count: 'exact', head: true }).eq('entry_id', id)
        await sb.from('game_contest_entries').update({ votes: count || 0 }).eq('id', id)
        return json({ ok: true, votes: count || 0 })
      }

      // Código do cartãozinho da embalagem (cada um vale 1 vez)
      case 'redeem': {
        const p = await mustPlayer(sb, body.token)
        const code = String(body.code || '').trim().toUpperCase().replace(/\s+/g, '')
        const { count } = await sb.from('game_codes').select('code', { count: 'exact', head: true }).eq('used_by', p.id).gte('used_at', isoAgo(3600e3))
        if ((count || 0) >= 20) return json({ error: 'Muitos códigos em pouco tempo — tente mais tarde' }, 429)
        const { data: c } = await sb.from('game_codes').select('code, items, used_by').eq('code', code).maybeSingle()
        if (!c) return json({ error: 'Código inválido. Confira e tente de novo.' }, 404)
        if (c.used_by) return json({ error: c.used_by === p.id ? 'Você já usou esse código.' : 'Esse código já foi usado.' }, 400)
        const { data: upd } = await sb.from('game_codes').update({ used_by: p.id, used_at: new Date().toISOString() }).eq('code', code).is('used_by', null).select('items')
        if (!upd?.length) return json({ error: 'Esse código já foi usado.' }, 400)
        return json({ ok: true, items: c.items, now: now() })
      }

      case 'logout': {
        if (typeof body.token === 'string') await sb.from('game_sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', await sha256Hex(body.token))
        return json({ ok: true })
      }

      case 'delete_account': {
        const s = await mustSession(sb, body.token)
        const { data: p } = await sb.from('game_players').select('email').eq('id', s.player_id).single()
        await sb.from('game_players').delete().eq('id', s.player_id) // cascata: sessões, save, XP, amigos…
        if (p?.email) await sb.from('game_login_codes').delete().eq('email', p.email)
        return json({ ok: true })
      }

      case 'time':
        return json({ now: now() })

      default:
        return json({ error: 'Ação desconhecida' }, 400)
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    console.error('[game-api] erro:', err)
    return json({ error: 'Erro no servidor' }, 500)
  }
})
