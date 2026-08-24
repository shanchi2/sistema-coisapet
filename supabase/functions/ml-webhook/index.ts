// Recebe as notificações push do ML (tópico orders_v2). O ML exige
// resposta 200 em até 500ms, senão considera "não recebido" e tenta de
// novo por até 1h — depois disso, descarta. Por isso este handler NÃO
// processa o pedido aqui: só valida, grava na fila (ml_webhook_events)
// e responde. O processamento de verdade acontece em ml-process-webhook,
// disparado por um Database Webhook no INSERT dessa fila.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient } from '../_shared/mercadolivre.ts'

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let payload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { resource, topic, user_id, application_id } = payload || {}
  if (!resource || !topic) return new Response('Missing resource/topic', { status: 400 })

  // Confirma que a notificação é mesmo pro nosso app antes de enfileirar
  if (application_id && String(application_id) !== Deno.env.get('ML_CLIENT_ID')) {
    return new Response('Unknown application_id', { status: 200 }) // 200 pra não gerar retry do ML
  }

  // Só nos interessa orders_v2 por enquanto — outros tópicos são
  // reconhecidos (200) mas ignorados, sem gravar fila.
  if (topic !== 'orders_v2') return new Response('OK (topic ignorado)', { status: 200 })

  try {
    const db = adminClient()
    const { error } = await db.from('ml_webhook_events').insert({
      topic, resource,
      ml_user_id:     user_id ? String(user_id) : null,
      application_id: application_id ? String(application_id) : null,
      raw_payload:    payload,
    })
    if (error) throw error
    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('[ml-webhook] erro ao enfileirar:', err)
    // Responde 500 de propósito aqui — se não conseguimos nem gravar a
    // fila, é melhor o ML tentar reenviar do que perder o evento.
    return new Response('Erro interno', { status: 500 })
  }
})
