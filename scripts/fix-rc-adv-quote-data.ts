import { sql } from '../src/lib/pg';

async function main() {
  console.log('Iniciando saneamento de resíduos de saúde em propostas de RC Advogados...');

  try {
    // 1. Remove chaves residuais de saúde do client_data de propostas de RC Advogados
    const result = await sql`
      UPDATE cotacoes
      SET client_data = client_data - 'grupoTarifario' - 'grupoTarifarioLabel' - 'grupo' - 'crm' - 'crmUf' - 'cro' - 'croUf'
      WHERE (
        product_id = 'prod-rc-001'
        OR product_id IN (
          SELECT id FROM products
          WHERE flow_key IN ('rc-advogados', 'rc_advogados_v1', 'rc_professional_v1')
             OR code IN ('RC-ADV-001', 'RC-001')
        )
      )
      AND (
        client_data ? 'grupoTarifario'
        OR client_data ? 'grupoTarifarioLabel'
        OR client_data ? 'grupo'
        OR client_data ? 'crm'
      )
      RETURNING id, client_name, client_cpf_cnpj
    `;

    console.log(`Propostas de RC Advogados saneadas: ${result.length}`);
    for (const r of result) {
      console.log(`- [${r.id}] ${r.client_name} (${r.client_cpf_cnpj})`);
    }

    // 2. Se a proposta tiver registroProfissionalNumero preenchido mas não tiver oab, sincroniza
    const syncedOab = await sql`
      UPDATE cotacoes
      SET client_data = jsonb_set(
        jsonb_set(
          client_data,
          '{oab}',
          to_jsonb(COALESCE(client_data->>'oab', client_data->>'registroProfissionalNumero', ''))
        ),
        '{oabUf}',
        to_jsonb(COALESCE(client_data->>'oabUf', client_data->>'ufOab', client_data->>'registroProfissionalUf', 'SP'))
      )
      WHERE (
        product_id = 'prod-rc-001'
        OR product_id IN (
          SELECT id FROM products
          WHERE flow_key IN ('rc-advogados', 'rc_advogados_v1', 'rc_professional_v1')
             OR code IN ('RC-ADV-001', 'RC-001')
        )
      )
      AND (client_data->>'oab' IS NULL OR client_data->>'oab' = '')
      AND (client_data->>'registroProfissionalNumero' IS NOT NULL AND client_data->>'registroProfissionalNumero' != '')
      RETURNING id, client_name
    `;

    console.log(`Propostas com OAB sincronizada a partir do número de registro: ${syncedOab.length}`);
    for (const s of syncedOab) {
      console.log(`- [${s.id}] ${s.client_name}`);
    }

    console.log('Saneamento concluído com sucesso!');
  } catch (err) {
    console.error('Erro no saneamento:', err);
  } finally {
    process.exit(0);
  }
}

main();
