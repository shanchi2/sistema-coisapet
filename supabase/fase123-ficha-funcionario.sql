-- fase123 — Ficha do funcionário mais completa (planilha "EM ATIVIDADE", 22/10)
--
-- Campos que a planilha de RH tem e o cadastro ainda não tinha. Todos
-- opcionais (texto/data livres) — só pra deixar a ficha completa.
--
-- system_users usa privilégio POR COLUNA desde a fase106 (o password_hash
-- não é acessível pela API), então toda coluna nova precisa do GRANT
-- explícito abaixo, senão a tela de Usuários quebra no select.

alter table public.system_users
  add column if not exists job_description     text,  -- função detalhada (o que faz no dia a dia)
  add column if not exists work_schedule       text,  -- horário de trabalho (texto livre: "07:30–12:00 | 13:30–18:00")
  add column if not exists saturday_schedule   text,  -- trabalha sábado? horário
  add column if not exists weekly_hours        int,   -- carga horária semanal (h)
  add column if not exists registration_date   date,  -- data do registro em carteira (hire_date = início de fato)
  add column if not exists work_status         text,  -- situação atual (Registrado, Prestador de serviço, Sem registro…)
  add column if not exists hr_notes            text;  -- observações de RH (histórico, combinados, pendências)

grant select (job_description, work_schedule, saturday_schedule, weekly_hours, registration_date, work_status, hr_notes),
      insert (job_description, work_schedule, saturday_schedule, weekly_hours, registration_date, work_status, hr_notes),
      update (job_description, work_schedule, saturday_schedule, weekly_hours, registration_date, work_status, hr_notes)
  on public.system_users to anon, authenticated;
