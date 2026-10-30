import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificarVendedorConflitoCadastral } from '@/lib/cadastral-alerts';

const { mockSql, mockSendTemplatedEmail, mockDispatchDomainEvent, mockResolveWhiteLabel } = vi.hoisted(() => {
  const sqlFn: any = vi.fn();
  sqlFn.unsafe = vi.fn();
  sqlFn.json = (val: any) => JSON.stringify(val);

  return {
    mockSql: sqlFn,
    mockSendTemplatedEmail: vi.fn(),
    mockDispatchDomainEvent: vi.fn(),
    mockResolveWhiteLabel: vi.fn(),
  };
});

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/email-service', () => ({
  sendTemplatedEmail: mockSendTemplatedEmail,
}));

vi.mock('@/lib/triggers/dispatcher', () => ({
  dispatchDomainEvent: mockDispatchDomainEvent,
}));

vi.mock('@/lib/email-whitelabel', () => ({
  resolveWhiteLabelForPartnerId: mockResolveWhiteLabel,
  buildEmailWhiteLabelVariables: vi.fn().mockReturnValue({
    empresa_nome: 'Corretora Prime Seguros',
    cor_primaria: '#0a3d4f',
    cor_destaque: '#00e5ff',
    whitelabel_header_html: '<h1>Corretora Prime Seguros</h1>',
    whitelabel_footer_html: '<p>Prime Seguros • (11) 9999-8888</p>',
    from_name: 'Prime Seguros via DuoLife',
    reply_to: 'contato@primeseguros.com.br',
  }),
}));

describe('alerta-conflito-cadastral-email.test.ts - Alerta Imediato ao Vendedor por Duplicidade Cadastral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveWhiteLabel.mockResolvedValue({
      companyName: 'Corretora Prime Seguros',
      companyPhone: '(11) 9999-8888',
      companyEmail: 'contato@primeseguros.com.br',
      primaryColor: '#0a3d4f',
      accentColor: '#00e5ff',
    });
    mockSendTemplatedEmail.mockResolvedValue({
      success: true,
      logId: 'email-log-123',
    });
    mockDispatchDomainEvent.mockResolvedValue({
      eventType: 'CONFLITO_CADASTRAL_DETECTADO',
      evaluatedTriggersCount: 1,
      actionsExecutedCount: 1,
      errors: [],
    });
  });

  it('deve identificar o e-mail do vendedor via partner_users e disparar o e-mail transacional com link para o comparador', async () => {
    // 1. Simula retorno da busca por partner_users
    mockSql.mockResolvedValueOnce([
      {
        email: 'vendedor.joao@corretoraprime.com.br',
        name: 'João Vendedor',
      },
    ]);

    const result = await notificarVendedorConflitoCadastral({
      cotacaoId: 'cot-dup-101',
      clienteNome: 'Dr. Roberto Silveira',
      clienteDocumento: '12345678901',
      clienteEmail: 'roberto@clinica.com.br',
      clienteTelefone: '11988887777',
      produtoNome: 'RC Médico e Clínicas',
      targetPartnerId: 'partner-prime-01',
      userId: 'user-vendedor-001',
      origin: 'https://painel.primeseguros.com.br',
    });

    expect(result.sent).toBe(true);
    expect(result.sellerEmail).toBe('vendedor.joao@corretoraprime.com.br');
    expect(result.sellerName).toBe('João Vendedor');
    expect(result.linkResolucao).toBe('https://painel.primeseguros.com.br/portal/cotacoes/cot-dup-101');

    // Valida chamada do sendTemplatedEmail
    expect(mockSendTemplatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'alerta_conflito_cadastral_vendedor',
        to: 'vendedor.joao@corretoraprime.com.br',
        toName: 'João Vendedor',
        fromName: 'Prime Seguros via DuoLife',
        replyTo: 'contato@primeseguros.com.br',
        variables: expect.objectContaining({
          cliente_nome: 'Dr. Roberto Silveira',
          cliente_documento: '12345678901',
          cotacao_id: 'cot-dup-101',
          produto_nome: 'RC Médico e Clínicas',
          link_resolucao: 'https://painel.primeseguros.com.br/portal/cotacoes/cot-dup-101',
          empresa_nome: 'Corretora Prime Seguros',
        }),
      })
    );

    // Valida disparo do evento de domínio
    expect(mockDispatchDomainEvent).toHaveBeenCalledWith(
      'CONFLITO_CADASTRAL_DETECTADO',
      expect.objectContaining({
        eventType: 'CONFLITO_CADASTRAL_DETECTADO',
        contextId: 'cot-dup-101',
        cotacao: expect.objectContaining({ id: 'cot-dup-101' }),
        parceiro: expect.objectContaining({ id: 'partner-prime-01' }),
        cliente: expect.objectContaining({
          nome: 'Dr. Roberto Silveira',
          documento: '12345678901',
        }),
      })
    );
  });

  it('deve fazer fallback para o e-mail do parceiro caso o usuário vendedor específico não tenha sido localizado', async () => {
    // 1. partner_users não encontra nada
    mockSql.mockResolvedValueOnce([]);
    // 2. users não encontra nada
    mockSql.mockResolvedValueOnce([]);
    // 3. partners encontra os dados do parceiro institucional
    mockSql.mockResolvedValueOnce([
      {
        email: 'gestao@corretoraprime.com.br',
        name: 'Prime Corretora de Seguros',
        nome_fantasia: 'Prime Seguros',
        company_name: 'Prime Seguros Ltda',
      },
    ]);

    const result = await notificarVendedorConflitoCadastral({
      cotacaoId: 'cot-dup-202',
      clienteNome: 'Mariana Duarte',
      clienteDocumento: '98765432100',
      targetPartnerId: 'partner-prime-01',
      userId: 'user-antigo-inexistente',
    });

    expect(result.sent).toBe(true);
    expect(result.sellerEmail).toBe('gestao@corretoraprime.com.br');
    expect(mockSendTemplatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'gestao@corretoraprime.com.br',
        variables: expect.objectContaining({
          cotacao_id: 'cot-dup-202',
          cliente_nome: 'Mariana Duarte',
        }),
      })
    );
  });

  it('deve retornar sent: false de forma segura caso nenhum e-mail de vendedor ou parceiro seja localizado', async () => {
    // Todas as buscas retornam vazio
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);

    const result = await notificarVendedorConflitoCadastral({
      cotacaoId: 'cot-dup-303',
      clienteNome: 'Cliente Sem Corretor',
      clienteDocumento: '00011122233',
      targetPartnerId: 'partner-fantasma',
    });

    expect(result.sent).toBe(false);
    expect(result.error).toContain('Vendedor responsável não possui e-mail cadastrado');
    expect(mockSendTemplatedEmail).not.toHaveBeenCalled();
  });
});
