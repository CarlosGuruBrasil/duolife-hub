import { NextRequest, NextResponse } from 'next/server';
import { authenticateWixRequest } from '@/lib/wix-integration-auth';
import { sql } from '@/lib/pg';
import { parseJsonbField } from '@/lib/json-safe';
import { ESTADOS_TERMINAIS } from '@/lib/cotacao-status';
import { gerarContratoPdfBuffer } from '@/lib/pdf-contract-generator';
import { criarDocumentoZapSignDireto } from '@/lib/zapsign-direct-docs';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateWixRequest(req);
  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json(
      { success: false, error: 'ID da cotação é obrigatório.' },
      { status: 400 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const forceRecreate = Boolean(body?.forceRecreate);

    // 1. Busca a cotação no banco
    const [cotacao] = await sql<any[]>`
      SELECT * FROM cotacoes WHERE id = ${id} LIMIT 1
    `;

    if (!cotacao) {
      return NextResponse.json(
        { success: false, error: `Cotação '${id}' não encontrada.` },
        { status: 404 }
      );
    }

    if (ESTADOS_TERMINAIS.includes(cotacao.status) && cotacao.status !== 'contrato_gerado') {
      return NextResponse.json(
        {
          success: false,
          error: `Cotação está em estado terminal (${cotacao.status}) e não pode gerar novo contrato.`,
        },
        { status: 422 }
      );
    }

    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);

    // 2. Se já existir documento ativo e não for forceRecreate, retorna o existente
    const [existingDoc] = await sql<any[]>`
      SELECT external_document_id, sign_url, status
      FROM signature_documents
      WHERE cotacao_id = ${cotacao.id}
        AND provider = 'zapsign'
        AND status IN ('pending', 'signed')
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (existingDoc && !forceRecreate) {
      return NextResponse.json({
        success: true,
        docToken: existingDoc.external_document_id,
        signUrl: existingDoc.sign_url,
        status: cotacao.status === 'assinado' ? 'assinado' : 'contrato_gerado',
        alreadyExisted: true,
      });
    }

    // 3. Gera PDF vetorial oficial via motor integrado
    logger.info({ cotacaoId: cotacao.id }, 'wix.contrato.gerando_pdf');
    const pdfData = await gerarContratoPdfBuffer(cotacao.id);

    // 4. Configura signatários: Proponente assina imediatamente no checkout web
    const signatarioProponente = {
      nome: pdfData.signatarioProponente?.nome || cotacao.client_name,
      email: pdfData.signatarioProponente?.email || cotacao.client_email || 'suporte@duolife.net.br',
      phone: pdfData.signatarioProponente?.phone || cotacao.client_phone || null,
      order: undefined, // Sem restrição sequencial: proponente assina imediatamente no checkout
      signaturePattern: '{{assinatura_proponente}}',
      sendAutomaticEmail: false, // Cliente já está na tela assinando
    };

    const signatarioCorretora = {
      nome: pdfData.signatarioCorretora?.nome || 'Corretora Net4Life',
      email: pdfData.signatarioCorretora?.email || 'contato@net4life.com.br',
      phone: pdfData.signatarioCorretora?.phone || null,
      order: undefined, // Sem restrição sequencial: ambos assinam de forma independente
      signaturePattern: '{{assinatura_corretora}}',
      sendAutomaticEmail: true,
    };

    const deadlineZapSign = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // 5. Registra o documento na API oficial da ZapSign (Proponente em primeiro lugar)
    logger.info({ cotacaoId: cotacao.id, docName: pdfData.docName }, 'wix.contrato.enviando_zapsign');
    const directDoc = await criarDocumentoZapSignDireto({
      base64Pdf: pdfData.base64,
      docName: pdfData.docName,
      externalId: cotacao.id,
      deadlineAt: deadlineZapSign,
      signatarios: [signatarioProponente, signatarioCorretora],
    });

    const docToken = directDoc.docToken;
    const proponenteSigner =
      directDoc.signers?.find(
        (s) => s.email?.toLowerCase() === signatarioProponente.email.toLowerCase()
      ) ||
      directDoc.signers?.find((s) => s.name === signatarioProponente.nome) ||
      directDoc.signers?.[0];

    const signUrl = proponenteSigner?.signUrl || directDoc.signUrl || '';

    // 6. Registra em signature_documents
    await sql`
      INSERT INTO signature_documents (
        cotacao_id,
        client_id,
        provider,
        external_document_id,
        status,
        sign_url,
        created_at,
        updated_at
      )
      VALUES (
        ${cotacao.id},
        ${cotacao.client_id || null},
        'zapsign',
        ${docToken},
        'pending',
        ${signUrl},
        NOW(),
        NOW()
      )
    `;

    // 7. Atualiza client_data e o status da cotação para 'contrato_gerado'
    clientData.contratoToken = docToken;
    clientData.signUrl = signUrl;
    clientData.contratoGeradoEm = new Date().toISOString();

    await sql`
      UPDATE cotacoes
      SET status = 'contrato_gerado',
          client_data = ${JSON.stringify(clientData)}::jsonb,
          updated_at = NOW()
      WHERE id = ${cotacao.id}
    `;

    logger.info(
      {
        cotacaoId: cotacao.id,
        docToken,
        signUrl,
      },
      'wix.contrato.gerado_com_sucesso'
    );

    return NextResponse.json({
      success: true,
      docToken,
      signUrl,
      status: 'contrato_gerado',
    });
  } catch (err: any) {
    logger.error({ err, cotacaoId: id }, 'wix.contrato.falha_geracao');
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Erro interno ao gerar contrato e registrar documento no ZapSign.',
      },
      { status: 500 }
    );
  }
}
