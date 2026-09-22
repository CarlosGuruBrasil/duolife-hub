-- Migration 014: Reparar importâncias seguradas e prêmios que foram corrompidos por remoção indevida do ponto decimal (* 100)

-- 1. Reparar cotações onde a importância segurada é 10.000.000 para planos de 100k
UPDATE cotacoes
SET importancia_segurada = 100000.00
WHERE importancia_segurada = 10000000.00
  AND (
    client_data->>'tipo' ILIKE '%100k%'
    OR client_data->>'tipoDePlano' ILIKE '%100k%'
    OR client_data->>'nomePlano' ILIKE '%100k%'
    OR client_data->>'nomePlano' ILIKE '%100 mil%'
    OR client_data->>'planoNome' ILIKE '%100k%'
  );

-- 2. Reparar cotações onde o plano é 200k e foi salvo como 20.000.000
UPDATE cotacoes
SET importancia_segurada = 200000.00
WHERE importancia_segurada = 20000000.00
  AND (
    client_data->>'tipo' ILIKE '%200k%'
    OR client_data->>'tipoDePlano' ILIKE '%200k%'
    OR client_data->>'nomePlano' ILIKE '%200k%'
    OR client_data->>'nomePlano' ILIKE '%200 mil%'
  );

-- 3. Reparar cotações onde o plano é 300k e foi salvo como 30.000.000
UPDATE cotacoes
SET importancia_segurada = 300000.00
WHERE importancia_segurada = 30000000.00
  AND (
    client_data->>'tipo' ILIKE '%300k%'
    OR client_data->>'tipoDePlano' ILIKE '%300k%'
    OR client_data->>'nomePlano' ILIKE '%300k%'
    OR client_data->>'nomePlano' ILIKE '%300 mil%'
  );

-- 4. Reparar cotações onde o plano é 500k e foi salvo como 50.000.000
UPDATE cotacoes
SET importancia_segurada = 500000.00
WHERE importancia_segurada = 50000000.00
  AND (
    client_data->>'tipo' ILIKE '%500k%'
    OR client_data->>'tipoDePlano' ILIKE '%500k%'
    OR client_data->>'nomePlano' ILIKE '%500k%'
    OR client_data->>'nomePlano' ILIKE '%500 mil%'
  );

-- 5. Reparar prêmio final desproporcional (ex: 36167 quando o valor real era 361.67) para planos <= 500k
UPDATE cotacoes
SET premio_final = ROUND(premio_final / 100.0, 2)
WHERE premio_final >= 10000.00
  AND premio_final <= 100000.00
  AND (
    client_data->>'tipo' ILIKE ANY (ARRAY['%100k%', '%200k%', '%300k%', '%500k%'])
    OR client_data->>'nomePlano' ILIKE ANY (ARRAY['%100k%', '%200k%', '%300k%', '%500k%', '%100 mil%', '%200 mil%', '%300 mil%', '%500 mil%'])
  );

-- 6. Corrigir também no JSON client_data se o valorCobertura estiver como 10.000.000
UPDATE cotacoes
SET client_data = jsonb_set(
  client_data,
  '{valorCobertura}',
  '"R$ 100.000,00"'
)
WHERE client_data->>'valorCobertura' ILIKE '%10.000.000%'
  AND (
    client_data->>'tipo' ILIKE '%100k%'
    OR client_data->>'nomePlano' ILIKE '%100k%'
    OR client_data->>'nomePlano' ILIKE '%100 mil%'
  );
