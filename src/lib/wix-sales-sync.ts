import { sql } from './pg';
import { ensureSchema } from './schema';
import {
  fetchAllWixImport1Items,
  WixClientItem,
  extractWixCreationDate,
  parseFlexibleDate,
} from './wix-compare';
import { normalizeDigits, normalizeMaybeString } from './wix-sync';
import { logger } from './logger';

export interface WixSalesSyncOptions {
  onlyForDocuments?: string[];
  excludeDocuments?: string[];
}

export interface WixSalesSyncResult {
  totalWixProcessed: number;
  salesCreated: number;
  salesUpdated: number;
  quotesCreated: number;
  quotesUpdated: number;
  ordersCreated: number;
  installmentsCreated: number;
  signaturesCreated: number;
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
    raw.premio_total ??
    raw.valorPlano ??
    raw.valor_plano;
  return parseWixNumber(val);
}

export function extractWixCoverage(raw: Record<string, unknown> | null | undefined): number {
  if (!raw) return 500000;
  const val =
    raw.importanciaSegurada ??
    raw.cobertura ??
    raw.valorCobertura ??
    raw.limiteIndenizacao ??
    raw.limite_indenizacao ??
    raw.coberturaEscolhida ??
    raw.cobertura_escolhida;
  const parsed = parseWixNumber(val);
  return parsed > 0 ? parsed : 500000;
}

export function extractWixOab(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  return (
    normalizeMaybeString(raw.oab) ||
    normalizeMaybeString(raw.numeroOab) ||
    normalizeMaybeString(raw.inscricaoOab) ||
    normalizeMaybeString(raw.numero_oab) ||
    normalizeMaybeString(raw.oabNumero) ||
    null
  );
}

export function extractWixEscritorio(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  return (
    normalizeMaybeString(raw.escritorioAssociado) ||
    normalizeMaybeString(raw.escritorio) ||
    normalizeMaybeString(raw.associacao) ||
    normalizeMaybeString(raw.nomeEscritorio) ||
    normalizeMaybeString(raw.escritorio_associado) ||
    null
  );
}

export function extractWixAsaasCustomer(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  return (
    normalizeMaybeString(raw.codigoAsaas) ||
    normalizeMaybeString(raw.codigo_asaas) ||
    normalizeMaybeString(raw.asaasCustomerId) ||
    normalizeMaybeString(raw.asaasId) ||
    normalizeMaybeString(raw.idAsaas) ||
    null
  );
}

export function extractWixZapSignToken(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  return (
    normalizeMaybeString(raw.tokenZapsign) ||
    normalizeMaybeString(raw.token_zapsign) ||
    normalizeMaybeString(raw.zapsignToken) ||
    normalizeMaybeString(raw.zapsign_token) ||
    normalizeMaybeString(raw.tokenDoc) ||
    null
  );
}

export function extractWixTransactionCode(raw: Record<string, unknown> | null | undefined, wixId: string): string {
  if (!raw) return `WIX-${wixId}`;
  return (
    normalizeMaybeString(raw.codigoTransacao) ||
    normalizeMaybeString(raw.codigo_transacao) ||
    normalizeMaybeString(raw.transacao) ||
    normalizeMaybeString(raw.transactionId) ||
    `WIX-${wixId}`
  );
}

export function extractWixUrls(raw: Record<string, unknown> | null | undefined): {
  bankSlipUrl: string | null;
  signedFileUrl: string | null;
} {
  if (!raw) return { bankSlipUrl: null, signedFileUrl: null };
  const bankSlipUrl =
    normalizeMaybeString(raw.linkBoleto) ||
    normalizeMaybeString(raw.boleto) ||
    normalizeMaybeString(raw.urlBoleto) ||
    normalizeMaybeString(raw.boletoUrl) ||
    normalizeMaybeString(raw.faturaUrl) ||
    normalizeMaybeString(raw.asaasInvoiceUrl) ||
    normalizeMaybeString(raw.invoiceUrl) ||
    null;

  const signedFileUrl =
    normalizeMaybeString(raw.propostaAssinada) ||
    normalizeMaybeString(raw.linkProposta) ||
    normalizeMaybeString(raw.urlProposta) ||
    normalizeMaybeString(raw.propostaPdf) ||
    normalizeMaybeString(raw.pdfProposta) ||
    normalizeMaybeString(raw.documentoAssinado) ||
    null;

  return { bankSlipUrl, signedFileUrl };
}

