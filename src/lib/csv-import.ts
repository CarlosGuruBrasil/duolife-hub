import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { normalizeDigits, normalizeMaybeString } from '@/lib/wix-sync';
import { logger } from '@/lib/logger';
import { parseCsvContent, type RawCsvRow } from './csv-parser';
import {
  loadPartnerResolutionContext,
  resolvePartnerFromCode,
  normalizePartnerKey,
} from './wix-partners-catalog';
import { mapSeguradoFromCsvRow, type SeguradoCsvData } from './csv-row-mapper';

export { parseCsvContent, type RawCsvRow, normalizePartnerKey };
export { mapSeguradoFromCsvRow, type SeguradoCsvData };

export interface CsvImportResult {
  totalRowsProcessed: number;
  clientsCreated: number;
  clientsUpdated: number;
  quotesCreated: number;
  quotesUpdated: number;
  salesCreated: number;
  salesUpdated: number;
  ordersCreated: number;
  installmentsCreated: number;
  signaturesCreated: number;
  errorsCount: number;
  durationMs: number;
  errors: Array<{ row: number; name?: string; doc?: string; message: string }>;
}

/**
 * Converte strings monetárias brasileiras em número ponto flutuante.
 * Ex: "R$ 300.000,00" -> 300000 | "720" -> 720 | "103.33" -> 103.33
 */
export function parseCurrencyNumber(value: string | undefined | null, fallback = 0): number {
  if (!value) return fallback;
  const clean = String(value)
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!clean) return fallback;

  // Se tem vírgula como decimal (ex: 1.250,50 ou 180,00)
  if (clean.includes(',')) {
    const normalized = clean.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(normalized);
    return isNaN(n) ? fallback : n;
  }

  // Se tem apenas pontos ou dígitos normais (ex: 103.33 ou 720)
  const n = parseFloat(clean);
  return isNaN(n) ? fallback : n;
}

/**
 * Normaliza datas em formato ISO ou Date válido.
 */
export function parseDateFlexible(val: string | undefined | null): Date | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;

  try {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  } catch {}

  // Tenta formato brasileiro DD/MM/AAAA
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    const d = new Date(`${year}-${month}-${day}T12:00:00Z`);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Processa um lote de linhas do CSV e persiste nas tabelas relacionais do DuoLife.
 */
