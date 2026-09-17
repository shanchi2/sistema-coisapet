// Faz 2 papéis, ao contrário do ml-oauth-callback (que só recebe o
// redirect de volta): a Shopee exige o link de autorização ASSINADO com
// a partner_key (secreta), então não dá pra montar esse link no front
// como fazemos com o ML (client_id não é secreto lá). Por isso:
//
//   - sem "code" na query  → é o clique inicial no botão "Conectar
//     Shopee": monta o link assinado e redireciona o navegador pra lá.
//   - com "code" na query  → é o retorno da Shopee depois do vendedor
//     autorizar: troca code por token e salva em shopee_integration.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, buildAuthorizeUrl, exchangeCodeForToken } from '../_shared/shopee.ts'

const APP_ORDERS_URL = Deno.env.get('APP_ORDERS_URL') || 'https://coisapet.com.br/sistema/pedidos'

// Idêntica à URL desta própria function — precisa bater com o "Domínio de
// URL de redirecionamento" cadastrado no app da Shopee (mesmo motivo do
// ml-oauth-callback: não dá pra derivar de req.url aqui dentro, o
// gateway do Supabase reescreve a URL antes do Deno enxergar).
const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/shopee-oauth-callback`

function redirectTo(status: string, detail = '') {
  const url = `${APP_ORDERS_URL}?shopee=${status}${detail ? `&shopee_detail=${encodeURIComponent(detail)}` : ''}`
  return new Response(null, { status: 302, headers: { Location: url } })
}

serve(async (req) => {
  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const shopId = url.searchParams.get('shop_id')
  const error  = url.searchParams.get('error')

  if (error) return redirectTo('erro', error)

  if (!code) {
    try {
      const authUrl = await buildAuthorizeUrl(REDIRECT_URI)
      return new Response(null, { status: 302, headers: { Location: authUrl } })
    } catch (err) {
      console.error('[shopee-oauth-callback] erro ao montar link de autorização:', err)
      return redirectTo('erro', String(err))
    }
  }

  if (!shopId) return redirectTo('erro', 'sem_shop_id')

  try {
    const tok = await exchangeCodeForToken(code, shopId)

    const db = adminClient()
    // Só existe UMA loja Shopee conectada por vez neste sistema — remove
    // qualquer conexão anterior antes de salvar a nova (mesmo padrão do ML).
    await db.from('shopee_integration').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    const { error: insErr } = await db.from('shopee_integration').insert({
      shop_id:       shopId,
      access_token:  tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at:    new Date(Date.now() + tok.expire_in * 1000).toISOString(),
      is_sandbox:    true,
    })
    if (insErr) throw insErr

    return redirectTo('conectado')
  } catch (err) {
    console.error('[shopee-oauth-callback] erro:', err)
    return redirectTo('erro', String(err))
  }
})