export function extractWixInstallments(raw: Record<string, unknown> | null | undefined, totalAmount: number): {
  count: number;
  paidCount: number;
  installmentAmount: number;
  paidAmount: number;
} {
  if (!raw) {
    return { count: 1, paidCount: 1, installmentAmount: totalAmount, paidAmount: totalAmount };
  }

  const forma = String(raw.formaPagamento || raw.forma_pagamento || raw.pagamento || '');
  let count = 1;
  const matchX = forma.match(/(\d+)\s*x/i);
  if (matchX) {
    count = parseInt(matchX[1], 10);
  } else {
    const matchParc = forma.match(/(\d+)\s*parcela/i);
    if (matchParc) {
      count = parseInt(matchParc[1], 10);
    }
  }

  const rawValorPago = parseWixNumber(raw.valorPago || raw.valor_pago || raw.pago);
  let installmentAmount = rawValorPago > 0 ? rawValorPago : (count > 0 ? totalAmount / count : totalAmount);

  if (count === 1 && rawValorPago > 0 && totalAmount > rawValorPago) {
    const ratio = Math.round(totalAmount / rawValorPago);
    if (ratio > 1 && ratio <= 24) {
      count = ratio;
    }
  }

  const situacao = String(raw.situacaoPagamento || raw.situacao_pagamento || raw.statusPagamento || '').toLowerCase();
  let paidCount = 0;
  if (situacao.includes('todas') || situacao.includes('total') || situacao.includes('pago') || situacao === 'ativa') {
    paidCount = count;
  } else {
    const matchPagas = situacao.match(/(\d+)\s*parcela.*paga/i);
    if (matchPagas) {
      paidCount = parseInt(matchPagas[1], 10);
    } else if (rawValorPago > 0 && installmentAmount > 0) {
      paidCount = Math.min(count, Math.max(1, Math.round(rawValorPago / installmentAmount)));
    }
  }

  count = Math.max(1, Math.min(count, 36));
  paidCount = Math.max(0, Math.min(paidCount, count));
  const paidAmount = paidCount >= count ? totalAmount : (paidCount * installmentAmount);

  return {
    count,
    paidCount,
    installmentAmount: Math.round(installmentAmount * 100) / 100,
    paidAmount: Math.round(paidAmount * 100) / 100,
  };
}

export function parseWixAddress(raw: Record<string, unknown> | null | undefined): {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
} {
  const result = {
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
  };
  if (!raw) return result;

  if (raw.cep) result.cep = String(raw.cep).trim();
  if (raw.logradouro || raw.rua) result.logradouro = String(raw.logradouro || raw.rua).trim();
  if (raw.numero) result.numero = String(raw.numero).trim();
  if (raw.complemento) result.complemento = String(raw.complemento).trim();
  if (raw.bairro) result.bairro = String(raw.bairro).trim();
  if (raw.cidade) result.cidade = String(raw.cidade).trim();
  if (raw.uf || raw.estado) result.uf = String(raw.uf || raw.estado).trim();

  const endStr = typeof raw.endereco === 'string' ? raw.endereco : (typeof raw.address === 'string' ? raw.address : '');
  if (endStr && !result.logradouro) {
    const cepMatch = endStr.match(/CEP:?\s*(\d{5}-?\d{3})/i);
    if (cepMatch && !result.cep) result.cep = cepMatch[1].replace(/\D/g, '');

    const parts = endStr.split(' - ').map(s => s.trim());
    if (parts.length >= 1) {
      const ruaNum = parts[0].split(',');
      result.logradouro = ruaNum[0].trim();
      if (ruaNum.length > 1 && !result.numero) {
        result.numero = ruaNum[1].trim();
      }
    }
    if (parts.length >= 2 && !result.bairro) {
      result.bairro = parts[1];
    }
    if (parts.length >= 3 && !result.cidade) {
      result.cidade = parts[2];
    }
    if (parts.length >= 4 && !result.uf) {
      result.uf = parts[3].slice(0, 2);
    }
  }

  return result;
}

