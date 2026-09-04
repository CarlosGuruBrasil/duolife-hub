import { sql } from './pg';
import { logger } from './logger';
import { parseJsonbField } from './json-safe';
import { calcularPrecoServidor } from './pricing';
import { ESTADOS_TERMINAIS } from './cotacao-status';
import { getAsaasConfig } from './system-settings';
import { dispatchDomainEvent } from './triggers/dispatcher';

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
export async function generateAsaasPaymentForQuote(cotacaoId: string): Promise<GeneratePaymentResult> {
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
      cotacao.status !== 'pagamento_gerado'
    ) {
      return {
        ok: false,
        error: `Cotação já está em estado final (${cotacao.status}) — não é possível gerar cobrança`,
      };
    }

    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);

    // 2. Idempotência: já existe uma cobrança gerada para esta cotação
    if (clientData.checkoutId && clientData.linkBoleto) {
      return {
        ok: true,
        checkoutId: clientData.checkoutId,
        linkBoleto: clientData.linkBoleto,
        dueDate: clientData.dataVencimento,
        alreadyExisted: true,
      };
    }

    // 3. Obtém configurações ativas do Asaas (banco system_settings com fallback em env)
    const { apiKey, baseUrl } = await getAsaasConfig();

    if (!apiKey) {
      logger.error({ cotacaoId }, 'asaas.payment.missing_api_key');
      return { ok: false, error: 'Chave da API do Asaas não configurada no sistema' };
    }

    let clienteId = clientData.clienteId;

    // 4. Cadastra o cliente no Asaas se ainda não existir ID
    if (!clienteId) {
      const cleanDoc = String(cotacao.client_cpf_cnpj).replace(/\D/g, '');
      const cleanPhone = clientData.celular ? String(clientData.celular).replace(/\D/g, '') : '';
      const cleanCep = clientData.cep ? String(clientData.cep).replace(/\D/g, '') : '';

      const clientPayload = {
        name: cotacao.client_name,
        cpfCnpj: cleanDoc,
        email: cotacao.client_email || 'suporte@duolife.net.br',
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

    // 5. Prepara os valores e parcelamento — recalculado no servidor
    const tipoDePlano = clientData.tipo || clientData.tipoDePlano || null;
    const preco = await calcularPrecoServidor({
      tipoDePlano,
      qtdParcelasSolicitada: Number(clientData.parcela) || 1,
      cupomCodigo: clientData.cupomCodigo || null,
    });

    if (!preco) {
      logger.error({ cotacaoId: cotacao.id, tipoDePlano }, 'asaas.payment.plano_nao_encontrado');
      return { ok: false, error: 'Não foi possível recalcular o preço do plano — cotação inconsistente' };
    }

    const valorTotal = preco.valorTotal;
    const qtdParcelas = preco.qtdParcelas;
    const valorParcela = preco.valorParcela;

    if (!valorTotal || valorTotal <= 0) {
      logger.error({ cotacaoId: cotacao.id }, 'asaas.payment.valor_invalido');
      return { ok: false, error: 'Cotação sem valor de prêmio calculado — não é possível gerar cobrança' };
    }

    // Data de vencimento: 3 dias a partir de hoje
    const dataVencimento = new Date();
    dataVencimento.setDate(dataVencimento.getDate() + 3);
    const dueDateStr = dataVencimento.toISOString().split('T')[0];

    const descricao = `Seguro RC Advogado - Plano ${clientData.tipo || clientData.tipoDePlano || ''}`;

    // 6. Cria a cobrança ou parcelamento no Asaas
    let paymentPayload: Record<string, any> = {
      customer: clienteId,
      billingType: 'BOLETO', // Boleto híbrido (com PIX incluso)
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
      return { ok: false, error: `Falha ao gerar cobrança no Asaas: ${paymentResText}` };
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
        status = 'pagamento_gerado',
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
        ? await sql<{ nome_fantasia: string; razao_social: string }[]>`
            SELECT nome_fantasia, razao_social FROM partners WHERE id = ${cotacao.partner_id} LIMIT 1
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
        parceiro: {
          nome: partnerRow?.nome_fantasia || partnerRow?.razao_social || 'DuoLife',
        },
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
