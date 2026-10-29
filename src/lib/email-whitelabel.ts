import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import {
  resolveHierarchicalWhiteLabel,
  getWhiteLabelConfig,
  DEFAULT_WHITE_LABEL,
  type WhiteLabelConfig,
} from '@/lib/white-label';

export interface EmailWhiteLabelVariables {
  empresa_nome: string;
  empresa_slogan: string;
  empresa_telefone: string;
  empresa_email: string;
  empresa_site: string;
  empresa_susep: string;
  logo_url: string;
  cor_primaria: string;
  cor_secundaria: string;
  cor_destaque: string;
  whitelabel_header_html: string;
  whitelabel_footer_html: string;
  from_name: string;
  reply_to?: string;
}

export interface ResolvedWhiteLabelContext {
  whiteLabel: WhiteLabelConfig;
  partnerEmail?: string;
}

/**
 * Sanitiza texto para inserção segura em strings HTML.
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Remove quebras de linha de cabeçalhos SMTP para prevenir CRLF Injection.
 */
function sanitizeHeader(val?: string | null): string {
  if (!val) return '';
  return String(val).replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Constrói o conjunto completo de variáveis e fragmentos HTML White-Label para templates de e-mail.
 */
export function buildEmailWhiteLabelVariables(
  whiteLabel: WhiteLabelConfig,
  fallbackPartnerEmail?: string
): EmailWhiteLabelVariables {
  const empresa_nome = (whiteLabel.companyName || '').trim() || 'DuoLife';
  const empresa_slogan = whiteLabel.companySlogan || '';
  const empresa_telefone = whiteLabel.companyPhone || '';
  const empresa_email = whiteLabel.companyEmail || '';
  const empresa_site = whiteLabel.companyWebsite || '';
  const empresa_susep = whiteLabel.susep || '';
  const logo_url = whiteLabel.logoUrl || '';

  const cor_primaria = whiteLabel.primaryColor || '#0e4a5a';
  const cor_secundaria = whiteLabel.secondaryColor || '#7fa8b2';
  const cor_destaque = whiteLabel.accentColor || '#00d4e0';

  // Cabeçalho de e-mail: Se houver logotipo, exibe <img>; caso contrário, exibe <h1> limpo
  let whitelabel_header_html = '';
  if (logo_url.trim()) {
    whitelabel_header_html = `<img src="${escapeHtml(logo_url.trim())}" alt="${escapeHtml(empresa_nome)}" style="max-height: 48px; max-width: 200px; display: block;" border="0" />`;
  } else {
    whitelabel_header_html = `<h1 style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 24px; font-weight: 700; color: ${escapeHtml(cor_primaria)}; line-height: 1.2;">${escapeHtml(empresa_nome)}</h1>`;
  }

  // Rodapé de e-mail com identificação da empresa, telefone e e-mail de contato
  const footerParts = [
    escapeHtml(empresa_nome),
    empresa_telefone ? escapeHtml(empresa_telefone) : null,
    empresa_email ? escapeHtml(empresa_email) : null,
    empresa_susep ? `SUSEP: ${escapeHtml(empresa_susep)}` : null,
  ].filter(Boolean);

  const whitelabel_footer_html = `<p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #6b7280; line-height: 1.5;">${footerParts.join(' • ')}</p>`;

  // Nome do remetente (From): ex "Silva Seguros via DuoLife" ou "DuoLife Hub"
  const isCustomName = empresa_nome.toLowerCase() !== 'duolife';
  const rawFromName = isCustomName ? `${empresa_nome} via DuoLife` : 'DuoLife Hub';
  const from_name = sanitizeHeader(rawFromName);

  // E-mail de resposta (Reply-To): email da empresa/corretora ou fallback do parceiro
  const rawReplyTo = empresa_email.trim() || fallbackPartnerEmail?.trim() || undefined;
  const reply_to = rawReplyTo ? sanitizeHeader(rawReplyTo) : undefined;

  return {
    empresa_nome,
    empresa_slogan,
    empresa_telefone,
    empresa_email,
    empresa_site,
    empresa_susep,
    logo_url,
    cor_primaria,
    cor_secundaria,
    cor_destaque,
    whitelabel_header_html,
    whitelabel_footer_html,
    from_name,
    reply_to,
  };
}

/**
 * Resolve a identidade White-Label de um parceiro aplicando herança com sua Corretora Mãe.
 */
export async function resolveWhiteLabelForPartnerId(partnerId: string): Promise<WhiteLabelConfig> {
  if (!partnerId || typeof partnerId !== 'string' || !partnerId.trim()) {
    return { ...DEFAULT_WHITE_LABEL };
  }

  try {
    const rows = await sql<
      Array<{
        id: string;
        email: string;
        metadata: unknown;
        corretora_metadata: unknown;
      }>
    >`
      SELECT 
        p.id, 
        p.email, 
        p.metadata, 
        c.metadata AS corretora_metadata
      FROM partners p
      LEFT JOIN corretoras c ON c.id = p.corretora_id
      WHERE p.id = ${partnerId.trim()}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return { ...DEFAULT_WHITE_LABEL };
    }

    return resolveHierarchicalWhiteLabel(rows[0].metadata, rows[0].corretora_metadata);
  } catch (err) {
    logger.warn({ partnerId, err }, 'email_whitelabel.resolve_partner_failed');
    return { ...DEFAULT_WHITE_LABEL };
  }
}

/**
 * Resolve o White-Label associado a uma cotação através do seu parceiro de venda.
 */
export async function resolveWhiteLabelForQuoteId(quoteId: string): Promise<WhiteLabelConfig> {
  if (!quoteId || typeof quoteId !== 'string' || !quoteId.trim()) {
    return { ...DEFAULT_WHITE_LABEL };
  }

  try {
    const rows = await sql<Array<{ partner_id: string | null }>>`
      SELECT partner_id
      FROM cotacoes
      WHERE id = ${quoteId.trim()}
      LIMIT 1
    `;

    if (!rows || rows.length === 0 || !rows[0].partner_id) {
      return { ...DEFAULT_WHITE_LABEL };
    }

    return resolveWhiteLabelForPartnerId(rows[0].partner_id);
  } catch (err) {
    logger.warn({ quoteId, err }, 'email_whitelabel.resolve_quote_failed');
    return { ...DEFAULT_WHITE_LABEL };
  }
}

/**
 * Resolve o White-Label e o e-mail do parceiro a partir do contexto de disparo de notificação.
 */
export async function resolveWhiteLabelForContext(context: any): Promise<ResolvedWhiteLabelContext> {
  if (!context || typeof context !== 'object') {
    return { whiteLabel: { ...DEFAULT_WHITE_LABEL } };
  }

  const partnerId =
    context.parceiro?.id ||
    context.partner?.id ||
    context.partnerId ||
    context.parceiroId;

  const quoteId =
    context.cotacao?.id ||
    context.quote?.id ||
    context.quoteId ||
    context.cotacaoId;

  const contextPartnerEmail =
    context.parceiro?.email ||
    context.partner?.email;

  // 1. Resolução via Partner ID direto
  if (partnerId && typeof partnerId === 'string' && partnerId.trim()) {
    try {
      const rows = await sql<
        Array<{
          id: string;
          email: string;
          metadata: unknown;
          corretora_metadata: unknown;
        }>
      >`
        SELECT 
          p.id, 
          p.email, 
          p.metadata, 
          c.metadata AS corretora_metadata
        FROM partners p
        LEFT JOIN corretoras c ON c.id = p.corretora_id
        WHERE p.id = ${partnerId.trim()}
        LIMIT 1
      `;

      if (rows && rows.length > 0) {
        const whiteLabel = resolveHierarchicalWhiteLabel(rows[0].metadata, rows[0].corretora_metadata);
        const partnerEmail = contextPartnerEmail || rows[0].email || undefined;
        return { whiteLabel, partnerEmail };
      }

      return {
        whiteLabel: { ...DEFAULT_WHITE_LABEL },
        partnerEmail: contextPartnerEmail || undefined,
      };
    } catch (err) {
      logger.warn({ partnerId, err }, 'email_whitelabel.resolve_context_partner_failed');
      return {
        whiteLabel: { ...DEFAULT_WHITE_LABEL },
        partnerEmail: contextPartnerEmail || undefined,
      };
    }
  }

  // 2. Resolução via Quote ID
  if (quoteId && typeof quoteId === 'string' && quoteId.trim()) {
    try {
      const quoteRows = await sql<Array<{ partner_id: string | null }>>`
        SELECT partner_id
        FROM cotacoes
        WHERE id = ${quoteId.trim()}
        LIMIT 1
      `;

      if (quoteRows && quoteRows.length > 0 && quoteRows[0].partner_id) {
        return resolveWhiteLabelForContext({
          ...context,
          parceiro: {
            id: quoteRows[0].partner_id,
            email: contextPartnerEmail,
          },
        });
      }
    } catch (err) {
      logger.warn({ quoteId, err }, 'email_whitelabel.resolve_context_quote_failed');
    }
  }

  // 3. Fallback DuoLife padrão
  return {
    whiteLabel: { ...DEFAULT_WHITE_LABEL },
    partnerEmail: contextPartnerEmail || undefined,
  };
}
