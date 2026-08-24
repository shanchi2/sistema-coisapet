-- ================================================================
-- CoisaPet — Fase 7: Tipo de anexo em contas a pagar
-- ================================================================
-- Execute no SQL Editor do Supabase
-- ================================================================

-- Adiciona coluna 'type' para diferenciar boleto/QR Code de comprovante
ALTER TABLE public.bill_attachments
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'comprovante';

-- Valores válidos:
--   'documento'   → boleto, QR Code, NF — anexado no cadastro da conta
--   'comprovante' → recibo, print de pagamento — anexado ao registrar pagamento

ALTER TABLE public.bill_attachments
  ADD CONSTRAINT bill_attachments_type_check
  CHECK (type IN ('documento', 'comprovante'));

COMMENT ON COLUMN public.bill_attachments.type IS
  'documento = boleto/QR Code/NF (cadastro) | comprovante = recibo de pagamento';

-- Índice para filtrar por tipo
CREATE INDEX IF NOT EXISTS idx_attachments_type ON public.bill_attachments(type);
