// Disparada 1x/dia por um cron do Postgres (pg_cron + pg_net, ver
// supabase/fase30-reputation-alert-cron.sql) — nunca chamada pelo
// frontend, por isso deploy com --no-verify-jwt (mesmo padrão de
// ml-webhook). Não aceita nenhum input de fora, só roda a checagem fixa.
//
// Objetivo: avisar ANTES da taxa de cancelamento cruzar o limite que
// derruba o termômetro de reputação pra amarelo — isso afeta o ranking
// de TODOS os anúncios de uma vez, não só um. Mesmos números já usados
// na tela (CancellationCard/MlAccountDashboardPage): limite 3% (2% pra
// quem é Mercado Líder), alerta a partir de 80% desse limite.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration, mlFetch } from '../_shared/mercadolivre.ts'

serve(async () => {
  const db = adminClient()
  try {
    const integration = await getValidIntegration(db)
    const user = await mlFetch(`/users/${integration.ml_user_id}`, integration.access_token)
    const rep = user.seller_reputation
    const rate = rep?.metrics?.cancellations?.rate
    if (rate == null) return new Response('Sem dado de reputação.', { status: 200 })

    const isMercadoLider = !!rep.power_seller_status
    const threshold = isMercadoLider ? 0.02 : 0.03
    const nearLimit = rate >= threshold * 0.8
    if (!nearLimit) return new Response(`OK — taxa ${(rate * 100).toFixed(1)}%, longe do limite.`, { status: 200 })

    // Dedupe: já alertou nas últimas 24h? Evita notificação repetida
    // todo dia enquanto a taxa continuar no mesmo patamar.
    const { data: recent } = await db.from('notifications')
      .select('id').eq('type', 'ml_reputation_alert')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
    if (recent?.length) return new Response('Já alertado nas últimas 24h.', { status: 200 })

    const { data: admins } = await db.from('system_users')
      .select('id').in('role', ['admin', 'administrativo']).eq('active', true)
    if (!admins?.length) return new Response('Sem admin pra notificar.', { status: 200 })

    const pct = (rate * 100).toFixed(1)
    const limitPct = (threshold * 100).toFixed(0)
    await db.from('notifications').insert(admins.map((u: any) => ({
      user_id: u.id,
      type:    'ml_reputation_alert',
      title:   '⚠️ Reputação ML perto do limite',
      body:    `Taxa de cancelamento em ${pct}% (limite: ${limitPct}%) — isso afeta o ranking de TODOS os anúncios ao mesmo tempo, não só um.`,
      link:    '/ml',
    })))

    return new Response(`Alerta enviado — taxa ${pct}%.`, { status: 200 })
  } catch (err) {
    console.error('[ml-reputation-check] erro:', err)
    return new Response(String(err), { status: 500 })
  }
})
