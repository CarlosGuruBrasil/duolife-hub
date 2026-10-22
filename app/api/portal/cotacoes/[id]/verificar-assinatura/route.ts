import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized, isInternalUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';
import { parseJsonbField } from '@/lib/json-safe';
import { getZapSignConfig, sanitizeApiToken } from '@/lib/system-settings';
import { dispatchDomainEvent } from '@/lib/triggers/dispatcher';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';
import { identificarRequisitosAssinatura } from '@/lib/assinatura-status';

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

    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);
    let docToken = String(clientData.contratoToken || clientData.tokenZapsign || '').trim();

    if (!docToken) {
      const [docRow] = await sql<{ external_document_id: string | null; signed_file_url: string | null }[]>`
        SELECT external_document_id, signed_file_url
        FROM signature_documents
        WHERE cotacao_id = ${cotacao.id} AND provider = 'zapsign'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (docRow?.external_document_id) {
        docToken = docRow.external_document_id;
      }
    }

    let rawPdfCandidate = String(clientData.contratoPdf || clientData.signedFileUrl || clientData.linkContrato || '').trim();
    let existingPdf = rawPdfCandidate && !rawPdfCandidate.includes('/verificar/') ? rawPdfCandidate : '';
    if (!existingPdf) {
      const [sigPdf] = await sql<{ signed_file_url: string | null }[]>`
        SELECT signed_file_url
        FROM signature_documents
        WHERE cotacao_id = ${cotacao.id} AND provider = 'zapsign' AND signed_file_url IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (sigPdf?.signed_file_url && !sigPdf.signed_file_url.includes('/verificar/')) {
        existingPdf = sigPdf.signed_file_url;
      }
    }

    const requisitos = identificarRequisitosAssinatura(clientData, cotacao);

    if (!docToken) {
      const isConcluida = ['aprovada', 'emitida', 'ativa'].includes(cotacao.status);
      return Response.json({
        ok: true,
        status: cotacao.status,
        assinado: isConcluida,
        statusAssinatura: isConcluida
          ? 'todas_assinadas'
          : (requisitos.total === 1 ? 'falta_cliente' : 'faltam_ambas'),
        assinaturasConcluidas: isConcluida ? requisitos.total : 0,
        totalAssinaturas: requisitos.total,
        assinaturasNecessarias: requisitos.papeis,
        contratoModo: requisitos.modo,
        podeSalvarPreferencia: false,
        signUrlCorretora: null,
        signatarios: [],
        contratoPdf: existingPdf || '',
        message: isConcluida
          ? 'Contrato assinado.'
          : 'Nenhum contrato gerado para esta cotação',
        error: isConcluida
          ? undefined
          : 'Nenhum contrato gerado para esta cotação'
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
    const signersList = Array.isArray(resJson.signers) ? resJson.signers : [];
    const clientEmail = (cotacao.client_email || clientData.email || '').toLowerCase().trim();
    const clientName = (cotacao.client_name || clientData.nome || '').toLowerCase().trim();

    // Identificação dos signatários
    let proponenteSigner = signersList.find((s: any) => {
      const sEmail = (s.email || '').toLowerCase().trim();
      const sName = (s.name || '').toLowerCase().trim();
      const isClientEmail = Boolean(clientEmail && sEmail === clientEmail);
      const isClientName = Boolean(clientName && (sName.includes(clientName) || clientName.includes(sName)));
      return isClientEmail || isClientName;
    });

    let corretoraSigner = signersList.find((s: any) => {
      if (s === proponenteSigner) return false;
      const sEmail = (s.email || '').toLowerCase().trim();
      const sName = (s.name || '').toLowerCase().trim();
      return (
        sEmail.includes('net4life.com.br') ||
        sEmail.includes('corretora') ||
        sEmail.includes('duolife') ||
        sName.includes('corretora') ||
        sName.includes('net4life')
      );
    });

    // Fallbacks para associação dos signatários por posição
    if (signersList.length >= 2) {
      if (!proponenteSigner && corretoraSigner) {
        proponenteSigner = signersList.find((s: any) => s !== corretoraSigner) || signersList[0];
      } else if (proponenteSigner && !corretoraSigner) {
        corretoraSigner = signersList.find((s: any) => s !== proponenteSigner) || signersList[1];
      } else if (!proponenteSigner && !corretoraSigner) {
        proponenteSigner = signersList[0];
        corretoraSigner = signersList[1];
      }
    } else if (signersList.length === 1 && !proponenteSigner) {
      proponenteSigner = signersList[0];
    }

    const docStatusFinalizado = resJson.status === 'signed' || resJson.status === 'completed';

    // Determina o status dos signatários estritamente pela resposta atual da ZapSign
    let clienteAssinou = false;
    let corretoraAssinou = false;
    let statusAssinatura: 'todas_assinadas' | 'falta_corretora' | 'falta_cliente' | 'faltam_ambas';
    let totalAssinaturas = requisitos.total;
    let assinaturasConcluidas = 0;
    let todasAssinadas = false;
    let podeSalvarPreferencia = false;
    let signatarios: Array<{ nome: string; papel: 'cliente' | 'corretora'; assinado: boolean; email: string }> = [];
    let message = '';

    const proponenteSigned = Boolean(proponenteSigner && proponenteSigner.status === 'signed');
    const corretoraSigned = Boolean(corretoraSigner && corretoraSigner.status === 'signed');
    const signedCount = signersList.filter((s: any) => s.status === 'signed').length;

    // ==========================================
    // CASO 1: CONTRATO COM 1 ASSINATURA (CLIENTE)
    // ==========================================
    if (totalAssinaturas === 1) {
      if (docStatusFinalizado || proponenteSigned || signedCount >= 1) {
        clienteAssinou = true;
        corretoraAssinou = true; // Não exigida
        statusAssinatura = 'todas_assinadas';
        assinaturasConcluidas = 1;
        todasAssinadas = true;
        podeSalvarPreferencia = true;
        message = 'A assinatura do cliente foi concluída com sucesso!';
      } else {
        clienteAssinou = false;
        corretoraAssinou = true; // Não exigida
        statusAssinatura = 'falta_cliente';
        assinaturasConcluidas = 0;
        todasAssinadas = false;
        podeSalvarPreferencia = false;
        message = 'Aguardando assinatura do Proponente no ZapSign.';
      }

      signatarios = [
        {
          nome: proponenteSigner?.name || cotacao.client_name || 'Proponente',
          papel: 'cliente' as const,
          assinado: clienteAssinou,
          email: proponenteSigner?.email || cotacao.client_email || '',
        },
      ];
    } else {
      // ==========================================
      // CASO 2: CONTRATO COM 2 ASSINATURAS (CLIENTE + CORRETORA)
      // ==========================================
      if (docStatusFinalizado) {
        clienteAssinou = true;
        corretoraAssinou = true;
      } else {
        if (proponenteSigned && corretoraSigned) {
          clienteAssinou = true;
          corretoraAssinou = true;
        } else if (proponenteSigned && !corretoraSigned) {
          clienteAssinou = true;
          corretoraAssinou = false;
        } else if (!proponenteSigned && corretoraSigned) {
          clienteAssinou = false;
          corretoraAssinou = true;
        } else if (signedCount === 1) {
          clienteAssinou = true;
          corretoraAssinou = false;
        } else {
          clienteAssinou = false;
          corretoraAssinou = false;
        }
      }

      if (clienteAssinou && corretoraAssinou) {
        statusAssinatura = 'todas_assinadas';
      } else if (clienteAssinou && !corretoraAssinou) {
        statusAssinatura = 'falta_corretora';
      } else if (!clienteAssinou && corretoraAssinou) {
        statusAssinatura = 'falta_cliente';
      } else {
        statusAssinatura = 'faltam_ambas';
      }

      assinaturasConcluidas = (clienteAssinou ? 1 : 0) + (corretoraAssinou ? 1 : 0);
      todasAssinadas = statusAssinatura === 'todas_assinadas';
      podeSalvarPreferencia = statusAssinatura === 'falta_corretora' || clienteAssinou;

      signatarios = [
        {
          nome: proponenteSigner?.name || cotacao.client_name || 'Proponente',
          papel: 'cliente' as const,
          assinado: clienteAssinou,
          email: proponenteSigner?.email || cotacao.client_email || '',
        },
        {
          nome: corretoraSigner?.name || 'Corretora',
          papel: 'corretora' as const,
          assinado: corretoraAssinou,
          email: corretoraSigner?.email || 'contato@net4life.com.br',
        },
      ];

      if (statusAssinatura === 'todas_assinadas') {
        message = 'Todas as assinaturas foram concluídas com sucesso!';
      } else if (statusAssinatura === 'falta_corretora') {
        message = 'O Proponente já assinou. Aguardando assinatura da Corretora para emissão da fatura.';
      } else if (statusAssinatura === 'falta_cliente') {
        message = 'A Corretora já assinou. Aguardando assinatura do Proponente.';
      } else {
        message = 'Aguardando assinaturas do Proponente e da Corretora.';
      }
    }

    const signUrlProponente = proponenteSigner?.sign_url || clientData.signUrlProponente || clientData.signUrl || null;
    const signUrlCorretora = totalAssinaturas === 2 ? (corretoraSigner?.sign_url || clientData.signUrlCorretora || null) : null;

    // Atualiza dados no client_data da cotação
    clientData.statusAssinatura = statusAssinatura;
    clientData.clienteAssinou = clienteAssinou;
    clientData.corretoraAssinou = corretoraAssinou;
    clientData.totalAssinaturas = totalAssinaturas;
    clientData.assinaturasNecessarias = requisitos.papeis;
    clientData.contratoModo = requisitos.modo;
    if (totalAssinaturas === 2 && signUrlCorretora) {
      clientData.signUrlCorretora = signUrlCorretora;
    } else {
      delete clientData.signUrlCorretora;
    }
    if (signUrlProponente) clientData.signUrlProponente = signUrlProponente;

    const pdfLink =
      resJson.signed_file ||
      resJson.signed_file_url ||
      resJson.original_file ||
      clientData.contratoPdf ||
      existingPdf ||
      null;

    if (pdfLink) {
      clientData.contratoPdf = pdfLink;
    }
    if (signUrlProponente) {
      clientData.signUrl = signUrlProponente;
    }

    if (todasAssinadas) {
      clientData.assinadoEm = clientData.assinadoEm || new Date().toISOString();

      const canAdvanceToAssinado = ['contrato_gerado', 'enviada', 'rascunho'].includes(cotacao.status);

      // Atualiza status da cotação
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
          signed_file_url = COALESCE(${pdfLink}, signed_file_url),
          sign_url = COALESCE(${signUrlProponente}, sign_url),
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

      // Regra obrigatória: A cobrança Asaas só é emitida automaticamente se já houver formaPagamentoPreferida salva em client_data
      let paymentInfo: any = null;
      if (clientData.formaPagamentoPreferida) {
        try {
          const isManualAdmin = user ? isInternalUser(user) : false;
          paymentInfo = await generateAsaasPaymentForQuote(cotacao.id, { isManualAdmin });
        } catch (paymentErr) {
          logger.error({ paymentErr, cotacaoId: cotacao.id }, 'api.portal.verificar-assinatura.asaas_payment_failed');
        }
      }

      return Response.json({
        ok: true,
        status: canAdvanceToAssinado ? 'assinado' : cotacao.status,
        assinado: true,
        statusAssinatura,
        assinaturasConcluidas,
        totalAssinaturas,
        podeSalvarPreferencia,
        signUrlCorretora,
        signatarios,
        message,
        contratoPdf: pdfLink,
        checkoutId: paymentInfo?.checkoutId || clientData.checkoutId || null,
        linkBoleto: paymentInfo?.linkBoleto || clientData.linkBoleto || null,
        dueDate: paymentInfo?.dueDate || clientData.dataVencimento || null,
        paymentError: paymentInfo?.ok === false ? paymentInfo.error : undefined,
      });
    }

    // Caso não estejam todas assinadas: verifica se expirou
    const isExpired = resJson.status === 'expired' || (clientData.contratoPrazoLimite && new Date() > new Date(clientData.contratoPrazoLimite));
    if (isExpired) {
      await sql`
        UPDATE signature_documents
        SET status = 'expired', updated_at = NOW(), raw_payload = ${JSON.stringify(resJson)}::jsonb
        WHERE cotacao_id = ${cotacao.id} AND provider = 'zapsign' AND status NOT IN ('signed', 'cancelled')
      `;
      return Response.json({
        ok: true,
        status: cotacao.status,
        assinado: false,
        statusAssinatura,
        assinaturasConcluidas,
        totalAssinaturas,
        podeSalvarPreferencia,
        signUrlCorretora,
        signatarios,
        expirado: true,
        message: 'O prazo de assinatura de 7 dias expirou sem assinatura. Clique em "Regerar Minuta" para emitir um novo contrato.'
      });
    }

    // Quando não estão todas assinadas: se a cotação estava marcada como 'assinado' indevidamente,
    // reverte para 'contrato_gerado' e limpa assinadoEm para refletir a pendência da 2ª assinatura.
    delete clientData.assinadoEm;
    const newCotacaoStatus = cotacao.status === 'assinado' ? 'contrato_gerado' : cotacao.status;

    await sql`
      UPDATE cotacoes
      SET
        status = ${newCotacaoStatus},
        client_data = ${JSON.stringify(clientData)}::jsonb,
        updated_at = NOW()
      WHERE id = ${cotacao.id}
    `;

    await sql`
      UPDATE signature_documents
      SET
        status = 'pending',
        raw_payload = ${JSON.stringify(resJson)}::jsonb,
        updated_at = NOW()
      WHERE cotacao_id = ${cotacao.id} AND provider = 'zapsign'
    `;

    return Response.json({
      ok: true,
      status: newCotacaoStatus,
      assinado: false,
      statusAssinatura,
      assinaturasConcluidas,
      totalAssinaturas,
      podeSalvarPreferencia,
      signUrlCorretora,
      signatarios,
      message,
    });

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, errorMsg, cotacaoId: id }, 'api.portal.verificar-assinatura.failed');
    return Response.json({
      error: `Erro interno ao verificar assinatura: ${errorMsg}`,
      details: errorMsg,
    }, { status: 500 });
  }
}
