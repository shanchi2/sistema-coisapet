-- ================================================================
-- CoisaPet — Fase 51: Agendamento de publicação do Blog
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): Raphael pediu pra poder agendar a data
-- de publicação de um post (em vez de só Rascunho/Publicado). Mesmo
-- padrão de cron já usado no projeto (Fase 30/34 — `pg_cron`), só que
-- aqui é um UPDATE direto no banco, sem precisar de Edge Function: a
-- ação (virar `published`) é só uma troca de status, não tem lógica
-- de negócio externa envolvida.
-- ================================================================

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.blog_posts.scheduled_at IS 'Quando o post deve virar publicado sozinho (status=''scheduled''). O cron blog-publicar-agendados confere a cada 5min e publica quem já passou da hora, usando scheduled_at como published_at (hora real pedida, não a hora que o cron passou a rodar).';

ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_status_check;
ALTER TABLE public.blog_posts ADD CONSTRAINT blog_posts_status_check
  CHECK (status IN ('draft', 'published', 'scheduled', 'trash'));

CREATE INDEX IF NOT EXISTS idx_blog_posts_scheduled_at ON public.blog_posts(scheduled_at) WHERE status = 'scheduled';

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'blog-publicar-agendados';

SELECT cron.schedule(
  'blog-publicar-agendados',
  '*/5 * * * *', -- a cada 5 minutos
  $$
  UPDATE public.blog_posts
  SET status = 'published', published_at = scheduled_at
  WHERE status = 'scheduled' AND scheduled_at <= NOW();
  $$
);
