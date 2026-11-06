import { sql } from './pg';
import { isHealthQuote } from './product-schemas';
import { logger } from './logger';
import { generateClientSessionToken } from './client-draft-storage';
import { deleteAsaasPayment } from './asaas-charges';

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

export function parseVigenciaDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const str = value.trim();
  // Formato ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  // Formato Brasileiro DD/MM/YYYY
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }
  return null;
}

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

export interface CadastralConflictSnapshot {
  hasConflict: boolean;
  resolved: boolean;
  resolvedAt?: string | null;
  resolution?: 'MANTER_ORIGINAL' | 'USAR_NOVOS' | null;
  resolvedByUserId?: string | null;
  originalClientId: string;
  originalData: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    birthDate?: string | null;
    metadata?: Record<string, unknown>;
  };
  submittedData: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    birthDate?: string | null;
    metadata?: Record<string, unknown>;
  };
  divergentFields: string[];
  detectedAt: string;
}

export interface ClientRegistrationIntegrityResult {
  client: any;
  isNew: boolean;
  hasDuplicateConflict: boolean;
  clientSessionToken?: string;
  cadastralConflict?: CadastralConflictSnapshot;
}

function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***';
  const name = parts[0];
  const domain = parts[1];
  const first = name.slice(0, 1);
  return `${first}***@${domain}`;
}

function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, '');
  if (clean.length >= 10) {
    const ddd = clean.slice(0, 2);
    const last4 = clean.slice(-4);
    return `(${ddd}) *****-${last4}`;
  }
  return '(**) *****-****';
}

