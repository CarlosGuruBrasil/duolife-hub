import { sql } from './pg';

function normalizeDocument(value: string) {
  return value.replace(/\D/g, '');
}

function inferDocumentType(documentNumber: string) {
  return documentNumber.length > 11 ? 'cnpj' : 'cpf';
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
      ${birthDate},
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
    await tx`
      SELECT id
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

    // 3. Taxa de comissão
    const [rateRow] = await tx<{ rate: number; policy_prefix: string | null }[]>`
      SELECT
        COALESCE(
          (
            SELECT rate
            FROM partner_commission_rates
            WHERE partner_id = ${input.partnerId}
              AND product_id = ${input.productId}
              AND valid_from <= CURRENT_DATE
              AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
            ORDER BY valid_from DESC
            LIMIT 1
          ),
          p.base_commission_rate,
          0
        ) AS rate,
        p.policy_prefix
      FROM products p
      WHERE id = ${input.productId}
    `;

    const commissionRate = rateRow ? Number(rateRow.rate) : 0;
    const commissionAmount = input.premioFinal * (commissionRate / 100);
    const policyNumber = `${rateRow?.policy_prefix || 'DL'}-${input.cotacaoId.slice(0, 8).toUpperCase()}`;

    // 4. Insere venda
    const [sale] = await tx<{ id: string }[]>`
      INSERT INTO sales (
        cotacao_id,
        client_id,
        partner_id,
        product_id,
        policy_number,
        importancia_segurada,
        premio_total,
        commission_rate,
        commission_amount,
        status,
        issue_date,
        expiry_date
      )
      VALUES (
        ${input.cotacaoId},
        ${input.clientId},
        ${input.partnerId},
        ${input.productId},
        ${policyNumber},
        ${input.importanciaSegurada || 0},
        ${input.premioFinal},
        ${commissionRate},
        ${commissionAmount},
        'ativa',
        CURRENT_DATE,
        CURRENT_DATE + interval '1 year'
      )
      RETURNING id
    `;

    // 5. Insere comissão se houver valor
    if (commissionAmount > 0) {
      await tx`
        INSERT INTO commissions (
          sale_id,
          partner_id,
          amount,
          rate,
          status,
          reference_month
        )
        VALUES (
          ${sale.id},
          ${input.partnerId},
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

    return { saleId: sale.id, created: true };
  });
}

