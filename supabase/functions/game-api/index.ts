// MinhaCoisaPet — API do jogo (17/10): login por código no e-mail + save na
// nuvem. Pública (deploy --no-verify-jwt): quem chama é o jogo, sem chave do
// Supabase. Só esta função mexe nas tabelas game_* (service role); a chave
// pública não tem acesso a elas (fase110). O jogo NÃO usa o Supabase Auth.
//
// Ações (POST JSON { action, ... }):
//   request_code { email, age_ok }  → manda o código de 6 dígitos (vale 15 min)
//   verify_code  { email, code }    → { token, save, now }
//   load         { token }          → { email, save, now }
//   save         { token, pet }     → { ok, now }
//   logout       { token }
//   delete_account { token }        → apaga jogador, sessões e save (LGPD)
// `now` = hora do servidor: o jogo usa pra não depender do relógio do aparelho.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const RESEND_KEY = Deno.env.get('RESEND_KEY')
const FROM = 'MinhaCoisaPet <noreply@coisapet.com.br>'
const CODE_TTL_MIN = 15
const MAX_ATTEMPTS = 5
const SESSION_DAYS = 180
const MAX_SAVE_BYTES = 60_000

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return 'mcp_' + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const randomCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
const normEmail = (e: unknown) => String(e || '').trim().toLowerCase()
const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString()

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
  // "Usado por último" — no máx. 1 escrita a cada 10 min
  if (Date.now() - new Date(data.last_used_at).getTime() > 600e3) {
    const now = new Date().toISOString()
    await sb.from('game_sessions').update({ last_used_at: now }).eq('id', data.id)
    await sb.from('game_players').update({ last_seen_at: now }).eq('id', data.player_id)
  }
  return data
}

async function loadSave(sb: any, playerId: string) {
  const { data } = await sb.from('game_saves').select('pet, updated_at').eq('player_id', playerId).maybeSingle()
  return data ? { pet: data.pet, updated_at: data.updated_at } : null
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
        // Limites: 1 código a cada 60 s e 6 por hora por e-mail; 20 por hora por IP
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
        // guarda a confirmação de idade pra quando a conta for criada
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
        return json({ token, email, save: await loadSave(sb, player.id), now: now() })
      }

      case 'load': {
        const s = await sessionFrom(sb, body.token)
        if (!s) return json({ error: 'Sessão expirada' }, 401)
        const { data: p } = await sb.from('game_players').select('email').eq('id', s.player_id).single()
        return json({ email: p?.email, save: await loadSave(sb, s.player_id), now: now() })
      }

      case 'save': {
        const s = await sessionFrom(sb, body.token)
        if (!s) return json({ error: 'Sessão expirada' }, 401)
        const pet = body.pet
        if (!pet || typeof pet !== 'object' || pet.v !== 1 || typeof pet.name !== 'string') return json({ error: 'Save inválido' }, 400)
        if (JSON.stringify(pet).length > MAX_SAVE_BYTES) return json({ error: 'Save grande demais' }, 413)
        const { error } = await sb.from('game_saves').upsert({ player_id: s.player_id, pet, updated_at: new Date().toISOString() })
        if (error) throw error
        return json({ ok: true, now: now() })
      }

      case 'logout': {
        if (typeof body.token === 'string') await sb.from('game_sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', await sha256Hex(body.token))
        return json({ ok: true })
      }

      case 'delete_account': {
        const s = await sessionFrom(sb, body.token)
        if (!s) return json({ error: 'Sessão expirada' }, 401)
        const { data: p } = await sb.from('game_players').select('email').eq('id', s.player_id).single()
        await sb.from('game_players').delete().eq('id', s.player_id) // cascata: sessões + save
        if (p?.email) await sb.from('game_login_codes').delete().eq('email', p.email)
        return json({ ok: true })
      }

      case 'time':
        return json({ now: now() })

      default:
        return json({ error: 'Ação desconhecida' }, 400)
    }
  } catch (err) {
    console.error('[game-api] erro:', err)
    return json({ error: 'Erro no servidor' }, 500)
  }
})
