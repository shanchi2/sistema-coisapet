// Recebe o redirect do ML depois do vendedor autorizar o app
// (https://auth.mercadolivre.com.br/authorization?...), troca o "code"
// por access_token/refresh_token e salva em ml_integration.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, exchangeCodeForToken, mlFetch } from '../_shared/mercadolivre.ts'

const APP_ORDERS_URL = Deno.env.get('APP_ORDERS_URL') || 'https://coisapet.com.br/sistema/pedidos'

// Tem que ser IDÊNTICA à redirect_uri que o front usa pra montar o link de
// autorização (MercadoLivreConnect.jsx) e à cadastrada no app do ML — o ML
// compara os dois valores literalmente. Não dá pra derivar de req.url aqui
// dentro: o gateway do Supabase reescreve a URL antes do Deno enxergar,
// então isso mandava pro ML uma redirect_uri "interna" diferente da usada
// na autorização, e ele rejeitava com "redirect_uri does not match the original".
const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ml-oauth-callback`

function redirectTo(status: string, detail = '') {
  const url = `${APP_ORDERS_URL}?ml=${status}${detail ? `&ml_detail=${encodeURIComponent(detail)}` : ''}`
  return new Response(null, { status: 302, headers: { Location: url } })
}

serve(async (req) => {
  const url = new URL(req.url)
  const code  = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) return redirectTo('erro', error)
  if (!code)  return redirectTo('erro', 'sem_code')

  try {
    const tok = await exchangeCodeForToken(code, REDIRECT_URI)

    const me = await mlFetch('/users/me', tok.access_token)

    const db = adminClient()
    // Só existe UMA conta ML conectada por vez neste sistema — remove
    // qualquer conexão anterior antes de salvar a nova.
    await db.from('ml_integration').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    const { error: insErr } = await db.from('ml_integration').insert({
      ml_user_id:    String(tok.user_id),
      ml_nickname:   me.nickname || null,
      access_token:  tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at:    new Date(Date.now() + tok.expires_in * 1000).toISOString(),
      scope:         tok.scope || null,
    })
    if (insErr) throw insErr

    return redirectTo('conectado')
  } catch (err) {
    console.error('[ml-oauth-callback] erro:', err)
    return redirectTo('erro', String(err))
  }
})
