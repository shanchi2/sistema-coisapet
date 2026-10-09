-- Fase 104 — Reclamações do Mercado Livre (09/10)
--
-- Pedido do Raphael: controle das reclamações/mediações/devoluções do ML
-- dentro do sistema (a barra de atenção já mostrava "reclamações abertas",
-- mas não tinha tela). Fonte: API post-purchase do ML
-- (/post-purchase/v1/claims/search, /claims/{id}/detail, /messages,
-- /claims/reasons/{id}, /v2/claims/{id}/returns) + /orders/{id} pro
-- produto. Só entram reclamações CONTRA a CoisaPet (respondent = nossa
-- conta) — as que a CoisaPet abriu como compradora ficam de fora.
-- Sincronizado pela Edge Function `ml-claims` (cron + botão). Sem R$.

CREATE TABLE IF NOT EXISTS public.ml_claims (
  id                 BIGINT PRIMARY KEY,           -- id da reclamação no ML
  order_id           TEXT,                         -- resource_id (pedido)
  type               TEXT,                         -- mediations | returns | ...
  stage              TEXT,                         -- claim | dispute | ...
  status             TEXT,                         -- opened | closed
  reason_id          TEXT,
  reason_name        TEXT,
  reason_text        TEXT,
  problem            TEXT,                         -- "O comprador disse que…"
  detail_title       TEXT,                         -- "Devolução em preparação"
  detail_description TEXT,
  due_date           TIMESTAMPTZ,
  action_responsible TEXT,                         -- complainant | respondent | mediator
  our_actions        JSONB,                        -- ações disponíveis pra nós
  resolution         JSONB,
  return_info        JSONB,                        -- status/envio da devolução (sem valores)
  messages           JSONB,
  order_info         JSONB,                        -- itens, comprador (apelido), miniatura
  date_created       TIMESTAMPTZ,
  last_updated       TIMESTAMPTZ,
  internal_note      TEXT,                         -- anotação da equipe
  internal_note_by   TEXT,
  internal_note_at   TIMESTAMPTZ,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ml_claims_status_idx ON public.ml_claims(status, last_updated DESC);

CREATE TABLE IF NOT EXISTS public.ml_claims_sync (
  id         TEXT PRIMARY KEY,
  synced_at  TIMESTAMPTZ,
  result     TEXT,
  error      TEXT
);

ALTER TABLE public.ml_claims      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_claims_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ml_claims_read ON public.ml_claims;
DROP POLICY IF EXISTS ml_claims_sync_read ON public.ml_claims_sync;
CREATE POLICY ml_claims_read ON public.ml_claims FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ml_claims_sync_read ON public.ml_claims_sync FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.ml_claims, public.ml_claims_sync TO anon, authenticated;

-- Permissão do módulo (mesmo padrão dos Retornos Shopee)
INSERT INTO public.role_permissions (role, module, enabled)
SELECT r, 'ml-reclamacoes', r IN ('atendimento', 'marketplace')
FROM unnest(ARRAY['administrativo','atendimento','marketplace','producao']) AS r
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role = r AND module = 'ml-reclamacoes');

-- Cron (aplicado à parte): a cada 30 min
-- SELECT cron.schedule('ml-claims-sync', '7,37 * * * *', $$ SELECT net.http_post(
--   url := 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/ml-claims',
--   body := '{"action":"sync"}'::jsonb, headers := '{"Content-Type": "application/json", "Authorization": "Bearer <anon>"}'::jsonb,
--   timeout_milliseconds := 150000); $$);
