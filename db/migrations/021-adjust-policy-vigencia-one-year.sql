-- Migração 021: Ajustar término de vigência de apólices anuais
-- Regra regulatória SUSEP e comercial: vigência de 1 ano vai até o dia anterior do próximo ano.
-- Exemplo: 07/10/2026 até 06/10/2027; 06/10/2026 até 05/10/2027.

UPDATE sales
SET expiry_date = (issue_date + interval '1 year' - interval '1 day')::date
WHERE expiry_date = (issue_date + interval '1 year')::date;
