import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

// E-mail das notificações DESLIGADO (22/10, decisão do Raphael).
// Mandava 1 e-mail por notificação do sino — inclusive cada pedido
// sincronizado do ML/Shopee, pra ~6 pessoas — e estourou a cota mensal do
// Resend (+8 mil e-mails em outubro; o plano grátis é 3 mil/mês), travando
// também o código de entrada do jogo MinhaCoisaPet.
// Agora as notificações ficam SÓ no sininho do sistema; o Resend fica livre
// pro login do jogo (game-api). O gatilho `on_notification_insert` foi
// desligado na fase122 — esta função fica como trava extra caso ele volte.
// A versão antiga (com o HTML do e-mail) está no histórico do git.
serve(() => new Response(JSON.stringify({ ok: true, skipped: 'e-mail de notificações desligado' }), {
  headers: { 'Content-Type': 'application/json' },
}))
