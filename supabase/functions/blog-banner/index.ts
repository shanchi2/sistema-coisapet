// Sorteia UM banner promocional pra encaixar no meio de um post do
// blog — produto real do catálogo + texto + link pra Shopee ou ML +
// cupom. Pensado pro site público (PHP, código separado deste
// projeto) chamar a cada visualização de post, SEM autenticação
// (--no-verify-jwt) — não é uma tela do sistema interno.
//
// Configuração (liga/desliga, cupom, desconto, quais categorias
// entram no sorteio) fica na tabela `blog_banner_settings`, editável
// pela tela "Banners do Blog" no painel de Diretoria (fase68) — nada
// disso é mais fixo no código.
//
// Decisão de "em quais posts mostrar" e "em qual ponto do texto
// encaixar" fica por conta de quem renderiza (ver comentário no fim
// do arquivo) — esta function só responde "me dá 1 banner aleatório
// agora", sempre um diferente a cada chamada, e grava 1 linha em
// `blog_banner_events` (type='impression') toda vez que sorteia.
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

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// "Mercado Livre" é masculino (no/pelo), "Shopee" é feminino (na/pela)
// — concordância errada aqui vaza pra todo banner mostrado, então fica
// centralizado numa função só em vez de cada template acertar sozinho.
function artigos(plataforma: string) {
  const masc = plataforma === 'Mercado Livre'
  return { em: masc ? 'no' : 'na', por: masc ? 'pelo' : 'pela' }
}

// Cada função recebe (produto, plataforma, artigos, preço formatado,
// cupom/desconto do settings) e devolve {headline, body}. Vários
// estilos pra não repetir sempre a mesma frase — mistura urgência/
// escassez com o exemplo que o Raphael deu ("oportunidade única...
// consiga X% de desconto com o cupom...").
type TplArgs = { nome: string; plataforma: string; preco: string | null; em: string; por: string; cupom: string; desconto: string }
const TEMPLATES: Array<(p: TplArgs) => { headline: string; body: string }> = [
  (p) => ({
    headline: '🔥 Oportunidade única',
    body: `Compre ${p.nome} agora ${p.por} ${p.plataforma} e ganhe ${p.desconto} de desconto com o cupom ${p.cupom}.`,
  }),
  (p) => ({
    headline: '🐹 Direto do nosso catálogo',
    body: `${p.nome}${p.preco ? ` por ${p.preco}` : ''} — use o cupom ${p.cupom} e leve com ${p.desconto} off ${p.em} ${p.plataforma}.`,
  }),
  (p) => ({
    headline: '⏳ Só por tempo limitado',
    body: `Aproveite ${p.desconto} de desconto em ${p.nome} usando o cupom ${p.cupom} ${p.em} ${p.plataforma}. Estoque real, envio rápido.`,
  }),
  (p) => ({
    headline: '✅ Recomendado pela CoisaPet',
    body: `Quem tem hamster em casa confia: ${p.nome}. Compre ${p.por} ${p.plataforma} com o cupom ${p.cupom} (${p.desconto} off).`,
  }),
  (p) => ({
    headline: '🛒 Já que você está lendo sobre isso...',
    body: `${p.nome} está com ${p.desconto} de desconto ${p.em} ${p.plataforma} usando o cupom ${p.cupom}. Vale a pena conferir.`,
  }),
]

