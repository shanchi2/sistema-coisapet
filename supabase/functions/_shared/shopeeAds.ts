// Saldo de Shopee Ads + snapshot/alerta — compartilhado entre a
// shopee-ads (chamada pela tela, com JWT) e a shopee-ads-balance-check
// (chamada pelo pg_cron, sem JWT e sem input — fase92).
import { adminClient, shopeeFetch } from './shopee.ts'

// ── Saldo e toggles ───────────────────────────────────────────────────
export async function balance(integration: any) {
  const [bal, tog] = await Promise.allSettled([
    shopeeFetch('/api/v2/ads/get_total_balance', integration, {}),
    shopeeFetch('/api/v2/ads/get_shop_toggle_info', integration, {}),
  ])
  const b = bal.status === 'fulfilled' ? bal.value?.response : null
  const t = tog.status === 'fulfilled' ? tog.value?.response : null
  return {
    total_balance:  b?.total_balance ?? null,
    balance_ts:     b?.data_timestamp ?? null,
    auto_top_up:    t?.auto_top_up ?? null,
    campaign_surge: t?.campaign_surge ?? null,
    balance_error:  bal.status === 'rejected' ? String(bal.reason?.message || bal.reason) : null,
    toggle_error:   tog.status === 'rejected' ? String(tog.reason?.message || tog.reason) : null,
  }
}


// ── Snapshot de saldo (cron) + alerta de saldo baixo ──────────────────
// Chamado pelo pg_cron (fase92) e também a cada abertura da aba Créditos.
// O histórico de saldo é o que permite calcular "quanto gastamos por dia"
// e "quando o crédito acaba" mesmo nos dias que ninguém abriu a tela.
export async function balanceSnapshot(integration: any, db: ReturnType<typeof adminClient>, source: string) {
  const b = await balance(integration)
  if (b.total_balance == null) return { ok: false, ...b }

  // No máx. 1 snapshot por hora (abrir a tela 20x não enche a tabela).
  const { data: last } = await db.from('shopee_ads_balance_snapshots')
    .select('id, captured_at').order('captured_at', { ascending: false }).limit(1).maybeSingle()
  const recent = last && (Date.now() - new Date(last.captured_at).getTime()) < 60 * 60 * 1000
  if (!recent) {
    await db.from('shopee_ads_balance_snapshots').insert({
      balance: b.total_balance, auto_top_up: b.auto_top_up, campaign_surge: b.campaign_surge, source,
    })
  }

  // Alerta de saldo baixo (limite configurado na tela, fase92), 1x/24h.
  const { data: settings } = await db.from('shopee_ads_settings').select('*').eq('id', 1).maybeSingle()
  const threshold = settings?.low_balance_threshold != null ? Number(settings.low_balance_threshold) : null
  let alerted = false
  if (threshold != null && Number(b.total_balance) < threshold) {
    const { data: recentAlert } = await db.from('notifications')
      .select('id').eq('type', 'shopee_ads_low_balance')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(1)
    if (!recentAlert?.length) {
      const { data: admins } = await db.from('system_users')
        .select('id').in('role', ['admin', 'marketplace']).eq('active', true)
      if (admins?.length) {
        const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        await db.from('notifications').insert(admins.map((u: any) => ({
          user_id: u.id,
          type:    'shopee_ads_low_balance',
          title:   '📣 Saldo de Shopee Ads baixo',
          body:    `Saldo atual ${fmt(Number(b.total_balance))} (alerta abaixo de ${fmt(threshold)})${b.auto_top_up ? ' — recarga automática está LIGADA.' : ' — recarga automática DESLIGADA, recarregue no Seller Center.'}`,
          link:    '/shopee/ads?aba=creditos',
        })))
        alerted = true
      }
    }
  }
  return { ok: true, ...b, saved: !recent, alerted }
}
