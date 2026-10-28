import { sql } from './pg';
import { isHealthQuote } from './product-schemas';
import { logger } from './logger';

function normalizeDocument(value: string) {
  return value.replace(/\D/g, '');
}

function inferDocumentType(documentNumber: string) {
  return documentNumber.length > 11 ? 'cnpj' : 'cpf';
}

export const SPREADSHEET_EXACT_MATRIX_ADVOGADOS: Record<
  number,
  { '1x': { insurer: number; corr: number; est: number; adm: number }; '6x': { insurer: number; corr: number; est: number; adm: number } }
> = {
  0: {
    '1x': { insurer: 41.39, corr: 30.73, est: 13.04, adm: 14.84 },
    '6x': { insurer: 38.59, corr: 28.69, est: 18.74, adm: 13.98 },
  },
  10: {
    '1x': { insurer: 45.93, corr: 28.87, est: 11.18, adm: 14.02 },
    '6x': { insurer: 42.87, corr: 26.95, est: 16.74, adm: 13.44 },
  },
  20: {
    '1x': { insurer: 51.67, corr: 26.08, est: 9.31, adm: 12.94 },
    '6x': { insurer: 48.24, corr: 24.34, est: 15.07, adm: 12.35 },
  },
  30: {
    '1x': { insurer: 59.08, corr: 20.49, est: 8.38, adm: 12.05 },
    '6x': { insurer: 55.13, corr: 13.04, est: 17.74, adm: 14.09 },
  },
  40: {
    '1x': { insurer: 68.89, corr: 13.97, est: 6.52, adm: 10.62 },
    '6x': { insurer: 64.31, corr: 13.04, est: 12.13, adm: 10.52 },
  },
};

export const SPREADSHEET_EXACT_MATRIX_SAUDE: Record<
  number,
  { '1x': { insurer: number; corr: number; est: number; adm: number }; '6x': { insurer: number; corr: number; est: number; adm: number } }
> = {
  0: {
    '1x': { insurer: 41.49, corr: 30.73, est: 13.04, adm: 14.74 },
    '6x': { insurer: 41.49, corr: 30.73, est: 13.04, adm: 14.74 },
  },
  10: {
    '1x': { insurer: 46.03, corr: 28.87, est: 11.18, adm: 13.92 },
    '6x': { insurer: 46.03, corr: 28.87, est: 11.18, adm: 13.92 },
  },
  20: {
    '1x': { insurer: 51.77, corr: 26.08, est: 9.31, adm: 12.84 },
    '6x': { insurer: 51.77, corr: 26.08, est: 9.31, adm: 12.84 },
  },
  30: {
    '1x': { insurer: 59.18, corr: 20.49, est: 8.38, adm: 11.95 },
    '6x': { insurer: 59.18, corr: 13.97, est: 11.52, adm: 15.33 },
  },
  40: {
    '1x': { insurer: 69.15, corr: 13.97, est: 6.52, adm: 10.36 },
    '6x': { insurer: 69.15, corr: 13.97, est: 6.52, adm: 10.36 },
  },
};

export function resolveFinancialSplit(input: {
  isHealth: boolean;
  premioFinal: number;
  discountPct?: number;
  installmentsCount?: number;
  customBrokerRate?: number | null;
}) {
  const isHealth = input.isHealth;
  const matrix = isHealth ? SPREADSHEET_EXACT_MATRIX_SAUDE : SPREADSHEET_EXACT_MATRIX_ADVOGADOS;
  const rawDiscount = Number(input.discountPct) || 0;
  const discountTier = [40, 30, 20, 10].find((t) => rawDiscount >= t) || 0;
  const isParcelado = (Number(input.installmentsCount) || 1) > 1;
  const parcelKey = isParcelado ? '6x' : '1x';
  const tierData = matrix[discountTier] || matrix[0];
  const row = tierData[parcelKey] || tierData['1x'];

  const brokerPct = input.customBrokerRate !== null && input.customBrokerRate !== undefined
    ? Number(input.customBrokerRate)
    : row.corr;

  const insurerPct = row.insurer;
  const estipulantePct = row.est;
  const admPct = row.adm;

  const round2 = (val: number) => Number(val.toFixed(2));
  const premio = input.premioFinal;

  return {
    insurerName: isHealth ? 'Kovr Seguradora' : 'KEV Seguros',
    discountPct: discountTier,
    isParcelado,
    installmentsCount: Number(input.installmentsCount) || 1,
    insurerPct,
    insurerAmount: round2(premio * (insurerPct / 100)),
    brokerPct,
    brokerAmount: round2(premio * (brokerPct / 100)),
    estipulantePct,
    estipulanteAmount: round2(premio * (estipulantePct / 100)),
    admPct,
    admAmount: round2(premio * (admPct / 100)),
  };
}

