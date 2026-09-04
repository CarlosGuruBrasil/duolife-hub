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

/**
 * Detecta variáveis no padrão {{nome_variavel}} ou {{nome_variavel|fallback}} no código HTML
 */
export function extractTemplateVariables(html: string): string[] {
  const matches = html.match(/\{\{([a-zA-Z0-9_-]+)(?:\|[^}]+)?\}\}/g) || [];
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
  variables: Record<string, any> = {}
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

  return content.replace(/\{\{([a-zA-Z0-9_-]+)(?:\|([^}]+))?\}\}/g, (_, key: string, fallback?: string) => {
    // Variáveis globais do sistema
    if (systemVars[key] !== undefined) {
      return systemVars[key];
    }

    // Variáveis informadas no contexto
    if (variables[key] !== undefined && variables[key] !== null) {
      const val = variables[key];
      if (typeof val === 'object') {
        return JSON.stringify(val);
      }
      return String(val);
    }

    // Fallback configurado na tag: {{nome|Cliente}}
    if (fallback !== undefined) {
      return fallback;
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
    SELECT id, code, name, subject, body_html, body_text, variables, is_active, created_at, updated_at
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

  const renderedSubject = renderTemplateString(template.subject, mergedVars);
  const renderedHtml = renderTemplateString(template.body_html, mergedVars);

  // 3. Executa o envio via Mailer oficial
  const result = await sendMail({
    to,
    subject: renderedSubject,
    html: renderedHtml,
  });

  const status = result.success ? (result.mock ? 'mocked' : 'sent') : 'failed';
  const errorMessage = result.error ? (result.error instanceof Error ? result.error.message : String(result.error)) : null;

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
        'nodemailer_smtp',
        ${errorMessage},
        ${sql.json({ ...metadata, variables: mergedVars })}
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
