import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { authenticateWixRequest, resolvePartnerForWix } from '@/lib/wix-integration-auth';
import { upsertInsuranceClient, ensureSaleForPaidQuote } from '@/lib/insurance-ops';
import { rcAdvogadosConfig } from '@/lib/product-schemas';
import { parseCurrencyToNumber } from '@/lib/format';
import { parseJsonbField } from '@/lib/json-safe';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

function normalizarIdentificadorPlano(val: any): string {
  if (!val) return '100k';
  const str = String(val).toLowerCase().trim();
  if (str.includes('100') || str.includes('100k') || str.includes('cem')) return '100k';
  if (str.includes('200') || str.includes('200k') || str.includes('duzentos')) return '200k';
  if (str.includes('300') || str.includes('300k') || str.includes('trezentos')) return '300k';
  if (str.includes('500') || str.includes('500k') || str.includes('quinhentos')) return '500k';
  return str;
}

function parseNumero(val: any, fallback = 0): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  if (!val) return fallback;
  const str = String(val).replace('R$', '').trim();
  if (str.includes(',')) {
    const num = parseFloat(str.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(num) ? num : fallback;
  }
  const num = parseFloat(str);
  return Number.isFinite(num) ? num : fallback;
}

function normalizarDataIso(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const str = String(val).trim();
  if (str.includes('/')) {
    const partes = str.split('/');
    if (partes.length === 3) {
      const dia = partes[0].padStart(2, '0');
      const mes = partes[1].padStart(2, '0');
      const ano = partes[2];
      return `${ano}-${mes}-${dia}`;
    }
  }
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch (_) {}
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await authenticateWixRequest(req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const rawBody = await req.json().catch(() => ({}));

    // Mapeamento tolerante dos dados recebidos da coleção Import1 ou do formulário Wix
    const nome = String(rawBody.nome || rawBody.clientName || rawBody.name || rawBody.nomeProponente || '').trim();
    const rawCpf = String(
      rawBody.cpf || rawBody.cpfCnpj || rawBody.cnpj || rawBody.clientCpfCnpj || rawBody.cpfProponente || ''
    ).trim();
    const cpfCnpj = rawCpf.replace(/\D/g, '');

    if (!cpfCnpj || (cpfCnpj.length !== 11 && cpfCnpj.length !== 14)) {
      return NextResponse.json(
        { success: false, error: 'CPF ou CNPJ válido é obrigatório para sincronizar a venda.' },
        { status: 400 }
      );
    }

    const email = rawBody.email || rawBody.clientEmail || rawBody.mail || null;
    const celular = rawBody.celular || rawBody.telefone || rawBody.phone || rawBody.whatsapp || null;
    const cleanCelular = celular ? String(celular).replace(/\D/g, '') : null;
    const dataNascto = normalizarDataIso(rawBody.dataNascto || rawBody.dataNascimento || rawBody.birthDate || rawBody.nascimento);

    const cep = rawBody.cep ? String(rawBody.cep).replace(/\D/g, '') : null;
    const logradouro = rawBody.logradouro || rawBody.endereco || rawBody.rua || null;
    const numero = rawBody.numero !== undefined && rawBody.numero !== null ? String(rawBody.numero) : null;
    const complemento = rawBody.complemento || rawBody.comp || null;
    const bairro = rawBody.bairro || null;
    const cidade = rawBody.cidade || rawBody.municipio || null;
    const uf = rawBody.uf || rawBody.estado ? String(rawBody.uf || rawBody.estado).trim().toUpperCase() : null;

    const oab = rawBody.oab || rawBody.oabNumero || rawBody.registroProfissional || null;
    const oabUf = rawBody.oabUf || rawBody.registroProfissionalUf || uf || null;

    const plano = normalizarIdentificadorPlano(
      rawBody.plano || rawBody.tipo || rawBody.tipoDePlano || rawBody.planoId || rawBody.valorCobertura
    );

    const qtdParcelas = Math.max(
      1,
      parseInt(String(rawBody.parcelas || rawBody.qtdParcelas || rawBody.parcela || '1'), 10) || 1
    );

    const planoDef = rcAdvogadosConfig.planos.find((p) => p.tipoDePlano === plano);
    const importanciaSegurada = planoDef ? parseCurrencyToNumber(planoDef.cobertura, 100000) : 100000;

    let valorTotal = parseNumero(rawBody.valor || rawBody.valorTotal || rawBody.premio);
    if (!valorTotal && planoDef) {
      valorTotal = parseCurrencyToNumber(planoDef.parcela, 310);
    }
    const valorParcela = parseNumero(rawBody.valorParcela) || Number((valorTotal / qtdParcelas).toFixed(2));

    // Resolução do Parceiro
    const partnerCode = rawBody.codigoVenda || rawBody.partnerCode || rawBody.vendedor || rawBody.ref || null;
    const partner = await resolvePartnerForWix(partnerCode);

    // Resolução do Produto
    let productId = 'prod-rc-001';
    try {
      const [prodRow] = await sql<any[]>`
        SELECT id FROM products
        WHERE id = 'prod-rc-001' OR flow_key = 'rc-advogados' OR code IN ('RC-ADV-001', 'RC-001')
        LIMIT 1
      `;
      if (prodRow?.id) {
        productId = prodRow.id;
      }
    } catch (err) {
      logger.warn({ err }, 'wix.sincronizar_venda.resolve_product_warn');
    }

    // 1. Upsert em insurance_clients
    const client = await upsertInsuranceClient({
      documentNumber: cpfCnpj,
      fullName: nome || 'Cliente Wix',
      email: email ? String(email).trim().toLowerCase() : null,
      phone: cleanCelular,
      birthDate: dataNascto,
      metadata: {
        origem: 'wix_painel_sincronizacao',
        wixId: rawBody._id || rawBody.wixId || null,
        address: {
          cep,
          logradouro,
          numero,
          complemento,
          bairro,
          cidade,
          uf,
        },
        profissional: {
          oab,
          oabUf,
          escritorioAssociado: rawBody.escritorioAssociado || null,
          titularidade: rawBody.titularidade || null,
        },
      },
    });

    // 2. Localização ou Criação da Cotação
    let existingQuote: any = null;
    const rawCotacaoId = rawBody.cotacaoId || rawBody.quoteId || null;

    if (rawCotacaoId) {
      const [found] = await sql<any[]>`
        SELECT * FROM cotacoes WHERE id = ${rawCotacaoId} LIMIT 1
      `;
      if (found) existingQuote = found;
    }

    if (!existingQuote) {
      const [found] = await sql<any[]>`
        SELECT * FROM cotacoes
        WHERE client_cpf_cnpj = ${cpfCnpj}
          AND product_id = ${productId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (found) existingQuote = found;
    }

    const docToken = rawBody.token || rawBody.docToken || rawBody.contratoToken || null;
    const urlProposta = rawBody.urlProposta || rawBody.signUrl || rawBody.contratoPdf || null;
    const checkoutId = rawBody.checkoutId || rawBody.paymentId || null;
    const installmentId = rawBody.installment || rawBody.installmentId || null;
    const linkBoleto = rawBody.linkBoleto || rawBody.bankSlipUrl || rawBody.invoiceUrl || null;
    const dataVencimento = normalizarDataIso(rawBody.dataVencimento || rawBody.dueDate);

    const statusTexto = `${rawBody.status || ''} ${rawBody.statusGeral || ''} ${rawBody.statusPagamento || ''} ${rawBody.statusCliente || ''}`.toLowerCase();
    const isQuitado =
      statusTexto.includes('quitad') ||
      statusTexto.includes('negócio fechado') ||
      statusTexto.includes('negocio fechado') ||
      statusTexto.includes('em dia') ||
      statusTexto.includes('pago');

    const isAssinado =
      isQuitado ||
      statusTexto.includes('assinado') ||
      Boolean(urlProposta && urlProposta.includes('app.zapsign.com.br'));

    let cotacaoStatus = 'rascunho';
    if (isQuitado) {
      cotacaoStatus = 'aprovada';
    } else if (isAssinado) {
      cotacaoStatus = 'assinado';
    } else if (checkoutId || linkBoleto) {
      cotacaoStatus = 'pagamento_gerado';
    } else if (docToken) {
      cotacaoStatus = 'contrato_gerado';
    }

    const mergedClientData = {
      ...(existingQuote ? parseJsonbField<Record<string, any>>(existingQuote.client_data) : {}),
      ...rawBody,
      nome,
      cpfCnpj,
      email,
      celular: cleanCelular,
      plano,
      tipo: plano,
      tipoDePlano: plano,
      parcela: String(qtdParcelas),
      qtdParcelas,
      valor: valorTotal,
      valorTotal,
      valorParcela,
      formaPagamento: rawBody.formaPagamento || 'BOLETO',
      partnerWixCode: partnerCode,
      partnerId: partner.id,
      partnerName: partner.name,
      corretoraId: partner.corretoraId,
      corretoraNome: partner.corretoraNome,
      origem: 'wix_painel_sincronizacao',
      wixId: rawBody._id || rawBody.wixId || null,
      token: docToken,
      urlProposta,
      checkoutId,
      installment: installmentId,
      linkBoleto,
      dataVencimento,
      dataInicioVigencia: normalizarDataIso(rawBody.inicioVigencia) || normalizarDataIso(rawBody.dataCad) || new Date().toISOString().slice(0, 10),
    };

    let cotacaoId: string;

    if (existingQuote) {
      cotacaoId = existingQuote.id;
      await sql`
        UPDATE cotacoes
        SET
          client_id = ${client.id},
          partner_id = ${partner.id},
          corretora_id = ${partner.corretoraId},
          client_name = ${nome || existingQuote.client_name},
          client_email = COALESCE(${email}, client_email),
          client_phone = COALESCE(${cleanCelular}, client_phone),
          importancia_segurada = COALESCE(${importanciaSegurada}, importancia_segurada),
          premio_calculado = COALESCE(${valorTotal}, premio_calculado),
          premio_final = COALESCE(${valorTotal}, premio_final),
          status = CASE
            WHEN status IN ('aprovada', 'emitida', 'ativa') THEN status
            ELSE ${cotacaoStatus}
          END,
          client_data = ${JSON.stringify(mergedClientData)}::jsonb,
          updated_at = NOW()
        WHERE id = ${cotacaoId}
      `;
    } else {
      const sourceToken = `wix_sync_${crypto.randomUUID().slice(0, 8)}`;
      const [inserted] = await sql<any[]>`
        INSERT INTO cotacoes (
          client_id,
          partner_id,
          corretora_id,
          product_id,
          client_name,
          client_cpf_cnpj,
          client_email,
          client_phone,
          importancia_segurada,
          premio_calculado,
          premio_final,
          status,
          flow_type,
          source_token,
          client_data,
          valid_until,
          created_at,
          updated_at
        )
        VALUES (
          ${client.id},
          ${partner.id},
          ${partner.corretoraId},
          ${productId},
          ${nome || 'Cliente Wix'},
          ${cpfCnpj},
          ${email},
          ${cleanCelular},
          ${importanciaSegurada},
          ${valorTotal},
          ${valorTotal},
          ${cotacaoStatus},
          'wix_s2s',
          ${sourceToken},
          ${JSON.stringify(mergedClientData)}::jsonb,
          CURRENT_DATE + interval '30 days',
          NOW(),
          NOW()
        )
        RETURNING id
      `;
      cotacaoId = inserted.id;
    }

    // 3. Sincroniza Contrato em signature_documents (se houver docToken ou urlProposta)
    if (docToken || urlProposta) {
      try {
        const signStatus = isAssinado ? 'signed' : 'pending';
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
            ${cotacaoId},
            ${client.id},
            'zapsign',
            ${docToken || `doc_${cotacaoId.slice(0, 8)}`},
            ${urlProposta},
            ${isAssinado ? urlProposta : null},
            ${signStatus},
            ${isAssinado ? sql`NOW()` : null},
            NOW(),
            NOW()
          )
          ON CONFLICT (provider, external_document_id) DO UPDATE
          SET
            status = EXCLUDED.status,
            sign_url = COALESCE(EXCLUDED.sign_url, signature_documents.sign_url),
            signed_file_url = COALESCE(EXCLUDED.signed_file_url, signature_documents.signed_file_url),
            signed_at = COALESCE(signature_documents.signed_at, EXCLUDED.signed_at),
            updated_at = NOW()
        `;
      } catch (errSig) {
        logger.warn({ err: errSig, cotacaoId }, 'wix.sincronizar_venda.signature_documents_warn');
      }
    }

    // 4. Sincroniza Cobrança em payment_orders e payment_installments (se houver checkoutId ou installmentId)
    if (checkoutId || installmentId || linkBoleto) {
      try {
        const orderStatus = isQuitado ? 'paid' : 'pending';
        const [order] = await sql<any[]>`
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
            bank_slip_url,
            invoice_url,
            created_at,
            updated_at
          )
          VALUES (
            ${cotacaoId},
            ${client.id},
            ${partner.id},
            ${productId},
            'asaas',
            ${rawBody.clienteId || null},
            ${checkoutId},
            ${installmentId},
            'BOLETO',
            ${orderStatus},
            ${valorTotal},
            ${qtdParcelas},
            ${isQuitado ? qtdParcelas : 0},
            ${isQuitado ? valorTotal : 0},
            ${dataVencimento ? sql`${dataVencimento}::date` : null},
            ${linkBoleto},
            ${linkBoleto},
            NOW(),
            NOW()
          )
          ON CONFLICT (cotacao_id) DO UPDATE
          SET
            external_payment_id = COALESCE(EXCLUDED.external_payment_id, payment_orders.external_payment_id),
            external_installment_id = COALESCE(EXCLUDED.external_installment_id, payment_orders.external_installment_id),
            status = CASE WHEN payment_orders.status = 'paid' THEN 'paid' ELSE EXCLUDED.status END,
            bank_slip_url = COALESCE(EXCLUDED.bank_slip_url, payment_orders.bank_slip_url),
            invoice_url = COALESCE(EXCLUDED.invoice_url, payment_orders.invoice_url),
            paid_installments = GREATEST(payment_orders.paid_installments, EXCLUDED.paid_installments),
            paid_amount = GREATEST(payment_orders.paid_amount, EXCLUDED.paid_amount),
            updated_at = NOW()
          RETURNING id
        `;

        if (order?.id && checkoutId) {
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
              due_date,
              bank_slip_url,
              invoice_url,
              created_at,
              updated_at
            )
            VALUES (
              ${order.id},
              ${cotacaoId},
              ${client.id},
              'asaas',
              ${checkoutId},
              ${installmentId},
              1,
              ${isQuitado ? 'received' : 'pending'},
              'BOLETO',
              ${valorParcela},
              ${dataVencimento ? sql`${dataVencimento}::date` : null},
              ${linkBoleto},
              ${linkBoleto},
              NOW(),
              NOW()
            )
            ON CONFLICT (provider, external_payment_id) DO UPDATE
            SET
              status = EXCLUDED.status,
              bank_slip_url = COALESCE(EXCLUDED.bank_slip_url, payment_installments.bank_slip_url),
              invoice_url = COALESCE(EXCLUDED.invoice_url, payment_installments.invoice_url),
              updated_at = NOW()
          `.catch((err) => logger.warn({ err }, 'wix.sincronizar_venda.payment_installments_warn'));
        }
      } catch (errOrder) {
        logger.warn({ err: errOrder, cotacaoId }, 'wix.sincronizar_venda.payment_orders_warn');
      }
    }

    // 5. Emissão de Venda/Apólice Oficial se a proposta estiver Quitada / Fechada
    let saleId: string | undefined;
    if (isQuitado) {
      try {
        const saleResult = await ensureSaleForPaidQuote({
          cotacaoId,
          clientId: client.id,
          partnerId: partner.id,
          productId,
          importanciaSegurada,
          premioFinal: valorTotal,
        });
        saleId = saleResult?.saleId;
        logger.info(
          { cotacaoId, saleId, created: saleResult?.created },
          'wix.sincronizar_venda.sale_ensured'
        );
      } catch (errSale) {
        logger.error({ err: errSale, cotacaoId }, 'wix.sincronizar_venda.ensureSaleForPaidQuote_falhou');
      }
    }

    logger.info(
      {
        cotacaoId,
        clientId: client.id,
        cpfCnpj,
        partnerId: partner.id,
        saleId,
        isQuitado,
      },
      'wix.sincronizar_venda.sucesso'
    );

    return NextResponse.json({
      ok: true,
      success: true,
      cotacaoId,
      clientId: client.id,
      saleId: saleId || null,
      status: isQuitado ? 'emitida' : cotacaoStatus,
      isQuitado,
    });
  } catch (err: any) {
    logger.error({ err }, 'wix.sincronizar_venda.erro_critico');
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: err?.message || 'Erro interno ao sincronizar venda do Wix.',
      },
      { status: 500 }
    );
  }
}