export async function processCsvRowsBatch(
  rows: RawCsvRow[],
  options?: { startingRowIndex?: number }
): Promise<CsvImportResult> {
  await ensureSchema();
  const startTime = Date.now();

  let clientsCreated = 0;
  let clientsUpdated = 0;
  let quotesCreated = 0;
  let quotesUpdated = 0;
  let salesCreated = 0;
  let salesUpdated = 0;
  let ordersCreated = 0;
  let installmentsCreated = 0;
  let signaturesCreated = 0;
  let errorsCount = 0;
  const errors: CsvImportResult['errors'] = [];

  // 1. Carrega e indexa parceiros com suporte completo aos 25 códigos do catálogo Wix
  const partnerContext = await loadPartnerResolutionContext();

  // 2. Localiza produto padrão de RC Advogado
  const [defaultProduct] = await sql<Array<{ id: string; code: string; policy_prefix: string | null }>>`
    SELECT id, code, policy_prefix
    FROM products
    WHERE code = 'RC-ADV-001' OR is_active = true
    ORDER BY (code = 'RC-ADV-001') DESC
    LIMIT 1
  `;

  if (!defaultProduct) {
    throw new Error('Nenhum produto de Responsabilidade Civil ativo encontrado no catálogo.');
  }

  const defaultProductId = defaultProduct.id;
  const policyPrefix = defaultProduct.policy_prefix || 'DL-RC';
  const startIdx = options?.startingRowIndex || 1;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = startIdx + idx;

    try {
      const name = normalizeMaybeString(row['Nome']) || 'Cliente Sem Nome';
      const rawCpf = row['Cpf'] || row['CPF'] || row['cpf'] || '';
      const documentNumber = normalizeDigits(rawCpf);

      if (!documentNumber) {
        errorsCount++;
        errors.push({
          row: rowNum,
          name,
          doc: rawCpf,
          message: 'Linha sem CPF/CNPJ válido para identificação do cliente.',
        });
        continue;
      }

      // Bloco cadastral/profissional completo (OAB, celular, nascimento,
      // endereço, vigência, seguro anterior, declarações de sinistro).
      const segurado = mapSeguradoFromCsvRow(row);

      const email = normalizeMaybeString(row['Email'])?.toLowerCase() || null;
      const faturamentoAntes = normalizeMaybeString(row['FaturamentoAntes']) || null;
      const faturamentoDepois = normalizeMaybeString(row['FaturamentoDepois']) || null;
      const asaasCustomerId = normalizeMaybeString(row['ClienteId']) || null;
      const wixId = normalizeMaybeString(row['ID']) || null;
      const wixContactId = normalizeMaybeString(row['Contato ID']) || null;
      const statusGeral = normalizeMaybeString(row['Status Geral']) || 'Pendente de Pagamento';
      const statusPagamento = normalizeMaybeString(row['Status Pagamento']) || 'Pendente';
      const statusCliente = normalizeMaybeString(row['Status Cliente']) || 'Em negociação';
      const rawCodigoVenda = normalizeMaybeString(row['CodigoVenda']);
      const codigoVenda = rawCodigoVenda ? rawCodigoVenda.toLowerCase() : null;

      // Resolução do parceiro
      const partnerId = resolvePartnerFromCode(rawCodigoVenda, partnerContext);

      // Data de criação e vigências
      const createdAtDate =
        parseDateFlexible(row['Created Date']) ||
        parseDateFlexible(row['DataCad-1']) ||
        parseDateFlexible(row['DataCompra']) ||
        new Date();

      const dataCompraDate = parseDateFlexible(row['DataCompra']);
      const vigenciaInicio =
        parseDateFlexible(segurado.dataInicioVigencia) || dataCompraDate || createdAtDate;
      const vigenciaFim =
        parseDateFlexible(segurado.fimVigencia) ||
        new Date(vigenciaInicio.getTime() + 365 * 24 * 60 * 60 * 1000);
      const vigenciaInicioIso = segurado.dataInicioVigencia || vigenciaInicio.toISOString().slice(0, 10);
      const vigenciaFimIso = segurado.fimVigencia || vigenciaFim.toISOString().slice(0, 10);

      // Valores
      const valorTotal = parseCurrencyNumber(row['Valor'], 0);
      const valorCobertura = segurado.valorCobertura;
      const valorParcela = parseCurrencyNumber(row['ValorParcela'], valorTotal);
      const valorLiquido = parseCurrencyNumber(row['ValorLiquido'], valorTotal);
      const parcelasTotal = parseInt(row['Parcela'] || '1', 10) || 1;
      const ultimaParcelaPaga = parseInt(row['Ultima Parcela Paga'] || '0', 10) || 0;
      const nomePlano = segurado.nomePlano || '100k';
      const isRenewal = segurado.isRenovacao === 'Sim';

      // URLs e Tokens
      const urlProposta = normalizeMaybeString(row['UrlProposta']) || null;
      const urlAssinado = normalizeMaybeString(row['UrlAssinado']) || normalizeMaybeString(row['UrlDocAssinado']) || null;
      const urlDocOriginal = normalizeMaybeString(row['UrlDocOriginal']) || null;
      const linkBoleto = normalizeMaybeString(row['LinkBoleto']) || null;
      const checkoutId = normalizeMaybeString(row['CheckoutId']) || null;
      const cobrancaNumero = normalizeMaybeString(row['Cobrança Número']) || null;
      const zapsignToken = normalizeMaybeString(row['Token']) || normalizeMaybeString(row['contratoToken']) || null;
      const franquia = segurado.planoFranquia || 'R$ 3.000,00';

      // Metadados agregados do segurado
      const clientMetadata: Record<string, unknown> = {
        source: 'csv_import',
        importedAt: new Date().toISOString(),
        asaasCustomerId,
        wixId,
        wixContactId,
        statusCliente,
        faturamentoAntes,
        faturamentoDepois,
        codigoVenda,
        planName: nomePlano,
        coverageAmount: valorCobertura,
        codigoWix: segurado.codigoWix,
        lgpd: segurado.lgpd,
        oab: segurado.oab,
        celular: segurado.celular,
        dataNascto: segurado.dataNascto,
        dataAtividade: segurado.dataAtividade,
        endereco: {
          cep: segurado.cep,
          logradouro: segurado.logradouro,
          numero: segurado.numero,
          complemento: segurado.complemento,
          bairro: segurado.bairro,
          cidade: segurado.cidade,
          uf: segurado.uf,
          completo: segurado.enderecoCompleto,
        },
        rawCsvData: row,
      };

      // 3. Upsert em insurance_clients
      const [existingClient] = await sql<Array<{ id: string }>>`
        SELECT id FROM insurance_clients WHERE document_number = ${documentNumber} LIMIT 1
      `;

      const [client] = await sql<Array<{ id: string }>>`
        INSERT INTO insurance_clients (
          document_number,
          document_type,
          full_name,
          email,
          phone,
          birth_date,
          metadata,
          created_at,
          updated_at
        )
        VALUES (
          ${documentNumber},
          ${documentNumber.length > 11 ? 'cnpj' : 'cpf'},
          ${name},
          ${email},
          ${segurado.celularDigits},
          ${segurado.dataNascto},
          ${JSON.stringify(clientMetadata)}::jsonb,
          ${createdAtDate},
          NOW()
        )
        ON CONFLICT (document_number) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          email = COALESCE(EXCLUDED.email, insurance_clients.email),
          phone = COALESCE(EXCLUDED.phone, insurance_clients.phone),
          birth_date = COALESCE(EXCLUDED.birth_date, insurance_clients.birth_date),
          metadata = insurance_clients.metadata || EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `;

      if (!existingClient) {
        clientsCreated++;
      } else {
        clientsUpdated++;
      }

      // 4. Mapeamento de Status da Cotação
      let cotacaoStatus = 'rascunho';
      const statusLower = `${statusGeral} ${statusPagamento} ${statusCliente}`.toLowerCase();
      if (statusLower.includes('fechado') || statusLower.includes('quitado') || statusLower.includes('em dia') || statusLower.includes('vigente')) {
        cotacaoStatus = 'aprovada';
      } else if (statusLower.includes('cancelado')) {
        cotacaoStatus = 'recusada';
      } else if (statusLower.includes('falta pagamento') || statusLower.includes('pendente')) {
        cotacaoStatus = 'pagamento_gerado';
      } else if (urlAssinado || zapsignToken) {
        cotacaoStatus = 'assinado';
      }

      const clientDataObj = {
        nome: name,
        cpfCnpj: documentNumber,
        email,
        faturamentoAntes,
        faturamentoDepois,

        // Dados pessoais / profissionais do proponente
        celular: segurado.celular,
        oab: segurado.oab,
        dataNascto: segurado.dataNascto,
        dataAtividade: segurado.dataAtividade,

        // Endereço
        cep: segurado.cep,
        logradouro: segurado.logradouro,
        numero: segurado.numero,
        complemento: segurado.complemento,
        bairro: segurado.bairro,
        cidade: segurado.cidade,
        uf: segurado.uf,
        enderecoCompleto: segurado.enderecoCompleto,

        // Perfil profissional
        titularidade: segurado.titularidade,
        escritorioAssociado: segurado.escritorioAssociado,
        atuacao: segurado.atuacao,
        ppeCargos: segurado.ppeCargos,
        ppeRepresenta: segurado.ppeRepresenta,
        ppeCargoSelect: segurado.ppeCargoSelect,
        lgpd: segurado.lgpd,

        // Plano e vigência
        tipoDePlano: segurado.tipoDePlano,
        nomePlano,
        valorCobertura,
        planoFranquia: franquia,
        dataInicioVigencia: vigenciaInicioIso,
        fimVigencia: vigenciaFimIso,
        isRenovacao: segurado.isRenovacao,

        // Seguro anterior
        seguradora: segurado.seguradora,
        vigencia: segurado.vigencia,
        limite: segurado.limite,
        franquiaAnterior: segurado.franquiaAnterior,
        premio: segurado.premio,
        dataRetroativa: segurado.dataRetroativa,

        // Declarações de sinistro
        propostaRecusada: segurado.propostaRecusada,
        propostaDetalhe: segurado.propostaDetalhe,
        reclamacaoProfissional: segurado.reclamacaoProfissional,
        reclamacaoDetalhe: segurado.reclamacaoDetalhe,
        investigacaoAutoridade: segurado.investigacaoAutoridade,
        investigacaoDetalhe: segurado.investigacaoDetalhe,
        fatoTerceiros: segurado.fatoTerceiros,
        fatoDetalhe: segurado.fatoDetalhe,
        pagouReclamacao: segurado.pagouReclamacao,
        pagouDetalhe: segurado.pagouDetalhe,

        plano: nomePlano,
        cobertura: valorCobertura,
        franquia,
        parcela: parcelasTotal,
        parcelas: parcelasTotal,
        installmentCount: parcelasTotal,
        valorParcela: valorParcela,
        valor: valorTotal,
        urlProposta,
        urlAssinado,
        linkBoleto,
        contratoToken: zapsignToken,
        origem: 'csv_import',
        codigoVenda,
        codigoWix: segurado.codigoWix,
      };

      // 5. Upsert / Criação de Cotação
      const externalRef = wixId || `CSV-${documentNumber}`;
      const [existingCotacao] = await sql<Array<{ id: string }>>`
        SELECT id FROM cotacoes
        WHERE external_ref = ${externalRef}
           OR (client_cpf_cnpj = ${documentNumber} AND created_at::date = ${createdAtDate.toISOString().slice(0, 10)}::date)
        LIMIT 1
      `;

      let cotacao: { id: string; is_new: boolean };
      if (existingCotacao) {
        await sql`
          UPDATE cotacoes
          SET
            client_id = ${client.id},
            partner_id = ${partnerId},
            product_id = ${defaultProductId},
            client_name = ${name},
            client_cpf_cnpj = ${documentNumber},
            client_email = ${email},
            client_phone = COALESCE(${segurado.celularDigits}, cotacoes.client_phone),
            client_data = COALESCE(client_data, '{}'::jsonb) || ${JSON.stringify(clientDataObj)}::jsonb,
            importancia_segurada = ${valorCobertura},
            premio_calculado = ${valorTotal},
            premio_final = ${valorTotal},
            status = ${cotacaoStatus},
            is_renewal = ${isRenewal},
            updated_at = NOW()
          WHERE id = ${existingCotacao.id}
        `;
        cotacao = { id: existingCotacao.id, is_new: false };
        quotesUpdated++;
      } else {
        const [inserted] = await sql<Array<{ id: string }>>`
          INSERT INTO cotacoes (
            client_id,
            partner_id,
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
            is_renewal,
            external_ref,
            corretora_id,
            created_at,
            updated_at
          )
          VALUES (
            ${client.id},
            ${partnerId},
            ${defaultProductId},
            ${name},
            ${documentNumber},
            ${email},
            ${segurado.celularDigits},
            ${JSON.stringify(clientDataObj)}::jsonb,
            ${valorCobertura},
            ${valorTotal},
            ${valorTotal},
            ${cotacaoStatus},
            ${isRenewal},
            ${externalRef},
            'corretora_net4life_001',
            ${createdAtDate},
            NOW()
          )
          RETURNING id
        `;
        cotacao = { id: inserted.id, is_new: true };
        quotesCreated++;
      }

      // 6. Criação de Venda / Apólice (se o negócio for fechado/vigente/quitado ou se tiver dataCompra/valor pago)
      const isSaleValid =
        cotacaoStatus === 'aprovada' ||
        statusLower.includes('vigente') ||
        statusLower.includes('quitado') ||
        statusLower.includes('em dia') ||
        statusLower.includes('fechado') ||
        ultimaParcelaPaga > 0;

      if (isSaleValid) {
        const policyNumber =
          row['Cobrança Número'] ||
          (wixId ? `WIX-${wixId}` : `${policyPrefix}-${documentNumber.slice(-6)}-${vigenciaInicio.getFullYear()}`);

        const saleStatus = statusLower.includes('cancelado') ? 'cancelada' : 'ativa';

        await sql`
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
            expiry_date,
            corretora_id,
            metadata,
            created_at,
            updated_at
          )
          VALUES (
            ${cotacao.id},
            ${client.id},
            ${partnerId},
            ${defaultProductId},
            ${policyNumber},
            ${valorCobertura},
            ${valorTotal},
            10.0,
            ${(valorTotal * 0.1).toFixed(2)},
            ${saleStatus},
            ${vigenciaInicioIso},
            ${vigenciaFimIso},
            'corretora_net4life_001',
            ${JSON.stringify({
              source: 'csv_import',
              planName: nomePlano,
              tipoDePlano: segurado.tipoDePlano,
              planoFranquia: franquia,
              cobrancaNumero,
              checkoutId,
              asaasCustomerId,
              wixId,
              codigoVenda,
              codigoWix: segurado.codigoWix,
              oab: segurado.oab,
              uf: segurado.uf,
              seguradoraAnterior: segurado.seguradora,
              dataRetroativa: segurado.dataRetroativa,
            })}::jsonb,
            ${createdAtDate},
            NOW()
          )
          ON CONFLICT (policy_number) DO UPDATE SET
            partner_id = EXCLUDED.partner_id,
            cotacao_id = EXCLUDED.cotacao_id,
            client_id = EXCLUDED.client_id,
            status = EXCLUDED.status,
            premio_total = EXCLUDED.premio_total,
            importancia_segurada = EXCLUDED.importancia_segurada,
            issue_date = EXCLUDED.issue_date,
            expiry_date = EXCLUDED.expiry_date,
            metadata = sales.metadata || EXCLUDED.metadata,
            updated_at = NOW()
        `;

        salesCreated++;
      }

      // 7. Criação de Ordem de Pagamento Asaas
      let paymentOrderId: string | null = null;
      if (valorTotal > 0 || checkoutId || cobrancaNumero) {
        const orderStatus =
          statusLower.includes('quitado') || statusLower.includes('em dia')
            ? 'confirmed'
            : statusLower.includes('cancelado')
            ? 'cancelled'
            : 'pending';

        const [pOrder] = await sql<Array<{ id: string }>>`
          INSERT INTO payment_orders (
            cotacao_id,
            client_id,
            partner_id,
            product_id,
            provider,
            provider_customer_id,
            external_payment_id,
            external_installment_id,
            billing_type,
            status,
            amount_total,
            installment_count,
            paid_installments,
            paid_amount,
            due_date,
            invoice_url,
            bank_slip_url,
            raw_payload,
            created_at,
            updated_at
          )
          VALUES (
            ${cotacao.id},
            ${client.id},
            ${partnerId},
            ${defaultProductId},
            'asaas',
            ${asaasCustomerId},
            ${checkoutId},
            ${cobrancaNumero},
            'BOLETO',
            ${orderStatus},
            ${valorTotal},
            ${parcelasTotal},
            ${ultimaParcelaPaga},
            ${ultimaParcelaPaga > 0 ? (valorParcela * ultimaParcelaPaga) : (orderStatus === 'confirmed' ? valorTotal : 0)},
            ${parseDateFlexible(row['DataVencimento'])?.toISOString().slice(0, 10) || null},
            ${linkBoleto},
            ${linkBoleto},
            ${JSON.stringify({ source: 'csv_import', statusPagamento, statusParcela: row['Status Parcela'] })}::jsonb,
            ${createdAtDate},
            NOW()
          )
          ON CONFLICT (cotacao_id) DO UPDATE SET
            status = EXCLUDED.status,
            installment_count = EXCLUDED.installment_count,
            amount_total = EXCLUDED.amount_total,
            paid_installments = EXCLUDED.paid_installments,
            paid_amount = EXCLUDED.paid_amount,
            bank_slip_url = COALESCE(EXCLUDED.bank_slip_url, payment_orders.bank_slip_url),
            invoice_url = COALESCE(EXCLUDED.invoice_url, payment_orders.invoice_url),
            updated_at = NOW()
          RETURNING id
        `;

        paymentOrderId = pOrder.id;
        ordersCreated++;
      }

      // 8. Criação das Parcelas Individuais (payment_installments)
      if (paymentOrderId) {
        // Tenta parsear o array JSON de 'Status Parcela'
        let parsedInstallments: Array<{ parcelaAtual?: number; status?: string; data?: { $date?: string } }> = [];
        try {
          if (row['Status Parcela'] && row['Status Parcela'].startsWith('[')) {
            parsedInstallments = JSON.parse(row['Status Parcela']);
          }
        } catch {}

        if (Array.isArray(parsedInstallments) && parsedInstallments.length > 0) {
          for (let pIdx = 0; pIdx < parsedInstallments.length; pIdx++) {
            const p = parsedInstallments[pIdx];
            const pNum = p.parcelaAtual || pIdx + 1;
            const pStatusRaw = String(p.status || '').toUpperCase();
            let pStatus = 'pending';
            if (pStatusRaw.includes('PAGA') || pStatusRaw.includes('PAGO') || pStatusRaw.includes('CONFIRMED')) {
              pStatus = 'received';
            } else if (pStatusRaw.includes('VENCID')) {
              pStatus = 'overdue';
            } else if (pStatusRaw.includes('DELET') || pStatusRaw.includes('CANCEL')) {
              pStatus = 'cancelled';
            }

            const pPaidDate = p.data?.$date ? parseDateFlexible(p.data.$date) : null;
            const extPayId = checkoutId ? `${checkoutId}_${pNum}` : `CSV-INST-${cotacao.id}-${pNum}`;

            await sql`
              INSERT INTO payment_installments (
                payment_order_id,
                cotacao_id,
                client_id,
                provider,
                external_payment_id,
                external_installment_id,
                installment_number,
                status,
                billing_type,
                amount,
                net_amount,
                paid_at,
                invoice_url,
                bank_slip_url,
                created_at,
                updated_at
              )
              VALUES (
                ${paymentOrderId},
                ${cotacao.id},
                ${client.id},
                'asaas',
                ${extPayId},
                ${cobrancaNumero},
                ${pNum},
                ${pStatus},
                'BOLETO',
                ${valorParcela},
                ${valorLiquido},
                ${pPaidDate},
                ${linkBoleto},
                ${linkBoleto},
                ${createdAtDate},
                NOW()
              )
              ON CONFLICT (provider, external_payment_id) DO UPDATE SET
                status = EXCLUDED.status,
                paid_at = EXCLUDED.paid_at,
                updated_at = NOW()
            `;
            installmentsCreated++;
          }
        } else {
          // Cria parcelas sequenciais baseadas em 'Parcela'
          for (let pNum = 1; pNum <= parcelasTotal; pNum++) {
            const isPaid = pNum <= ultimaParcelaPaga || statusLower.includes('quitado');
            const extPayId = checkoutId ? `${checkoutId}_${pNum}` : `CSV-INST-${cotacao.id}-${pNum}`;

            await sql`
              INSERT INTO payment_installments (
                payment_order_id,
                cotacao_id,
                client_id,
                provider,
                external_payment_id,
                external_installment_id,
                installment_number,
                status,
                billing_type,
                amount,
                net_amount,
                paid_at,
                invoice_url,
                bank_slip_url,
                created_at,
                updated_at
              )
              VALUES (
                ${paymentOrderId},
                ${cotacao.id},
                ${client.id},
                'asaas',
                ${extPayId},
                ${cobrancaNumero},
                ${pNum},
                ${isPaid ? 'received' : 'pending'},
                'BOLETO',
                ${valorParcela},
                ${valorLiquido},
                ${isPaid ? createdAtDate : null},
                ${linkBoleto},
                ${linkBoleto},
                ${createdAtDate},
                NOW()
              )
              ON CONFLICT (provider, external_payment_id) DO UPDATE SET
                status = EXCLUDED.status,
                updated_at = NOW()
            `;
            installmentsCreated++;
          }
        }
      }

      // 9. Criação de Documento ZapSign
      if (zapsignToken || urlDocOriginal || urlAssinado) {
        const signStatus = (urlAssinado || cotacaoStatus === 'aprovada') ? 'signed' : 'pending';
        const extDocId = zapsignToken || `CSV-ZAP-${cotacao.id}`;

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
            created_at,
            updated_at
          )
          VALUES (
            ${cotacao.id},
            ${client.id},
            'zapsign',
            ${extDocId},
            ${urlDocOriginal || urlProposta},
            ${urlAssinado},
            ${signStatus},
            ${signStatus === 'signed' ? createdAtDate : null},
            ${createdAtDate},
            NOW()
          )
          ON CONFLICT (provider, external_document_id) DO UPDATE SET
            signed_file_url = EXCLUDED.signed_file_url,
            status = EXCLUDED.status,
            updated_at = NOW()
        `;
        signaturesCreated++;
      }
    } catch (err) {
      errorsCount++;
      const message = err instanceof Error ? err.message : 'Erro ao processar linha';
      errors.push({
        row: rowNum,
        name: row['Nome'],
        doc: row['Cpf'],
        message,
      });
      logger.error({ err, rowNum }, 'csv_import.row_failed');
    }
  }

  return {
    totalRowsProcessed: rows.length,
    clientsCreated,
    clientsUpdated,
    quotesCreated,
    quotesUpdated,
    salesCreated,
    salesUpdated,
    ordersCreated,
    installmentsCreated,
    signaturesCreated,
    errorsCount,
    durationMs: Date.now() - startTime,
    errors,
  };
}