function addMonthsToDate(baseDate: Date, months: number): string {
  const d = new Date(baseDate.getTime());
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
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

export async function syncWixSalesToLocalDb(options?: WixSalesSyncOptions): Promise<WixSalesSyncResult> {
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
      ordersCreated: 0,
      installmentsCreated: 0,
      signaturesCreated: 0,
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

  // Se tabela de parceiros estiver vazia, cria parceiro NET4Life padrão
  if (!fallbackPartnerId) {
    const [createdPartner] = await sql<Array<{ id: string }>>`
      INSERT INTO partners (
        razao_social,
        nome_fantasia,
        cnpj,
        email,
        phone,
        status,
        corretora_id,
        metadata
      )
      VALUES (
        'Net4life Corretora de Seguros Ltda',
        'NET4Life Corretora de Seguros',
        '07351909000133',
        'contato@net4life.com.br',
        '+55 11 91177-1319',
        'active',
        'corretora_net4life_001',
        '{"whiteLabel": {"slug": "net4life", "wixCode": "net4life"}}'::jsonb
      )
      ON CONFLICT (email) DO UPDATE SET razao_social = EXCLUDED.razao_social
      RETURNING id
    `;
    fallbackPartnerId = createdPartner.id;
    partnerByCodeMap.set('net4life', fallbackPartnerId);
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
  let ordersCreated = 0;
  let installmentsCreated = 0;
  let signaturesCreated = 0;
  let pendingQuotesCount = 0;
  let canceledQuotesCount = 0;
  let totalRevenue = 0;
  const details: WixSalesSyncResult['details'] = [];

  const excludedSet = new Set((options?.excludeDocuments || []).map((d) => normalizeDigits(d)));
  const onlySet = options?.onlyForDocuments ? new Set(options.onlyForDocuments.map((d) => normalizeDigits(d))) : null;

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

      const docDigits = normalizeDigits(documentNumber);

      // Filtro de exclusão: ignora clientes divergentes pendentes de decisão
      if (docDigits && excludedSet.has(docDigits)) {
        details.push({
          wixId: wix.id,
          clientName,
          documentNumber,
          action: 'skipped',
          status: 'divergente_retido_aguarda_admin',
        });
        continue;
      }

      // Filtro de inclusão (se especificado)
      if (onlySet && docDigits && !onlySet.has(docDigits)) {
        details.push({
          wixId: wix.id,
          clientName,
          documentNumber,
          action: 'skipped',
          status: 'ignorado_por_filtro',
        });
        continue;
      }

      const email = wix.email ? wix.email.toLowerCase().trim() : (normalizeMaybeString(raw.email)?.toLowerCase().trim() || null);
      const phone = wix.phone ? normalizeDigits(wix.phone) : (normalizeDigits(raw.celular) || normalizeDigits(raw.telefone) || null);
      const rawPartnerCode = (wix.partnerCode || normalizeMaybeString(raw.codigoVenda) || normalizeMaybeString(raw.codigoParceiro) || '').trim().toLowerCase();
      const partnerId = partnerByCodeMap.get(rawPartnerCode) || fallbackPartnerId;
      const corretoraId = 'corretora_net4life_001';

      const classification = classifyWixStatus(wix.statusCliente || wix.status);
      const revenue = extractWixRevenue(raw);
      const coverage = extractWixCoverage(raw);
      const oab = extractWixOab(raw);
      const escritorio = extractWixEscritorio(raw);
      const asaasCustomer = extractWixAsaasCustomer(raw);
      const zapsignToken = extractWixZapSignToken(raw);
      const transactionCode = extractWixTransactionCode(raw, wix.id);
      const urls = extractWixUrls(raw);
      const address = parseWixAddress(raw);
      const installmentsInfo = extractWixInstallments(raw, revenue);

      const rawDateStr =
        parseFlexibleDate(raw._createdDate) ||
        parseFlexibleDate(wix.createdDate) ||
        extractWixCreationDate(raw, { createdDate: wix.createdDate, id: wix.id });
      const wixDate = rawDateStr ? new Date(rawDateStr) : new Date();
      const issueDate = wixDate.toISOString().slice(0, 10);
      const expiryDate = new Date(wixDate.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // 3. Localiza ou cria o cliente segurado em insurance_clients
      let clientId: string | null = null;
      let existingClientCreatedAt: string | null = null;
      if (documentNumber && !documentNumber.startsWith('WIX-')) {
        const [existingClient] = await sql<Array<{ id: string; created_at: string }>>`
          SELECT id, created_at::text FROM insurance_clients WHERE document_number = ${documentNumber} LIMIT 1
        `;
        if (existingClient) {
          clientId = existingClient.id;
          existingClientCreatedAt = existingClient.created_at;
        }
      }
      if (!clientId && wix.id) {
        const [existingByExt] = await sql<Array<{ id: string; created_at: string }>>`
          SELECT id, created_at::text FROM insurance_clients WHERE metadata->>'externalId' = ${wix.id} LIMIT 1
        `;
        if (existingByExt) {
          clientId = existingByExt.id;
          existingClientCreatedAt = existingByExt.created_at;
        }
      }

      const clientCreatedAt = rawDateStr
        ? new Date(rawDateStr)
        : (existingClientCreatedAt ? new Date(existingClientCreatedAt) : wixDate);

      const clientMetaPayload = {
        source: 'wix',
        externalId: wix.id,
        oab,
        escritorio,
        asaasCustomerId: asaasCustomer,
        zapsignToken,
        address,
        wix: raw,
      };

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
            ${JSON.stringify(clientMetaPayload)}::jsonb,
            ${clientCreatedAt},
            NOW()
          )
          ON CONFLICT (document_number)
          DO UPDATE SET
            full_name = EXCLUDED.full_name,
            email = COALESCE(EXCLUDED.email, insurance_clients.email),
            phone = COALESCE(EXCLUDED.phone, insurance_clients.phone),
            ${rawDateStr ? sql`created_at = ${clientCreatedAt},` : sql``}
            metadata = insurance_clients.metadata || EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id
        `;
        clientId = createdClient.id;
      } else {
        // Atualiza cliente existente preservando a data de cadastro original do Wix
        await sql`
          UPDATE insurance_clients
          SET
            full_name = COALESCE(${clientName || null}::text, full_name),
            email = COALESCE(${email || null}::text, email),
            phone = COALESCE(${phone || null}::text, phone),
            ${rawDateStr ? sql`created_at = ${clientCreatedAt},` : sql``}
            metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(clientMetaPayload)}::jsonb,
            updated_at = NOW()
          WHERE id = ${clientId}
        `;
      }

      // Atualiza data_cadastro em leads para refletir a data real do Wix
      if (documentNumber && rawDateStr) {
        await sql`
          UPDATE leads
          SET data_cadastro = ${clientCreatedAt}
          WHERE document_number = ${documentNumber}
             OR external_id = ${wix.id}
        `;
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

      const quoteClientData = {
        oab,
        escritorio,
        codigoAsaas: asaasCustomer,
        tokenZapsign: zapsignToken,
        codigoTransacao: transactionCode,
        installmentCount: installmentsInfo.count,
        paidInstallments: installmentsInfo.paidCount,
        installmentAmount: installmentsInfo.installmentAmount,
        address,
        wix: raw,
        partnerCode: rawPartnerCode,
      };

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
            client_data = COALESCE(client_data, '{}'::jsonb) || ${JSON.stringify(quoteClientData)}::jsonb,
            importancia_segurada = ${coverage},
            premio_calculado = ${revenue},
            premio_final = ${revenue},
            status = ${cotacaoStatus},
            metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ source: 'wix', wixId: wix.id, wix: raw })}::jsonb,
            created_at = ${wixDate},
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
            ${JSON.stringify(quoteClientData)}::jsonb,
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
      let saleId: string | null = null;
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
              created_at = ${wixDate},
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

      // 6. Sincroniza Ordem de Pagamento em PAYMENT_ORDERS
      const orderStatus =
        installmentsInfo.paidCount >= installmentsInfo.count
          ? 'paid'
          : (installmentsInfo.paidCount > 0 ? 'partially_paid' : 'pending');

      const [paymentOrder] = await sql<Array<{ id: string }>>`
        INSERT INTO payment_orders (
          cotacao_id,
          client_id,
          partner_id,
          product_id,
          provider,
          provider_customer_id,
          external_payment_id,
          billing_type,
          status,
          amount_total,
          installment_count,
          paid_installments,
          paid_amount,
          due_date,
          invoice_url,
          bank_slip_url,
          description,
          raw_payload,
          created_at,
          updated_at
        )
        VALUES (
          ${cotacaoId},
          ${clientId},
          ${partnerId},
          ${defaultProductId},
          'asaas',
          ${asaasCustomer},
          ${transactionCode},
          'BOLETO',
          ${orderStatus},
          ${revenue},
          ${installmentsInfo.count},
          ${installmentsInfo.paidCount},
          ${installmentsInfo.paidAmount},
          ${issueDate}::date,
          ${urls.bankSlipUrl},
          ${urls.bankSlipUrl},
          ${'Seguro RC Advogados - ' + clientName},
          ${JSON.stringify({ source: 'wix', wixId: wix.id, transactionCode, raw })}::jsonb,
          ${wixDate},
          NOW()
        )
        ON CONFLICT (cotacao_id)
        DO UPDATE SET
          client_id = EXCLUDED.client_id,
          partner_id = EXCLUDED.partner_id,
          product_id = EXCLUDED.product_id,
          provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, payment_orders.provider_customer_id),
          external_payment_id = COALESCE(EXCLUDED.external_payment_id, payment_orders.external_payment_id),
          amount_total = EXCLUDED.amount_total,
          installment_count = EXCLUDED.installment_count,
          paid_installments = EXCLUDED.paid_installments,
          paid_amount = EXCLUDED.paid_amount,
          status = EXCLUDED.status,
          bank_slip_url = COALESCE(EXCLUDED.bank_slip_url, payment_orders.bank_slip_url),
          invoice_url = COALESCE(EXCLUDED.invoice_url, payment_orders.invoice_url),
          updated_at = NOW()
        RETURNING id
      `;

      if (paymentOrder?.id) {
        ordersCreated++;
        const orderId = paymentOrder.id;

        // 7. Sincroniza Parcelas Individuais em PAYMENT_INSTALLMENTS
        for (let i = 1; i <= installmentsInfo.count; i++) {
          const isPaid = i <= installmentsInfo.paidCount;
          const installmentDueDate = addMonthsToDate(wixDate, i - 1);
          const extInstallmentId = `${transactionCode}-PARC-${i}`;

          await sql`
            INSERT INTO payment_installments (
              payment_order_id,
              cotacao_id,
              client_id,
              provider,
              external_payment_id,
              installment_number,
              status,
              billing_type,
              amount,
              net_amount,
              due_date,
              paid_at,
              bank_slip_url,
              invoice_url,
              raw_payload,
              created_at,
              updated_at
            )
            VALUES (
              ${orderId},
              ${cotacaoId},
              ${clientId},
              'asaas',
              ${extInstallmentId},
              ${i},
              ${isPaid ? 'received' : 'pending'},
              'BOLETO',
              ${installmentsInfo.installmentAmount},
              ${installmentsInfo.installmentAmount},
              ${installmentDueDate}::date,
              ${isPaid ? wixDate : null},
              ${urls.bankSlipUrl},
              ${urls.bankSlipUrl},
              ${JSON.stringify({ source: 'wix', installmentNumber: i, transactionCode })}::jsonb,
              ${wixDate},
              NOW()
            )
            ON CONFLICT (provider, external_payment_id)
            DO UPDATE SET
              status = EXCLUDED.status,
              amount = EXCLUDED.amount,
              due_date = EXCLUDED.due_date,
              paid_at = EXCLUDED.paid_at,
              bank_slip_url = COALESCE(EXCLUDED.bank_slip_url, payment_installments.bank_slip_url),
              invoice_url = COALESCE(EXCLUDED.invoice_url, payment_installments.invoice_url),
              updated_at = NOW()
          `;
          installmentsCreated++;
        }
      }

      // 8. Sincroniza Contrato ZapSign em SIGNATURE_DOCUMENTS
      if (zapsignToken) {
        const isSigned = classification === 'fechado';
        await sql`
          INSERT INTO signature_documents (
            cotacao_id,
            client_id,
            provider,
            external_document_id,
            sign_url,
            signed_file_url,
            status,
            signed_at,
            last_event_type,
            raw_payload,
            created_at,
            updated_at
          )
          VALUES (
            ${cotacaoId},
            ${clientId},
            'zapsign',
            ${zapsignToken},
            ${urls.signedFileUrl},
            ${urls.signedFileUrl},
            ${isSigned ? 'signed' : 'pending'},
            ${isSigned ? wixDate : null},
            ${isSigned ? 'doc_signed' : 'doc_created'},
            ${JSON.stringify({ source: 'wix', token: zapsignToken, raw })}::jsonb,
            ${wixDate},
            NOW()
          )
          ON CONFLICT (provider, external_document_id)
          DO UPDATE SET
            signed_file_url = COALESCE(EXCLUDED.signed_file_url, signature_documents.signed_file_url),
            status = EXCLUDED.status,
            signed_at = COALESCE(EXCLUDED.signed_at, signature_documents.signed_at),
            updated_at = NOW()
        `;
        signaturesCreated++;
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
    ordersCreated,
    installmentsCreated,
    signaturesCreated,
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
    ordersCreated,
    installmentsCreated,
    signaturesCreated,
    pendingQuotesCount,
    canceledQuotesCount,
    totalRevenue,
    durationMs,
    details,
  };
}
