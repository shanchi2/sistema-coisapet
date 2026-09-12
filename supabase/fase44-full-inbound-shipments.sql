-- Fase 44 — Gestão de Envios Full (espelho local da tela do painel ML)
--
-- A tela "Gestão de envios Full" do Mercado Livre (onde o Raphael cria/
-- acompanha os envios de estoque pro centro de distribuição) NÃO tem
-- equivalente na API pública do ML — só dá pra consultar via o painel
-- logado no navegador (confirmado: o endpoint que a tela usa devolve 401
-- sem os cookies da sessão, e a documentação oficial do ML diz
-- explicitamente que só "estoque Full" e "operações de estoque" têm API,
-- não a gestão de envios em si).
--
-- Por isso essas tabelas guardam um SNAPSHOT sincronizado manualmente
-- (via automação de navegador, não um cron automático) em vez de dados
-- sempre-atualizados como o resto do módulo ML. `synced_at` marca quando
-- cada sincronização rodou.

CREATE TABLE IF NOT EXISTS public.ml_full_inbound_shipments (
  id                          BIGINT      PRIMARY KEY,           -- id do envio no ML (ex: 76223991)
  shipment_type               TEXT,
  name                        TEXT,                              -- nome/etiqueta dado ao envio (ex: "Teste - Shanchi")
  status                      TEXT,                              -- working / closed / etc (bruto do ML)
  sub_status                  TEXT,
  units_count                 INTEGER,
  products_count               INTEGER,
  appointment_date            TIMESTAMPTZ,                       -- data agendada de entrega/coleta
  appointment_cancel_limit    TIMESTAMPTZ,
  appointment_expired         BOOLEAN,
  reception_date              TIMESTAMPTZ,                       -- quando o CD efetivamente recebeu
  on_sale_units                INTEGER,
  logistic_center_id          TEXT,
  logistics_summary           TEXT,                              -- PENDING / etc
  total_charged                NUMERIC,
  with_penalties               BOOLEAN,
  has_identification_problems BOOLEAN,
  has_unsolvable_problems     BOOLEAN,
  has_fiscal_problems         BOOLEAN,
  last_updated_ml              TIMESTAMPTZ,                      -- "last_updated" que o próprio ML reporta
  raw                          JSONB,                            -- objeto bruto completo devolvido pelo ML (auditoria / campos futuros)
  synced_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT ALL ON public.ml_full_inbound_shipments TO anon;

CREATE TABLE IF NOT EXISTS public.ml_full_inbound_items (
  id            BIGSERIAL PRIMARY KEY,
  shipment_id   BIGINT REFERENCES public.ml_full_inbound_shipments(id) ON DELETE CASCADE,
  ml_code       TEXT,                                            -- "Código ML" mostrado na tela de detalhe
  title         TEXT,
  variation     TEXT,
  declared_qty  INTEGER,
  processed_qty INTEGER,
  diff_qty      INTEGER,
  apt_qty       INTEGER,
  result_text   TEXT,                                            -- ex: "Un. com diferenças", "Un. não aptas para o Full"
  raw           JSONB,                                            -- texto bruto das células, pra nunca perder nada do que a tela mostrava
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ml_full_inbound_items_shipment_id_idx ON public.ml_full_inbound_items(shipment_id);
GRANT ALL ON public.ml_full_inbound_items TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.ml_full_inbound_items_id_seq TO anon;
