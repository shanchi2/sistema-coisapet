// Disparada pelo pg_cron (supabase/fase92-shopee-ads.sql) a cada 3h —
// nunca pelo frontend, por isso deploy com --no-verify-jwt (mesmo padrão
// do ml-reputation-check). Não aceita input nenhum: só grava um snapshot
// do saldo de Shopee Ads e avisa (sino) se ficou abaixo do limite
// configurado na aba Créditos. As ações que EDITAM campanha ficam na
// shopee-ads, que continua exigindo JWT.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { adminClient, getValidIntegration } from '../_shared/shopee.ts'
import { balanceSnapshot } from '../_shared/shopeeAds.ts'

serve(async () => {
  const db = adminClient()
  try {
    const integration = await getValidIntegration(db)
    const res = await balanceSnapshot(integration, db, 'cron')
    return new Response(JSON.stringify(res), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[shopee-ads-balance-check] erro:', err)
    return new Response(String(err), { status: 500 })
  }
})
