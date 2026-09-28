-- Fase 80 (28/09) — nome do produto nas páginas de manuais.
-- products.name costuma ser nome de anúncio (cheio de palavra-chave:
-- "Enriquecimento Ambiental P/ Hamster Roedores Coelho Terrário - Pó de
-- Coco"). doc_title é o nome curto que aparece em coisapet.com.br/doc/<slug>
-- e na lista /links/manuais — vazio = usa products.name.
alter table products add column if not exists doc_title text;
