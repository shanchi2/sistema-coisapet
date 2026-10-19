-- Avaliações dos marketplaces (20/10): acompanhamento do contato com quem deu
-- 1–3 estrelas. A equipe tenta falar com o cliente ANTES de responder a
-- avaliação (a Shopee deixa o comprador editar nota/comentário 1x em até 30
-- dias — `editable` = EDITABLE / HAVE_EDITED_ONCE / EXPIRED na API).
-- Aqui fica quem está cuidando, o status e uma anotação por avaliação.
CREATE TABLE IF NOT EXISTS public.marketplace_review_followups (
  platform text NOT NULL, comment_id text NOT NULL,
  status text NOT NULL DEFAULT 'contatando' CHECK (status IN ('contatando','resolvido','sem_retorno')),
  note text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, comment_id));
ALTER TABLE public.marketplace_review_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_followups_all ON public.marketplace_review_followups FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_review_followups TO anon, authenticated;
