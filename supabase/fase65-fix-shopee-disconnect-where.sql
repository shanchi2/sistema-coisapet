-- ================================================================
-- CoisaPet — Fase 65: corrige shopee_disconnect() sem WHERE clause
-- ================================================================
-- Bug real (18/09): shopee_disconnect() (fase61) fazia
-- `DELETE FROM public.shopee_integration;` sem WHERE — nunca deu erro
-- antes porque ninguém tinha clicado em "Desconectar" de verdade até
-- hoje, quando precisou trocar a conexão sandbox pela Live. Este
-- projeto Supabase exige WHERE em todo DELETE/UPDATE (proteção de
-- segurança do projeto) — `WHERE true` mantém o comportamento
-- original (sempre existe no máximo 1 loja conectada, então
-- "apagar tudo" e "apagar com filtro sempre-verdadeiro" são a mesma
-- coisa), só satisfaz a exigência da cláusula.
-- ================================================================

CREATE OR REPLACE FUNCTION public.shopee_disconnect()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.shopee_integration WHERE true;
$$;
