import { sql } from './pg';
import { logger } from './logger';
import { parseJsonbField } from './json-safe';
import { calcularPrecoServidor } from './pricing';
import { ESTADOS_TERMINAIS } from './cotacao-status';
import { getAsaasConfig } from './system-settings';
import { dispatchDomainEvent } from './triggers/dispatcher';
import {
  addBusinessDays,
  isDateBeforeToday,
  parseDateSafe,
  getTodayISODate,
  formatToISODate,
  calculateBillingDueDate,
} from './business-days';
import { deleteAsaasPayment, deleteAsaasInstallment } from './asaas-charges';

export interface GeneratePaymentCustomValues {
  valorTotal?: number;
  qtdParcelas?: number;
  dueDate?: string;
  billingType?: 'BOLETO' | 'PIX';
  description?: string;
}

export interface GeneratePaymentOptions {
  isManualAdmin?: boolean;
  customValues?: GeneratePaymentCustomValues;
  forceRecreate?: boolean;
}

export interface GeneratePaymentResult {
  ok: boolean;
  checkoutId?: string;
  linkBoleto?: string;
  dueDate?: string;
  netValue?: number;
  alreadyExisted?: boolean;
  error?: string;
}

function extractPixPayload(pixTransaction: unknown): string | null {
  if (!pixTransaction) return null;
  if (typeof pixTransaction === 'string') return pixTransaction;
  if (typeof pixTransaction === 'object') {
    const obj = pixTransaction as Record<string, unknown>;
    if (typeof obj.payload === 'string') return obj.payload;
    if (typeof obj.qrCode === 'string') return obj.qrCode;
  }
  return null;
}

/**
 * Gera ou recupera cobrança no Asaas para uma cotação.
 * Idempotente: se já existir checkoutId gravado para a cotação, retorna os dados existentes.
 */
