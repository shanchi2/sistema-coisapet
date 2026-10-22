-- fase125 — Observação do dia no ajuste de ponto (23/10, pedido do irmão do Raphael)
--
-- No modal "Ajustar Ponto" do Relatório de RH: um campo pra explicar o
-- motivo do dia (horário lançado à mão, ajuste de carga horária...). Dias
-- com observação ganham destaque na linha do relatório e aparecem no
-- espelho impresso. Mesmo padrão de acesso de `work_day_targets`.
CREATE TABLE IF NOT EXISTS public.time_day_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  date         date NOT NULL,
  note         text NOT NULL,
  updated_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);
ALTER TABLE public.time_day_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_time_day_notes ON public.time_day_notes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_day_notes TO anon, authenticated;
