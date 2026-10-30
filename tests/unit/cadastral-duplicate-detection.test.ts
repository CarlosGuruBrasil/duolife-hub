import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn: any = vi.fn();
  fn.unsafe = vi.fn().mockResolvedValue([]);
  return { mockSql: fn };
});

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

import { handleClientRegistrationIntegrity } from '@/lib/insurance-ops';

describe('Detecção de Duplicidade Cadastral & Validação Zero-Trust de Token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve cadastrar novo cliente e gerar token de sessão quando o documento não existe', async () => {
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([
      {
        id: 'client-new-01',
        document_number: '12345678901',
        full_name: 'Novo Cliente',
        email: 'novo@exemplo.com',
        phone: '11999998888',
        metadata: {},
      },
    ]);

    const result = await handleClientRegistrationIntegrity({
      documentNumber: '12345678901',
      fullName: 'Novo Cliente',
      email: 'novo@exemplo.com',
      phone: '11999998888',
      isPublicRegistration: true,
    });

    expect(result.isNew).toBe(true);
    expect(result.hasDuplicateConflict).toBe(false);
    expect(result.clientSessionToken).toMatch(/^cst_/);
    expect(result.client.id).toBe('client-new-01');
  });

  it('deve sobrescrever diretamente quando o documento já existe e o token de sessão local coincide', async () => {
    const existingToken = 'cst_valid_token_12345';
    mockSql.mockResolvedValueOnce([
      {
        id: 'client-existing-01',
        document_number: '12345678901',
        full_name: 'Cliente Antigo',
        email: 'antigo@exemplo.com',
        phone: '11988887777',
        metadata: { client_session_token: existingToken },
      },
    ]);
    mockSql.mockResolvedValueOnce([
      {
        id: 'client-existing-01',
        document_number: '12345678901',
        full_name: 'Cliente Antigo Atualizado',
        email: 'novo_email@exemplo.com',
      },
    ]);

    const result = await handleClientRegistrationIntegrity({
      documentNumber: '12345678901',
      fullName: 'Cliente Antigo Atualizado',
      email: 'novo_email@exemplo.com',
      phone: '11988887777',
      clientSessionToken: existingToken,
      isPublicRegistration: true,
    });

    expect(result.isNew).toBe(false);
    expect(result.hasDuplicateConflict).toBe(false);
    expect(result.clientSessionToken).toBe(existingToken);
  });

  it('deve reter conflito e marcar duplicidade se o documento já existe mas o token não confere ou é ausente', async () => {
    mockSql.mockResolvedValueOnce([
      {
        id: 'client-existing-02',
        document_number: '12345678901',
        full_name: 'Doutor Fulano Original',
        email: 'original@exemplo.com',
        phone: '11911112222',
        metadata: { client_session_token: 'cst_outro_dispositivo' },
      },
    ]);

    const result = await handleClientRegistrationIntegrity({
      documentNumber: '12345678901',
      fullName: 'Fulano Tentando Atualizar',
      email: 'novo@exemplo.com',
      phone: '11999990000',
      clientSessionToken: 'cst_token_invalido_ou_nulo',
      isPublicRegistration: true,
    });

    expect(result.isNew).toBe(false);
    expect(result.hasDuplicateConflict).toBe(true);
    expect(result.cadastralConflict).toBeDefined();
    expect(result.cadastralConflict?.resolved).toBe(false);
    expect(result.cadastralConflict?.divergentFields).toContain('nome');
    expect(result.cadastralConflict?.divergentFields).toContain('email');
    expect(result.cadastralConflict?.divergentFields).toContain('celular');
  });
});
