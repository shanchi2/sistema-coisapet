// Sorteia UM banner promocional pra encaixar no meio de um post do
// blog — produto real do catálogo + texto + link pra Shopee ou ML +
// cupom. Pensado pro site público (PHP, código separado deste
// projeto) chamar a cada visualização de post, SEM autenticação
// (--no-verify-jwt) — não é uma tela do sistema interno.
//
// Decisão de "em quais posts mostrar" e "em qual ponto do texto
// encaixar" fica por conta de quem renderiza (ver comentário no fim
// do arquivo) — esta function só responde "me dá 1 banner aleatório
// agora", sempre um diferente a cada chamada.
//
// ⚠️ CUPOM_CODE/DESCONTO_PADRAO abaixo são um CHUTE inicial — o Raphael
// pediu esse texto como exemplo de estilo ("cupom CoisaPetBlog5"), mas
// eu não tenho como confirmar se esse cupom existe de verdade no ML/
// Shopee nem qual desconto real ele dá. NÃO subir isso pro site sem
// antes criar o cupom de verdade nas duas plataformas (ver
// `couponsList`/`promotionJoinItem` em ml-insights pra criar do lado
// do ML) e confirmar o valor aqui.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// TODO Raphael: confirmar se esse cupom existe de verdade e qual %
// real antes de publicar qualquer banner no site.
const CUPOM_CODE = 'CoisaPetBlog5'
const DESCONTO_PADRAO = '5%'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// "Mercado Livre" é masculino (no/pelo), "Shopee" é feminino (na/pela)
// — concordância errada aqui vaza pra todo banner mostrado, então fica
// centralizado numa função só em vez de cada template acertar sozinho.
function artigos(plataforma: string) {
  const masc = plataforma === 'Mercado Livre'
  return { em: masc ? 'no' : 'na', por: masc ? 'pelo' : 'pela' }
}

// Cada função recebe (produto, plataforma, artigos, preço formatado) e
// devolve {headline, body}. Vários estilos pra não repetir sempre a
// mesma frase — mistura urgência/escassez com o exemplo que o Raphael
// deu ("oportunidade única... consiga X% de desconto com o cupom...").
const TEMPLATES: Array<(p: { nome: string; plataforma: string; preco: string | null; em: string; por: string }) => { headline: string; body: string }> = [
  (p) => ({
    headline: '🔥 Oportunidade única',
    body: `Compre ${p.nome} agora ${p.por} ${p.plataforma} e ganhe ${DESCONTO_PADRAO} de desconto com o cupom ${CUPOM_CODE}.`,
  }),
  (p) => ({
    headline: '🐹 Direto do nosso catálogo',
    body: `${p.nome}${p.preco ? ` por ${p.preco}` : ''} — use o cupom ${CUPOM_CODE} e leve com ${DESCONTO_PADRAO} off ${p.em} ${p.plataforma}.`,
  }),
  (p) => ({
    headline: '⏳ Só por tempo limitado',
    body: `Aproveite ${DESCONTO_PADRAO} de desconto em ${p.nome} usando o cupom ${CUPOM_CODE} ${p.em} ${p.plataforma}. Estoque real, envio rápido.`,
  }),
  (p) => ({
    headline: '✅ Recomendado pela CoisaPet',
    body: `Quem tem hamster em casa confia: ${p.nome}. Compre ${p.por} ${p.plataforma} com o cupom ${CUPOM_CODE} (${DESCONTO_PADRAO} off).`,
  }),
  (p) => ({
    headline: '🛒 Já que você está lendo sobre isso...',
    body: `${p.nome} está com ${DESCONTO_PADRAO} de desconto ${p.em} ${p.plataforma} usando o cupom ${CUPOM_CODE}. Vale a pena conferir.`,
  }),
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = adminClient()

    // Pool: Terrário (médio/grande/120x60x60/transporte já são tudo a
    // mesma categoria) + Substratos + Rodinha (sku ROD-%, categoria
    // Acessório) — sempre com foto e pelo menos 1 link de plataforma,
    // senão o banner não tem pra onde mandar o clique.
    const { data: products, error } = await db
      .from('products')
      .select('id, name, slug, sku, photo_url, url_ml, url_shopee, price_ml, price_shopee, category_id, product_categories(name)')
      .eq('active', true)
      .eq('is_sellable', true)
      .not('photo_url', 'is', null)
    if (error) throw error

    const pool = (products || []).filter((p: any) => {
      const categoria = p.product_categories?.name
      const elegivel = categoria === 'Terrário' || categoria === 'Substratos' || String(p.sku || '').startsWith('ROD-')
      const temLink = !!p.url_ml || !!p.url_shopee
      return elegivel && temLink
    })

    if (!pool.length) return json({ available: false, reason: 'Nenhum produto elegível encontrado (terrário/substrato/rodinha com foto e link).' })

    const produto = pool[Math.floor(Math.random() * pool.length)]

    // Plataforma: sorteia entre as que o produto realmente tem link.
    const plataformasDisponiveis: Array<{ label: string; url: string; preco: number | null }> = []
    if (produto.url_ml)     plataformasDisponiveis.push({ label: 'Mercado Livre', url: produto.url_ml, preco: produto.price_ml })
    if (produto.url_shopee) plataformasDisponiveis.push({ label: 'Shopee', url: produto.url_shopee, preco: produto.price_shopee })
    const plataforma = plataformasDisponiveis[Math.floor(Math.random() * plataformasDisponiveis.length)]

    const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]
    const { headline, body } = template({
      nome: produto.name,
      plataforma: plataforma.label,
      preco: plataforma.preco ? fmtBRL(plataforma.preco) : null,
      ...artigos(plataforma.label),
    })

    const banner = {
      available: true,
      product: { id: produto.id, name: produto.name, slug: produto.slug, image_url: produto.photo_url },
      platform: plataforma.label,
      link: plataforma.url,
      price: plataforma.preco,
      coupon_code: CUPOM_CODE,
      discount_label: DESCONTO_PADRAO,
      headline,
      body,
      // Snippet pronto — quem renderiza pode usar isso direto ou montar
      // o próprio HTML com os campos acima.
      html: `<a href="${plataforma.url}" target="_blank" rel="noopener sponsored" class="coisapet-blog-banner" style="display:flex;gap:16px;align-items:center;text-decoration:none;color:inherit;border:1px solid #e5d9c8;border-radius:16px;padding:16px;background:#fdf8f0;max-width:640px;margin:32px auto">`
        + `<img src="${produto.photo_url}" alt="${produto.name}" style="width:88px;height:88px;object-fit:cover;border-radius:12px;flex-shrink:0"/>`
        + `<div><strong style="display:block;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#b8794e">${headline}</strong>`
        + `<span style="display:block;margin-top:4px;font-size:15px;line-height:1.4">${body}</span></div></a>`,
    }

    return json(banner)
  } catch (err) {
    return json({ available: false, error: String(err) }, 500)
  }
})

// ── Como usar (pro Copilot/quem renderizar o post no site público) ──
// GET/POST (sem auth) pra:
//   https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/blog-banner
// Devolve 1 banner sorteado por chamada — decisões de QUANDO mostrar
// ficam pro lado de quem chama:
//   - "metade dos posts": ex. Math.random() < 0.5 antes de chamar.
//   - "no meio do post": inserir o HTML retornado (campo `html`) por
//     volta do parágrafo do meio do content_html.
// Chamar 1x por visualização de página (não cachear a resposta),
// senão o mesmo banner aparece sempre pro mesmo post.
