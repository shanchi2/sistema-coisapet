-- ================================================================
-- CoisaPet — Fase 69: Compras (/compras) ganha anexo + integração
-- de verdade com o Financeiro
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): o Raphael pediu 2 coisas na tela de
-- Compras (maintenance_tasks, type='aquisicao'):
--   1. Anexar imagem/arquivo — tanto na sugestão de compra ("A
--      Comprar"/"Prioridade") quanto na compra já feita.
--   2. Ao mover pra "Comprado", em vez de só marcar status,
--      abrir o MESMO modal de "Nova Conta a Pagar" do Financeiro
--      e criar de verdade uma conta em `bills` — a compra some de
--      "pendência de compra" e vira uma conta real a pagar.
--
-- attachment_path/attachment_name: anexo de referência da SUGESTÃO
-- de compra (ex: foto do item, link de catálogo, orçamento) — sobe
-- pro bucket `purchase-attachments`, que já existe e já tem policy
-- pra anon (reaproveitado do módulo irmão /compra-lousa, mesmo
-- padrão, mesmo bucket).
--
-- bill_id: liga a tarefa de compra à conta real criada em `bills`
-- quando ela é marcada como comprada — a partir daí, valor/data de
-- vencimento/comprovante da compra moram no Financeiro (fonte única
-- de verdade), não duplicados aqui.
-- ================================================================

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS attachment_path TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.maintenance_tasks.attachment_path IS 'Caminho no bucket purchase-attachments — anexo de referência da sugestão de compra (foto do item, orçamento, etc). Não é o comprovante da compra — esse fica em bill_attachments, via bill_id.';
COMMENT ON COLUMN public.maintenance_tasks.bill_id IS 'Conta criada em bills quando esta compra foi marcada como "Comprado" — a partir daí valor/vencimento/comprovante reais moram no Financeiro, não aqui (fase69).';
