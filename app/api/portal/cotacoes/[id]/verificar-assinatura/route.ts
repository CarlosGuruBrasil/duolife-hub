import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const publicToken = req.headers.get('x-public-token');
  let targetPartnerId: string | null = null;
  let isAdmin = false;

  if (publicToken) {
    const [link] = await sql`
      SELECT partner_id
      FROM public_sale_links
      WHERE token = ${publicToken} AND status = 'active'
    `;
    if (!link) return Response.json({ error: 'Token público inválido' }, { status: 401 });
    targetPartnerId = link.partner_id;
  } else {
    const user = await verifyAuth();
    if (!user) return unauthorized();
    targetPartnerId = user.partnerId;
    if (user.role === 'duolife_admin' || user.role === 'duolife_staff') isAdmin = true;
  }

  const { id } = await params;

  try {
    let cotacaoResult;
    if (isAdmin) {
      cotacaoResult = await sql`SELECT * FROM cotacoes WHERE id = ${id}`;
    } else if (publicToken) {
      cotacaoResult = await sql`SELECT * FROM cotacoes WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${targetPartnerId}`;
    } else {
      cotacaoResult = await sql`SELECT * FROM cotacoes WHERE id = ${id} AND partner_id = ${targetPartnerId}`;
    }
    const cotacao = cotacaoResult[0];

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    // Se já estiver em estados avançados de assinatura/pagamento, retorna diretamente
    if (['assinado', 'pagamento_gerado', 'aprovada'].includes(cotacao.status)) {
      return Response.json({
        ok: true,
        status: cotacao.status,
        assinado: true,
        contratoPdf: cotacao.client_data?.contratoPdf || ''
      });
    }

    const clientData = cotacao.client_data || {};
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
    const token = process.env.ZAPSIGN_API_TOKEN;
    const baseUrl = process.env.ZAPSIGN_BASE_URL || 'https://sandbox.api.zapsign.com.br/api/v1';

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
      clientData.assinadoEm = new Date().toISOString();

      // Atualiza no banco
      await sql`
        UPDATE cotacoes
        SET
          status = 'assinado',
          client_data = ${JSON.stringify(clientData)},
          updated_at = NOW()
        WHERE id = ${cotacao.id}
      `;

      return Response.json({
        ok: true,
        status: 'assinado',
        assinado: true,
        contratoPdf: pdfLink
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
