-- Migration: 015-trigger-proposta-criada.sql
-- Gatilho de Proposta Criada e Template de E-mail de Contrato para Assinatura (ZapSign)

-- 1. Insere o Template de E-mail 'proposta_criada'
INSERT INTO email_templates (code, name, subject, body_html, variables, is_active)
VALUES (
  'proposta_criada',
  'Proposta Criada / Contrato para Assinatura (ZapSign)',
  'Sua Proposta e Contrato de Seguro estão prontos para assinatura — Proposta #{{cotacao_id}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: ''Segoe UI'', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
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
</html>',
  '["nome", "cliente_nome", "cotacao_id", "produto_nome", "cobertura", "valor", "parceiro_nome", "link_assinatura", "documento"]'::jsonb,
  true
)
ON CONFLICT (code) DO NOTHING;

-- 2. Insere a Árvore de Decisão padrão 'trigger_proposta_criada'
INSERT INTO automation_triggers (code, name, description, event_type, is_active, tree_definition)
VALUES (
  'trigger_proposta_criada',
  'Fluxo Padrão — Proposta Criada / Envio de Contrato',
  'Dispara e-mail com o link de assinatura digital da ZapSign para o cliente assim que o contrato é gerado',
  'PROPOSTA_CRIADA',
  true,
  '{
    "nos": [
      {
        "id": "root-proposta",
        "tipo": "GATILHO",
        "titulo": "Proposta Criada / Contrato Gerado",
        "subtitulo": "Evento: PROPOSTA_CRIADA",
        "parentId": null,
        "ativo": true,
        "posicaoX": 500,
        "posicaoY": 60,
        "configuracao": {
          "gatilho_codigo": "PROPOSTA_CRIADA"
        }
      },
      {
        "id": "action-email-proposta-cliente",
        "tipo": "ACAO_EMAIL",
        "titulo": "Enviar Contrato ao Cliente para Assinatura",
        "subtitulo": "Dispara template com link de assinatura ZapSign",
        "parentId": "root-proposta",
        "ativo": true,
        "posicaoX": 500,
        "posicaoY": 220,
        "configuracao": {
          "template_id": "proposta_criada",
          "destinatarios": [
            {
              "destinatario_tipo": "CLIENTE",
              "destinatario_email": "",
              "destinatario_nome": ""
            }
          ]
        }
      }
    ]
  }'::jsonb
)
ON CONFLICT (code) DO NOTHING;
