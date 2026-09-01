-- ================================================================
-- CoisaPet — Fase 33: cache de explicação de campo técnico gerada
-- por IA (ficha técnica do Mercado Livre)
-- ================================================================
-- Execute no SQL Editor do Supabase.
--
-- Contexto (ver coisapet.md): Raphael pediu tooltip "?" pra cada campo
-- técnico da Ficha Técnica, mas ir listando campo por campo pra eu
-- adicionar num dicionário manual não escala — tem categoria com
-- dezenas de atributos que ninguém sabe o que é (ex: Número da DI,
-- IEPS). Solução: quando o próprio Mercado Livre não manda explicação
-- (`hint`) e não é um dos poucos casos do nosso dicionário fixo, a
-- edge function `ml-insights` pergunta pra OpenAI (mesma chave já usada
-- pra Sugestão de IA de título/descrição) e GRAVA a resposta aqui —
-- só pergunta 1x por categoria+atributo pra sempre (todo produto da
-- mesma categoria reaproveita o cache, sem gastar de novo).
-- ================================================================

CREATE TABLE IF NOT EXISTS public.ml_attribute_hints_cache (
  category_id    TEXT        NOT NULL,
  attribute_id   TEXT        NOT NULL,
  attribute_name TEXT        NOT NULL,
  hint           TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (category_id, attribute_id)
);

COMMENT ON TABLE public.ml_attribute_hints_cache IS 'Cache de explicação de campo técnico da ficha técnica do ML gerada por IA (OpenAI) — 1 explicação por categoria+atributo, reaproveitada por todo produto dessa categoria. Só acessada pela edge function ml-insights via service role (nunca direto pelo frontend), por isso sem GRANT pra anon.';
