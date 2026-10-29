import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  sqlMock.json = vi.fn((val) => val);
  return { sql: sqlMock };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/email-service', () => ({
  sendTemplatedEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/email-whitelabel', () => ({
  resolveWhiteLabelForContext: vi.fn(),
  buildEmailWhiteLabelVariables: vi.fn(),
}));

import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { sendTemplatedEmail } from '@/lib/email-service';
import { resolveWhiteLabelForContext, buildEmailWhiteLabelVariables } from '@/lib/email-whitelabel';
import { dispatchDomainEvent } from '@/lib/triggers/dispatcher';
import type { TriggerEvaluationContext } from '@/lib/triggers/types';

describe('Dispatcher White-Label Integration (src/lib/triggers/dispatcher)', () => {
  const mockSql = sql as any;
  const mockSendTemplatedEmail = sendTemplatedEmail as any;
  const mockResolveWhiteLabel = resolveWhiteLabelForContext as any;
  const mockBuildVariables = buildEmailWhiteLabelVariables as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createTriggerMock = (eventType: string, templateId: string) => [
    {
      id: 'trig-001',
      code: `trigger_${eventType.toLowerCase()}`,
      name: `Trigger ${eventType}`,
      description: 'Desc',
      event_type: eventType,
      is_active: true,
      tree_definition: {
        nos: [
          {
            id: 'node-root',
            tipo: 'GATILHO',
            titulo: 'Raiz',
            parentId: null,
            ativo: true,
            posicaoX: 0,
            posicaoY: 0,
            configuracao: { gatilho_codigo: eventType },
          },
          {
            id: 'node-email',
            tipo: 'ACAO_EMAIL',
            titulo: 'Enviar Email',
            parentId: 'node-root',
            ativo: true,
            posicaoX: 0,
            posicaoY: 100,
            configuracao: {
              template_id: templateId,
              destinatarios: [
                { destinatario_tipo: 'CLIENTE', destinatario_email: '', destinatario_nome: '' },
              ],
            },
          },
        ],
      },
    },
  ];

  it('deve enriquecer sendTemplatedEmail com fromName, replyTo e variáveis de White-Label para PROPOSTA_CRIADA com parceiro', async () => {
    // 1. Mock do banco de dados: retorna trigger e sucesso no insert de log
    mockSql.mockResolvedValueOnce(createTriggerMock('PROPOSTA_CRIADA', 'proposta_criada'));
    mockSql.mockResolvedValueOnce([]); // insert log

    // 2. Mock do White-Label resolvido para o parceiro
    const mockWlConfig = {
      companyName: 'Silva Seguros',
      logoUrl: 'https://cdn.example.com/silva-logo.png',
      primaryColor: '#003366',
      accentColor: '#00aaff',
      companyEmail: 'contato@silvaseguros.com.br',
    };
    mockResolveWhiteLabel.mockResolvedValueOnce({
      whiteLabel: mockWlConfig,
      partnerEmail: 'contato@silvaseguros.com.br',
    });

    const mockWlVars = {
      empresa_nome: 'Silva Seguros',
      empresa_slogan: 'Tranquilidade e Confiança',
      empresa_telefone: '(11) 98765-4321',
      empresa_email: 'contato@silvaseguros.com.br',
      empresa_site: 'https://silvaseguros.com.br',
      empresa_susep: 'SUSEP-123456',
      logo_url: 'https://cdn.example.com/silva-logo.png',
      cor_primaria: '#003366',
      cor_secundaria: '#557799',
      cor_destaque: '#00aaff',
      whitelabel_header_html: '<img src="https://cdn.example.com/silva-logo.png" alt="Silva Seguros" />',
      whitelabel_footer_html: '<p>Silva Seguros • contato@silvaseguros.com.br</p>',
      from_name: 'Silva Seguros via DuoLife',
      reply_to: 'contato@silvaseguros.com.br',
    };
    mockBuildVariables.mockReturnValueOnce(mockWlVars);

    const context: TriggerEvaluationContext = {
      eventType: 'PROPOSTA_CRIADA',
      contextId: 'cot-100',
      cliente: {
        nome: 'Carlos Medeiros',
        email: 'carlos@medeiros.com',
        documento: '123.456.789-00',
      },
      cotacao: {
        id: 'cot-100',
        premio_final: 1250,
        cobertura: 200000,
        produto_nome: 'Seguro RC Médico',
      },
      parceiro: {
        id: 'partner-silva',
        nome: 'Silva Seguros',
        email: 'contato@silvaseguros.com.br',
      },
      dados: {
        link_proposta: 'https://app.zapsign.com.br/verificar/token123',
      },
    };

    const res = await dispatchDomainEvent('PROPOSTA_CRIADA', context);

    expect(res.actionsExecutedCount).toBe(1);
    expect(res.errors).toHaveLength(0);

    // Verifica chamada da resolução de white-label
    expect(mockResolveWhiteLabel).toHaveBeenCalledWith(context);
    expect(mockBuildVariables).toHaveBeenCalledWith(mockWlConfig, 'contato@silvaseguros.com.br');

    // Verifica argumentos passados para sendTemplatedEmail
    expect(mockSendTemplatedEmail).toHaveBeenCalledTimes(1);
    const emailCall = mockSendTemplatedEmail.mock.calls[0][0];

    expect(emailCall.templateCode).toBe('proposta_criada');
    expect(emailCall.to).toBe('carlos@medeiros.com');
    expect(emailCall.toName).toBe('Carlos Medeiros');
    expect(emailCall.fromName).toBe('Silva Seguros via DuoLife');
    expect(emailCall.replyTo).toBe('contato@silvaseguros.com.br');

    // Verifica que variáveis White-Label foram mescladas
    expect(emailCall.variables).toMatchObject({
      empresa_nome: 'Silva Seguros',
      logo_url: 'https://cdn.example.com/silva-logo.png',
      cor_primaria: '#003366',
      cor_destaque: '#00aaff',
      whitelabel_header_html: '<img src="https://cdn.example.com/silva-logo.png" alt="Silva Seguros" />',
      whitelabel_footer_html: '<p>Silva Seguros • contato@silvaseguros.com.br</p>',
      parceiro_nome: 'Silva Seguros',
      nome: 'Carlos Medeiros',
      email: 'carlos@medeiros.com',
      cotacao_id: 'cot-100',
      link_proposta: 'https://app.zapsign.com.br/verificar/token123',
    });
  });

  it('deve usar fallbacks padrão da DuoLife quando o evento não possui parceiro customizado', async () => {
    mockSql.mockResolvedValueOnce(createTriggerMock('FATURA_GERADA', 'fatura_gerada'));
    mockSql.mockResolvedValueOnce([]); // insert log

    const defaultWlConfig = {
      companyName: 'DuoLife',
      logoUrl: '',
      primaryColor: '#0e4a5a',
      accentColor: '#00d4e0',
    };
    mockResolveWhiteLabel.mockResolvedValueOnce({
      whiteLabel: defaultWlConfig,
      partnerEmail: undefined,
    });

    const defaultWlVars = {
      empresa_nome: 'DuoLife',
      empresa_slogan: '',
      empresa_telefone: '',
      empresa_email: '',
      empresa_site: '',
      empresa_susep: '',
      logo_url: '',
      cor_primaria: '#0e4a5a',
      cor_secundaria: '#7fa8b2',
      cor_destaque: '#00d4e0',
      whitelabel_header_html: '<h1>DuoLife</h1>',
      whitelabel_footer_html: '<p>DuoLife</p>',
      from_name: 'DuoLife Hub',
      reply_to: undefined,
    };
    mockBuildVariables.mockReturnValueOnce(defaultWlVars);

    const context: TriggerEvaluationContext = {
      eventType: 'FATURA_GERADA',
      contextId: 'cot-200',
      cliente: {
        nome: 'Ana Paula',
        email: 'ana@paula.com',
      },
      cotacao: {
        id: 'cot-200',
      },
      transacao: {
        link_fatura: 'https://asaas.com/i/boleto123',
        vencimento: '15/11/2026',
        valor: 450,
      },
    };

    const res = await dispatchDomainEvent('FATURA_GERADA', context);

    expect(res.actionsExecutedCount).toBe(1);
    expect(res.errors).toHaveLength(0);

    expect(mockSendTemplatedEmail).toHaveBeenCalledTimes(1);
    const emailCall = mockSendTemplatedEmail.mock.calls[0][0];

    expect(emailCall.fromName).toBe('DuoLife Hub');
    expect(emailCall.replyTo).toBeUndefined();
    expect(emailCall.variables.empresa_nome).toBe('DuoLife');
    expect(emailCall.variables.cor_primaria).toBe('#0e4a5a');
    expect(emailCall.variables.link_fatura).toBe('https://asaas.com/i/boleto123');
  });

  it('deve ser resiliente e continuar o envio caso a resolução de White-Label lance erro', async () => {
    mockSql.mockResolvedValueOnce(createTriggerMock('PROPOSTA_CRIADA', 'proposta_criada'));
    mockSql.mockResolvedValueOnce([]);

    mockResolveWhiteLabel.mockRejectedValueOnce(new Error('Erro de conexão com o banco'));

    const context: TriggerEvaluationContext = {
      eventType: 'PROPOSTA_CRIADA',
      contextId: 'cot-erro',
      cliente: {
        nome: 'Roberto Dias',
        email: 'roberto@dias.com',
      },
      cotacao: {
        id: 'cot-erro',
      },
    };

    const res = await dispatchDomainEvent('PROPOSTA_CRIADA', context);

    expect(res.actionsExecutedCount).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ contextId: 'cot-erro' }),
      expect.stringContaining('Falha ao resolver White-Label para e-mail')
    );

    // O e-mail ainda é enviado normalmente
    expect(mockSendTemplatedEmail).toHaveBeenCalledTimes(1);
    const emailCall = mockSendTemplatedEmail.mock.calls[0][0];
    expect(emailCall.fromName).toBeUndefined();
    expect(emailCall.replyTo).toBeUndefined();
    expect(emailCall.to).toBe('roberto@dias.com');
  });

  it('deve disparar para múltiplos destinatários aplicando o mesmo branding e headers em todos os envios', async () => {
    // Configura trigger com destinatários CLIENTE e PARCEIRO
    const multiRecipientTrigger = [
      {
        id: 'trig-multi',
        code: 'trigger_multi_dest',
        name: 'Trigger Multi',
        description: 'Desc',
        event_type: 'COTACAO_CRIADA',
        is_active: true,
        tree_definition: {
          nos: [
            {
              id: 'node-root',
              tipo: 'GATILHO',
              parentId: null,
              ativo: true,
              posicaoX: 0,
              posicaoY: 0,
              configuracao: { gatilho_codigo: 'COTACAO_CRIADA' },
            },
            {
              id: 'node-email',
              tipo: 'ACAO_EMAIL',
              parentId: 'node-root',
              ativo: true,
              posicaoX: 0,
              posicaoY: 100,
              configuracao: {
                template_id: 'cotacao_gerada',
                destinatarios: [
                  { destinatario_tipo: 'CLIENTE', destinatario_email: '', destinatario_nome: '' },
                  { destinatario_tipo: 'PARCEIRO', destinatario_email: '', destinatario_nome: '' },
                ],
              },
            },
          ],
        },
      },
    ];

    mockSql.mockResolvedValueOnce(multiRecipientTrigger);
    mockSql.mockResolvedValueOnce([]); // log

    mockResolveWhiteLabel.mockResolvedValueOnce({
      whiteLabel: { companyName: 'Elite Corretora', primaryColor: '#224466' },
      partnerEmail: 'contato@elitecorretora.com.br',
    });

    mockBuildVariables.mockReturnValueOnce({
      empresa_nome: 'Elite Corretora',
      cor_primaria: '#224466',
      from_name: 'Elite Corretora via DuoLife',
      reply_to: 'contato@elitecorretora.com.br',
      whitelabel_header_html: '<h1>Elite Corretora</h1>',
      whitelabel_footer_html: '<p>Elite Corretora</p>',
    });

    const context: TriggerEvaluationContext = {
      eventType: 'COTACAO_CRIADA',
      contextId: 'cot-multi',
      cliente: { nome: 'Marina Santos', email: 'marina@santos.com' },
      parceiro: { id: 'p-elite', nome: 'Elite Corretora', email: 'consultor@elitecorretora.com.br' },
      cotacao: { id: 'cot-multi', premio_final: 900 },
    };

    const res = await dispatchDomainEvent('COTACAO_CRIADA', context);

    expect(res.actionsExecutedCount).toBe(1);
    expect(mockSendTemplatedEmail).toHaveBeenCalledTimes(2);

    const firstCall = mockSendTemplatedEmail.mock.calls[0][0];
    const secondCall = mockSendTemplatedEmail.mock.calls[1][0];

    // Envio 1: Cliente
    expect(firstCall.to).toBe('marina@santos.com');
    expect(firstCall.fromName).toBe('Elite Corretora via DuoLife');
    expect(firstCall.replyTo).toBe('contato@elitecorretora.com.br');
    expect(firstCall.variables.empresa_nome).toBe('Elite Corretora');

    // Envio 2: Parceiro
    expect(secondCall.to).toBe('consultor@elitecorretora.com.br');
    expect(secondCall.fromName).toBe('Elite Corretora via DuoLife');
    expect(secondCall.replyTo).toBe('contato@elitecorretora.com.br');
    expect(secondCall.variables.empresa_nome).toBe('Elite Corretora');
  });
});
