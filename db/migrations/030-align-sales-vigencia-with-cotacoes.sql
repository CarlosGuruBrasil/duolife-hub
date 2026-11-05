-- Migração 030: Alinhar datas de início e fim de vigência das apólices (sales) com as cotações
-- Regra de Negócio: A vigência de uma apólice deve ser a data incluída/estipulada na proposta
-- (client_data->>'dataInicioVigencia', ou dataVigencia, ou vigencia, ou created_at da cotação),
-- e NUNCA a data de vencimento ou de pagamento do segurado.
-- O término de vigência anual segue o padrão regulatório SUSEP: até o dia anterior do próximo ano (+1 ano - 1 dia).

UPDATE sales s
SET
  issue_date = COALESCE(
    CASE
      WHEN c.client_data->>'dataInicioVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'dataInicioVigencia')::date
      WHEN c.client_data->>'dataInicioVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'dataInicioVigencia', 'DD/MM/YYYY')
      WHEN c.client_data->>'dataVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'dataVigencia')::date
      WHEN c.client_data->>'dataVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'dataVigencia', 'DD/MM/YYYY')
      WHEN c.client_data->>'inicioVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'inicioVigencia')::date
      WHEN c.client_data->>'inicioVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'inicioVigencia', 'DD/MM/YYYY')
      WHEN c.client_data->>'vigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'vigencia')::date
      WHEN c.client_data->>'vigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'vigencia', 'DD/MM/YYYY')
      ELSE NULL
    END,
    c.created_at::date
  ),
  expiry_date = (
    COALESCE(
      CASE
        WHEN c.client_data->>'dataInicioVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'dataInicioVigencia')::date
        WHEN c.client_data->>'dataInicioVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'dataInicioVigencia', 'DD/MM/YYYY')
        WHEN c.client_data->>'dataVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'dataVigencia')::date
        WHEN c.client_data->>'dataVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'dataVigencia', 'DD/MM/YYYY')
        WHEN c.client_data->>'inicioVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'inicioVigencia')::date
        WHEN c.client_data->>'inicioVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'inicioVigencia', 'DD/MM/YYYY')
        WHEN c.client_data->>'vigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'vigencia')::date
        WHEN c.client_data->>'vigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'vigencia', 'DD/MM/YYYY')
        ELSE NULL
      END,
      c.created_at::date
    ) + interval '1 year' - interval '1 day'
  )::date,
  updated_at = NOW()
FROM cotacoes c
WHERE c.id = s.cotacao_id
  AND (
    s.issue_date <> COALESCE(
      CASE
        WHEN c.client_data->>'dataInicioVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'dataInicioVigencia')::date
        WHEN c.client_data->>'dataInicioVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'dataInicioVigencia', 'DD/MM/YYYY')
        WHEN c.client_data->>'dataVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'dataVigencia')::date
        WHEN c.client_data->>'dataVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'dataVigencia', 'DD/MM/YYYY')
        WHEN c.client_data->>'inicioVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'inicioVigencia')::date
        WHEN c.client_data->>'inicioVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'inicioVigencia', 'DD/MM/YYYY')
        WHEN c.client_data->>'vigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'vigencia')::date
        WHEN c.client_data->>'vigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'vigencia', 'DD/MM/YYYY')
        ELSE NULL
      END,
      c.created_at::date
    )
    OR s.expiry_date <> (
      COALESCE(
        CASE
          WHEN c.client_data->>'dataInicioVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'dataInicioVigencia')::date
          WHEN c.client_data->>'dataInicioVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'dataInicioVigencia', 'DD/MM/YYYY')
          WHEN c.client_data->>'dataVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'dataVigencia')::date
          WHEN c.client_data->>'dataVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'dataVigencia', 'DD/MM/YYYY')
          WHEN c.client_data->>'inicioVigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'inicioVigencia')::date
          WHEN c.client_data->>'inicioVigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'inicioVigencia', 'DD/MM/YYYY')
          WHEN c.client_data->>'vigencia' ~ '^\d{4}-\d{2}-\d{2}' THEN (c.client_data->>'vigencia')::date
          WHEN c.client_data->>'vigencia' ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(c.client_data->>'vigencia', 'DD/MM/YYYY')
          ELSE NULL
        END,
        c.created_at::date
      ) + interval '1 year' - interval '1 day'
    )::date
  );
