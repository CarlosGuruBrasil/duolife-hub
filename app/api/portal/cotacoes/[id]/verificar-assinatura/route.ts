import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';
import { parseJsonbField } from '@/lib/json-safe';
import { getZapSignConfig } from '@/lib/system-settings';
import { dispatchDomainEvent } from '@/lib/triggers/dispatcher';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';

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
    const cotacao = publicToken
      ? (await sql`SELECT * FROM cotacoes WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${targetPartnerId}`)[0]
      : await getAccessibleQuoteById(id, user!);

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    // Se já estiver em estados avançados de assinatura/pagamento, retorna diretamente
    if (['assinado', 'pagamento_gerado', 'aprovada'].includes(cotacao.status)) {
      return Response.json({
        ok: true,
        status: cotacao.status,
        assinado: true,
        contratoPdf: parseJsonbField<Record<string, any>>(cotacao.client_data).contratoPdf || ''
      });
    }

    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);
    const docToken = clientData.contratoToken;

    if (!docToken) {
      return Response.json({
        ok: true,
        status: cotacao.status,
        assinado: false,
        error: 'Nenhum contrato gerado para esta cotação'
      });
    }

    // 2. Consulta status na API da ZapSign
    const zapConfig = await getZapSignConfig();
    const token = zapConfig.apiToken;
    const baseUrl = zapConfig.baseUrl;

    if (!token) {
      return Response.json({ error: 'Token da ZapSign não configurado' }, { status: 500 });
    }

    const response = await fetch(`${baseUrl}/docs/${docToken}/`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, body: errText }, 'api.portal.verificar-assinatura.zapsign_failed');
      return Response.json({ error: `Falha na API da ZapSign: ${errText}` }, { status: 400 });
    }

    const resJson = await response.json();
    
    // ZapSign considera o documento finalizado/assinado se status for "completed"
    const isSigned = resJson.status === 'completed' || resJson.signers?.every((s: any) => s.status === 'signed');

    if (isSigned) {
      const pdfLink = resJson.signed_file_url || `https://app.zapsign.com.br/verificar/${docToken}`;
      
      clientData.contratoPdf = pdfLink;
      clientData.assinadoEm = clientData.assinadoEm || new Date().toISOString();

      const canAdvanceToAssinado = ['contrato_gerado', 'enviada', 'rascunho'].includes(cotacao.status);

      // Atualiza no banco
      if (canAdvanceToAssinado) {
        await sql`
          UPDATE cotacoes
          SET
            status = 'assinado',
            client_data = ${JSON.stringify(clientData)}::jsonb,
            updated_at = NOW()
          WHERE id = ${cotacao.id}
        `;
      } else {
        await sql`
          UPDATE cotacoes
          SET
            client_data = ${JSON.stringify(clientData)}::jsonb,
            updated_at = NOW()
          WHERE id = ${cotacao.id}
        `;
      }

      await sql`
        UPDATE signature_documents
        SET
          status = 'signed',
          signed_file_url = ${pdfLink},
          signed_at = COALESCE(signed_at, NOW()),
          raw_payload = ${JSON.stringify(resJson)}::jsonb,
          updated_at = NOW()
        WHERE cotacao_id = ${cotacao.id}
          AND provider = 'zapsign'
      `;

      // Dispara gatilho de Contrato Assinado
      try {
        const [cotacaoCompleta] = await sql<{ client_id: string | null; partner_id: string; client_name: string; premio_final: number; importancia_segurada: number }[]>`
          SELECT client_id, partner_id, client_name, premio_final, importancia_segurada
          FROM cotacoes
          WHERE id = ${cotacao.id}
          LIMIT 1
        `;

        const [clientRow] = cotacaoCompleta?.client_id ? await sql<{ full_name: string; email: string; document_number: string; phone: string }[]>`
          SELECT full_name, email, document_number, phone FROM insurance_clients WHERE id = ${cotacaoCompleta.client_id} LIMIT 1
        ` : [];

        await dispatchDomainEvent('CONTRATO_ASSINADO', {
          eventType: 'CONTRATO_ASSINADO',
          contextId: cotacao.id,
          cliente: {
            nome: clientRow?.full_name || cotacaoCompleta?.client_name,
            email: clientRow?.email || clientData.email,
            documento: clientRow?.document_number || clientData.cpf || clientData.cnpj,
            telefone: clientRow?.phone || clientData.telefone,
          },
          cotacao: {
            id: cotacao.id,
            status: 'assinado',
            premio_final: Number(cotacaoCompleta?.premio_final) || 0,
            cobertura: Number(cotacaoCompleta?.importancia_segurada) || 0,
          },
          dados: {
            contratoPdf: pdfLink,
            assinadoEm: clientData.assinadoEm,
          },
        });
      } catch (dispatchErr) {
        logger.error({ dispatchErr, cotacaoId: cotacao.id }, 'api.portal.verificar-assinatura.dispatch_event_failed');
      }

      // Gera cobrança Asaas em background
      let paymentInfo: any = null;
      try {
        paymentInfo = await generateAsaasPaymentForQuote(cotacao.id);
      } catch (paymentErr) {
        logger.error({ paymentErr, cotacaoId: cotacao.id }, 'api.portal.verificar-assinatura.asaas_payment_failed');
      }

      return Response.json({
        ok: true,
        status: canAdvanceToAssinado ? 'assinado' : cotacao.status,
        assinado: true,
        contratoPdf: pdfLink,
        checkoutId: paymentInfo?.checkoutId,
        linkBoleto: paymentInfo?.linkBoleto,
      });
    }

    return Response.json({
      ok: true,
      status: cotacao.status,
      assinado: false
    });

  } catch (err: unknown) {
    logger.error({ err, cotacaoId: id }, 'api.portal.verificar-assinatura.failed');
    return Response.json({ error: 'Erro interno ao verificar assinatura' }, { status: 500 });
  }
}
