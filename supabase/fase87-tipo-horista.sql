-- Fase 87 (01/10/2026) — tipo de vínculo "horista" (pedido do Gabriel)
-- CLT recebe Holerite; Horista e Prestador (PJ) recebem "Recibo de pagamento".
-- employee_type já existia (clt/prestador/escritorio); só amplia o CHECK.
-- Quem virou horista (confirmado pelo Raphael): Luis Eduardo, João Vitor e
-- Luciene. Diovani continua Prestador.
alter table system_users drop constraint if exists system_users_employee_type_check;
alter table system_users add constraint system_users_employee_type_check
  check (employee_type = any (array['clt', 'horista', 'prestador', 'escritorio']));

update system_users set employee_type = 'horista', updated_at = now()
 where active and employee_type = 'prestador'
   and name in ('Luis Eduardo de Oliveira', 'João Vitor Matsnuga Sanches', 'Luciene da Silva Lira');
