-- Fase 43 — Múltiplos holerites por funcionário/mês (rótulo)
--
-- Alguns funcionários (Marlon: CLT + fim de semana, Diovani: pagamento
-- semanal) recebem mais de um holerite no mesmo mês. Antes, o segundo
-- envio sempre sobrepunha o primeiro sem avisar (bug no botão "Enviar"
-- do modal — o clique passava o evento do React como argumento pro
-- "forceOverwrite", pulando a checagem de conflito). Corrigido junto:
-- agora o modal detecta os já existentes e deixa escolher "Adicionar
-- mais um" ou "Substituir" um específico.
--
-- Coluna nova pra identificar qual é qual quando há mais de um no mês
-- (ex: "CLT", "Fim de semana", "Semana 1").

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS label text;
