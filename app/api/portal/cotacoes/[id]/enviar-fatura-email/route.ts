import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized, isInternalUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';
import { dispatchDomainEvent } from '@/lib/triggers/dispatcher';
import { sendTemplatedEmail } from '@/lib/email-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  const { id } = await params;

  try {
    // 1. Busca e valida acesso à cotação
    const cotacao = await getAccessibleQuoteById(id, user);
    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada ou acesso não autorizado' }, { status: 404 });
    }

    const clientData = (cotacao.client_data as Record<string, any>) || {};

    // 2. Busca dados complementares do cliente e parceiro
    const [clientRow] = cotacao.client_id
      ? await sql<{ full_name: string; email: string; document_number: string; phone: string }[]>`
          SELECT full_name, email, document_number, phone FROM insurance_clients WHERE id = ${cotacao.client_id} LIMIT 1
        `
      : [];

    const [partnerRow] = cotacao.partner_id
      ? await sql<{ nome_fantasia: string; razao_social: string; email?: string }[]>`
          SELECT nome_fantasia, razao_social, email FROM partners WHERE id = ${cotacao.partner_id} LIMIT 1
        `
      : [];

    const clientName = clientRow?.full_name || cotacao.client_name || clientData.nome || 'Cliente';
    const clientEmail = clientRow?.email || cotacao.client_email || clientData.email;
    const clientDoc = clientRow?.document_number || cotacao.client_cpf_cnpj || clientData.cpf || clientData.cnpj || '';
    const clientPhone = clientRow?.phone || cotacao.client_phone || clientData.celular || clientData.telefone || '';

    if (!clientEmail || !clientEmail.includes('@')) {
      return Response.json(
        { error: 'O cliente não possui um endereço de e-mail válido cadastrado para envio.' },
        { status: 400 }
      );
    }

    // 3. Busca cobrança existente no banco de dados (payment_orders ou client_data)
    let linkBoleto = clientData.linkBoleto as string | undefined;
    let checkoutId = clientData.checkoutId as string | undefined;
    let rawDueDate = clientData.dataVencimento as string | undefined;
    let valorTotal = Number(cotacao.premio_final || cotacao.premio_calculado) || 0;
    let qtdParcelas = Number(clientData.parcela) || 1;

    const [existingOrder] = await sql<any[]>`
      SELECT id, external_payment_id, bank_slip_url, invoice_url, due_date, amount_total, installment_count
      FROM payment_orders
      WHERE cotacao_id = ${cotacao.id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (existingOrder) {
      linkBoleto = existingOrder.bank_slip_url || existingOrder.invoice_url || linkBoleto;
      checkoutId = existingOrder.external_payment_id || checkoutId;
      if (existingOrder.due_date) {
        rawDueDate = String(existingOrder.due_date);
      }
      if (existingOrder.amount_total) {
        valorTotal = Number(existingOrder.amount_total);
      }
      if (existingOrder.installment_count) {
        qtdParcelas = Number(existingOrder.installment_count);
      }
    }

    // 4. Se ainda não houver link do boleto/fatura gerado, tenta gerar automaticamente se a cotação estiver assinada
    if (!linkBoleto) {
      const isManualAdmin = isInternalUser(user);
      const paymentGenResult = await generateAsaasPaymentForQuote(id, { isManualAdmin });

      if (paymentGenResult.ok && paymentGenResult.linkBoleto) {
        linkBoleto = paymentGenResult.linkBoleto;
        checkoutId = paymentGenResult.checkoutId;
        if (paymentGenResult.dueDate) {
          rawDueDate = paymentGenResult.dueDate;
        }
      } else {
        return Response.json(
          {
            error:
              paymentGenResult.error ||
              'Esta cotação ainda não possui cobrança/fatura gerada no Asaas. Gere o boleto antes de enviar o e-mail.',
          },
          { status: 400 }
        );
      }
    }

    // 5. Formatações de data e valores
    let formattedDueDate = '';
    if (rawDueDate) {
      if (rawDueDate.includes('-')) {
        const parts = rawDueDate.split('T')[0].split('-');
        if (parts.length === 3) {
          formattedDueDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          formattedDueDate = rawDueDate;
        }
      } else {
        formattedDueDate = rawDueDate;
      }
    }

    const valorParcela = qtdParcelas > 1 && valorTotal > 0
      ? Math.round((valorTotal / qtdParcelas) * 100) / 100
      : valorTotal;

    const partnerName = partnerRow?.nome_fantasia || partnerRow?.razao_social || 'DuoLife';

    // 6. Dispara evento de domínio oficial FATURA_GERADA
    let actionsExecuted = 0;
    try {
      const dispatchResult = await dispatchDomainEvent('FATURA_GERADA', {
        eventType: 'FATURA_GERADA',
        contextId: cotacao.id,
        cliente: {
          nome: clientName,
          email: clientEmail,
          documento: clientDoc,
          telefone: clientPhone,
        },
        cotacao: {
          id: cotacao.id,
          status: 'pagamento_gerado',
          premio_final: valorTotal,
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
          nome: partnerName,
          email: partnerRow?.email,
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

      actionsExecuted = dispatchResult.actionsExecutedCount;
    } catch (dispatchErr) {
      logger.error({ dispatchErr, cotacaoId: cotacao.id }, 'cotacoes.enviar_fatura_email.dispatch_error');
    }

    // 7. Fallback defensivo: se nenhum gatilho executou (ex: gatilho inativo ou não cadastrado), envia o template diretamente
    if (actionsExecuted === 0) {
      logger.info({ cotacaoId: cotacao.id, clientEmail }, 'cotacoes.enviar_fatura_email.running_direct_fallback');
      const directResult = await sendTemplatedEmail({
        templateCode: 'fatura_gerada',
        to: clientEmail,
        toName: clientName,
        variables: {
          nome: clientName,
          cotacao_id: cotacao.id,
          valor: valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          vencimento: formattedDueDate || 'À vista',
          link_fatura: linkBoleto,
          parceiro_nome: partnerName,
        },
        metadata: {
          eventType: 'FATURA_GERADA',
          contextId: cotacao.id,
          manualTrigger: true,
          triggeredBy: user.email,
        },
      });

      if (!directResult.success) {
        return Response.json(
          { error: `Falha ao enviar e-mail: ${directResult.error || 'Erro desconhecido'}` },
          { status: 500 }
        );
      }
    }

    logger.info(
      { cotacaoId: cotacao.id, clientEmail, triggeredBy: user.email },
      'cotacoes.enviar_fatura_email.success'
    );

    return Response.json({
      ok: true,
      message: `E-mail com a fatura enviado com sucesso para ${clientEmail}!`,
      clientEmail,
      linkBoleto,
    });
  } catch (err: unknown) {
    logger.error({ err, cotacaoId: id }, 'cotacoes.enviar_fatura_email.unexpected_error');
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erro interno ao disparar e-mail com fatura' },
      { status: 500 }
    );
  }
}
