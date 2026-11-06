import { NextRequest, NextResponse } from 'next/server';
import { authenticateWixRequest } from '@/lib/wix-integration-auth';
import { sql } from '@/lib/pg';
import { parseJsonbField } from '@/lib/json-safe';
import { ESTADOS_TERMINAIS } from '@/lib/cotacao-status';
import { getZapSignConfig } from '@/lib/system-settings';
import { cancelarDocumentoZapSign } from '@/lib/zapsign-direct-docs';
import {
  determinarTemplateZapSignNet4Life,
  montarVariaveisTemplateZapSign,
  criarDocumentoZapSignPorModelo,
} from '@/lib/zapsign-template-service';
import { logger } from '@/lib/logger';
import { isContratoAssinadoPeloCliente } from '@/lib/contrato-correcao';

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

    // 1. Busca a cotação no banco de dados
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

    // Contrato já assinado nunca é refeito pela integração (não há operador para informar o motivo).
    // A correção deve ser feita no painel, com motivo obrigatório.
    const contratoAssinado =
      existingDoc?.status === 'signed' ||
      (isContratoAssinadoPeloCliente(cotacao.status, clientData) && Boolean(clientData.contratoToken));
    if (contratoAssinado && (forceRecreate || !existingDoc)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Contrato já assinado. A correção deve ser solicitada ao corretor responsável.',
        },
        { status: 409 }
      );
    }

    if (existingDoc && !forceRecreate) {
      return NextResponse.json({
        success: true,
        docToken: existingDoc.external_document_id,
        signUrl: existingDoc.sign_url,
        status: cotacao.status === 'assinado' ? 'assinado' : 'contrato_gerado',
        alreadyExisted: true,
      });
    }

    // 3. Se for regeração e houver documento anterior, cancela na ZapSign
    if (clientData.contratoToken) {
      try {
        await cancelarDocumentoZapSign(clientData.contratoToken);
      } catch (cancelErr) {
        logger.warn({ cancelErr, docToken: clientData.contratoToken }, 'wix.contrato.cancel_old_warn');
      }

      await sql`
        UPDATE signature_documents
        SET status = 'cancelled', updated_at = NOW()
        WHERE cotacao_id = ${cotacao.id} AND status NOT IN ('cancelled', 'refused', 'expired')
      `;
    }

    // 4. Determina as configurações ativas do ZapSign e o Modelo a ser utilizado
    const zapConfig = await getZapSignConfig();
    const templateResolution = determinarTemplateZapSignNet4Life(clientData, cotacao, zapConfig);

    logger.info(
      {
        cotacaoId: cotacao.id,
        templateId: templateResolution.templateId,
        tipoContrato: templateResolution.tipoContrato,
        isRenovacao: templateResolution.isRenovacao,
        is100k: templateResolution.is100k,
      },
      'wix.contrato.template_resolvido'
    );

    // 5. Busca descrição textual de cargos PPE se aplicável
    let ppeDescricao = '';
    const arrayCargoSelect = clientData.ppeCargoSelect
      ? String(clientData.ppeCargoSelect).split(',').map((x) => x.trim()).filter(Boolean)
      : [];

    if (arrayCargoSelect.length > 0) {
      try {
        const rows = await sql`
          SELECT payload FROM wix_items
          WHERE wix_collection_id IN (
            SELECT id FROM wix_collections WHERE collection_id = 'PPECARGOS'
          )
          AND is_active = true
        `;
        const cargos = rows
          .map((r) => {
            try {
              const parsed = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
              return parsed?.item?.data || null;
            } catch {
              return null;
            }
          })
          .filter((c) => c && arrayCargoSelect.includes(String(c.id_)));

        ppeDescricao = cargos.map((c) => c.text).join('\n');
      } catch (err) {
        logger.warn({ err }, 'wix.contrato.fetch_ppe_failed');
      }
    }

    // 6. Monta todas as variáveis/tokens para substituição na minuta da ZapSign (SEM ENVIO DE PDF)
    const { dataArray } = montarVariaveisTemplateZapSign(clientData, cotacao, {
      ppeDescricao,
      corretoraInfo: {
        cidade: 'Florianópolis',
        nomeFantasia: 'NET4LIFE CORRETORA DE SEGUROS',
      },
      valorTotal: Number(cotacao.premio_final || clientData.valor || 0),
      qtdParcelas: Math.max(1, Number(clientData.parcela || clientData.parcelas || 1)),
      valorParcela: Number(clientData.valorParcela || cotacao.premio_final || 0),
    });

    const deadlineZapSign = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // 7. Criação do documento via Endpoint oficial de Modelos (/models/create-doc/)
    logger.info(
      { cotacaoId: cotacao.id, templateId: templateResolution.templateId, tokensCount: dataArray.length },
      'wix.contrato.criando_documento_modelo'
    );

    const docResult = await criarDocumentoZapSignPorModelo({
      templateId: templateResolution.templateId,
      signerName: cotacao.client_name,
      signerEmail: cotacao.client_email || 'suporte@duolife.net.br',
      externalId: cotacao.id,
      deadlineAt: deadlineZapSign,
      dataArray,
      zapConfig,
    });

    const docToken = docResult.docToken;
    const signUrl = docResult.signUrl;

    // 8. Registra em signature_documents
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

    // 9. Atualiza client_data e o status da cotação para 'contrato_gerado'
    clientData.contratoToken = docToken;
    clientData.signUrl = signUrl;
    clientData.signUrlProponente = signUrl;
    clientData.contratoModo = 'template';
    clientData.contratoTemplateId = templateResolution.templateId;
    clientData.contratoTipo = templateResolution.tipoContrato;
    clientData.contratoGeradoEm = new Date().toISOString();
    clientData.contratoPrazoLimite = deadlineZapSign;
    clientData.totalAssinaturas = 1;
    clientData.assinaturasNecessarias = ['cliente'];
    clientData.statusAssinatura = 'falta_cliente';
    clientData.clienteAssinou = false;
    clientData.corretoraAssinou = true;
    clientData.minutaDesatualizada = false;
    delete clientData.signUrlCorretora;

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
        templateId: templateResolution.templateId,
        tipoContrato: templateResolution.tipoContrato,
      },
      'wix.contrato.gerado_com_sucesso_via_modelo'
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
