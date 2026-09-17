// Helpers compartilhados entre shopee-oauth-callback e (próxima fase)
// shopee-process-webhook: assinatura HMAC-SHA256, troca/refresh de token
// OAuth e chamadas autenticadas à API da Shopee (Open Platform v2).
//
// IMPORTANTE: usamos o ambiente sandbox por padrão porque só temos Test
// Partner_id/Test API Partner Key até a Shopee aprovar o app pra
// produção (16/09) — trocar SHOPEE_API_BASE pra
// 'https://partner.shopeemobile.com' quando tivermos as credenciais Live.
//
// Domínio confirmado na documentação oficial (open.shopee.com/developer-guide/20,
// 16/09) — NÃO é partner.test-stable.shopeemobile.com (esse existe e
// responde, mas dá "Wrong sign" pra credenciais de teste v2 — foi o que
// aconteceu na primeira tentativa, confirmado com print da doc real).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SHOPEE_API_BASE = Deno.env.get('SHOPEE_API_BASE') || 'https://openplatform.sandbox.test-stable.shopee.sg'

export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function hmacSha256Hex(message: string, key: string) {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Assinatura pra chamada pública (sem loja ainda conectada) — usada pra
// montar o link de autorização e pra trocar code/refresh_token.
async function signPublic(path: string, timestamp: number) {
  const partnerId  = Deno.env.get('SHOPEE_PARTNER_ID')!
  const partnerKey = Deno.env.get('SHOPEE_PARTNER_KEY')!
  return hmacSha256Hex(`${partnerId}${path}${timestamp}`, partnerKey)
}

// Assinatura pra chamada autenticada de loja (a maioria dos endpoints
// depois de conectado) — inclui access_token e shop_id na assinatura.
async function signShop(path: string, timestamp: number, accessToken: string, shopId: string) {
  const partnerId  = Deno.env.get('SHOPEE_PARTNER_ID')!
  const partnerKey = Deno.env.get('SHOPEE_PARTNER_KEY')!
  return hmacSha256Hex(`${partnerId}${path}${timestamp}${accessToken}${shopId}`, partnerKey)
}

export async function buildAuthorizeUrl(redirectUri: string) {
  const path      = '/api/v2/shop/auth_partner'
  const timestamp = Math.floor(Date.now() / 1000)
  const partnerId = Deno.env.get('SHOPEE_PARTNER_ID')!
  const sign      = await signPublic(path, timestamp)
  const params = new URLSearchParams({
    partner_id: partnerId, timestamp: String(timestamp), sign, redirect: redirectUri,
  })
  return `${SHOPEE_API_BASE}${path}?${params}`
}

export async function exchangeCodeForToken(code: string, shopId: string) {
  const path      = '/api/v2/auth/token/get'
  const timestamp = Math.floor(Date.now() / 1000)
  const partnerId = Deno.env.get('SHOPEE_PARTNER_ID')!
  const sign      = await signPublic(path, timestamp)
  const url = `${SHOPEE_API_BASE}${path}?${new URLSearchParams({ partner_id: partnerId, timestamp: String(timestamp), sign })}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(partnerId) }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(`Falha ao trocar code por token: ${res.status} ${JSON.stringify(data)}`)
  return data
}

async function refreshAccessToken(db: ReturnType<typeof adminClient>, integration: any) {
  const path      = '/api/v2/auth/access_token/get'
  const timestamp = Math.floor(Date.now() / 1000)
  const partnerId = Deno.env.get('SHOPEE_PARTNER_ID')!
  const sign      = await signPublic(path, timestamp)
  const url = `${SHOPEE_API_BASE}${path}?${new URLSearchParams({ partner_id: partnerId, timestamp: String(timestamp), sign })}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: integration.refresh_token,
      shop_id: Number(integration.shop_id),
      partner_id: Number(partnerId),
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(`Falha ao renovar token da Shopee: ${res.status} ${JSON.stringify(data)}`)

  const expiresAt = new Date(Date.now() + data.expire_in * 1000).toISOString()
  const { data: updated, error } = await db.from('shopee_integration')
    .update({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
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
// (renova automaticamente se faltar menos de 5 min pra expirar) — mesmo
// padrão do getValidIntegration do ML.
export async function getValidIntegration(db: ReturnType<typeof adminClient>) {
  const { data: integration, error } = await db.from('shopee_integration')
    .select('*').order('connected_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (!integration) throw new Error('SHOPEE_NOT_CONNECTED')

  const expiresInMs = new Date(integration.expires_at).getTime() - Date.now()
  if (expiresInMs < 5 * 60 * 1000) return await refreshAccessToken(db, integration)
  return integration
}

// Chamada autenticada genérica pra loja já conectada (GET, com
// parâmetros extras específicos do endpoint).
export async function shopeeFetch(path: string, integration: { shop_id: string; access_token: string }, extraParams: Record<string, string> = {}) {
  const timestamp = Math.floor(Date.now() / 1000)
  const partnerId = Deno.env.get('SHOPEE_PARTNER_ID')!
  const sign = await signShop(path, timestamp, integration.access_token, integration.shop_id)
  const params = new URLSearchParams({
    partner_id: partnerId, timestamp: String(timestamp), sign,
    shop_id: integration.shop_id, access_token: integration.access_token,
    ...extraParams,
  })
  const url = `${SHOPEE_API_BASE}${path}?${params}`
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(`Erro na API da Shopee (${path}): ${res.status} ${JSON.stringify(data)}`)
  return data
}

// POST autenticado pra loja já conectada — usado pelas ações de escrita
// (ex: pausar/reativar anúncio). Sempre chamado a partir de uma ação que
// o próprio usuário confirmou explicitamente na tela (mesma regra do
// mlWrite) — nunca em lote nem automático.
export async function shopeeWrite(path: string, integration: { shop_id: string; access_token: string }, body: unknown) {
  const timestamp = Math.floor(Date.now() / 1000)
  const partnerId = Deno.env.get('SHOPEE_PARTNER_ID')!
  const sign = await signShop(path, timestamp, integration.access_token, integration.shop_id)
  const params = new URLSearchParams({
    partner_id: partnerId, timestamp: String(timestamp), sign,
    shop_id: integration.shop_id, access_token: integration.access_token,
  })
  const url = `${SHOPEE_API_BASE}${path}?${params}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(`Erro na API da Shopee (${path}): ${res.status} ${JSON.stringify(data)}`)
  return data
}
