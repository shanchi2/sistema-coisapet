-- Instagram dentro do sistema (19/10). Conta profissional @coisapet ligada
-- pela "Instagram API with Instagram Login" (não precisa de Página do Facebook).
--
-- Segurança:
--   * o token da Meta fica SÓ em ig_secrets (RLS sem policy + REVOKE) — só a
--     Edge Function `instagram-api` (service role) lê. Nunca vai pro front.
--   * o front só LÊ as tabelas ig_* (SELECT pra anon). Tudo que escreve —
--     criar/agendar/publicar post, responder/ocultar comentário, mandar DM —
--     passa pela função, que confere o token da sessão do sistema (fase106) e
--     se a pessoa tem o módulo `instagram`. Assim ninguém com a chave pública
--     do site consegue postar no Instagram da CoisaPet.
--   * DMs não ficam gravadas no banco: a caixa de entrada é buscada ao vivo
--     pela função (mensagem de cliente é dado pessoal).

-- ── Segredos (token, segredo do cron) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ig_secrets (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ig_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ig_secrets FROM anon, authenticated;
-- segredo que o cron manda pra função provar que é o cron
INSERT INTO public.ig_secrets (key, value)
VALUES ('cron_secret', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- ── Perfil da conta (1 linha) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ig_account (
  id                  int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ig_user_id          text,
  username            text,
  name                text,
  biography           text,
  website             text,
  profile_picture_url text,
  followers_count     int,
  follows_count       int,
  media_count         int,
  online_followers    jsonb,      -- { "0": n, ..., "23": n } (média dos últimos dias)
  demographics        jsonb,      -- { age_gender: [...], city: [...] }
  totals_28d          jsonb,      -- { reach, views, accounts_engaged, total_interactions, ... }
  publish_quota       jsonb,      -- { used, total } nas últimas 24h
  token_expires_at    timestamptz,
  connected_at        timestamptz,
  connected_by        text,
  last_sync_at        timestamptz,
  last_sync_error     text
);

-- ── Foto do dia (pra gráfico de seguidores/alcance) ───────────────────
CREATE TABLE IF NOT EXISTS public.ig_account_daily (
  day                 date PRIMARY KEY,
  followers_count     int,
  follows_count       int,
  media_count         int,
  reach               int,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Posts publicados (vindos da API) + métricas ───────────────────────
CREATE TABLE IF NOT EXISTS public.ig_media (
  id                  text PRIMARY KEY,
  caption             text,
  media_type          text,       -- IMAGE | VIDEO | CAROUSEL_ALBUM
  media_product_type  text,       -- FEED | REELS | STORY
  media_url           text,
  thumbnail_url       text,
  permalink           text,
  posted_at           timestamptz,
  like_count          int,
  comments_count      int,
  insights            jsonb,      -- { reach, views, saved, shares, total_interactions }
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_media_posted_idx ON public.ig_media (posted_at DESC);

-- ── Comentários (são públicos no próprio Instagram) ───────────────────
CREATE TABLE IF NOT EXISTS public.ig_comments (
  id            text PRIMARY KEY,
  media_id      text NOT NULL,
  parent_id     text,             -- resposta a outro comentário
  username      text,
  text          text,
  commented_at  timestamptz,
  like_count    int,
  hidden        boolean NOT NULL DEFAULT false,
  from_self     boolean NOT NULL DEFAULT false,   -- comentário da própria @coisapet
  answered      boolean NOT NULL DEFAULT false,   -- já tem resposta nossa
  done          boolean NOT NULL DEFAULT false,   -- marcado "resolvido" sem responder
  handled_by    text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_comments_media_idx ON public.ig_comments (media_id, commented_at DESC);
CREATE INDEX IF NOT EXISTS ig_comments_when_idx ON public.ig_comments (commented_at DESC);

-- ── Posts criados no sistema (rascunho / agendado / publicado) ────────
CREATE TABLE IF NOT EXISTS public.ig_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL DEFAULT 'IMAGE' CHECK (kind IN ('IMAGE','CAROUSEL','REELS','STORIES')),
  caption         text NOT NULL DEFAULT '',
  media           jsonb NOT NULL DEFAULT '[]',   -- [{ url, path, type: IMAGE|VIDEO }]
  cover_url       text,                          -- capa do Reels (opcional)
  share_to_feed   boolean NOT NULL DEFAULT true, -- Reels aparece no feed
  scheduled_at    timestamptz,
  status          text NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho','agendado','publicando','publicado','erro')),
  containers      jsonb,                         -- ids dos "containers" criados na Meta
  attempts        int NOT NULL DEFAULT 0,
  error           text,
  ig_media_id     text,
  permalink       text,
  published_at    timestamptz,
  blog_post_id    uuid,
  notes           text,
  created_by      uuid,
  created_by_name text,
  updated_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_posts_due_idx ON public.ig_posts (status, scheduled_at);

-- Front só lê
ALTER TABLE public.ig_account       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_account_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_media         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_posts         ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ig_account, public.ig_account_daily, public.ig_media, public.ig_comments, public.ig_posts FROM anon, authenticated;
GRANT SELECT ON public.ig_account, public.ig_account_daily, public.ig_media, public.ig_comments, public.ig_posts TO anon, authenticated;
DROP POLICY IF EXISTS ig_account_read ON public.ig_account;
DROP POLICY IF EXISTS ig_account_daily_read ON public.ig_account_daily;
DROP POLICY IF EXISTS ig_media_read ON public.ig_media;
DROP POLICY IF EXISTS ig_comments_read ON public.ig_comments;
DROP POLICY IF EXISTS ig_posts_read ON public.ig_posts;
CREATE POLICY ig_account_read       ON public.ig_account       FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ig_account_daily_read ON public.ig_account_daily FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ig_media_read         ON public.ig_media         FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ig_comments_read      ON public.ig_comments      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ig_posts_read         ON public.ig_posts         FOR SELECT TO anon, authenticated USING (true);

-- ── Bucket público das mídias (a Meta baixa a foto/vídeo por URL pública) ─
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('instagram-media', 'instagram-media', true, 104857600)   -- 100 MB (Reels)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "instagram_media_select" ON storage.objects;
DROP POLICY IF EXISTS "instagram_media_insert" ON storage.objects;
CREATE POLICY "instagram_media_select" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'instagram-media');
CREATE POLICY "instagram_media_insert" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'instagram-media');

-- ── Acesso: Diretoria (sempre) + Atendimento + Marketing(=perfil marketplace) ─
INSERT INTO public.role_permissions (role, module, enabled)
SELECT r, 'instagram', r IN ('atendimento', 'marketplace')
FROM unnest(ARRAY['administrativo','atendimento','marketplace','producao']) AS r
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role = r AND module = 'instagram');

-- ── Quem é o dono do token de sessão + se pode usar o módulo ───────────
-- (só a função chama, com service role)
CREATE OR REPLACE FUNCTION public.ig_session_user(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_name text; v_role text; v_ok boolean;
BEGIN
  v_id := public.session_user_id(p_token);
  IF v_id IS NULL THEN RETURN NULL; END IF;
  SELECT name, role INTO v_name, v_role FROM public.system_users WHERE id = v_id;
  v_ok := v_role = 'admin' OR EXISTS (
    SELECT 1 FROM public.role_permissions WHERE role = v_role AND module = 'instagram' AND enabled);
  RETURN jsonb_build_object('id', v_id, 'name', v_name, 'role', v_role, 'allowed', v_ok);
END $$;
REVOKE EXECUTE ON FUNCTION public.ig_session_user(text) FROM anon, authenticated, public;

-- ── Cron: a cada 5 min publica os agendados; sync completo 1x/hora ─────
-- (a própria função decide quando sincronizar)
SELECT cron.unschedule('instagram-cron') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-cron');
SELECT cron.schedule('instagram-cron', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/instagram-api',
    body := jsonb_build_object('action', 'cron', 'secret', (SELECT value FROM public.ig_secrets WHERE key = 'cron_secret')),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 150000);
$$);

-- 20/10: seguidores ganhos/perdidos por dia (aba Seguidores)
ALTER TABLE public.ig_account_daily ADD COLUMN IF NOT EXISTS new_follows int,
  ADD COLUMN IF NOT EXISTS unfollows int, ADD COLUMN IF NOT EXISTS follows_at timestamptz;
