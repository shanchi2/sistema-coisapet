// Helpers compartilhados entre ml-oauth-callback e ml-process-webhook:
// troca/refresh de token OAuth e chamadas autenticadas à API do ML.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ML_API = 'https://api.mercadolibre.com'

export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export async function exchangeCodeForToken(code: string, redirectUri: string) {
  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     Deno.env.get('ML_CLIENT_ID')!,
      client_secret: Deno.env.get('ML_CLIENT_SECRET')!,
      code,
      redirect_uri:  redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`Falha ao trocar code por token: ${res.status} ${await res.text()}`)
  return res.json()
}

// O refresh_token do ML é de uso único — cada refresh devolve um
// refresh_token NOVO que precisa ser salvo, senão o próximo refresh falha.
async function refreshAccessToken(db: ReturnType<typeof adminClient>, integration: any) {
  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     Deno.env.get('ML_CLIENT_ID')!,
      client_secret: Deno.env.get('ML_CLIENT_SECRET')!,
      refresh_token: integration.refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`Falha ao renovar token do ML: ${res.status} ${await res.text()}`)
  const tok = await res.json()

  const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString()
  const { data: updated, error } = await db.from('ml_integration')
    .update({
      access_token:  tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at:    expiresAt,
      updated_at:    new Date().toISOString(),
    })
    .eq('id', integration.id)
    .select()
    .single()
  if (error) throw error
  return updated
}

// Devolve a integração com um access_token garantidamente válido
// (renova automaticamente se faltar menos de 5 min pra expirar).
export async function getValidIntegration(db: ReturnType<typeof adminClient>) {
  const { data: integration, error } = await db.from('ml_integration')
    .select('*').order('connected_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (!integration) throw new Error('ML_NOT_CONNECTED')

  const expiresInMs = new Date(integration.expires_at).getTime() - Date.now()
  if (expiresInMs < 5 * 60 * 1000) return await refreshAccessToken(db, integration)
  return integration
}

export async function mlFetch(path: string, accessToken: string, extraHeaders: Record<string, string> = {}) {
  const url = path.startsWith('http') ? path : `${ML_API}${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders },
  })
  if (!res.ok) throw new Error(`Erro na API do ML (${url}): ${res.status} ${await res.text()}`)
  return res.json()
}
