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
    const resolvedVal = resolveNestedVariable(variables, key);
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
  const [template] = await sql<EmailTemplate[]>`
    SELECT id, code, name, subject, body_html, body_text, variables, external_id, last_synced_at, is_active, created_at, updated_at
    FROM email_templates
    WHERE code = ${normalizedCode} AND is_active = true
    LIMIT 1
  `;

  if (!template) {
    logger.warn({ templateCode: normalizedCode }, 'Template de e-mail não encontrado ou inativo');
    return {
      success: false,
      error: `Template de e-mail '${normalizedCode}' não cadastrado ou inativo.`,
    };
  }

  // 2. Mescla variáveis com nome/email padrão se não informados
  const mergedVars: Record<string, any> = {
    nome: toName || variables.nome || 'Cliente',
    email: to,
    ...variables,
  };

  const renderedSubject = renderTemplateString(template.subject, mergedVars, false);
  const renderedHtml = renderTemplateString(template.body_html, mergedVars, true);

  // 3. Executa o envio via Mailer oficial
  const result = await sendMail({
    to,
    toName,
    subject: renderedSubject,
    html: renderedHtml,
    templateId: template.external_id,
  });

  const status = result.success ? (result.mock ? 'mocked' : 'sent') : 'failed';
  const errorMessage = result.error ? (result.error instanceof Error ? result.error.message : String(result.error)) : null;
  const provider = result.provider || (result.mock ? 'mock' : 'nodemailer_smtp');

  // 4. Registra no log de auditoria
  try {
    const [log] = await sql<EmailDispatchLog[]>`
      INSERT INTO email_dispatch_logs (
        template_code, recipient_email, recipient_name, subject, status, provider, error_message, metadata
      ) VALUES (
        ${normalizedCode},
        ${to},
        ${toName || null},
        ${renderedSubject},
        ${status},
        ${provider},
        ${errorMessage},
        ${sql.json({ ...metadata, variables: mergedVars, externalTemplateId: template.external_id })}
      ) RETURNING id, template_code, recipient_email, recipient_name, subject, status, provider, error_message, metadata, created_at
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
      name: 'Fatura e Boleto para Pagamento',
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
        <p style="margin: 4px 0;"><strong>Opções de Pagamento:</strong> Boleto Bancário e PIX (QRCode)</p>
      </div>
      <p>Clique no botão abaixo para abrir a fatura e efetuar o pagamento:</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="{{link_fatura}}" class="btn" target="_blank">Acessar Boleto / Pagar via PIX</a>
      </div>
      <p style="font-size: 13px; color: #64748b;">Assim que o pagamento for compensado pelo banco, sua cobertura será ativada e a apólice será emitida automaticamente.</p>
      <p style="margin-top: 24px;">Atenciosamente,<br><strong>Equipe DuoLife</strong></p>
    </div>
    <div class="footer">
      DuoLife Hub &bull; {{-ano-}}
    </div>
  </div>
</body>
</html>`,
      variables: ['nome', 'cotacao_id', 'valor', 'vencimento', 'link_fatura'],
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
