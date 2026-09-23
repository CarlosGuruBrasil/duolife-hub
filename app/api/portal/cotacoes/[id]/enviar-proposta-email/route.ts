import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';
import { dispatchDomainEvent } from '@/lib/triggers/dispatcher';
import { sendTemplatedEmail } from '@/lib/email-service';
import { safeExternalUrl } from '@/lib/safe-url';

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

    // 2. Busca assinatura / contrato ZapSign existente
    const [signatureDoc] = await sql<any[]>`
      SELECT external_document_id, sign_url, status
      FROM signature_documents
      WHERE cotacao_id = ${cotacao.id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const rawSignUrl = signatureDoc?.sign_url || (clientData.signUrl as string | undefined);
    const signUrl = rawSignUrl && !rawSignUrl.includes('/verificar/') ? safeExternalUrl(rawSignUrl) : null;
    const docToken = signatureDoc?.external_document_id || clientData.contratoToken || clientData.tokenZapsign;

    if (!signUrl && !docToken && cotacao.status !== 'contrato_gerado') {
      return Response.json(
        { error: 'O contrato ainda não foi gerado no ZapSign. Gere o contrato antes de enviar por e-mail.' },
        { status: 400 }
      );
    }

    // 3. Busca dados complementares do cliente e parceiro
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

    const [vendedorRow] = cotacao.partner_user_id
      ? await sql<{ id: string; nome: string; email: string }[]>`
          SELECT id, name AS nome, email
          FROM partner_users
          WHERE id = ${cotacao.partner_user_id}
          LIMIT 1
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

    const valorTotal = Number(cotacao.premio_final || cotacao.premio_calculado || 0);
    const partnerName = partnerRow?.nome || cotacao.partner_name || 'DuoLife';
    const effectiveSignUrl = signUrl || '';

    // 4. Dispara o gatilho PROPOSTA_CRIADA via dispatcher
    let actionsExecuted = 0;
    try {
      const dispatchResult = await dispatchDomainEvent('PROPOSTA_CRIADA', {
        eventType: 'PROPOSTA_CRIADA',
        contextId: cotacao.id,
        cliente: {
          nome: clientName,
          email: clientEmail,
          documento: clientDoc,
          telefone: clientPhone,
        },
        cotacao: {
          id: cotacao.id,
          status: cotacao.status,
          premio_final: valorTotal,
          cobertura: Number(cotacao.importancia_segurada) || 100000,
          produto_codigo: 'RC-001',
          produto_nome: 'Seguro RC Profissional',
        },
        parceiro: partnerRow ? {
          id: cotacao.partner_id,
          nome: partnerRow.nome,
          email: partnerRow.email,
          codigoVenda: partnerRow.codigo_venda,
        } : undefined,
        vendedor: vendedorRow ? {
          id: vendedorRow.id,
          nome: vendedorRow.nome,
          email: vendedorRow.email,
        } : (partnerRow ? {
          id: cotacao.partner_user_id || cotacao.partner_id,
          nome: partnerRow.nome,
          email: partnerRow.email,
        } : undefined),
        dados: {
          docToken,
          signUrl: effectiveSignUrl,
          link_assinatura: effectiveSignUrl,
          link_proposta: effectiveSignUrl,
          link_contrato: effectiveSignUrl,
          valor: valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          cobertura: (Number(cotacao.importancia_segurada) || 100000).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          parceiro_nome: partnerName,
        },
      });

      actionsExecuted = dispatchResult.actionsExecutedCount;
    } catch (dispatchErr) {
      logger.error({ dispatchErr, cotacaoId: cotacao.id }, 'cotacoes.enviar_proposta_email.dispatch_error');
    }

    // 5. Fallback defensivo: se nenhum gatilho executou (ex: árvore inativa), envia o template diretamente
    if (actionsExecuted === 0) {
      logger.info({ cotacaoId: cotacao.id, clientEmail }, 'cotacoes.enviar_proposta_email.running_direct_fallback');
      const directResult = await sendTemplatedEmail({
        templateCode: 'proposta_criada',
        to: clientEmail,
        toName: clientName,
        variables: {
          nome: clientName,
          cliente_nome: clientName,
          cotacao_id: cotacao.id,
          produto_nome: 'Seguro Responsabilidade Civil Profissional',
          cobertura: (Number(cotacao.importancia_segurada) || 100000).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          valor: valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          parceiro_nome: partnerName,
          link_assinatura: effectiveSignUrl,
          link_proposta: effectiveSignUrl,
          documento: clientDoc,
        },
        metadata: {
          eventType: 'PROPOSTA_CRIADA',
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
      'cotacoes.enviar_proposta_email.success'
    );

    return Response.json({
      ok: true,
      message: `E-mail com a proposta e contrato enviado com sucesso para ${clientEmail}!`,
      clientEmail,
      signUrl: effectiveSignUrl,
    });
  } catch (err: unknown) {
    logger.error({ err, cotacaoId: id }, 'cotacoes.enviar_proposta_email.unexpected_error');
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erro interno ao disparar e-mail com a proposta' },
      { status: 500 }
    );
  }
}
