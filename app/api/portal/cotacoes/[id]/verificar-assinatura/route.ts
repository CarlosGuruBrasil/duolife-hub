import { NextRequest } from 'next/server';
import { verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

export async function GET(
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
