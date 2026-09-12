-- Fase 41 — Atestados médicos ganham aprovação (mesmo fluxo de férias)
--
-- Até agora, atestado enviado pelo app da equipe (equipe/index.html)
-- caía direto em medical_certificates sem nenhuma revisão, e o
-- Relatório de Ponto não sabia que aquele dia tinha atestado. Isso
-- adiciona status/aprovação (igual vacation_requests já tem) pra que
-- o Timesheet possa aprovar/rejeitar, e só o aprovado reflita no
-- Relatório de Ponto.

ALTER TABLE medical_certificates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovado','rejeitado')),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES system_users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reject_reason text;

-- Atestados enviados ANTES dessa feature existir já foram aceitos na
-- prática (ninguém foi cobrado por causa deles) — entram como
-- aprovados automaticamente, não é uma revisão retroativa de verdade.
UPDATE medical_certificates
SET status = 'aprovado', reviewed_at = created_at
WHERE status = 'pendente';
