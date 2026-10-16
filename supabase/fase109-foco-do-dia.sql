-- Foco do dia por funcionário (16/10, pedido do Raphael). Aba nova em
-- /servicos: a diretoria escolhe o funcionário e escreve o que é urgente pra
-- ele naquele dia ("Daniel, focar em embalar casinhas de halloween"). Aparece
-- na TV da produção (módulo `foco_dia` do tv-feed).
CREATE TABLE IF NOT EXISTS public.daily_focus (
  id               bigserial PRIMARY KEY,
  date             date NOT NULL,
  employee_id      uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
  employee_name    text NOT NULL,           -- guardado junto: a TV lê sem join
  task             text NOT NULL,
  urgent           boolean NOT NULL DEFAULT false,
  done             boolean NOT NULL DEFAULT false,
  done_at          timestamptz,
  position         int NOT NULL DEFAULT 0,
  created_by_name  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_focus_date_idx ON public.daily_focus (date, employee_name, position);

ALTER TABLE public.daily_focus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_focus_all ON public.daily_focus;
CREATE POLICY daily_focus_all ON public.daily_focus FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.daily_focus TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.daily_focus_id_seq TO anon, authenticated;
