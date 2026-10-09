-- Fase 103 — Barra de atenção no rodapé do sistema (09/10)
--
-- Pedido do Raphael: uma faixa no rodapé, passando devagar, com o que
-- precisa de atenção agora (estoque zerado, reclamações, devoluções,
-- coleta do Full, pedidos atrasados…), cada item com link pra tela certa,
-- e com opção de ligar/desligar. Quem monta é a Edge Function
-- `attention-feed`; aqui só guardamos a última montagem por 5 min pra
-- não bater na API do ML a cada usuário logado.
-- Só contagens — nunca valor em R$.

CREATE TABLE IF NOT EXISTS public.attention_feed_cache (
  id            TEXT PRIMARY KEY,
  payload       JSONB NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Sem policy: só a Edge Function (service role) lê/grava.
ALTER TABLE public.attention_feed_cache ENABLE ROW LEVEL SECURITY;
