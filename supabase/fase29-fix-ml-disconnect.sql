-- Fase 29 — Corrige ml_disconnect(): DELETE sem WHERE nunca funcionou
-- (bug latente desde a Fase 16, só apareceu agora porque a função nunca
-- tinha sido chamada de verdade antes de precisar reconectar o ML pra
-- pegar a permissão nova de Itens/Perguntas). O banco recusa DELETE sem
-- cláusula WHERE — `WHERE true` mantém o comportamento original (apaga
-- a linha única da integração conectada) satisfazendo essa exigência.

CREATE OR REPLACE FUNCTION public.ml_disconnect()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.ml_integration WHERE true;
$$;
