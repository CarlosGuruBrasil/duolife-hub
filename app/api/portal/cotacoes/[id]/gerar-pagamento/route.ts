import { NextRequest } from 'next/server';
import { verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyPartnerAuth();
  if (!user) return unauthorized();

  const { id } = await params;

  try {
    // 1. Busca a cotação
    const [cotacao] = await sql`
      SELECT * FROM cotacoes WHERE id = ${id} AND partner_id = ${user.partnerId!}
    `;

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    const clientData = cotacao.client_data || {};
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
      clientData.clienteId = clienteId;
    }

    // 3. Prepara os valores e parcelamento
    const valorTotal = Number(cotacao.premio_final || cotacao.premio_calculado || 0);
    const qtdParcelas = Number(clientData.parcela) || 1;
    const valorParcela = Number(clientData.valorParcela) || valorTotal;

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

    // Se for parcelado, pegamos os dados do primeiro pagamento/fatura
    let checkoutId = paymentJson.id;
    let linkBoleto = paymentJson.bankSlipUrl || paymentJson.invoiceUrl;
    let netValue = paymentJson.netValue;

    if (qtdParcelas > 1 && paymentJson.installments) {
      // Para parcelamento, o Asaas retorna uma lista das cobranças geradas
      // Ou podemos consultar a lista de pagamentos do parcelamento
      checkoutId = paymentJson.installment; // ID do parcelamento pai
      
      // Tentativa de obter as cobranças filhas para pegar o link da primeira parcela
      try {
        const listRes = await fetch(`${asaasBaseUrl}/payments?installment=${checkoutId}`, {
          headers: { 'access_token': asaasKey }
        });
        if (listRes.ok) {
          const listJson = await listRes.json();
          if (listJson.data && listJson.data.length > 0) {
            // Ordena as parcelas pelo vencimento ou pela propriedade 'installmentNumber'
            const sorted = listJson.data.sort((a: any, b: any) => (a.installmentNumber || 0) - (b.installmentNumber || 0));
            linkBoleto = sorted[0].bankSlipUrl || sorted[0].invoiceUrl;
            netValue = sorted.reduce((sum: number, item: any) => sum + (Number(item.netValue) || 0), 0);
          }
        }
      } catch (err) {
        logger.error({ err }, 'api.portal.gerar-pagamento.fetch_installments_failed');
      }
    }

    // 5. Atualiza a cotação no Banco
    clientData.checkoutId = checkoutId;
    clientData.linkBoleto = linkBoleto;
    clientData.dataVencimento = dueDateStr;

    await sql`
      UPDATE cotacoes
      SET
        status = 'pagamento_gerado',
        premio_final = ${valorTotal},
        client_data = ${JSON.stringify(clientData)},
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

  } catch (err: any) {
    logger.error({ err, cotacaoId: id }, 'api.portal.gerar-pagamento.failed');
    return Response.json({ error: 'Erro interno ao gerar pagamento' }, { status: 500 });
  }
}