async function handleClick(db: ReturnType<typeof adminClient>, body: any) {
  await db.from('blog_banner_events').insert({
    event_type:   'click',
    product_id:   body.product_id || null,
    product_name: body.product_name || null,
    platform:     body.platform || null,
    post_slug:    body.post_slug || null,
  })
  return json({ ok: true })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = adminClient()

    // Clique reportado pelo site público (opcional — só funciona se
    // quem renderiza o post chamar de volta no clique do link).
    if (req.method === 'POST') {
      let body: any = {}
      try { body = await req.json() } catch { /* sem corpo — trata como pedido normal de banner */ }
      if (body?.action === 'click') return await handleClick(db, body)
    }

    const { data: settings } = await db.from('blog_banner_settings').select('*').eq('id', 'default').maybeSingle()
    if (!settings) return json({ available: false, reason: 'Configuração não encontrada — rode a migração fase68.' })
    if (!settings.active) return json({ available: false, reason: 'Banners desativados no painel (Diretoria → Banners do Blog).' })

    const categoryIds: string[] = settings.category_ids || []
    if (!categoryIds.length && !settings.include_rodinhas) {
      return json({ available: false, reason: 'Nenhuma categoria selecionada no painel.' })
    }

    // Pool: categorias escolhidas no painel + Rodinha (sku ROD-%,
    // categoria Acessório — identificada por SKU porque a categoria
    // "Acessório" tem muita coisa que não é rodinha) — sempre com foto
    // e pelo menos 1 link de plataforma habilitada, senão o banner não
    // tem pra onde mandar o clique.
    const { data: products, error } = await db
      .from('products')
      .select('id, name, slug, sku, photo_url, url_ml, url_shopee, price_ml, price_shopee, category_id')
      .eq('active', true)
      .eq('is_sellable', true)
      .not('photo_url', 'is', null)
    if (error) throw error

    const pool = (products || []).filter((p: any) => {
      const naCategoria = categoryIds.includes(p.category_id)
      const ehRodinha   = settings.include_rodinhas && String(p.sku || '').startsWith('ROD-')
      if (!naCategoria && !ehRodinha) return false
      const temLinkHabilitado = (settings.show_on_ml && p.url_ml) || (settings.show_on_shopee && p.url_shopee)
      return temLinkHabilitado
    })

    if (!pool.length) return json({ available: false, reason: 'Nenhum produto elegível encontrado com as configurações atuais.' })

    const produto = pool[Math.floor(Math.random() * pool.length)]

    // products.photo_url é um CAMINHO dentro do bucket privado
    // `product-photos` (mesmo padrão usado em ProductFormModal.jsx),
    // não uma URL pública direta — precisa assinar. 6h de validade:
    // sobra pra qualquer carregamento de página, mas nunca fica pra
    // sempre grudado (banner é sorteado de novo a cada chamada mesmo).
    let imageUrl: string | null = null
    if (produto.photo_url) {
      const { data: signed } = await db.storage.from('product-photos').createSignedUrl(produto.photo_url, 6 * 3600)
      imageUrl = signed?.signedUrl || null
    }

    // Plataforma: sorteia entre as habilitadas no painel E que o
    // produto realmente tem link.
    const plataformasDisponiveis: Array<{ label: string; url: string; preco: number | null }> = []
    if (settings.show_on_ml && produto.url_ml)         plataformasDisponiveis.push({ label: 'Mercado Livre', url: produto.url_ml, preco: produto.price_ml })
    if (settings.show_on_shopee && produto.url_shopee) plataformasDisponiveis.push({ label: 'Shopee', url: produto.url_shopee, preco: produto.price_shopee })
    const plataforma = plataformasDisponiveis[Math.floor(Math.random() * plataformasDisponiveis.length)]

    const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]
    const { headline, body } = template({
      nome: produto.name,
      plataforma: plataforma.label,
      preco: plataforma.preco ? fmtBRL(plataforma.preco) : null,
      cupom: settings.coupon_code,
      desconto: settings.discount_label,
      ...artigos(plataforma.label),
    })

    // Impressão — melhor esforço, não trava a resposta se falhar.
    db.from('blog_banner_events').insert({
      event_type: 'impression', product_id: produto.id, product_name: produto.name, platform: plataforma.label,
    }).then(() => {}, () => {})

    return json({
      available: true,
      product: { id: produto.id, name: produto.name, slug: produto.slug, image_url: imageUrl },
      platform: plataforma.label,
      link: plataforma.url,
      price: plataforma.preco,
      coupon_code: settings.coupon_code,
      discount_label: settings.discount_label,
      headline,
      body,
      // Snippet pronto — quem renderiza pode usar isso direto ou montar
      // o próprio HTML com os campos acima. Pra registrar clique,
      // chamar de volta POST {action:'click', product_id, platform}
      // no onclick do link.
      html: `<a href="${plataforma.url}" target="_blank" rel="noopener sponsored" class="coisapet-blog-banner" style="display:flex;gap:16px;align-items:center;text-decoration:none;color:inherit;border:1px solid #e5d9c8;border-radius:16px;padding:16px;background:#fdf8f0;max-width:640px;margin:32px auto">`
        + (imageUrl ? `<img src="${imageUrl}" alt="${produto.name}" style="width:88px;height:88px;object-fit:cover;border-radius:12px;flex-shrink:0"/>` : '')
        + `<div><strong style="display:block;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#b8794e">${headline}</strong>`
        + `<span style="display:block;margin-top:4px;font-size:15px;line-height:1.4">${body}</span></div></a>`,
    })
  } catch (err) {
    return json({ available: false, error: String(err) }, 500)
  }
})

// ── Como usar (pro Copilot/quem renderizar o post no site público) ──
// GET/POST sem corpo (sem auth) pra:
//   https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/blog-banner
// Devolve 1 banner sorteado por chamada (e já grava a impressão) —
// decisões de QUANDO mostrar ficam pro lado de quem chama:
//   - "metade dos posts": ex. Math.random() < 0.5 antes de chamar.
//   - "no meio do post": inserir o HTML retornado (campo `html`) por
//     volta do parágrafo do meio do content_html.
// Chamar 1x por visualização de página (não cachear a resposta),
// senão o mesmo banner aparece sempre pro mesmo post.
//
// Clique (opcional, pra estatística de CTR aparecer no painel):
//   POST com body {"action":"click","product_id":"...","platform":"...","post_slug":"..."}
