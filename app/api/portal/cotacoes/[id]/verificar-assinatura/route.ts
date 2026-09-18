import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized, isInternalUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';
import { parseJsonbField } from '@/lib/json-safe';
import { getZapSignConfig, sanitizeApiToken } from '@/lib/system-settings';
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
    const token = sanitizeApiToken(zapConfig.apiToken);
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
      let friendlyError = `Falha na API da ZapSign: ${errText}`;
      if (errText.includes('API token not found') || errText.includes('Token da API não encontrado')) {
        const ambAtual = zapConfig.isSandbox ? 'Sandbox (Testes)' : 'Produção Real';
        friendlyError = `Falha de autenticação na ZapSign: O Token de API informado não foi localizado no ambiente ${ambAtual}. Verifique no painel administrativo (/admin/chaves-api) se o ambiente selecionado corresponde à conta onde o token foi gerado.`;
      }
      return Response.json({ error: friendlyError }, { status: 400 });
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
        const [cotacaoCompleta] = await sql<{ client_id: string | null; partner_id: string; partner_user_id: string | null; client_name: string; premio_final: number; importancia_segurada: number }[]>`
          SELECT client_id, partner_id, partner_user_id, client_name, premio_final, importancia_segurada
          FROM cotacoes
          WHERE id = ${cotacao.id}
          LIMIT 1
        `;

        const [clientRow] = cotacaoCompleta?.client_id ? await sql<{ full_name: string; email: string; document_number: string; phone: string }[]>`
          SELECT full_name, email, document_number, phone FROM insurance_clients WHERE id = ${cotacaoCompleta.client_id} LIMIT 1
        ` : [];

        // Busca vendedor responsável pela proposta (partner_users)
        const [vendedorRow] = cotacaoCompleta?.partner_user_id ? await sql<{ id: string; nome: string; email: string }[]>`
          SELECT id, name AS nome, email
          FROM partner_users
          WHERE id = ${cotacaoCompleta.partner_user_id}
          LIMIT 1
        ` : [];

        const [partnerRow] = cotacaoCompleta?.partner_id ? await sql<{ nome: string; email: string; codigo_venda?: string }[]>`
          SELECT
            COALESCE(p.nome_fantasia, p.razao_social) AS nome,
            COALESCE(NULLIF(p.email, ''), pu.email) AS email,
            p.metadata->'whiteLabel'->>'wixCode' AS codigo_venda
          FROM partners p
          LEFT JOIN partner_users pu ON pu.partner_id = p.id AND pu.is_active = true
          WHERE p.id = ${cotacaoCompleta.partner_id}
          ORDER BY pu.created_at ASC
          LIMIT 1
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
          vendedor: vendedorRow
            ? {
                id: vendedorRow.id,
                nome: vendedorRow.nome,
                email: vendedorRow.email,
              }
            : partnerRow
            ? {
                id: cotacaoCompleta.partner_user_id || cotacaoCompleta.partner_id,
                nome: partnerRow.nome,
                email: partnerRow.email,
              }
            : undefined,
          parceiro: partnerRow ? {
            id: cotacaoCompleta.partner_id,
            nome: partnerRow.nome,
            email: partnerRow.email,
            codigoVenda: partnerRow.codigo_venda,
          } : undefined,
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

      // Gera cobrança Asaas em background (respeitando regra de vigência e permissão)
      let paymentInfo: any = null;
      try {
        const isManualAdmin = user ? isInternalUser(user) : false;
        paymentInfo = await generateAsaasPaymentForQuote(cotacao.id, { isManualAdmin });
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
        dueDate: paymentInfo?.dueDate,
        paymentError: paymentInfo?.ok === false ? paymentInfo.error : undefined,
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
