import { sql } from './pg';
import { sendMail } from './mailer';
import { logger } from './logger';

export interface EmailTemplate {
  id: string;
  code: string;
  name: string;
  subject: string;
  body_html: string;
  body_text?: string | null;
  variables: string[];
  design_json?: any;
  external_id?: string | null;
  last_synced_at?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailDispatchLog {
  id: string;
  template_code: string | null;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  body_html?: string | null;
  status: 'sent' | 'failed' | 'mocked';
  provider: string;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface SendTemplatedEmailOptions {
  templateCode: string;
  to: string;
  toName?: string | null;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface SendTemplatedEmailResult {
  success: boolean;
  mock?: boolean;
  error?: string;
  logId?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCpfCnpjIfRaw(v: unknown): string {
  if (typeof v !== 'string') return v ? String(v) : '';
  const digits = v.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return v;
}

/**
 * Normaliza e enriquece dicionário de variáveis com aliases bidirecionais,
 * garantindo compatibilidade entre templates de diferentes módulos e autores.
 */
export function normalizeEmailVariables(rawVars: Record<string, any> = {}): Record<string, any> {
  const norm: Record<string, any> = { ...rawVars };

  // 1. Cliente: nome e email
  const clienteNome = norm.cliente_nome || norm.nome || norm['cliente.nome'];
  if (clienteNome && !norm.cliente_nome) norm.cliente_nome = clienteNome;
  if (clienteNome && !norm.nome) norm.nome = clienteNome;

  const clienteEmail = norm.cliente_email || norm.email || norm['cliente.email'];
  if (clienteEmail && !norm.cliente_email) norm.cliente_email = clienteEmail;
  if (clienteEmail && !norm.email) norm.email = clienteEmail;

  // 2. Documento do cliente (com e sem máscara)
  const doc = norm.cliente_documento || norm.documento || norm.cpf || norm.cnpj || norm['cliente.documento'];
  if (doc) {
    const formattedDoc = formatCpfCnpjIfRaw(doc);
    norm.cliente_documento = formattedDoc;
    norm.documento = formattedDoc;
    norm.cpf_cnpj = formattedDoc;
  }

  // 3. Telefone
  const tel = norm.cliente_telefone || norm.telefone || norm.celular || norm['cliente.telefone'];
  if (tel) {
    if (!norm.cliente_telefone) norm.cliente_telefone = tel;
    if (!norm.telefone) norm.telefone = tel;
  }

  // 4. Vencimento
  const venc = norm.data_vencimento || norm.vencimento;
  if (venc) {
    if (!norm.data_vencimento) norm.data_vencimento = venc;
    if (!norm.vencimento) norm.vencimento = venc;
  }

  // 5. Valores financeiros
  const val = norm.valor || norm.valor_parcela || norm.premio_atual || norm.premio_final;
  if (val !== undefined && val !== null) {
    if (norm.valor === undefined) norm.valor = val;
    if (norm.valor_parcela === undefined) norm.valor_parcela = val;
    if (norm.premio_atual === undefined) norm.premio_atual = val;
  }

  // 6. Links de Fatura, Proposta, Assinatura e Redefinição
  const linkFatura = norm.link_fatura || norm.fatura_url || norm.link_boleto || norm.invoice_url;
  if (linkFatura) {
    if (!norm.link_fatura) norm.link_fatura = linkFatura;
    if (!norm.fatura_url) norm.fatura_url = linkFatura;
    if (!norm.link_boleto) norm.link_boleto = linkFatura;
  }

  const linkAssinatura = norm.link_assinatura || norm.sign_url || norm.signUrl || norm.link_contrato;
  if (linkAssinatura) {
    if (!norm.link_assinatura) norm.link_assinatura = linkAssinatura;
    if (!norm.sign_url) norm.sign_url = linkAssinatura;
    if (!norm.signUrl) norm.signUrl = linkAssinatura;
    if (!norm.link_contrato) norm.link_contrato = linkAssinatura;
  }

  const linkProposta = norm.link_proposta || norm.proposta_url || norm.quote_url || linkAssinatura;
  if (linkProposta) {
    if (!norm.link_proposta) norm.link_proposta = linkProposta;
    if (!norm.proposta_url) norm.proposta_url = linkProposta;
    if (!norm.link_assinatura) norm.link_assinatura = linkProposta;
  }

  const linkReset = norm.link_reset || norm.reset_url;
  if (linkReset) {
    if (!norm.link_reset) norm.link_reset = linkReset;
    if (!norm.reset_url) norm.reset_url = linkReset;
  }

  // 7. Apólice e Cotação
  const apolice = norm.apolice_numero || norm.numero_apolice || norm.policy_number;
  if (apolice) {
    if (!norm.apolice_numero) norm.apolice_numero = apolice;
    if (!norm.numero_apolice) norm.numero_apolice = apolice;
  }

  const cotacaoId = norm.cotacao_id || norm.proposta_id || norm.quote_id;
  if (cotacaoId) {
    if (!norm.cotacao_id) norm.cotacao_id = cotacaoId;
    if (!norm.proposta_id) norm.proposta_id = cotacaoId;
  }

  // 8. Parceiro e Vendedor
  const parcNome = norm.parceiro_nome || norm.corretor_nome || norm['parceiro.nome'];
  if (parcNome) {
    if (!norm.parceiro_nome) norm.parceiro_nome = parcNome;
    if (!norm.corretor_nome) norm.corretor_nome = parcNome;
  }

  // 9. Forma de Pagamento
  const formaPag = norm.forma_pagamento || norm.formaPagamento || norm.billing_type || norm.billingType;
  if (formaPag) {
    if (!norm.forma_pagamento) norm.forma_pagamento = formaPag;
    if (!norm.billing_type) norm.billing_type = formaPag;
  }
  const formaPagTexto = norm.forma_pagamento_texto || norm.formaPagamentoTexto;
  if (formaPagTexto && !norm.forma_pagamento_texto) {
    norm.forma_pagamento_texto = formaPagTexto;
  }

  return norm;
}

function resolveNestedVariable(obj: Record<string, any>, path: string): any {
  if (obj[path] !== undefined) return obj[path];
  const parts = path.split('.');
  let current: any = obj;
  for (const p of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[p];
  }
  return current;
}

/**
 * Detecta variáveis no padrão {{nome_variavel}} ou {{nome_variavel|fallback}} no código HTML
 */
export function extractTemplateVariables(html: string): string[] {
  const matches = html.match(/\{\{([a-zA-Z0-9_.-]+)(?:\|[^}]+)?\}\}/g) || [];
  const uniqueVars = new Set<string>();

  for (const match of matches) {
    let raw = match.replace(/\{\{|\}\}/g, '').trim();
    if (raw.includes('|')) {
      raw = raw.split('|')[0].trim();
    }
    // Ignora variáveis automáticas do sistema
    if (raw && !raw.startsWith('-') && !uniqueVars.has(raw)) {
      uniqueVars.add(raw);
    }
  }

  return Array.from(uniqueVars);
}

/**
 * Renderiza o texto substituindo variáveis {{variavel}} e automáticas
 */
export function renderTemplateString(
  content: string,
  variables: Record<string, any> = {},
  isHtml = false
): string {
  const normalizedVars = normalizeEmailVariables(variables);
  const now = new Date();
  const dataHoje = now.toLocaleDateString('pt-BR');
  const horaHoje = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dataHoraHoje = `${dataHoje} ${horaHoje}`;
  const anoHoje = String(now.getFullYear());

  const systemVars: Record<string, string> = {
    '-data-': dataHoje,
    '-hora-': horaHoje,
    '-data_hora-': dataHoraHoje,
    '-ano-': anoHoje,
    '-aplicativo-': 'DuoLife Hub',
  };

  return content.replace(/\{\{([a-zA-Z0-9_.-]+)(?:\|([^}]+))?\}\}/g, (_, key: string, fallback?: string) => {
    // Variáveis globais do sistema
    if (systemVars[key] !== undefined) {
      return systemVars[key];
    }

    // Variáveis informadas no contexto (direta ou por notação de ponto)
    const resolvedVal = resolveNestedVariable(normalizedVars, key);
    if (resolvedVal !== undefined && resolvedVal !== null) {
      let strVal = typeof resolvedVal === 'object' ? JSON.stringify(resolvedVal) : String(resolvedVal);
      // Se for template HTML e não for link/url de reset ou fatura, escapa entidades HTML
      if (isHtml && !key.includes('link') && !key.includes('url') && !key.includes('html')) {
        strVal = escapeHtml(strVal);
      }
      return strVal;
    }

    // Fallback configurado na tag: {{nome|Cliente}}
    if (fallback !== undefined) {
      return isHtml ? escapeHtml(fallback) : fallback;
    }

    // Se nenhuma correspondência, mantém tag visível ou vazia
    return ``;
  });
}

/**
 * Dispara e-mail a partir de um código de template ativo no banco
 */
export async function sendTemplatedEmail({
  templateCode,
  to,
  toName,
  variables = {},
  metadata = {},
}: SendTemplatedEmailOptions): Promise<SendTemplatedEmailResult> {
  const normalizedCode = templateCode.trim().toLowerCase();

  // 1. Busca o template no banco de dados
  let [template] = await sql<EmailTemplate[]>`
    SELECT id, code, name, subject, body_html, body_text, variables, external_id, last_synced_at, is_active, created_at, updated_at
    FROM email_templates
    WHERE code = ${normalizedCode} AND is_active = true
    LIMIT 1
  `;

  if (!template) {
    try {
      await ensureDefaultEmailTemplates();
      [template] = await sql<EmailTemplate[]>`
        SELECT id, code, name, subject, body_html, body_text, variables, external_id, last_synced_at, is_active, created_at, updated_at
        FROM email_templates
        WHERE code = ${normalizedCode} AND is_active = true
        LIMIT 1
      `;
    } catch {
      // Continua se falhar
    }
  }

  if (!template) {
    logger.warn({ templateCode: normalizedCode }, 'Template de e-mail não encontrado ou inativo');
    return {
      success: false,
      error: `Template de e-mail '${normalizedCode}' não cadastrado ou inativo.`,
    };
  }

  // 2. Mescla variáveis com nome/email padrão se não informados e normaliza aliases
  const mergedVars: Record<string, any> = normalizeEmailVariables({
    nome: toName || variables.nome || 'Cliente',
    email: to,
    ...variables,
  });

  const renderedSubject = renderTemplateString(template.subject, mergedVars, false);
  const renderedHtml = renderTemplateString(template.body_html, mergedVars, true);

  // 3. Executa o envio via Mailer oficial
  const result = await sendMail({
    to,
    toName,
    subject: renderedSubject,
    html: renderedHtml,
    templateId: template.external_id,
    variables: mergedVars,
  });

  const status = result.success ? (result.mock ? 'mocked' : 'sent') : 'failed';
  const errorMessage = result.error ? (result.error instanceof Error ? result.error.message : String(result.error)) : null;
  const provider = result.provider || (result.mock ? 'mock' : 'nodemailer_smtp');

  // 4. Registra no log de auditoria
  try {
    const [log] = await sql<EmailDispatchLog[]>`
      INSERT INTO email_dispatch_logs (
        template_code, recipient_email, recipient_name, subject, body_html, status, provider, error_message, metadata
      ) VALUES (
        ${normalizedCode},
        ${to},
        ${toName || null},
        ${renderedSubject},
        ${renderedHtml},
        ${status},
        ${provider},
        ${errorMessage},
        ${sql.json({ ...metadata, variables: mergedVars, externalTemplateId: template.external_id })}
      ) RETURNING id, template_code, recipient_email, recipient_name, subject, body_html, status, provider, error_message, metadata, created_at
    `;

    return {
      success: result.success,
      mock: result.mock,
      error: errorMessage || undefined,
      logId: log?.id,
    };
  } catch (logErr) {
    logger.error({ logErr }, 'Falha ao registrar log de disparo de e-mail');
    return {
      success: result.success,
      mock: result.mock,
      error: errorMessage || undefined,
    };
  }
}

/**
 * Resolve o conteúdo HTML final de um log de disparo de e-mail para auditoria/visualização.
 * Se o HTML já foi persistido no banco, retorna diretamente.
 * Se for um log anterior (legado) que não possui body_html gravado,
 * reconstrói dinamicamente com base no template_code e variáveis do metadata.
 */
export async function resolveEmailLogHtml(log: EmailDispatchLog): Promise<string> {
  if (log.body_html && log.body_html.trim().length > 0) {
    return log.body_html;
  }

  // Tenta reconstruir a partir do template cadastrado
  if (log.template_code) {
    const [template] = await sql<EmailTemplate[]>`
      SELECT body_html FROM email_templates WHERE code = ${log.template_code} LIMIT 1
    `;

    if (template && template.body_html) {
      const vars = (log.metadata?.variables as Record<string, any>) || {};
      return renderTemplateString(template.body_html, vars, true);
    }
  }

  // Fallback elegante caso não haja template nem body_html
  const recipient = log.recipient_name
    ? `${log.recipient_name} &lt;${log.recipient_email}&gt;`
    : log.recipient_email;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; line-height: 1.5;">
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 8px 0; color: #0e4a5a; font-size: 16px;">${log.subject || 'E-mail do Sistema'}</h3>
        <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>Destinatário:</strong> ${recipient}</p>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;"><strong>Provedor:</strong> ${log.provider} | <strong>Status:</strong> ${log.status}</p>
      </div>
      <p style="color: #64748b; font-size: 14px; font-style: italic;">
        O corpo HTML original deste registro legado não pôde ser reconstruído automaticamente pois o template associado não foi encontrado.
      </p>
    </div>
  `;
}

/**
 * Cria templates padrões no banco de dados caso não existam
 */
export async function ensureDefaultEmailTemplates(): Promise<void> {
  const defaultTemplates = [
    {
      code: 'boas_vindas',
      name: 'Boas-vindas — Novo Cliente / Lead',
      subject: 'Seja bem-vindo à DuoLife, {{nome|Cliente}}!',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #0e4a5a; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: bold; }
    .content { padding: 32px 24px; line-height: 1.6; }
    .btn { display: inline-block; background: #0e4a5a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>DuoLife Hub</h1>
    </div>
    <div class="content">
      <h2>Olá, {{nome|Cliente}}!</h2>
      <p>É um prazer receber você na <strong>DuoLife</strong>. Agradecemos pelo seu contato e confiança em nossas soluções de proteção profissional.</p>
      <p>Nossa equipe técnica e comercial já está à disposição para apoiar você em todas as etapas.</p>
      <p style="margin-top: 24px;">Atenciosamente,<br><strong>Equipe DuoLife</strong></p>
    </div>
    <div class="footer">
      Este e-mail foi enviado automaticamente pelo DuoLife Hub em {{-data-}} às {{-hora-}}.
    </div>
  </div>
</body>
</html>`,
      variables: ['nome'],
    },
    {
      code: 'cotacao_gerada',
      name: 'Proposta / Cotação Gerada',
      subject: 'Sua Cotação DuoLife #{{cotacao_id}} está pronta!',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #0e4a5a; color: #ffffff; padding: 24px; text-align: center; }
    .content { padding: 32px 24px; line-height: 1.6; }
    .card-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .btn { display: inline-block; background: #00d4e0; color: #0e4a5a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0;">Proposta de Seguro DuoLife</h2>
    </div>
    <div class="content">
      <p>Olá, <strong>{{nome|Cliente}}</strong>!</p>
      <p>Preparamos a sua cotação personalizada para o produto <strong>{{produto_nome|Seguro RC Profissional}}</strong>.</p>
      <div class="card-info">
        <p style="margin: 4px 0;"><strong>Importância Segurada:</strong> R$ {{cobertura|100.000,00}}</p>
        <p style="margin: 4px 0;"><strong>Prêmio Anual:</strong> R$ {{valor|0,00}}</p>
        <p style="margin: 4px 0;"><strong>Corretor / Parceiro:</strong> {{parceiro_nome|DuoLife}}</p>
      </div>
      <p>Para revisar as coberturas e prosseguir com a contratação, acesse o link seguro abaixo:</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{{link_proposta|https://duolife.com.br}}" class="btn">Visualizar e Assinar Proposta</a>
      </div>
    </div>
    <div class="footer">
      DuoLife Seguros & Benefícios &bull; {{-ano-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'cotacao_id', 'produto_nome', 'cobertura', 'valor', 'parceiro_nome', 'link_proposta'],
    },
    {
      code: 'proposta_criada',
      name: 'Proposta Criada / Contrato para Assinatura (ZapSign)',
      subject: 'Sua Proposta e Contrato de Seguro estão prontos para assinatura — Proposta #{{cotacao_id}}',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #0e4a5a; color: #ffffff; padding: 24px; text-align: center; }
    .content { padding: 32px 24px; line-height: 1.6; }
    .card-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .badge { display: inline-block; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; border-radius: 6px; padding: 4px 10px; font-weight: bold; font-size: 12px; margin-bottom: 12px; }
    .btn { display: inline-block; background: #00d4e0; color: #0e4a5a; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; }
    .notice-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin-top: 24px; font-size: 13px; color: #166534; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0;">Proposta e Contrato de Seguro</h2>
    </div>
    <div class="content">
      <span class="badge">&bull; Documento Gerado via ZapSign</span>
      <p>Olá, <strong>{{nome|Cliente}}</strong>!</p>
      <p>A sua proposta para o produto <strong>{{produto_nome|Seguro RC Profissional}}</strong> (Proposta <strong>#{{cotacao_id}}</strong>) foi gerada com sucesso e o documento contratual já está pronto para a sua assinatura eletrônica.</p>
      <div class="card-info">
        <p style="margin: 4px 0;"><strong>Segurado:</strong> {{cliente_nome|Cliente}}</p>
        <p style="margin: 4px 0;"><strong>CPF/CNPJ:</strong> {{documento}}</p>
        <p style="margin: 4px 0;"><strong>Importância Segurada:</strong> R$ {{cobertura|100.000,00}}</p>
        <p style="margin: 4px 0;"><strong>Prêmio do Seguro:</strong> R$ {{valor|0,00}}</p>
        <p style="margin: 4px 0;"><strong>Corretor / Parceiro:</strong> {{parceiro_nome|DuoLife}}</p>
      </div>
      <p>Clique no botão abaixo para revisar as condições e realizar sua assinatura digital segura:</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="{{link_assinatura}}" class="btn" target="_blank">Assinar Contrato Digitalmente</a>
      </div>
      <div class="notice-box">
        <strong>Assinatura 100% Digital com Validade Jurídica:</strong><br>
        A assinatura é feita de forma prática e imediata pelo seu celular ou computador, sem necessidade de imprimir, escanear ou autenticar em cartório.
      </div>
      <p style="margin-top: 24px;">Atenciosamente,<br><strong>Equipe DuoLife</strong></p>
    </div>
    <div class="footer">
      DuoLife Seguros & Benefícios &bull; Notificação automática gerada em {{-data-}} às {{-hora-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'cliente_nome', 'cotacao_id', 'produto_nome', 'cobertura', 'valor', 'parceiro_nome', 'link_assinatura', 'documento'],
    },
    {
      code: 'contrato_assinado',
      name: 'Contrato Assinado com Sucesso',
      subject: 'Contrato Assinado — Proposta #{{cotacao_id}}',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #059669; color: #ffffff; padding: 24px; text-align: center; }
    .content { padding: 32px 24px; line-height: 1.6; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0;">Contrato Assinado com Sucesso!</h2>
    </div>
    <div class="content">
      <p>Olá, <strong>{{nome|Cliente}}</strong>,</p>
      <p>Confirmamos o recebimento da assinatura eletrônica do seu contrato da proposta <strong>#{{cotacao_id}}</strong>.</p>
      <p>O documento assinado via ZapSign já está registrado em nossos sistemas e o próximo passo é a ativação financeira da sua apólice.</p>
      <p style="margin-top: 24px;">Atenciosamente,<br><strong>Equipe DuoLife</strong></p>
    </div>
    <div class="footer">
      DuoLife Hub &bull; {{-ano-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'cotacao_id'],
    },
    {
      code: 'contrato_assinado_vendedor',
      name: 'Notificação ao Vendedor — Contrato Assinado',
      subject: 'Contrato Assinado pelo Cliente — Proposta #{{cotacao_id}}',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #0e4a5a; color: #ffffff; padding: 24px; text-align: center; }
    .content { padding: 32px 24px; line-height: 1.6; }
    .card-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .badge-success { display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 6px; padding: 6px 12px; font-weight: bold; font-size: 13px; margin-bottom: 12px; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0;">Notificação de Venda — DuoLife Hub</h2>
    </div>
    <div class="content">
      <span class="badge-success">&check; Contrato Assinado via ZapSign</span>
      <p>Olá, <strong>{{nome|Vendedor}}</strong>!</p>
      <p>Ótima notícia: o cliente <strong>{{cliente_nome|Cliente}}</strong> concluiu com sucesso a assinatura eletrônica do contrato referente à proposta <strong>#{{cotacao_id}}</strong>.</p>
      <div class="card-info">
        <p style="margin: 4px 0;"><strong>Segurado:</strong> {{cliente_nome|Cliente}}</p>
        <p style="margin: 4px 0;"><strong>Produto:</strong> {{produto_nome|Seguro RC Profissional}}</p>
        <p style="margin: 4px 0;"><strong>Importância Segurada:</strong> R$ {{cobertura|100.000,00}}</p>
        <p style="margin: 4px 0;"><strong>Prêmio:</strong> R$ {{valor|0,00}}</p>
        <p style="margin: 4px 0;"><strong>Corretora / Parceiro:</strong> {{parceiro_nome|DuoLife}}</p>
      </div>
      <p>O documento assinado já está arquivado no sistema e o link da fatura/cobrança Asaas foi gerado para liquidação do segurado.</p>
      <p style="margin-top: 24px;">Atenciosamente,<br><strong>DuoLife Hub</strong></p>
    </div>
    <div class="footer">
      DuoLife Hub &bull; Notificação automática de produção em {{-data-}} às {{-hora-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'cliente_nome', 'cotacao_id', 'produto_nome', 'cobertura', 'valor', 'parceiro_nome'],
    },
    {
      code: 'fatura_gerada',
      name: 'Fatura e Cobrança para Pagamento',
      subject: 'Fatura Disponível para Pagamento — Proposta #{{cotacao_id}}',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #0e4a5a; color: #ffffff; padding: 24px; text-align: center; }
    .content { padding: 32px 24px; line-height: 1.6; }
    .card-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .btn { display: inline-block; background: #00d4e0; color: #0e4a5a; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0;">Fatura de Seguro Disponível</h2>
    </div>
    <div class="content">
      <p>Olá, <strong>{{nome|Cliente}}</strong>,</p>
      <p>Seu contrato da proposta <strong>#{{cotacao_id}}</strong> foi assinado com sucesso! A cobrança oficial já foi gerada e está pronta para liquidação.</p>
      <div class="card-info">
        <p style="margin: 4px 0;"><strong>Valor:</strong> R$ {{valor|0,00}}</p>
        <p style="margin: 4px 0;"><strong>Vencimento:</strong> {{vencimento}}</p>
        <p style="margin: 4px 0;"><strong>Forma de Pagamento:</strong> {{forma_pagamento_texto|Fatura (Cartão de Crédito, Boleto Bancário ou PIX)}}</p>
      </div>
      <p>Clique no botão abaixo para abrir a sua fatura e efetuar o pagamento:</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="{{link_fatura}}" class="btn" target="_blank">Acessar Fatura para Pagamento</a>
      </div>
      <p style="font-size: 13px; color: #64748b;">Caso nenhuma forma de pagamento tenha sido pré-selecionada, você poderá escolher entre Cartão de Crédito, Boleto Bancário ou PIX diretamente na tela da fatura. Assim que o pagamento for compensado pelo banco, sua cobertura será ativada e a apólice será emitida automaticamente.</p>
      <p style="margin-top: 24px;">Atenciosamente,<br><strong>Equipe DuoLife</strong></p>
    </div>
    <div class="footer">
      DuoLife Hub &bull; {{-ano-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'cotacao_id', 'valor', 'vencimento', 'link_fatura', 'forma_pagamento', 'forma_pagamento_texto'],
    },
    {
      code: 'pagamento_confirmado',
      name: 'Confirmação de Pagamento Recebido',
      subject: 'Pagamento Confirmado — Proposta #{{cotacao_id}}',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #0e4a5a; color: #ffffff; padding: 24px; text-align: center; }
    .content { padding: 32px 24px; line-height: 1.6; }
    .badge { display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 6px; padding: 8px 16px; font-weight: bold; margin: 16px 0; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0;">Pagamento Confirmado</h2>
    </div>
    <div class="content">
      <p>Olá, <strong>{{nome|Cliente}}</strong>!</p>
      <div style="text-align: center;">
        <span class="badge">&check; Pagamento no valor de R$ {{valor|0,00}} recebido com sucesso</span>
      </div>
      <p>Sua apólice do produto <strong>{{produto_nome|Seguro RC}}</strong> já está ativa e protegendo o seu exercício profissional.</p>
      <p>Você pode acessar os detalhes completos da apólice a qualquer momento através do seu painel.</p>
    </div>
    <div class="footer">
      DuoLife Seguros & Benefícios &bull; Disparado em {{-data-}} às {{-hora-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'cotacao_id', 'valor', 'produto_nome'],
    },
    {
      code: 'recuperacao_senha',
      name: 'Recuperação / Redefinição de Senha',
      subject: 'Redefinição de Senha — DuoLife Hub',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0e4a5a; color: #ffffff; padding: 28px 24px; text-align: center; }
    .content { padding: 32px 24px; line-height: 1.6; }
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #00d4e0; color: #072a33; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; }
    .notice { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0; font-size: 13px; color: #64748b; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0; font-size: 22px;">DuoLife Hub</h2>
    </div>
    <div class="content">
      <h3 style="color: #0e4a5a; margin-top: 0;">Olá, {{nome|Usuário}}!</h3>
      <p>Recebemos uma solicitação para redefinir a senha da sua conta de acesso ao <strong>DuoLife Hub</strong>.</p>
      <p>Para criar uma nova senha segura, clique no botão abaixo:</p>
      
      <div class="btn-container">
        <a href="{{link_reset|https://duolife.com.br}}" class="btn" target="_blank">Redefinir Minha Senha</a>
      </div>

      <div class="notice">
        <p style="margin: 0 0 6px 0;"><strong>Atenção:</strong> Este link é temporário e expira em <strong>{{tempo_expiracao|1 hora}}</strong>.</p>
        <p style="margin: 0;">Se você não solicitou esta alteração, pode ignorar este e-mail com segurança. Sua senha atual permanecerá inalterada.</p>
      </div>

      <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">
        Se o botão acima não funcionar, copie e cole este link diretamente no seu navegador:<br>
        <a href="{{link_reset|https://duolife.com.br}}" style="color: #0e4a5a;">{{link_reset}}</a>
      </p>
    </div>
    <div class="footer">
      DuoLife Seguros & Benefícios &bull; Solicitação gerada em {{-data-}} às {{-hora-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'link_reset', 'tempo_expiracao'],
    },
    {
      code: 'alerta_renovacao_corretor',
      name: 'Alerta de Renovação — Corretor Responsável',
      subject: '[Renovação {{janela_label}}] Apólice de {{cliente_nome}} vence em {{dias_restantes}} dias',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0e4a5a; color: #ffffff; padding: 24px; text-align: center; }
    .content { padding: 32px 24px; line-height: 1.6; }
    .badge { display: inline-block; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 14px; font-weight: bold; font-size: 13px; margin-bottom: 16px; }
    .card-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .btn-container { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background-color: #00d4e0; color: #072a33; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0; font-size: 20px;">DuoLife Hub &bull; Régua de Renovação</h2>
    </div>
    <div class="content">
      <div style="text-align: center;">
        <span class="badge">Aviso de Expiração: {{janela_label}}</span>
      </div>
      <h3 style="color: #0e4a5a; margin-top: 0;">Olá, {{nome|Corretor}}!</h3>
      <p>A apólice de seguro do seu cliente <strong>{{cliente_nome}}</strong> está próxima do término de vigência.</p>
      
      <div class="card-info">
        <p style="margin: 4px 0;"><strong>Segurado:</strong> {{cliente_nome}}</p>
        <p style="margin: 4px 0;"><strong>CPF/CNPJ:</strong> {{cliente_documento}}</p>
        <p style="margin: 4px 0;"><strong>Contato:</strong> {{cliente_telefone|Não informado}} &bull; {{cliente_email|Não informado}}</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0;">
        <p style="margin: 4px 0;"><strong>Apólice Atual:</strong> {{apolice_numero}}</p>
        <p style="margin: 4px 0;"><strong>Produto:</strong> {{produto_nome|Seguro RC Profissional}}</p>
        <p style="margin: 4px 0;"><strong>Cobertura Atual:</strong> R$ {{cobertura}}</p>
        <p style="margin: 4px 0;"><strong>Vencimento da Vigência:</strong> <span style="color: #b91c1c; font-weight: bold;">{{data_expiracao}} (em {{dias_restantes}} dias)</span></p>
      </div>

      <p>Para garantir a <strong>manutenção da retroatividade de coberturas</strong> e a retenção do segurado na sua carteira, inicie o processo de renovação antecipadamente com 1 clique:</p>

      <div class="btn-container">
        <a href="{{link_renovacao}}" class="btn" target="_blank">Iniciar Renovação no Portal</a>
      </div>

      <p style="font-size: 13px; color: #64748b;">Ao clicar no botão acima, o formulário de cotação já será aberto com os dados cadastrais e o histórico da apólice anterior pré-carregados para sua conferência e envio.</p>
    </div>
    <div class="footer">
      DuoLife Seguros & Benefícios &bull; Disparado em {{-data-}} às {{-hora-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'cliente_nome', 'cliente_documento', 'cliente_telefone', 'cliente_email', 'apolice_numero', 'produto_nome', 'cobertura', 'data_expiracao', 'dias_restantes', 'janela_label', 'link_renovacao'],
    },
    {
      code: 'alerta_fatura_a_vencer_corretor',
      name: 'Alerta de Fatura Asaas a Vencer — Corretor',
      subject: '[Fatura a Vencer] Parcela {{parcela_info}} de {{cliente_nome}} vence em {{dias_vencimento}} dias',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #0e4a5a; color: #ffffff; padding: 22px; text-align: center; }
    .content { padding: 30px 24px; line-height: 1.6; }
    .card-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .btn { display: inline-block; background: #00d4e0; color: #072a33; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0; font-size: 20px;">DuoLife Hub &bull; Alerta Preventivo de Cobrança</h2>
    </div>
    <div class="content">
      <h3 style="color: #0e4a5a; margin-top: 0;">Olá, {{nome|Corretor}}!</h3>
      <p>Identificamos uma parcela do seu segurado com vencimento próximo nos próximos <strong>{{dias_vencimento}} dias</strong>.</p>
      
      <div class="card-info">
        <p style="margin: 4px 0;"><strong>Segurado:</strong> {{cliente_nome}} (CPF/CNPJ: {{cliente_documento}})</p>
        <p style="margin: 4px 0;"><strong>Contato:</strong> {{cliente_telefone|Não informado}}</p>
        <p style="margin: 4px 0;"><strong>Apólice / Proposta:</strong> {{apolice_numero|#}}{{cotacao_id}}</p>
        <p style="margin: 4px 0;"><strong>Parcela:</strong> {{parcela_info}}</p>
        <p style="margin: 4px 0;"><strong>Valor:</strong> R$ {{valor_parcela}}</p>
        <p style="margin: 4px 0;"><strong>Data de Vencimento:</strong> <strong>{{data_vencimento}}</strong></p>
      </div>

      <p>Caso o cliente precise de uma 2ª via ou link direto da fatura com PIX e Boleto, você pode repassar o link oficial abaixo:</p>

      <div style="text-align: center; margin: 24px 0;">
        <a href="{{link_fatura}}" class="btn" target="_blank">Acessar Fatura Asaas do Cliente</a>
      </div>
    </div>
    <div class="footer">
      DuoLife Hub &bull; {{-ano-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'cliente_nome', 'cliente_documento', 'cliente_telefone', 'apolice_numero', 'cotacao_id', 'parcela_info', 'valor_parcela', 'data_vencimento', 'dias_vencimento', 'link_fatura'],
    },
    {
      code: 'alerta_inadimplencia_corretor',
      name: 'Alerta de Inadimplência Asaas — Corretor Responsável',
      subject: '[Atenção: Inadimplência] Parcela {{parcela_info}} de {{cliente_nome}} está vencida há {{dias_atraso}} dias',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #fecaca; border-radius: 12px; overflow: hidden; }
    .header { background: #b91c1c; color: #ffffff; padding: 22px; text-align: center; }
    .content { padding: 30px 24px; line-height: 1.6; }
    .warning-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px; color: #991b1b; font-size: 14px; }
    .card-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .btn { display: inline-block; background: #b91c1c; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0; font-size: 20px;">Atenção: Parcela em Atraso (Risco de Cancelamento)</h2>
    </div>
    <div class="content">
      <h3 style="color: #b91c1c; margin-top: 0;">Olá, {{nome|Corretor}}!</h3>
      
      <div class="warning-box">
        <strong>Importante:</strong> A parcela do seu segurado abaixo consta como não liquidada após a data limite. A falta de pagamento pode acarretar a suspensão ou cancelamento da apólice pela seguradora.
      </div>

      <div class="card-info">
        <p style="margin: 4px 0;"><strong>Segurado:</strong> {{cliente_nome}} (CPF/CNPJ: {{cliente_documento}})</p>
        <p style="margin: 4px 0;"><strong>Telefone:</strong> {{cliente_telefone|Não informado}}</p>
        <p style="margin: 4px 0;"><strong>E-mail:</strong> {{cliente_email|Não informado}}</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0;">
        <p style="margin: 4px 0;"><strong>Apólice:</strong> {{apolice_numero|#}}{{cotacao_id}}</p>
        <p style="margin: 4px 0;"><strong>Parcela:</strong> {{parcela_info}}</p>
        <p style="margin: 4px 0;"><strong>Valor:</strong> R$ {{valor_parcela}}</p>
        <p style="margin: 4px 0;"><strong>Venceu em:</strong> {{data_vencimento}} (<span style="color: #b91c1c; font-weight: bold;">{{dias_atraso}} dias de atraso</span>)</p>
      </div>

      <p>Sugerimos o contato direto com o segurado para alinhamento amigável e reenvio do link de pagamento com 2ª via atualizada:</p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="{{link_fatura}}" class="btn" target="_blank">Abrir Link da Fatura (PIX / Boleto)</a>
      </div>
    </div>
    <div class="footer">
      DuoLife Hub &bull; Retenção &bull; {{-ano-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'cliente_nome', 'cliente_documento', 'cliente_telefone', 'cliente_email', 'apolice_numero', 'cotacao_id', 'parcela_info', 'valor_parcela', 'data_vencimento', 'dias_atraso', 'link_fatura'],
    },
    {
      code: 'alerta_inadimplencia_cliente',
      name: 'Lembrete de Pagamento de Fatura — Segurado',
      subject: 'Lembrete de Pagamento: Sua fatura de seguro está em aberto — DuoLife',
      body_html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #0e4a5a; color: #ffffff; padding: 24px; text-align: center; }
    .content { padding: 30px 24px; line-height: 1.6; }
    .card-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .btn { display: inline-block; background: #00d4e0; color: #072a33; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0; font-size: 20px;">Lembrete de Pagamento de Seguro</h2>
    </div>
    <div class="content">
      <p>Olá, <strong>{{nome|Cliente}}</strong>!</p>
      <p>Constatamos que a sua parcela do seguro profissional ainda não foi identificada como liquidada pelo sistema financeiro.</p>
      
      <div class="card-info">
        <p style="margin: 4px 0;"><strong>Proposta / Apólice:</strong> {{apolice_numero|#}}{{cotacao_id}}</p>
        <p style="margin: 4px 0;"><strong>Parcela:</strong> {{parcela_info}}</p>
        <p style="margin: 4px 0;"><strong>Valor:</strong> R$ {{valor_parcela}}</p>
        <p style="margin: 4px 0;"><strong>Vencimento:</strong> {{data_vencimento}}</p>
      </div>

      <p>Para evitar a perda da proteção e manter sua apólice ativa sem interrupções, você pode quitar através de PIX instantâneo ou Boleto:</p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="{{link_fatura}}" class="btn" target="_blank">Acessar Fatura / Pagar via PIX</a>
      </div>

      <p style="font-size: 13px; color: #64748b;">Caso o pagamento já tenha sido efetuado nas últimas 24 horas, desconsidere esta mensagem — a compensação bancária é atualizada automaticamente.</p>
    </div>
    <div class="footer">
      DuoLife Seguros & Benefícios &bull; {{-ano-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'cotacao_id', 'apolice_numero', 'parcela_info', 'valor_parcela', 'data_vencimento', 'link_fatura'],
    },
  ];

  for (const tpl of defaultTemplates) {
    await sql`
      INSERT INTO email_templates (code, name, subject, body_html, variables, is_active)
      VALUES (
        ${tpl.code},
        ${tpl.name},
        ${tpl.subject},
        ${tpl.body_html},
        ${sql.json(tpl.variables)},
        true
      )
      ON CONFLICT (code) DO NOTHING
    `;
  }
}
