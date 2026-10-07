-- Fase 100 — TV da Produção (07/10)
--
-- Tela pra TV do andar de cima (produção), estilo "TV de consultório":
-- alertas, avisos e informações do dia, sem nenhum valor em R$. Motivo:
-- a coleta do Full do ML de 07/10 foi esquecida (multa).
--
-- A TV não faz login: cada aparelho usa um CÓDIGO próprio (só o hash
-- fica aqui, revogável — mesmo esquema da extensão do Full, fase99) e
-- lê tudo pela Edge Function `tv-feed`, que já devolve os dados
-- agregados e sem dinheiro.

-- Configuração (uma linha só): layout, tempo dos slides e a chave
-- liga/desliga + ordem de cada módulo.
CREATE TABLE IF NOT EXISTS public.tv_settings (
  id              TEXT        PRIMARY KEY DEFAULT 'default',
  mode            TEXT        NOT NULL DEFAULT 'consultorio',   -- consultorio | slides
  slide_seconds   INTEGER     NOT NULL DEFAULT 10,
  full_warn_days  INTEGER     NOT NULL DEFAULT 2,               -- avisa a coleta do Full N dias antes
  modules         JSONB       NOT NULL DEFAULT '[]'::jsonb,     -- [{ key, enabled }], na ordem de exibição
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID
);
INSERT INTO public.tv_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- Aparelhos (TVs) autorizados
CREATE TABLE IF NOT EXISTS public.tv_screens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label           TEXT        NOT NULL,
  token_hash      TEXT        NOT NULL UNIQUE,
  created_by      UUID,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);

-- Alertas/avisos lançados direto pra TV (inclui coleta do Full manual,
-- de segurança caso a sincronização do ML esteja atrasada)
CREATE TABLE IF NOT EXISTS public.tv_alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT        NOT NULL DEFAULT 'aviso',          -- aviso | coleta
  level           TEXT        NOT NULL DEFAULT 'info',           -- info | atencao | critico
  title           TEXT        NOT NULL,
  body            TEXT,
  event_at        TIMESTAMPTZ,                                   -- coleta: data/hora; aviso: opcional
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at         TIMESTAMPTZ,                                   -- some da TV depois disso
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by      UUID,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tv_alerts_active_idx ON public.tv_alerts(active, starts_at);

-- Avisos do RH podem ir pra TV também
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS show_on_tv BOOLEAN NOT NULL DEFAULT FALSE;

-- Mesmo padrão do resto do app (auth própria com chave anon); quem vê a
-- tela de configuração é controlado no front (só diretor).
ALTER TABLE public.tv_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_screens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_alerts   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tv_settings_all ON public.tv_settings;
DROP POLICY IF EXISTS tv_screens_all  ON public.tv_screens;
DROP POLICY IF EXISTS tv_alerts_all   ON public.tv_alerts;
CREATE POLICY tv_settings_all ON public.tv_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY tv_screens_all  ON public.tv_screens  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY tv_alerts_all   ON public.tv_alerts   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.tv_settings, public.tv_screens, public.tv_alerts TO anon, authenticated;