export async function generateAsaasPaymentForQuote(
  cotacaoId: string,
  options?: GeneratePaymentOptions
): Promise<GeneratePaymentResult> {
  try {
    // 1. Busca a cotação no banco
    const [cotacao] = await sql<any[]>`
      SELECT * FROM cotacoes WHERE id = ${cotacaoId} LIMIT 1
    `;

    if (!cotacao) {
      return { ok: false, error: 'Cotação não encontrada' };
    }

    if (
      ESTADOS_TERMINAIS.includes(cotacao.status) &&
      cotacao.status !== 'assinado' &&
      cotacao.status !== 'pagamento_gerado' &&
      !options?.isManualAdmin
    ) {
      return {
        ok: false,
        error: `Cotação já está em estado final (${cotacao.status}) — não é possível gerar cobrança`,
      };
    }

    // Se já houver apólice emitida em sales, não permitir recriação acidental
    const [existingSale] = await sql<any[]>`
      SELECT id, status FROM sales WHERE cotacao_id = ${cotacao.id} LIMIT 1
    `;
    if (existingSale && !options?.isManualAdmin) {
      return {
        ok: false,
        error: 'Esta cotação já possui apólice/venda emitida e não pode ter a cobrança regerada.',
      };
    }

    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);

    // 2. Tratamento de recriação forçada (cancelando cobrança anterior no Asaas e banco)
    if (options?.forceRecreate) {
      const [existingOrderToCancel] = await sql<any[]>`
        SELECT id, status, external_payment_id, external_installment_id
        FROM payment_orders
        WHERE cotacao_id = ${cotacao.id}
        LIMIT 1
      `;
      if (existingOrderToCancel) {
        const isPaid = ['paid', 'received', 'confirmed', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(
          existingOrderToCancel.status
        );
        if (isPaid) {
          return {
            ok: false,
            error: 'Esta cobrança já foi compensada/paga no Asaas e não pode ser cancelada ou substituída.',
          };
        }

        // Deleta no Asaas
        if (existingOrderToCancel.external_installment_id) {
          await deleteAsaasInstallment(existingOrderToCancel.external_installment_id).catch(() => {});
        } else if (existingOrderToCancel.external_payment_id) {
          await deleteAsaasPayment(existingOrderToCancel.external_payment_id).catch(() => {});
        }

        // Limpa registros locais vinculados
        await sql.begin(async (tx) => {
          await tx`DELETE FROM delinquency_notifications WHERE payment_order_id = ${existingOrderToCancel.id}`;
          await tx`DELETE FROM payment_installments WHERE payment_order_id = ${existingOrderToCancel.id}`;
          await tx`DELETE FROM payment_orders WHERE id = ${existingOrderToCancel.id}`;
        });

        delete clientData.checkoutId;
        delete clientData.linkBoleto;
        delete clientData.dataVencimento;
        delete clientData.faturaId;
        delete clientData.externalInstallmentId;
      }
    } else if (!options?.customValues) {
      // Idempotência padrão: só aplica quando não for customValues e não for forceRecreate
      if (clientData.checkoutId && clientData.linkBoleto) {
        await sql`
          UPDATE cotacoes
          SET
            status = CASE
              WHEN status IN ('rascunho', 'enviada', 'contrato_gerado', 'assinado') THEN 'pagamento_gerado'
              ELSE status
            END,
            updated_at = NOW()
          WHERE id = ${cotacao.id}
        `;
        return {
          ok: true,
          checkoutId: clientData.checkoutId,
          linkBoleto: clientData.linkBoleto,
          dueDate: clientData.dataVencimento,
          alreadyExisted: true,
        };
      }

      const [existingOrder] = await sql<any[]>`
        SELECT external_payment_id, invoice_url, bank_slip_url, due_date
        FROM payment_orders
        WHERE cotacao_id = ${cotacao.id}
        LIMIT 1
      `;
      if (existingOrder && (existingOrder.bank_slip_url || existingOrder.invoice_url)) {
        const existingLink = existingOrder.bank_slip_url || existingOrder.invoice_url;
        clientData.checkoutId = existingOrder.external_payment_id;
        clientData.linkBoleto = existingLink;
        clientData.dataVencimento = existingOrder.due_date;
        await sql`
          UPDATE cotacoes
          SET
            status = CASE
              WHEN status IN ('rascunho', 'enviada', 'contrato_gerado', 'assinado') THEN 'pagamento_gerado'
              ELSE status
            END,
            client_data = ${JSON.stringify(clientData)}::jsonb,
            updated_at = NOW()
          WHERE id = ${cotacao.id}
        `;
        return {
          ok: true,
          checkoutId: existingOrder.external_payment_id,
          linkBoleto: existingLink,
          dueDate: existingOrder.due_date,
          alreadyExisted: true,
        };
      }
    } else {
      // Quando customValues é fornecido sem forceRecreate, verifica se já existe cobrança ativa
      const [existingOrder] = await sql<any[]>`
        SELECT external_payment_id, invoice_url, bank_slip_url, due_date, status
        FROM payment_orders
        WHERE cotacao_id = ${cotacao.id}
        LIMIT 1
      `;
      if (existingOrder && (existingOrder.external_payment_id || clientData.checkoutId)) {
        const isPaid = ['paid', 'received', 'confirmed', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(
          existingOrder.status
        );
        if (isPaid) {
          return {
            ok: false,
            error: 'Esta cotação já possui uma cobrança com pagamento confirmado/pago.',
            alreadyExisted: true,
          };
        }
        return {
          ok: false,
          error: 'Já existe uma cobrança gerada para esta cotação. Confirme a substituição para cancelar a anterior e emitir a nova.',
          checkoutId: existingOrder.external_payment_id || clientData.checkoutId,
          linkBoleto: existingOrder.bank_slip_url || existingOrder.invoice_url || clientData.linkBoleto,
          dueDate: existingOrder.due_date || clientData.dataVencimento,
          alreadyExisted: true,
        };
      }
    }

    // 3. Obtém configurações ativas do Asaas (banco system_settings com fallback em env)
    const { apiKey, baseUrl } = await getAsaasConfig();

    if (!apiKey) {
      logger.error({ cotacaoId }, 'asaas.payment.missing_api_key');
      return { ok: false, error: 'Chave da API do Asaas não configurada no sistema' };
    }

    let clienteId = clientData.clienteId;

    // 4. Cadastra ou recupera o cliente no Asaas se ainda não existir ID
    if (!clienteId) {
      const cleanDoc = String(cotacao.client_cpf_cnpj).replace(/\D/g, '');
      const rawPhone = clientData.celular || clientData.telefone || cotacao.client_phone || '';
      const cleanPhone = rawPhone ? String(rawPhone).replace(/\D/g, '') : '';
      const cleanCep = clientData.cep ? String(clientData.cep).replace(/\D/g, '') : '';

      // Verifica se o cliente já existe no Asaas antes de tentar criar
      if (cleanDoc) {
        try {
          const findCustRes = await fetch(`${baseUrl}/customers?cpfCnpj=${cleanDoc}`, {
            headers: { 'access_token': apiKey },
          });
          if (findCustRes.ok) {
            const findCustJson = await findCustRes.json();
            if (findCustJson.data && findCustJson.data.length > 0 && findCustJson.data[0]?.id) {
              clienteId = findCustJson.data[0].id;
              clientData.clienteId = clienteId;
            }
          }
        } catch (findErr) {
          logger.warn({ findErr, cotacaoId: cotacao.id }, 'asaas.payment.find_customer_warn');
        }
      }

      if (!clienteId) {
        const clientPayload = {
          name: cotacao.client_name,
          cpfCnpj: cleanDoc,
          email: cotacao.client_email || clientData.email || 'suporte@duolife.net.br',
          mobilePhone: cleanPhone,
          address: clientData.logradouro || '',
          addressNumber: String(clientData.numero || ''),
          complement: clientData.complemento || '',
          province: clientData.bairro || '',
          postalCode: cleanCep,
          notificationDisabled: true, // Notificações gerenciadas pelo motor DuoLife
        };

        const clientRes = await fetch(`${baseUrl}/customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access_token': apiKey,
          },
          body: JSON.stringify(clientPayload),
        });

        const clientResText = await clientRes.text();

        if (!clientRes.ok) {
          logger.error({ status: clientRes.status, body: clientResText }, 'asaas.payment.customer_failed');
          return { ok: false, error: `Falha ao cadastrar cliente no Asaas: ${clientResText}` };
        }

        const clientJson = JSON.parse(clientResText);
        clienteId = clientJson.id;
        if (!clienteId) {
          logger.error({ cotacaoId: cotacao.id, body: clientResText }, 'asaas.payment.customer_sem_id');
          return { ok: false, error: 'Resposta inesperada da Asaas ao cadastrar cliente' };
        }
        clientData.clienteId = clienteId;
      }
    }

    // 5. Prepara os valores e parcelamento — recalculado no servidor ou obtido de customValues
    const tipoDePlano = clientData.tipo || clientData.tipoDePlano || clientData.nomePlano || clientData.plano || null;
    let valorTotal = 0;
    let qtdParcelas = 1;
    let valorParcela = 0;

    if (options?.customValues?.valorTotal !== undefined && options.customValues.valorTotal > 0) {
      valorTotal = Math.round(options.customValues.valorTotal * 100) / 100;
      qtdParcelas = Math.max(1, Math.floor(Number(options.customValues.qtdParcelas || 1)));
      valorParcela = qtdParcelas > 1 ? Math.round((valorTotal / qtdParcelas) * 100) / 100 : valorTotal;
    } else {
      const preco = await calcularPrecoServidor({
        tipoDePlano,
        qtdParcelasSolicitada: Number(clientData.parcela) || 1,
        cupomCodigo: clientData.cupomCodigo || null,
        descontoManualPercent: Number(clientData.descontoManualPercent ?? clientData.descontoPercentual) || 0,
      });

      valorTotal = preco ? Math.round(preco.valorTotal * 100) / 100 : 0;
      qtdParcelas = preco ? preco.qtdParcelas : (Number(clientData.parcela) || 1);
      valorParcela = preco ? Math.round(preco.valorParcela * 100) / 100 : 0;

      // Fallback de segurança para cotações com contrato já assinado no banco:
      if ((!valorTotal || valorTotal <= 0) && (cotacao.premio_final || cotacao.premio_calculado)) {
        valorTotal = Number(cotacao.premio_final || cotacao.premio_calculado);
        qtdParcelas = Number(clientData.parcela) || 1;
        valorParcela = qtdParcelas > 1 ? Math.round((valorTotal / qtdParcelas) * 100) / 100 : valorTotal;
      }
    }

    if (!valorTotal || valorTotal <= 0) {
      logger.error({ cotacaoId: cotacao.id, tipoDePlano }, 'asaas.payment.valor_invalido');
      return { ok: false, error: 'Cotação sem valor de prêmio calculado — não é possível gerar cobrança' };
    }

    // Regra de Data de Vencimento e Permissão:
    let dueDateStr: string;

    if (options?.customValues?.dueDate) {
      const cleanDue = options.customValues.dueDate.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDue)) {
        return { ok: false, error: 'Data de vencimento inválida. Use o formato AAAA-MM-DD.' };
      }
      dueDateStr = cleanDue;
    } else {
      let rawAssinatura = clientData.assinadoEm || clientData.dataAssinatura || clientData.signedAt;
      if (!rawAssinatura) {
        const [sigDoc] = await sql<{ signed_at: string | Date | null }[]>`
          SELECT signed_at
          FROM signature_documents
          WHERE cotacao_id = ${cotacao.id} AND provider = 'zapsign' AND signed_at IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 1
        `;
        if (sigDoc?.signed_at) {
          rawAssinatura = sigDoc.signed_at;
        }
      }

      const dueDateCalc = calculateBillingDueDate({
        rawVigencia: clientData.dataInicioVigencia || clientData.vigencia || clientData.dataVigencia,
        rawAssinatura,
        createdAt: cotacao.created_at,
        isManualAdmin: options?.isManualAdmin,
      });

      if (!dueDateCalc.ok || !dueDateCalc.dueDate) {
        if (options?.isManualAdmin) {
          dueDateStr = addBusinessDays(getTodayISODate(), 2);
        } else {
          logger.warn(
            {
              cotacaoId: cotacao.id,
              vigencia: dueDateCalc.vigenciaIso,
              assinatura: dueDateCalc.assinaturaIso,
              reason: dueDateCalc.reason,
            },
            'asaas.payment.blocked_by_due_date_rule'
          );
          return {
            ok: false,
            error: dueDateCalc.error || 'Não foi possível calcular a data de vencimento da cobrança.',
          };
        }
      } else {
        dueDateStr = dueDateCalc.dueDate;
      }
    }

    const billingType = options?.customValues?.billingType || 'BOLETO';
    const descricao = options?.customValues?.description?.trim() || `Seguro RC Advogado - Plano ${tipoDePlano || ''}`;

    // 6. Cria a cobrança ou parcelamento no Asaas
    let paymentPayload: Record<string, any> = {
      customer: clienteId,
      billingType,
      dueDate: dueDateStr,
      description: descricao,
    };

    if (qtdParcelas > 1) {
      paymentPayload = {
        ...paymentPayload,
        value: valorParcela,
        installmentCount: qtdParcelas,
        installmentValue: valorParcela,
      };
    } else {
      paymentPayload = {
        ...paymentPayload,
        value: valorTotal,
      };
    }

    const paymentRes = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentResText = await paymentRes.text();

    if (!paymentRes.ok) {
      logger.error({ status: paymentRes.status, body: paymentResText }, 'asaas.payment.payment_failed');
      let errorMsg = `Falha ao gerar cobrança no Asaas (HTTP ${paymentRes.status})`;
      try {
        const errJson = JSON.parse(paymentResText);
        if (Array.isArray(errJson.errors) && errJson.errors.length > 0) {
          errorMsg = errJson.errors[0]?.description || errJson.errors[0]?.message || errorMsg;
        } else if (errJson.message) {
          errorMsg = String(errJson.message);
        }
      } catch {}
      return { ok: false, error: errorMsg };
    }

    const paymentJson = JSON.parse(paymentResText);

    // Se for parcelado, buscamos as cobranças filhas
    let checkoutId = paymentJson.id;
    let linkBoleto = paymentJson.bankSlipUrl || paymentJson.invoiceUrl;
    let netValue = paymentJson.netValue;
    let installmentsPayload = [paymentJson];
    let externalInstallmentId = paymentJson.installment || null;

    if (qtdParcelas > 1 && paymentJson.installment) {
      externalInstallmentId = paymentJson.installment;
      checkoutId = paymentJson.id;

      try {
        const listRes = await fetch(`${baseUrl}/payments?installment=${paymentJson.installment}`, {
          headers: { 'access_token': apiKey },
        });
        if (listRes.ok) {
          const listJson = await listRes.json();
          if (listJson.data && listJson.data.length > 0) {
            const sorted = listJson.data.sort(
              (a: any, b: any) => (a.installmentNumber || 0) - (b.installmentNumber || 0)
            );
            installmentsPayload = sorted;
            linkBoleto = sorted[0].bankSlipUrl || sorted[0].invoiceUrl;
            checkoutId = sorted[0].id || checkoutId;
            netValue = sorted.reduce((sum: number, item: any) => sum + (Number(item.netValue) || 0), 0);
          }
        }
      } catch (err) {
        logger.error({ err }, 'asaas.payment.fetch_installments_failed');
      }
    }

    // 7. Grava a ordem de pagamento
    const [paymentOrder] = await sql<{ id: string }[]>`
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
        due_date,
        invoice_url,
        bank_slip_url,
        description,
        raw_payload,
        updated_at
      )
      VALUES (
        ${cotacao.id},
        ${cotacao.client_id || null},
        ${cotacao.partner_id},
        ${cotacao.product_id},
        'asaas',
        ${clienteId},
        ${paymentJson.id || null},
        ${externalInstallmentId},
        ${paymentJson.billingType || 'BOLETO'},
        ${String(paymentJson.status || 'PENDING').toLowerCase()},
        ${valorTotal},
        ${qtdParcelas},
        ${dueDateStr},
        ${paymentJson.invoiceUrl || null},
        ${paymentJson.bankSlipUrl || null},
        ${descricao},
        ${JSON.stringify(paymentJson)}::jsonb,
        NOW()
      )
      ON CONFLICT (cotacao_id)
      DO UPDATE SET
        provider_customer_id = EXCLUDED.provider_customer_id,
        external_payment_id = EXCLUDED.external_payment_id,
        external_installment_id = EXCLUDED.external_installment_id,
        billing_type = EXCLUDED.billing_type,
        status = EXCLUDED.status,
        amount_total = EXCLUDED.amount_total,
        installment_count = EXCLUDED.installment_count,
        due_date = EXCLUDED.due_date,
        invoice_url = EXCLUDED.invoice_url,
        bank_slip_url = EXCLUDED.bank_slip_url,
        description = EXCLUDED.description,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING id
    `;

    const paymentOrderId = paymentOrder?.id;

    if (paymentOrderId) {
      for (const installment of installmentsPayload) {
        if (!installment.id) {
          logger.error({ installment, cotacaoId: cotacao.id }, 'asaas.payment.installment_sem_id');
          continue;
        }
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
            due_date,
            invoice_url,
            bank_slip_url,
            pix_qr_code_url,
            raw_payload,
            updated_at
          )
          VALUES (
            ${paymentOrderId},
            ${cotacao.id},
            ${cotacao.client_id || null},
            'asaas',
            ${installment.id},
            ${installment.installment || paymentJson.installment || null},
            ${Number(installment.installmentNumber) || 1},
            ${String(installment.status || 'PENDING').toLowerCase()},
            ${installment.billingType || paymentJson.billingType || 'BOLETO'},
            ${Number(installment.value) || valorParcela},
            ${Number(installment.netValue) || null},
            ${installment.dueDate || dueDateStr},
            ${installment.invoiceUrl || null},
            ${installment.bankSlipUrl || null},
            ${extractPixPayload(installment.pixTransaction) || installment.pixQrCodeUrl || null},
            ${JSON.stringify(installment)}::jsonb,
            NOW()
          )
          ON CONFLICT (provider, external_payment_id)
          DO UPDATE SET
            status = EXCLUDED.status,
            net_amount = EXCLUDED.net_amount,
            due_date = EXCLUDED.due_date,
            invoice_url = EXCLUDED.invoice_url,
            bank_slip_url = EXCLUDED.bank_slip_url,
            pix_qr_code_url = EXCLUDED.pix_qr_code_url,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = NOW()
        `;
      }
    }

    // 8. Atualiza a cotação no Banco
    clientData.checkoutId = checkoutId;
    clientData.linkBoleto = linkBoleto;
    clientData.dataVencimento = dueDateStr;
    clientData.paymentOrderId = paymentOrderId || null;
    clientData.externalInstallmentId = externalInstallmentId;

    await sql`
      UPDATE cotacoes
      SET
        status = CASE
          WHEN status IN ('aprovada', 'emitida') THEN status
          ELSE 'pagamento_gerado'
        END,
        premio_final = ${valorTotal},
        client_data = ${JSON.stringify(clientData)}::jsonb,
        updated_at = NOW()
      WHERE id = ${cotacao.id}
    `;

    // 9. Dispara evento de domínio FATURA_GERADA para envio de e-mail ao cliente
    try {
      const [clientRow] = cotacao.client_id
        ? await sql<{ full_name: string; email: string; document_number: string; phone: string }[]>`
            SELECT full_name, email, document_number, phone FROM insurance_clients WHERE id = ${cotacao.client_id} LIMIT 1
          `
        : [];

      const [partnerRow] = cotacao.partner_id
        ? await sql<{ nome: string; email: string; codigo_venda?: string }[]>`
            SELECT
              COALESCE(p.nome_fantasia, p.razao_social) AS nome,
              COALESCE(NULLIF(p.email, ''), pu.email) AS email,
              p.metadata->'whiteLabel'->>'wixCode' AS codigo_venda
            FROM partners p
            LEFT JOIN partner_users pu ON pu.partner_id = p.id AND pu.is_active = true
            WHERE p.id = ${cotacao.partner_id}
            ORDER BY pu.created_at ASC
            LIMIT 1
          `
        : [];

      // Busca vendedor responsável pela proposta (partner_users)
      const [vendedorRow] = cotacao.partner_user_id
        ? await sql<{ id: string; nome: string; email: string }[]>`
            SELECT id, name AS nome, email
            FROM partner_users
            WHERE id = ${cotacao.partner_user_id}
            LIMIT 1
          `
        : [];

      const formattedDueDate = dueDateStr.split('-').reverse().join('/');

      await dispatchDomainEvent('FATURA_GERADA', {
        eventType: 'FATURA_GERADA',
        contextId: cotacao.id,
        cliente: {
          nome: clientRow?.full_name || cotacao.client_name,
          email: clientRow?.email || cotacao.client_email || clientData.email,
          documento: clientRow?.document_number || cotacao.client_cpf_cnpj,
          telefone: clientRow?.phone || clientData.celular || cotacao.client_phone,
        },
        cotacao: {
          id: cotacao.id,
          status: 'pagamento_gerado',
          premio_final: Number(valorTotal) || 0,
          cobertura: Number(cotacao.importancia_segurada) || 0,
          produto_nome: 'Seguro RC Profissional',
        },
        transacao: {
          id: checkoutId,
          link_fatura: linkBoleto,
          vencimento: formattedDueDate,
          valor: valorTotal,
          forma_pagamento: 'BOLETO',
          status: 'PENDING',
        },
        vendedor: vendedorRow
          ? {
              id: vendedorRow.id,
              nome: vendedorRow.nome,
              email: vendedorRow.email,
            }
          : partnerRow
          ? {
              id: cotacao.partner_user_id || cotacao.partner_id,
              nome: partnerRow.nome,
              email: partnerRow.email,
            }
          : undefined,
        parceiro: partnerRow ? {
          id: cotacao.partner_id,
          nome: partnerRow.nome,
          email: partnerRow.email,
          codigoVenda: partnerRow.codigo_venda,
        } : undefined,
        dados: {
          checkoutId,
          link_fatura: linkBoleto,
          vencimento: formattedDueDate,
          valor: valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          qtdParcelas,
          valorParcela: valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        },
      });
    } catch (dispatchErr) {
      logger.error({ dispatchErr, cotacaoId: cotacao.id }, 'asaas.payment.dispatch_event_failed');
    }

    return {
      ok: true,
      checkoutId,
      linkBoleto,
      dueDate: dueDateStr,
      netValue,
    };
  } catch (err: unknown) {
    logger.error({ err, cotacaoId }, 'asaas.payment.unexpected_failed');
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro interno ao gerar cobrança no Asaas',
    };
  }
}