export async function upsertInsuranceClient(input: {
  documentNumber: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const documentNumber = normalizeDocument(input.documentNumber);
  const documentType = inferDocumentType(documentNumber);
  const birthDate =
    input.birthDate && /^\d{4}-\d{2}-\d{2}/.test(input.birthDate)
      ? input.birthDate.slice(0, 10)
      : null;

  const [client] = await sql`
    INSERT INTO insurance_clients (
      document_number,
      document_type,
      full_name,
      email,
      phone,
      birth_date,
      metadata,
      updated_at
    )
    VALUES (
      ${documentNumber},
      ${documentType},
      ${input.fullName},
      ${input.email || null},
      ${input.phone || null},
      ${birthDate ? birthDate : null}::date,
      ${JSON.stringify(input.metadata || {})}::jsonb,
      NOW()
    )
    ON CONFLICT (document_number)
    DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email = COALESCE(EXCLUDED.email, insurance_clients.email),
      phone = COALESCE(EXCLUDED.phone, insurance_clients.phone),
      birth_date = COALESCE(EXCLUDED.birth_date, insurance_clients.birth_date),
      metadata = insurance_clients.metadata || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id, document_number, document_type, full_name, email, phone
  `;

  return client;
}

export async function ensureSaleForPaidQuote(input: {
  cotacaoId: string;
  clientId: string | null;
  partnerId: string;
  productId: string;
  importanciaSegurada: number | null;
  premioFinal: number;
}) {
  return await sql.begin(async (tx) => {
    // 1. Lock de linha na cotação para garantir que concorrência não processe duas vezes
    const [quote] = await tx<{ id: string; client_data: Record<string, any> | null; corretora_id: string | null }[]>`
      SELECT id, client_data, corretora_id
      FROM cotacoes
      WHERE id = ${input.cotacaoId}
      FOR UPDATE
    `;

    // 2. Verifica se a venda já existe
    const existing = await tx<{ id: string }[]>`
      SELECT id
      FROM sales
      WHERE cotacao_id = ${input.cotacaoId}
      LIMIT 1
    `;

    if (existing[0]) {
      return { saleId: existing[0].id, created: false };
    }

    // Extrai data de início da vigência indicada na proposta, com fallback para data atual
    const clientData = (quote?.client_data || {}) as Record<string, any>;
    const rawInicioVigencia = clientData.dataInicioVigencia || clientData.vigencia || clientData.dataVigencia;
    const inicioVigenciaIso =
      typeof rawInicioVigencia === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawInicioVigencia)
        ? rawInicioVigencia.slice(0, 10)
        : null;

    // 3. Taxa de comissão e Split Financeiro Oficial
    const isHealthProduct = isHealthQuote(
      {
        productId: input.productId,
      },
      clientData
    );
    const [rateRow] = await tx<{ rate: number | null; policy_prefix: string | null }[]>`
      SELECT
        (
          SELECT rate
          FROM partner_commission_rates
          WHERE partner_id = ${input.partnerId}
            AND product_id = ${input.productId}
            AND valid_from <= CURRENT_DATE
            AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
          ORDER BY valid_from DESC
          LIMIT 1
        ) AS rate,
        p.policy_prefix
      FROM products p
      WHERE id = ${input.productId}
    `;

    // Verifica se há parcelas na ordem de pagamento
    const [orderRow] = await tx<{ installment_count: number | null }[]>`
      SELECT installment_count FROM payment_orders WHERE cotacao_id = ${input.cotacaoId} ORDER BY created_at DESC LIMIT 1
    `;

    const installmentsCount = Number(orderRow?.installment_count || clientData.parcela || 1);
    const discountPct = Number(clientData.descontoManualPercent ?? clientData.descontoPercentual) || 0;
    const customBrokerRate = rateRow?.rate !== null && rateRow?.rate !== undefined ? Number(rateRow.rate) : null;

    const split = resolveFinancialSplit({
      isHealth: isHealthProduct,
      premioFinal: input.premioFinal,
      discountPct,
      installmentsCount,
      customBrokerRate,
    });

    const commissionRate = split.brokerPct;
    const commissionAmount = split.brokerAmount;
    const policyNumber = `${rateRow?.policy_prefix || (isHealthProduct ? 'DL-RC-MED' : 'DL-RC-ADV')}-${input.cotacaoId.slice(0, 8).toUpperCase()}`;

    // Obtém corretora vinculada ao parceiro da cotação (com fallback para a corretora da cotação ou NET4Life)
    const [partnerCorretora] = await tx<{ corretora_id: string | null }[]>`
      SELECT corretora_id FROM partners WHERE id = ${input.partnerId} LIMIT 1
    `;
    const corretoraId = partnerCorretora?.corretora_id || quote?.corretora_id || 'corretora_net4life_001';

    // 4. Insere venda — Vigência de 1 ano securitária: até o dia anterior do próximo ano
    const [sale] = await tx<{ id: string }[]>`
      INSERT INTO sales (
        cotacao_id,
        client_id,
        partner_id,
        corretora_id,
        product_id,
        policy_number,
        importancia_segurada,
        premio_total,
        commission_rate,
        commission_amount,
        status,
        issue_date,
        expiry_date,
        metadata
      )
      VALUES (
        ${input.cotacaoId},
        ${input.clientId},
        ${input.partnerId},
        ${corretoraId},
        ${input.productId},
        ${policyNumber},
        ${input.importanciaSegurada || 0},
        ${input.premioFinal},
        ${commissionRate},
        ${commissionAmount},
        'ativa',
        COALESCE(${inicioVigenciaIso}::date, CURRENT_DATE),
        (COALESCE(${inicioVigenciaIso}::date, CURRENT_DATE) + interval '1 year' - interval '1 day')::date,
        ${JSON.stringify({ ...((quote as any)?.metadata || {}), financialSplit: split })}::jsonb
      )
      RETURNING id
    `;

    // 5. Insere comissão se houver valor
    if (commissionAmount > 0) {
      await tx`
        INSERT INTO commissions (
          sale_id,
          partner_id,
          corretora_id,
          amount,
          rate,
          status,
          reference_month
        )
        VALUES (
          ${sale.id},
          ${input.partnerId},
          ${corretoraId},
          ${commissionAmount},
          ${commissionRate},
          'pendente',
          to_char(CURRENT_DATE, 'YYYY-MM')
        )
      `;
    }

    // 6. Atualiza cotação para aprovada
    await tx`
      UPDATE cotacoes
      SET status = 'aprovada', updated_at = NOW()
      WHERE id = ${input.cotacaoId}
    `;

    // 7. Incremento atômico e idempotente de cupons promocionais (TD-012)
    const rawCupom = clientData.cupomCodigo || (quote as any)?.cupom_codigo || null;
    if (rawCupom && typeof rawCupom === 'string' && rawCupom.trim()) {
      const cupomCodigo = rawCupom.trim().toUpperCase();
      try {
        const insertedEvent = await tx<{ id: string }[]>`
          INSERT INTO cupom_uso_eventos (cupom_codigo, cotacao_id)
          VALUES (${cupomCodigo}, ${input.cotacaoId})
          ON CONFLICT (cotacao_id) DO NOTHING
          RETURNING id
        `;

        if (insertedEvent.length > 0) {
          await tx`
            INSERT INTO cupom_usos (cupom_codigo, usos, updated_at)
            VALUES (${cupomCodigo}, 1, NOW())
            ON CONFLICT (cupom_codigo) DO UPDATE
            SET usos = cupom_usos.usos + 1, updated_at = NOW()
          `;
          logger.info(
            { cotacaoId: input.cotacaoId, cupomCodigo },
            'insurance-ops.cupom_usage_incremented'
          );
        }
      } catch (cupomErr) {
        logger.warn(
          { cotacaoId: input.cotacaoId, cupomCodigo, err: cupomErr },
          'insurance-ops.cupom_increment_failed'
        );
      }
    }

    return { saleId: sale.id, created: true };
  });
}

