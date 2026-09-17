-- ================================================================
-- CoisaPet — Fase 64b: migração das famílias de cor pra produto principal
-- ================================================================
-- Script de uso único, rodado direto (não faz parte do app). Pra cada
-- família de variação de COR com padrão de SKU limpo ("BASE-COR" em
-- todo mundo) e sem nenhum membro marcado como kit, cria 1 produto
-- principal (is_sellable=false, nunca vendido) e reparenta todos os
-- membros da família (mestre atual incluso) pra ele. SKUs existentes
-- nunca mudam. Famílias com SKU irregular ou em conflito com kit ficam
-- de fora — aparecem no relatório final como "pulada" pra revisão
-- manual depois.
-- ================================================================

CREATE TEMP TABLE conversion_log (
  master_id    UUID,
  principal_id UUID,
  base_sku     TEXT,
  family_name  TEXT,
  status       TEXT
);

DO $$
DECLARE
  fam RECORD;
  new_principal_id UUID;
  base_sku_v   TEXT;
  family_name_v TEXT;
  distinct_bases INT;
  distinct_names INT;
  sku_collision  INT;
BEGIN
  FOR fam IN
    SELECT m.id AS master_id
    FROM products m
    WHERE m.active = true
      AND m.parent_product_id IS NULL
      AND m.is_kit = false
      AND EXISTS (SELECT 1 FROM products c WHERE c.parent_product_id = m.id AND c.active = true)
      AND EXISTS (
        SELECT 1 FROM products fm
        JOIN product_variations pv ON pv.product_id = fm.id
        JOIN product_variation_option_links pvol ON pvol.variation_id = pv.id
        JOIN product_variation_options pvo ON pvo.id = pvol.option_id
        JOIN product_variation_types pvt ON pvt.id = pvo.type_id
        WHERE pvt.name = 'Cor' AND (fm.id = m.id OR fm.parent_product_id = m.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM products fm2
        WHERE (fm2.id = m.id OR fm2.parent_product_id = m.id) AND fm2.is_kit = true
      )
  LOOP
    SELECT COUNT(DISTINCT regexp_replace(sku, '-[^-]+$', '')),
           COUNT(DISTINCT name)
      INTO distinct_bases, distinct_names
    FROM products
    WHERE (id = fam.master_id OR parent_product_id = fam.master_id) AND active = true AND sku IS NOT NULL;

    IF distinct_bases IS DISTINCT FROM 1 OR distinct_names IS DISTINCT FROM 1 THEN
      INSERT INTO conversion_log (master_id, status) VALUES (fam.master_id, 'pulada: sku ou nome inconsistente');
      CONTINUE;
    END IF;

    SELECT regexp_replace(sku, '-[^-]+$', ''), name
      INTO base_sku_v, family_name_v
    FROM products WHERE id = fam.master_id;

    SELECT COUNT(*) INTO sku_collision FROM products WHERE sku = base_sku_v;
    IF sku_collision > 0 THEN
      INSERT INTO conversion_log (master_id, base_sku, family_name, status) VALUES (fam.master_id, base_sku_v, family_name_v, 'pulada: sku base já existe');
      CONTINUE;
    END IF;

    INSERT INTO products (name, sku, is_sellable, active, sale_price, category_id, photo_url)
    SELECT family_name_v, base_sku_v, false, true, 0, category_id, photo_url
    FROM products WHERE id = fam.master_id
    RETURNING id INTO new_principal_id;

    UPDATE products SET parent_product_id = new_principal_id
    WHERE id = fam.master_id OR parent_product_id = fam.master_id;

    INSERT INTO conversion_log (master_id, principal_id, base_sku, family_name, status)
    VALUES (fam.master_id, new_principal_id, base_sku_v, family_name_v, 'convertida');
  END LOOP;
END $$;

SELECT status, count(*) FROM conversion_log GROUP BY status ORDER BY status;
SELECT * FROM conversion_log ORDER BY status, family_name;
