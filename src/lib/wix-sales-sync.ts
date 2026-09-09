import { sql } from './pg';
import { ensureSchema } from './schema';
import { fetchAllWixImport1Items, WixClientItem } from './wix-compare';
import { normalizeDigits, normalizeMaybeString } from './wix-sync';
import { logger } from './logger';

export interface WixSalesSyncResult {
  totalWixProcessed: number;
  salesCreated: number;
  salesUpdated: number;
  quotesCreated: number;
  quotesUpdated: number;
  pendingQuotesCount: number;
  canceledQuotesCount: number;
  totalRevenue: number;
  durationMs: number;
  details: Array<{
    wixId: string;
    clientName: string | null;
    documentNumber: string | null;
    action: 'sale_created' | 'sale_updated' | 'quote_created' | 'quote_updated' | 'skipped' | 'error';
    status: string;
    revenue?: number;
    error?: string;
  }>;
}

function parseWixNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const clean = value.replace(/[^\d,-]/g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function extractWixRevenue(raw: Record<string, unknown> | null | undefined): number {
  if (!raw) return 0;
  const val =
    raw.premio ??
    raw.receita ??
    raw._receita ??
    raw.valor ??
    raw.premioTotal ??
    raw.premio_total;
  return parseWixNumber(val);
}

export function extractWixCoverage(raw: Record<string, unknown> | null | undefined): number {
  if (!raw) return 500000;
  const val =
    raw.importanciaSegurada ??
    raw.cobertura ??
    raw.valorCobertura ??
    raw.limiteIndenizacao ??
    raw.limite_indenizacao;
  const parsed = parseWixNumber(val);
  return parsed > 0 ? parsed : 500000;
}

export function classifyWixStatus(statusRaw: unknown): 'fechado' | 'pendente' | 'cancelado' | 'outro' {
  if (!statusRaw) return 'outro';
  const s = String(statusRaw).toLowerCase().trim();
  if (
    s === '3' ||
    s.includes('paga de') ||
    s.includes('todas as parcelas pagas') ||
    s.includes('negócio fechado') ||
    s.includes('negocio fechado') ||
    s === 'ativa' ||
    s === 'ativo' ||
    s === 'pago' ||
    s === 'fechado'
  ) {
    return 'fechado';
  }
  if (
    s === '2' ||
    s.includes('pagamento gerado') ||
    s.includes('contrato assinado') ||
    s.includes('pendente de pagamento') ||
    s.includes('falta de pagamento') ||
    s.includes('em negociacao') ||
    s.includes('em negociação') ||
    s === 'pendente' ||
    s === 'aguardando'
  ) {
    return 'pendente';
  }
  if (s === '1' || s.includes('cancelado') || s === 'recusado') {
    return 'cancelado';
  }
  return 'outro';
}

export async function syncWixSalesToLocalDb(): Promise<WixSalesSyncResult> {
  await ensureSchema();
  const startTime = Date.now();

  const wixData = await fetchAllWixImport1Items();
  const wixItems = wixData.items;

  if (wixItems.length === 0) {
    if (wixData.source === 'unavailable') {
      throw new Error(wixData.errorMessage || 'Fonte de dados do Wix indisponível.');
    }
    return {
      totalWixProcessed: 0,
      salesCreated: 0,
      salesUpdated: 0,
      quotesCreated: 0,
      quotesUpdated: 0,
      pendingQuotesCount: 0,
      canceledQuotesCount: 0,
      totalRevenue: 0,
      durationMs: Date.now() - startTime,
      details: [],
    };
  }

  // 1. Carrega parceiros para mapear por wixCode / slug / razaoSocial
  const partnerRows = await sql<
    Array<{
      id: string;
      razao_social: string;
      nome_fantasia: string | null;
      metadata: Record<string, unknown> | null;
    }>
  >`
    SELECT id, razao_social, nome_fantasia, metadata
    FROM partners
    WHERE status != 'suspended'
  `;

  const partnerByCodeMap = new Map<string, string>();
  let fallbackPartnerId = partnerRows[0]?.id || '';

  for (const p of partnerRows) {
    const wl = (p.metadata?.whiteLabel as Record<string, unknown>) || {};
    const wixCode = String(wl.wixCode || '').trim().toLowerCase();
    const slug = String(wl.slug || '').trim().toLowerCase();
    const razao = p.razao_social.trim().toLowerCase();
    const fantasia = (p.nome_fantasia || '').trim().toLowerCase();

    if (wixCode) partnerByCodeMap.set(wixCode, p.id);
    if (slug) partnerByCodeMap.set(slug, p.id);
    if (razao) partnerByCodeMap.set(razao, p.id);
    if (fantasia) partnerByCodeMap.set(fantasia, p.id);
    partnerByCodeMap.set(p.id.toLowerCase(), p.id);

    // Se for o parceiro matriz da NET4Life, guarda como fallback principal
    if (slug.includes('net4life') || razao.includes('net4life') || p.id === 'corretora_net4life_001') {
      fallbackPartnerId = p.id;
    }
  }

  // 2. Carrega produto padrão de RC Advogados
  const [defaultProduct] = await sql<Array<{ id: string; code: string; policy_prefix: string | null }>>`
    SELECT id, code, policy_prefix
    FROM products
    WHERE code = 'RC-ADV-001' OR is_active = true
    ORDER BY (code = 'RC-ADV-001') DESC
    LIMIT 1
  `;

  if (!defaultProduct) {
    throw new Error('Nenhum produto de RC ativo encontrado para associar às vendas do Wix.');
  }

  const defaultProductId = defaultProduct.id;
  const policyPrefix = defaultProduct.policy_prefix || 'DL-RC';

  let salesCreated = 0;
  let salesUpdated = 0;
  let quotesCreated = 0;
  let quotesUpdated = 0;
  let pendingQuotesCount = 0;
  let canceledQuotesCount = 0;
  let totalRevenue = 0;
  const details: WixSalesSyncResult['details'] = [];

  for (const wix of wixItems) {
    try {
      const raw = wix.rawData || {};
      const documentNumber =
        wix.documentNumber ||
        normalizeDigits(raw.cpf) ||
        normalizeDigits(raw.cnpj) ||
        normalizeDigits(raw.documentNumber) ||
        normalizeDigits(raw.documento) ||
        normalizeDigits(raw.cpfCnpj) ||
        `WIX-${wix.id}`;

      const clientName =
        wix.name ||
        normalizeMaybeString(raw.nome) ||
        normalizeMaybeString(raw.name) ||
        normalizeMaybeString(raw.nomeExibido) ||
        `Cliente ${documentNumber}`;

      const email = wix.email ? wix.email.toLowerCase().trim() : (normalizeMaybeString(raw.email)?.toLowerCase().trim() || null);
      const phone = wix.phone ? normalizeDigits(wix.phone) : (normalizeDigits(raw.celular) || normalizeDigits(raw.telefone) || null);
      const rawPartnerCode = (wix.partnerCode || normalizeMaybeString(raw.codigoVenda) || normalizeMaybeString(raw.codigoParceiro) || '').trim().toLowerCase();
      const partnerId = partnerByCodeMap.get(rawPartnerCode) || fallbackPartnerId;
      const corretoraId = 'corretora_net4life_001';

      const classification = classifyWixStatus(wix.statusCliente || wix.status);
      const revenue = extractWixRevenue(raw);
      const coverage = extractWixCoverage(raw);
      const wixDate = wix.createdDate ? new Date(wix.createdDate) : new Date();
      const issueDate = wixDate.toISOString().slice(0, 10);
      const expiryDate = new Date(wixDate.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // 3. Localiza ou cria o cliente segurado em insurance_clients
      let clientId: string | null = null;
      if (documentNumber && !documentNumber.startsWith('WIX-')) {
        const [existingClient] = await sql<Array<{ id: string }>>`
          SELECT id FROM insurance_clients WHERE document_number = ${documentNumber} LIMIT 1
        `;
        if (existingClient) clientId = existingClient.id;
      }
      if (!clientId && wix.id) {
        const [existingByExt] = await sql<Array<{ id: string }>>`
          SELECT id FROM insurance_clients WHERE metadata->>'externalId' = ${wix.id} LIMIT 1
        `;
        if (existingByExt) clientId = existingByExt.id;
      }

      if (!clientId) {
        const docType = documentNumber.length > 11 ? 'cnpj' : 'cpf';
        const [createdClient] = await sql<Array<{ id: string }>>`
          INSERT INTO insurance_clients (
            document_number,
            document_type,
            full_name,
            email,
            phone,
            metadata,
            created_at,
            updated_at
          )
          VALUES (
            ${documentNumber},
            ${docType},
            ${clientName},
            ${email},
            ${phone},
            ${JSON.stringify({ source: 'wix', externalId: wix.id, wix: raw })}::jsonb,
            ${wixDate},
            NOW()
          )
          ON CONFLICT (document_number)
          DO UPDATE SET
            full_name = EXCLUDED.full_name,
            email = COALESCE(EXCLUDED.email, insurance_clients.email),
            phone = COALESCE(EXCLUDED.phone, insurance_clients.phone),
            updated_at = NOW()
          RETURNING id
        `;
        clientId = createdClient.id;
      }

      // Determina status da cotação
      let cotacaoStatus = 'rascunho';
      if (classification === 'fechado') cotacaoStatus = 'emitida';
      else if (classification === 'pendente') {
        cotacaoStatus = 'enviada';
        pendingQuotesCount++;
      } else if (classification === 'cancelado') {
        cotacaoStatus = 'cancelada';
        canceledQuotesCount++;
      }

      // 4. Localiza ou cria cotação vinculada ao item do Wix
      const [existingCotacao] = await sql<Array<{ id: string; status: string }>>`
        SELECT id, status
        FROM cotacoes
        WHERE external_ref = ${wix.id}
           OR metadata->>'wixId' = ${wix.id}
        LIMIT 1
      `;

      let cotacaoId: string;

      if (existingCotacao) {
        cotacaoId = existingCotacao.id;
        await sql`
          UPDATE cotacoes
          SET
            client_id = ${clientId},
            partner_id = ${partnerId},
            corretora_id = ${corretoraId},
            product_id = ${defaultProductId},
            client_name = ${clientName},
            client_cpf_cnpj = ${documentNumber},
            client_email = ${email},
            client_phone = ${phone},
            importancia_segurada = ${coverage},
            premio_calculado = ${revenue},
            premio_final = ${revenue},
            status = ${cotacaoStatus},
            metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ source: 'wix', wixId: wix.id, wix: raw })}::jsonb,
            updated_at = NOW()
          WHERE id = ${cotacaoId}
        `;
        quotesUpdated++;
      } else {
        const [newCotacao] = await sql<Array<{ id: string }>>`
          INSERT INTO cotacoes (
            client_id,
            partner_id,
            corretora_id,
            product_id,
            client_name,
            client_cpf_cnpj,
            client_email,
            client_phone,
            client_data,
            importancia_segurada,
            premio_calculado,
            premio_final,
            status,
            flow_type,
            external_ref,
            metadata,
            created_at,
            updated_at
          )
          VALUES (
            ${clientId},
            ${partnerId},
            ${corretoraId},
            ${defaultProductId},
            ${clientName},
            ${documentNumber},
            ${email},
            ${phone},
            ${JSON.stringify({ wix: raw, partnerCode: rawPartnerCode })}::jsonb,
            ${coverage},
            ${revenue},
            ${revenue},
            ${cotacaoStatus},
            'wix',
            ${wix.id},
            ${JSON.stringify({ source: 'wix', wixId: wix.id, collectionId: 'Import1' })}::jsonb,
            ${wixDate},
            NOW()
          )
          RETURNING id
        `;
        cotacaoId = newCotacao.id;
        quotesCreated++;
      }

      // 5. Se for venda fechada, cria ou atualiza em SALES
      if (classification === 'fechado') {
        const cleanWixId = wix.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
        const policyNumber = `${policyPrefix}-WIX-${cleanWixId}`;
        const commissionRate = 10.0; // Taxa padrão 10%
        const commissionAmount = revenue * (commissionRate / 100);

        const [existingSale] = await sql<Array<{ id: string }>>`
          SELECT id
          FROM sales
          WHERE cotacao_id = ${cotacaoId}
             OR metadata->>'wixId' = ${wix.id}
             OR policy_number = ${policyNumber}
          LIMIT 1
        `;

        let saleId: string;

        if (existingSale) {
          saleId = existingSale.id;
          await sql`
            UPDATE sales
            SET
              client_id = ${clientId},
              partner_id = ${partnerId},
              corretora_id = ${corretoraId},
              product_id = ${defaultProductId},
              importancia_segurada = ${coverage},
              premio_total = ${revenue},
              commission_rate = ${commissionRate},
              commission_amount = ${commissionAmount},
              status = 'ativa',
              issue_date = ${issueDate}::date,
              expiry_date = ${expiryDate}::date,
              metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ source: 'wix', wixId: wix.id })}::jsonb,
              updated_at = NOW()
            WHERE id = ${saleId}
          `;
          salesUpdated++;
          details.push({
            wixId: wix.id,
            clientName,
            documentNumber,
            action: 'sale_updated',
            status: 'ativa',
            revenue,
          });
        } else {
          const [newSale] = await sql<Array<{ id: string }>>`
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
              metadata,
              created_at,
              updated_at
            )
            VALUES (
              ${cotacaoId},
              ${clientId},
              ${partnerId},
              ${corretoraId},
              ${defaultProductId},
              ${policyNumber},
              ${coverage},
              ${revenue},
              ${commissionRate},
              ${commissionAmount},
              'ativa',
              ${issueDate}::date,
              ${expiryDate}::date,
              ${JSON.stringify({ source: 'wix', wixId: wix.id, collectionId: 'Import1' })}::jsonb,
              ${wixDate},
              NOW()
            )
            RETURNING id
          `;
          saleId = newSale.id;
          salesCreated++;
          totalRevenue += revenue;

          // Cria registro de comissão associada à venda
          if (commissionAmount > 0) {
            const refMonth = issueDate.slice(0, 7);
            await sql`
              INSERT INTO commissions (
                sale_id,
                partner_id,
                corretora_id,
                amount,
                rate,
                status,
                reference_month,
                created_at
              )
              VALUES (
                ${saleId},
                ${partnerId},
                ${corretoraId},
                ${commissionAmount},
                ${commissionRate},
                'paga',
                ${refMonth},
                ${wixDate}
              )
            `;
          }

          details.push({
            wixId: wix.id,
            clientName,
            documentNumber,
            action: 'sale_created',
            status: 'ativa',
            revenue,
          });
        }
      } else {
        details.push({
          wixId: wix.id,
          clientName,
          documentNumber,
          action: existingCotacao ? 'quote_updated' : 'quote_created',
          status: cotacaoStatus,
          revenue,
        });
      }
    } catch (itemErr) {
      const errMsg = itemErr instanceof Error ? itemErr.message : String(itemErr);
      logger.warn({ err: itemErr, wixId: wix.id }, 'wix.sales.sync.item.failed');
      details.push({
        wixId: wix.id,
        clientName: wix.name,
        documentNumber: wix.documentNumber,
        action: 'error',
        status: 'erro',
        error: errMsg,
      });
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info({
    totalWixProcessed: wixItems.length,
    salesCreated,
    salesUpdated,
    quotesCreated,
    quotesUpdated,
    pendingQuotesCount,
    totalRevenue,
    durationMs,
  }, 'wix.sales.sync.completed');

  return {
    totalWixProcessed: wixItems.length,
    salesCreated,
    salesUpdated,
    quotesCreated,
    quotesUpdated,
    pendingQuotesCount,
    canceledQuotesCount,
    totalRevenue,
    durationMs,
    details,
  };
}
