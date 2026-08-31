import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';
import { parseJsonbField } from '@/lib/json-safe';
import { calcularPrecoServidor } from '@/lib/pricing';
import { ESTADOS_TERMINAIS } from '@/lib/cotacao-status';

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const publicToken = req.headers.get('x-public-token');
  let targetPartnerId: string | null = null;
  let user = null;

  if (publicToken) {
    const [link] = await sql`
      SELECT partner_id
      FROM public_sale_links
      WHERE token = ${publicToken} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
    `;
    if (!link) return Response.json({ error: 'Token público inválido ou expirado' }, { status: 401 });
    targetPartnerId = link.partner_id;
  } else {
    user = await verifyAuth();
    if (!user) return unauthorized();
    targetPartnerId = user.partnerId;
  }

  const { id } = await params;

  try {
    // 1. Busca a cotação
    const cotacao = publicToken
      ? (await sql`SELECT * FROM cotacoes WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${targetPartnerId}`)[0]
      : await getAccessibleQuoteById(id, user!);

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    if (ESTADOS_TERMINAIS.includes(cotacao.status)) {
      return Response.json({ error: `Cotação já está em estado final (${cotacao.status}) — não é possível gerar cobrança` }, { status: 422 });
    }

    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);
    const asaasKey = process.env.ASAAS_API_KEY;
    const asaasBaseUrl = process.env.ASAAS_BASE_URL || 'https://sandbox.asaas.com/api/v3';

    if (!asaasKey) {
      return Response.json({ error: 'Chave do Asaas não configurada' }, { status: 500 });
    }

    let clienteId = clientData.clienteId;

    // 2. Cadastra o cliente no Asaas se ainda não existir ID
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
        notificationDisabled: true
      };

      const clientRes = await fetch(`${asaasBaseUrl}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': asaasKey
        },
        body: JSON.stringify(clientPayload)
      });

      const clientResText = await clientRes.text();

      if (!clientRes.ok) {
        logger.error({ status: clientRes.status, body: clientResText }, 'api.portal.gerar-pagamento.asaas_customer_failed');
        return Response.json({ error: `Falha ao cadastrar cliente no Asaas: ${clientResText}` }, { status: 400 });
      }

      const clientJson = JSON.parse(clientResText);
      clienteId = clientJson.id;
      if (!clienteId) {
        logger.error({ cotacaoId: cotacao.id, body: clientResText }, 'api.portal.gerar-pagamento.asaas_customer_sem_id');
        return Response.json({ error: 'Resposta inesperada da Asaas ao cadastrar cliente' }, { status: 502 });
      }
      clientData.clienteId = clienteId;
    }

    // 3. Prepara os valores e parcelamento — recalculado no servidor a partir da tabela real de
    // planos/cupom, nunca aceito de clientData.valor/valorParcela (esses vêm do cliente e são forjáveis).
    const tipoDePlano = clientData.tipo || clientData.tipoDePlano || null;
    const preco = await calcularPrecoServidor({
      tipoDePlano,
      qtdParcelasSolicitada: Number(clientData.parcela) || 1,
      cupomCodigo: clientData.cupomCodigo || null,
    });

    if (!preco) {
      logger.error({ cotacaoId: cotacao.id, tipoDePlano }, 'api.portal.gerar-pagamento.plano_nao_encontrado');
      return Response.json({ error: 'Não foi possível recalcular o preço do plano — cotação inconsistente' }, { status: 422 });
    }

    const valorTotal = preco.valorTotal;
    const qtdParcelas = preco.qtdParcelas;
    const valorParcela = preco.valorParcela;

    if (!valorTotal || valorTotal <= 0) {
      logger.error({ cotacaoId: cotacao.id }, 'api.portal.gerar-pagamento.valor_invalido');
      return Response.json({ error: 'Cotação sem valor de prêmio calculado — não é possível gerar cobrança' }, { status: 422 });
    }

    // Idempotência: já existe uma cobrança gerada para esta cotação, não cria outra no Asaas.
    if (clientData.checkoutId) {
      return Response.json({
        ok: true,
        checkoutId: clientData.checkoutId,
        linkBoleto: clientData.linkBoleto,
        dueDate: clientData.dataVencimento,
        alreadyExisted: true,
      });
    }

    // Data de vencimento: 3 dias a partir de hoje
    const dataVencimento = new Date();
    dataVencimento.setDate(dataVencimento.getDate() + 3);
    const dueDateStr = dataVencimento.toISOString().split('T')[0];

    const descricao = `Seguro RC Advogado - Plano ${clientData.tipo || clientData.tipoDePlano || ''}`;

    // 4. Cria a cobrança ou parcelamento no Asaas
    let paymentPayload: Record<string, any> = {
      customer: clienteId,
      billingType: 'BOLETO', // Boleto híbrido (com PIX incluso)
      dueDate: dueDateStr,
      description: descricao
    };

    if (qtdParcelas > 1) {
      paymentPayload = {
        ...paymentPayload,
        value: valorParcela,
        installmentCount: qtdParcelas,
        installmentValue: valorParcela
      };
    } else {
      paymentPayload = {
        ...paymentPayload,
        value: valorTotal
      };
    }

    const paymentRes = await fetch(`${asaasBaseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': asaasKey
      },
      body: JSON.stringify(paymentPayload)
    });

    const paymentResText = await paymentRes.text();

    if (!paymentRes.ok) {
      logger.error({ status: paymentRes.status, body: paymentResText }, 'api.portal.gerar-pagamento.asaas_payment_failed');
      return Response.json({ error: `Falha ao gerar cobrança no Asaas: ${paymentResText}` }, { status: 400 });
    }

    const paymentJson = JSON.parse(paymentResText);

    // Se for parcelado, buscamos as cobranças filhas para rastrear cada parcela.
    let checkoutId = paymentJson.id;
    let linkBoleto = paymentJson.bankSlipUrl || paymentJson.invoiceUrl;
    let netValue = paymentJson.netValue;
    let installmentsPayload = [paymentJson];
    let externalInstallmentId = paymentJson.installment || null;

    if (qtdParcelas > 1 && paymentJson.installment) {
      externalInstallmentId = paymentJson.installment;
      checkoutId = paymentJson.id;

      try {
        const listRes = await fetch(`${asaasBaseUrl}/payments?installment=${paymentJson.installment}`, {
          headers: { 'access_token': asaasKey }
        });
        if (listRes.ok) {
          const listJson = await listRes.json();
          if (listJson.data && listJson.data.length > 0) {
            const sorted = listJson.data.sort((a: any, b: any) => (a.installmentNumber || 0) - (b.installmentNumber || 0));
            installmentsPayload = sorted;
            linkBoleto = sorted[0].bankSlipUrl || sorted[0].invoiceUrl;
            checkoutId = sorted[0].id || checkoutId;
            netValue = sorted.reduce((sum: number, item: any) => sum + (Number(item.netValue) || 0), 0);
          }
        }
      } catch (err) {
        logger.error({ err }, 'api.portal.gerar-pagamento.fetch_installments_failed');
      }
    }

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
          logger.error({ installment, cotacaoId: cotacao.id }, 'api.portal.gerar-pagamento.installment_sem_id');
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

    // 5. Atualiza a cotação no Banco
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

    return Response.json({
      ok: true,
      checkoutId,
      linkBoleto,
      dueDate: dueDateStr,
      netValue
    });

  } catch (err: unknown) {
    logger.error({ err, cotacaoId: id }, 'api.portal.gerar-pagamento.failed');
    return Response.json({ error: 'Erro interno ao gerar pagamento' }, { status: 500 });
  }
}
