import { sql } from './pg';
import { logger } from './logger';
import { sendTemplatedEmail } from './email-service';
import { resolveWhiteLabelForPartnerId, buildEmailWhiteLabelVariables } from './email-whitelabel';
import { dispatchDomainEvent } from './triggers/dispatcher';

export interface NotificarConflitoCadastralParams {
  cotacaoId: string;
  clienteNome: string;
  clienteDocumento: string;
  clienteEmail?: string | null;
  clienteTelefone?: string | null;
  produtoNome?: string | null;
  targetPartnerId?: string | null;
  userId?: string | null;
  req?: Request | null;
  origin?: string | null;
}

export interface NotificarConflitoCadastralResult {
  sent: boolean;
  sellerEmail?: string;
  sellerName?: string;
  linkResolucao: string;
  error?: string;
}

/**
 * Notifica imediatamente o vendedor/corretor responsável quando um cliente preenche
 * uma proposta pública ou exclusiva com duplicidade cadastral (CPF/CNPJ divergente de registro anterior).
 */
export async function notificarVendedorConflitoCadastral(
  params: NotificarConflitoCadastralParams
): Promise<NotificarConflitoCadastralResult> {
  const { cotacaoId, clienteNome, clienteDocumento } = params;

  // 1. Determina o e-mail e nome do vendedor responsável
  let sellerEmail: string | null = null;
  let sellerName: string = 'Vendedor';

  if (params.userId) {
    try {
      const [pu] = await sql<{ email: string; name: string }[]>`
        SELECT email, name FROM partner_users WHERE id = ${params.userId} LIMIT 1
      `;
      if (pu?.email) {
        sellerEmail = pu.email;
        sellerName = pu.name || sellerName;
      } else {
        const [u] = await sql<{ email: string; name: string }[]>`
          SELECT email, name FROM users WHERE id = ${params.userId} LIMIT 1
        `;
        if (u?.email) {
          sellerEmail = u.email;
          sellerName = u.name || sellerName;
        }
      }
    } catch (err) {
      logger.warn({ err, userId: params.userId }, 'cadastral_alerts.find_user_failed');
    }
  }

  // Fallback: se não encontrou usuário direto, busca o parceiro ou o primeiro usuário ativo do parceiro
  if (!sellerEmail && params.targetPartnerId) {
    try {
      const [partner] = await sql<{ email: string; name: string; nome_fantasia: string; company_name: string }[]>`
        SELECT email, name, nome_fantasia, company_name FROM partners WHERE id = ${params.targetPartnerId} LIMIT 1
      `;
      if (partner?.email) {
        sellerEmail = partner.email;
        sellerName = partner.name || partner.nome_fantasia || partner.company_name || sellerName;
      } else {
        const [pu] = await sql<{ email: string; name: string }[]>`
          SELECT email, name FROM partner_users WHERE partner_id = ${params.targetPartnerId} ORDER BY created_at ASC LIMIT 1
        `;
        if (pu?.email) {
          sellerEmail = pu.email;
          sellerName = pu.name || sellerName;
        }
      }
    } catch (err) {
      logger.warn({ err, partnerId: params.targetPartnerId }, 'cadastral_alerts.find_partner_failed');
    }
  }

  // 2. Determina a URL base para navegação direta ao comparador de duplicidade
  let baseUrl = process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || '';
  if (!baseUrl && params.req) {
    const originHeader = params.req.headers.get('origin');
    const forwardedHost = params.req.headers.get('x-forwarded-host');
    const hostHeader = params.req.headers.get('host');
    const rawHost = originHeader || forwardedHost || hostHeader;
    if (rawHost) {
      const proto = params.req.headers.get('x-forwarded-proto') || 'https';
      baseUrl = rawHost.startsWith('http') ? rawHost : `${proto}://${rawHost}`;
    }
  }
  if (!baseUrl && params.origin) {
    baseUrl = params.origin;
  }
  if (!baseUrl) {
    baseUrl = 'https://duolife.net.br';
  }

  const linkResolucao = `${baseUrl.replace(/\/$/, '')}/portal/cotacoes/${cotacaoId}`;

  if (!sellerEmail) {
    logger.warn({ cotacaoId, targetPartnerId: params.targetPartnerId }, 'cadastral_alerts.no_seller_email_found');
    return {
      sent: false,
      linkResolucao,
      error: 'Vendedor responsável não possui e-mail cadastrado para recebimento de alertas.',
    };
  }

  // 3. Resolve variáveis White-Label do parceiro
  let wlVars: Record<string, any> = {};
  let fromName: string | undefined = undefined;
  let replyTo: string | undefined = undefined;

  if (params.targetPartnerId) {
    try {
      const wlConfig = await resolveWhiteLabelForPartnerId(params.targetPartnerId);
      const built = buildEmailWhiteLabelVariables(wlConfig);
      wlVars = built;
      fromName = built.from_name;
      replyTo = built.reply_to;
    } catch (e) {
      logger.warn({ err: e }, 'cadastral_alerts.resolve_whitelabel_failed');
    }
  }

  // 4. Dispara e-mail transacional prioritário para o vendedor
  let emailSuccess = false;
  let emailError: string | undefined = undefined;

  try {
    const emailRes = await sendTemplatedEmail({
      templateCode: 'alerta_conflito_cadastral_vendedor',
      to: sellerEmail,
      toName: sellerName,
      fromName,
      replyTo,
      variables: {
        ...wlVars,
        nome: sellerName,
        cliente_nome: clienteNome,
        cliente_documento: clienteDocumento,
        cliente_telefone: params.clienteTelefone || 'Não informado',
        cliente_email: params.clienteEmail || 'Não informado',
        cotacao_id: cotacaoId,
        produto_nome: params.produtoNome || 'Seguro RC Profissional',
        link_resolucao: linkResolucao,
      },
      metadata: {
        cotacao_id: cotacaoId,
        motivo: 'conflito_cadastral_duplicidade',
        target_partner_id: params.targetPartnerId,
        seller_user_id: params.userId,
      },
    });

    emailSuccess = emailRes.success;
    emailError = emailRes.error;

    logger.info(
      {
        cotacaoId,
        sellerEmail,
        success: emailSuccess,
      },
      'cadastral_alerts.seller_notified'
    );
  } catch (err: any) {
    emailError = err?.message || 'Falha ao enviar e-mail de alerta';
    logger.error({ err, cotacaoId, sellerEmail }, 'cadastral_alerts.email_send_failed');
  }

  // 5. Dispara evento de domínio para o motor de gatilhos
  try {
    await dispatchDomainEvent('CONFLITO_CADASTRAL_DETECTADO', {
      eventType: 'CONFLITO_CADASTRAL_DETECTADO',
      contextId: cotacaoId,
      cotacao: {
        id: cotacaoId,
        produto_nome: params.produtoNome || undefined,
        status: 'pendente_duplicidade',
      },
      parceiro: params.targetPartnerId ? { id: params.targetPartnerId } : undefined,
      vendedor: {
        id: params.userId || undefined,
        nome: sellerName,
        email: sellerEmail,
      },
      cliente: {
        nome: clienteNome,
        documento: clienteDocumento,
        email: params.clienteEmail || undefined,
        telefone: params.clienteTelefone || undefined,
      },
      dados: {
        linkResolucao,
        produtoNome: params.produtoNome,
      },
    });
  } catch (eventErr) {
    logger.warn({ eventErr, cotacaoId }, 'cadastral_alerts.dispatch_event_failed');
  }

  return {
    sent: emailSuccess,
    sellerEmail,
    sellerName,
    linkResolucao,
    error: emailError,
  };
}
