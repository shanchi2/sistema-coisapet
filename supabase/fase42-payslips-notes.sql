-- Fase 42 — Campo de observação curta no holerite
--
-- O Raphael pediu um campo curto no modal de "Enviar holerite" pra
-- anotar alguma informação sobre o pagamento daquele mês (ex: desconto,
-- adiantamento, bônus) — aparece tanto pra quem administra quanto pro
-- funcionário no app da equipe, junto do holerite do mês.

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS notes text;