export async function handleClientRegistrationIntegrity(input: {
  documentNumber: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  metadata?: Record<string, unknown>;
  clientSessionToken?: string | null;
  isPublicRegistration?: boolean;
}): Promise<ClientRegistrationIntegrityResult> {
  const documentNumber = normalizeDocument(input.documentNumber);
  const documentType = inferDocumentType(documentNumber);
  const birthDate =
    input.birthDate && /^\d{4}-\d{2}-\d{2}/.test(input.birthDate)
      ? input.birthDate.slice(0, 10)
      : null;

  // 1. Busca se cliente já existe na base
  const [existing] = await sql`
    SELECT id, document_number, document_type, full_name, email, phone, birth_date, metadata
    FROM insurance_clients
    WHERE document_number = ${documentNumber}
    LIMIT 1
  `;

  // Cenário 1: Novo cliente
  if (!existing) {
    const sessionToken = generateClientSessionToken();
    const newMetadata = {
      ...(input.metadata || {}),
      client_session_token: sessionToken,
    };

    const [created] = await sql`
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
        ${JSON.stringify(newMetadata)}::jsonb,
        NOW()
      )
      RETURNING id, document_number, document_type, full_name, email, phone, metadata
    `;

    return {
      client: created,
      isNew: true,
      hasDuplicateConflict: false,
      clientSessionToken: sessionToken,
    };
  }

  // Cenário 2: Cliente já existe. Se não for registro público do cliente, permite fluxo interno do corretor
  if (!input.isPublicRegistration) {
    return {
      client: existing,
      isNew: false,
      hasDuplicateConflict: false,
    };
  }

  // Cenário 3: Registro público por link do cliente.
  const storedToken = (existing.metadata as any)?.client_session_token;
  const isSameClientSession =
    Boolean(input.clientSessionToken) &&
    Boolean(storedToken) &&
    input.clientSessionToken === storedToken;

  if (isSameClientSession) {
    // Mesma máquina/navegador com o token legítimo: sobrescreve dados cadastrais diretamente
    const mergedMetadata = {
      ...((existing.metadata as any) || {}),
      ...(input.metadata || {}),
      client_session_token: storedToken,
    };

    const [updated] = await sql`
      UPDATE insurance_clients
      SET
        full_name = ${input.fullName},
        email = COALESCE(${input.email || null}, email),
        phone = COALESCE(${input.phone || null}, phone),
        birth_date = COALESCE(${birthDate ? birthDate : null}::date, birth_date),
        metadata = ${JSON.stringify(mergedMetadata)}::jsonb,
        updated_at = NOW()
      WHERE id = ${existing.id}
      RETURNING id, document_number, document_type, full_name, email, phone, metadata
    `;

    return {
      client: updated || existing,
      isNew: false,
      hasDuplicateConflict: false,
      clientSessionToken: storedToken,
    };
  }

  // Cenário 4: Documento em duplicidade sem token idêntico.
  // NÃO atualiza insurance_clients e retém snapshot de conflito para decisão obrigatória do vendedor
  const divergentFields: string[] = [];
  if (existing.full_name?.trim().toLowerCase() !== input.fullName?.trim().toLowerCase()) {
    divergentFields.push('nome');
  }
  if (input.email && existing.email?.trim().toLowerCase() !== input.email?.trim().toLowerCase()) {
    divergentFields.push('email');
  }
  if (input.phone && normalizeDocument(existing.phone || '') !== normalizeDocument(input.phone || '')) {
    divergentFields.push('celular');
  }

  const cadastralConflict: CadastralConflictSnapshot = {
    hasConflict: true,
    resolved: false,
    resolvedAt: null,
    resolution: null,
    originalClientId: existing.id,
    originalData: {
      fullName: existing.full_name,
      email: maskEmail(existing.email),
      phone: maskPhone(existing.phone),
      birthDate: existing.birth_date ? String(existing.birth_date).slice(0, 10) : null,
      metadata: {},
    },
    submittedData: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      birthDate: birthDate,
      metadata: input.metadata,
    },
    divergentFields,
    detectedAt: new Date().toISOString(),
  };

  return {
    client: existing,
    isNew: false,
    hasDuplicateConflict: true,
    cadastralConflict,
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
    const [quote] = await tx<{ id: string; client_data: Record<string, any> | null; corretora_id: string | null; created_at: Date }[]>`
      SELECT id, client_data, corretora_id, created_at
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

    // Extrai data de início da vigência indicada na proposta, com fallback obrigatório para a data de inclusão no sistema (created_at).
    // NUNCA utilizar data de vencimento da cobrança ou data de pagamento do segurado.
    const clientData = (quote?.client_data || {}) as Record<string, any>;
    const rawInicioVigencia =
      clientData.dataInicioVigencia ||
      clientData.dataVigencia ||
      clientData.inicioVigencia ||
      clientData.vigencia;
    const quoteCreatedAtIso = quote?.created_at ? parseVigenciaDate(quote.created_at) : null;
    const inicioVigenciaIso = parseVigenciaDate(rawInicioVigencia) || quoteCreatedAtIso || new Date().toISOString().slice(0, 10);

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
        ${inicioVigenciaIso}::date,
        (${inicioVigenciaIso}::date + interval '1 year' - interval '1 day')::date,
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

export async function handleAsaasPaymentRefund(
  cotacaoId: string,
  eventName: string
): Promise<{ success: boolean; updated: boolean }> {
  if (!cotacaoId || !cotacaoId.trim()) {
    return { success: false, updated: false };
  }

  const cleanId = cotacaoId.trim();

  return await sql.begin(async (tx) => {
    // 1. Estorna comissões geradas para a apólice
    await tx`
      UPDATE commissions
      SET status = 'estornada',
          notes = COALESCE(notes || ' | ', '') || ${'Estornado via Webhook Asaas (' + eventName + ')'},
          updated_at = NOW()
      WHERE sale_id IN (SELECT id FROM sales WHERE cotacao_id = ${cleanId})
        AND status != 'estornada'
    `;

    // 2. Cancela a apólice emitida
    await tx`
      UPDATE sales
      SET status = 'cancelada',
          updated_at = NOW()
      WHERE cotacao_id = ${cleanId}
        AND status != 'cancelada'
    `;

    // 3. Cancela a proposta/cotação
    await tx`
      UPDATE cotacoes
      SET status = 'cancelada',
          updated_at = NOW()
      WHERE id = ${cleanId}
        AND status != 'cancelada'
    `;

    logger.warn(
      { cotacaoId: cleanId, eventName },
      'insurance-ops: estorno de comissoes e cancelamento de apolice executados com sucesso'
    );

    return { success: true, updated: true };
  });
}

export interface CancelDelinquencyParams {
  cotacaoId: string;
  installmentId?: string;
  installmentNumber?: number;
  dueDate?: string;
  reason?: string;
  onlyOverdueCharge?: boolean;
}

/**
 * Cancela atomicamente APENAS a cobrança/parcela atrasada por inadimplência.
 * - Cancela no Asaas apenas a cobrança vencida que extrapolou a tolerância.
 * - JAMAIS cancela parcelas futuras não vencidas.
 * - JAMAIS cancela a apólice (sales) ou comissões caso o cliente tenha parcelas pagas ou em dia.
 */
export async function cancelSaleAndQuoteForDelinquency(
  params: CancelDelinquencyParams
): Promise<{ success: boolean; canceled: boolean; error?: string }> {
  if (!params.cotacaoId || !params.cotacaoId.trim()) {
    return { success: false, canceled: false, error: 'ID da cotação não informado' };
  }

  const cleanId = params.cotacaoId.trim();

  try {
    // 0. Verifica se a proposta ou venda possui flag de proteção/imunidade contra cancelamento automático
    const [protectionCheck] = await sql<Array<{
      cotacao_metadata: any;
      sale_metadata: any;
    }>>`
      SELECT
        c.metadata AS cotacao_metadata,
        s.metadata AS sale_metadata
      FROM cotacoes c
      LEFT JOIN sales s ON s.cotacao_id = c.id
      WHERE c.id = ${cleanId}
      LIMIT 1
    `;

    const cotMeta = (protectionCheck?.cotacao_metadata || {}) as Record<string, any>;
    const saleMeta = (protectionCheck?.sale_metadata || {}) as Record<string, any>;

    if (
      cotMeta.isento_cancelamento === true ||
      cotMeta.reativado_manualmente === true ||
      saleMeta.isento_cancelamento === true ||
      saleMeta.reativado_manualmente === true
    ) {
      logger.info(
        { cotacaoId: cleanId, reason: params.reason },
        'insurance-ops: cancelamento ignorado pois contrato possui imunidade/reativacao manual'
      );
      return { success: true, canceled: false };
    }

    // 1. Busca APENAS a cobrança específica ou cobranças estritamente vencidas
    let targetInstallments: Array<{ id: string; external_payment_id: string | null; installment_number: number }>;

    if (params.installmentId) {
      targetInstallments = await sql<Array<{ id: string; external_payment_id: string | null; installment_number: number }>>`
        SELECT id, external_payment_id, installment_number
        FROM payment_installments
        WHERE id = ${params.installmentId}
          AND cotacao_id = ${cleanId}
          AND status NOT IN ('paid', 'received', 'confirmed', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'cancelled')
      `;
    } else {
      // Se não especificou ID, busca estritamente parcelas cujo vencimento já expirou (passado)
      targetInstallments = await sql<Array<{ id: string; external_payment_id: string | null; installment_number: number }>>`
        SELECT id, external_payment_id, installment_number
        FROM payment_installments
        WHERE cotacao_id = ${cleanId}
          AND status NOT IN ('paid', 'received', 'confirmed', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'cancelled')
          AND due_date < CURRENT_DATE
      `;
    }

    if (targetInstallments.length === 0) {
      return { success: true, canceled: false };
    }

    // Cancela no Asaas APENAS a(s) cobrança(s) atrasada(s) localizada(s)
    for (const inst of targetInstallments) {
      if (inst.external_payment_id) {
        try {
          await deleteAsaasPayment(inst.external_payment_id);
        } catch (asaasErr) {
          logger.warn(
            { asaasErr, externalPaymentId: inst.external_payment_id, cotacaoId: cleanId },
            'insurance-ops: aviso ao cancelar parcela atrasada no Asaas'
          );
        }
      }
    }

    const targetIds = targetInstallments.map((i) => i.id);

    // 2. Transação atômica no PostgreSQL
    return await sql.begin(async (tx) => {
      // a) Atualiza APENAS a(s) parcela(s) atrasada(s) para 'cancelled'
      await tx`
        UPDATE payment_installments
        SET status = 'cancelled',
            notes = COALESCE(notes || ' | ', '') || ${'Cancelada por Inadimplência (' + (params.reason || 'Decurso de prazo') + ')'},
            updated_at = NOW()
        WHERE id IN ${sql(targetIds)}
      `;

      // b) Verifica a saúde geral do contrato:
      // - Quantas parcelas estão pagas?
      // - Quantas parcelas futuras ainda existem (a vencer)?
      const [healthCheck] = await tx<Array<{
        paid_count: number;
        future_pending_count: number;
        has_active_sale: boolean;
      }>>`
        SELECT
          COUNT(*) FILTER (WHERE LOWER(pi.status) IN ('paid', 'received', 'confirmed', 'received_in_cash'))::int AS paid_count,
          COUNT(*) FILTER (WHERE pi.status NOT IN ('cancelled', 'paid', 'received', 'confirmed', 'received_in_cash') AND pi.due_date >= CURRENT_DATE)::int AS future_pending_count,
          EXISTS(SELECT 1 FROM sales s WHERE s.cotacao_id = ${cleanId} AND s.status = 'ativa') AS has_active_sale
        FROM payment_installments pi
        WHERE pi.cotacao_id = ${cleanId}
      `;

      const hasPaid = (healthCheck?.paid_count || 0) > 0;
      const hasFuture = (healthCheck?.future_pending_count || 0) > 0;
      const hasSale = healthCheck?.has_active_sale === true;

      // REGRA DE OURO: O cancelamento deve ser feito APENAS na cobrança atrasada.
      // Se o cliente tem parcelas pagas, parcelas futuras ou uma apólice emitida ativa,
      // A APÓLICE NÃO É CANCELADA, A COTAÇÃO NÃO É CANCELADA E AS COMISSÕES NÃO SÃO ESTORNADAS!
      if (hasPaid || hasFuture || hasSale) {
        logger.info(
          {
            cotacaoId: cleanId,
            canceledInstallments: targetIds,
            hasPaid,
            hasFuture,
            hasSale,
          },
          'insurance-ops: parcela atrasada cancelada pontualmente; apolice e contrato mantidos ativos'
        );

        return { success: true, canceled: true };
      }

      // Se e somente se NÃO houver apólice ativa, NÃO houver nenhuma parcela paga e NÃO houver parcelas futuras
      // (exemplo: proposta em rascunho/aberta cuja 1ª parcela de entrada foi abandonada):
      await tx`
        UPDATE cotacoes
        SET status = 'cancelada',
            updated_at = NOW()
        WHERE id = ${cleanId}
          AND status NOT IN ('aprovada', 'emitida', 'ativa')
      `;

      await tx`
        UPDATE payment_orders
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE cotacao_id = ${cleanId}
      `;

      logger.warn(
        { cotacaoId: cleanId, reason: params.reason, installmentNumber: params.installmentNumber },
        'insurance-ops: proposta sem entrada/pagamento cancelada por decurso de prazo'
      );

      return { success: true, canceled: true };
    });
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    logger.error({ err, cotacaoId: cleanId }, 'insurance-ops: falha ao cancelar cobranca por inadimplencia');
    return { success: false, canceled: false, error: errorMsg };
  }
}



