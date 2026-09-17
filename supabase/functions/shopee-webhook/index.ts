// Recebe as notificações push da Shopee (Push Mechanism). Mesmo desenho
// do ml-webhook: NÃO processa o pedido aqui, só valida o essencial,
// grava na fila (shopee_webhook_events) e responde rápido. O
// processamento de verdade acontece em shopee-process-webhook, disparado
// por um Database Webhook no INSERT dessa fila.
//
// Formato exato do payload da Shopee ainda não confirmado contra um
// evento real (doc bloqueou acesso automático) — grava o payload cru
// (`raw_payload`) mesmo quando o formato foge do esperado, pra dar pra
// inspecionar depois e ajustar o parsing sem perder nenhum evento.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient } from '../_shared/shopee.ts'

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const code   = payload?.code
  const shopId = payload?.shop_id ?? payload?.data?.shop_id ?? null

  try {
    const db = adminClient()
    const { error } = await db.from('shopee_webhook_events').insert({
      code:    code != null ? Number(code) : null,
      shop_id: shopId != null ? String(shopId) : null,
      raw_payload: payload,
    })
    if (error) throw error
    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('[shopee-webhook] erro ao enfileirar:', err)
    // 500 de propósito — se não deu nem pra gravar a fila, é melhor a
    // Shopee tentar reenviar do que a gente perder o evento.
    return new Response('Erro interno', { status: 500 })
  }
})
