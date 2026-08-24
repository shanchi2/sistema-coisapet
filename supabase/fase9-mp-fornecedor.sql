-- ================================================================
-- CoisaPet — Fase 9: Vincula fornecedor à matéria-prima
-- ================================================================
-- Execute no SQL Editor do Supabase
-- ================================================================

-- Adiciona coluna supplier_id como FK para a tabela suppliers
ALTER TABLE public.raw_materials
  ADD COLUMN IF NOT EXISTS supplier_id UUID
    REFERENCES public.suppliers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.raw_materials.supplier_id IS
  'Fornecedor vinculado — referencia a tabela suppliers';

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_raw_materials_supplier
  ON public.raw_materials(supplier_id);

-- Mantém a coluna supplier (texto) por compatibilidade com dados antigos
-- mas o sistema passará a usar supplier_id daqui em diante
-- Você pode migrar os dados antigos manualmente se quiser:
--
-- UPDATE public.raw_materials rm
-- SET supplier_id = s.id
-- FROM public.suppliers s
-- WHERE lower(rm.supplier) = lower(s.name);
