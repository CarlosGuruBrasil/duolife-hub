import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccessibleQuoteById } from '@/lib/access';
import { isInternalUser, isDevUser, AuthUser, PartnerAccessContext } from '@/lib/auth';
import { getPortalClientsList } from '@/lib/portal-clients-service';

const mockSql: any = vi.fn().mockImplementation(() => Promise.resolve([{ total: 0 }]));
vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn((strings: any, ...values: any[]) => {
    if (Array.isArray(strings) && !('raw' in strings)) {
      return strings;
    }
    return mockSql(strings, ...values);
  });
  sqlMock.unsafe = vi.fn((s) => s);
  return { sql: sqlMock };
});

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getPartnerAccessContext: vi.fn(),
  };
});

import { getPartnerAccessContext } from '@/lib/auth';

describe('Segurança: Isolamento Horizontal no Portal e Preservação de Acesso Admin/Dev', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockImplementation(() => Promise.resolve([{ total: 0 }]));
  });

  describe('1. Preservação de Acesso Irrestrito para Administradores e Desenvolvedores', () => {
    it('isInternalUser e isDevUser devem reconhecer duolife_admin e duolife_dev como administradores e desenvolvedores', () => {
      const admin: AuthUser = {
        userId: 'admin-1',
        partnerId: null,
        name: 'Admin Global',
        email: 'admin@duolife.com.br',
        role: 'duolife_admin',
        permissions: {},
      };
      const dev: AuthUser = {
        userId: 'dev-1',
        partnerId: null,
        name: 'Dev Global',
        email: 'dev@duolife.com.br',
        role: 'duolife_dev',
        permissions: {},
      };
      const staff: AuthUser = {
        userId: 'staff-1',
        partnerId: null,
        name: 'Staff Operação',
        email: 'staff@duolife.com.br',
        role: 'duolife_staff',
        permissions: {},
      };

      expect(isInternalUser(admin)).toBe(true);
      expect(isInternalUser(dev)).toBe(true);
      expect(isInternalUser(staff)).toBe(true);
      expect(isDevUser(dev)).toBe(true);
      expect(isDevUser(admin)).toBe(false);
    });

    it('getAccessibleQuoteById para admin/dev não deve impor restrição de parceiro ou corretor', async () => {
      const adminUser: AuthUser = {
        userId: 'admin-1',
        partnerId: null,
        name: 'Admin',
        email: 'admin@duolife.com.br',
        role: 'duolife_admin',
        permissions: {},
      };

      mockSql.mockResolvedValueOnce([{ id: 'cot_qualquer', client_name: 'Cliente Global' }]);

      const result = await getAccessibleQuoteById('cot_qualquer', adminUser);
      expect(result).toBeDefined();
      expect(result?.id).toBe('cot_qualquer');

      const templateCall = mockSql.mock.calls[0];
      const queryText = templateCall[0].join(' ');
      // Admin faz SELECT direto por ID sem filtros de partner_id ou partner_user_id
      expect(queryText).toContain('SELECT * FROM cotacoes WHERE id =');
      expect(queryText).not.toContain('partner_id =');
      expect(queryText).not.toContain('partner_user_id =');
    });
  });

  describe('2. Acesso Abrangente de Inquilino para Diretores de Parceiros e Corretoras', () => {
    it('diretor de parceiro (visibleUserIds === null) visualiza todas as cotações do seu partner_id sem restrição de corretor', async () => {
      const directorUser: AuthUser = {
        userId: 'dir-1',
        partnerId: 'partner-abc',
        name: 'Diretor Silva',
        email: 'diretor@parceiro.com.br',
        role: 'partner_director',
        partnerRole: 'director',
        permissions: {},
      };

      vi.mocked(getPartnerAccessContext).mockResolvedValueOnce({
        isCorretoraUser: false,
        partnerId: 'partner-abc',
        corretoraId: null,
        visibleUserIds: null,
        isInternal: false,
        partnerRole: 'director',
        role: 'partner_director',
      });

      mockSql.mockResolvedValueOnce([{ id: 'cot-inst', partner_id: 'partner-abc', partner_user_id: null }]);

      const result = await getAccessibleQuoteById('cot-inst', directorUser);
      expect(result).toBeDefined();

      const templateCall = mockSql.mock.calls[0];
      const queryText = templateCall[0].join(' ');
      expect(queryText).toContain('partner_id =');
      expect(queryText).not.toContain('partner_user_id IN');
    });

    it('usuário de corretora (isCorretoraUser === true) visualiza todas as cotações da corretora', async () => {
      const corretoraUser: AuthUser = {
        userId: 'corr-user-1',
        partnerId: null,
        name: 'Operador Corretora',
        email: 'operador@corretora.com.br',
        role: 'corretora_admin',
        corretoraId: 'corr-100',
        permissions: {},
      };

      vi.mocked(getPartnerAccessContext).mockResolvedValueOnce({
        isCorretoraUser: true,
        partnerId: null,
        corretoraId: 'corr-100',
        visibleUserIds: null,
        isInternal: false,
        partnerRole: null,
        role: 'corretora_admin',
      });

      mockSql.mockResolvedValueOnce([{ id: 'cot-corr', corretora_id: 'corr-100' }]);

      const result = await getAccessibleQuoteById('cot-corr', corretoraUser);
      expect(result).toBeDefined();

      const templateCall = mockSql.mock.calls[0];
      const queryText = templateCall[0].join(' ');
      expect(queryText).toContain('corretora_id =');
      expect(queryText).not.toContain('partner_user_id IN');
    });
  });

  describe('3. Isolamento Estrito para Corretores Subordinados no Portal', () => {
    it('corretor com visibleUserIds restrito não deve ter acesso a cotações institucionais de outros usuários', async () => {
      const brokerUser: AuthUser = {
        userId: 'broker-10',
        partnerId: 'partner-100',
        name: 'Corretor João',
        email: 'joao@parceiro.com.br',
        role: 'partner_broker',
        partnerRole: 'broker',
        permissions: {},
      };

      vi.mocked(getPartnerAccessContext).mockResolvedValueOnce({
        isCorretoraUser: false,
        partnerId: 'partner-100',
        corretoraId: null,
        visibleUserIds: ['broker-10'],
        isInternal: false,
        partnerRole: 'broker',
        role: 'partner_broker',
      });

      mockSql.mockResolvedValueOnce([{ id: 'cot-10', partner_user_id: 'broker-10' }]);

      const result = await getAccessibleQuoteById('cot-10', brokerUser);
      expect(result).toBeDefined();

      const templateCall = mockSql.mock.calls[0];
      const queryText = templateCall[0].join(' ');
      // NÃO pode conter cláusula OR partner_user_id IS NULL
      expect(queryText).not.toMatch(/OR\s+partner_user_id\s+IS\s+NULL/i);
      expect(queryText).toContain('partner_user_id IN');
    });

    it('getPortalClientsList para corretor subordinado aplica escopo estrito sem vazamento institucional', async () => {
      const brokerAccess: PartnerAccessContext = {
        isCorretoraUser: false,
        partnerId: 'partner-100',
        corretoraId: null,
        visibleUserIds: ['broker-10'],
        isInternal: false,
        partnerRole: 'broker',
        role: 'partner_broker',
      };

      await getPortalClientsList(brokerAccess, { page: 1, pageSize: 20 });

      // Inspeciona todas as chamadas SQL para verificar a construção do escopo
      const sqlQueries = mockSql.mock.calls.map((call: any[]) => (call[0] && Array.isArray(call[0]) ? call[0].join(' ') : '')).join('\n');
      expect(sqlQueries).not.toMatch(/OR\s+c_scope\.partner_user_id\s+IS\s+NULL/i);
      expect(sqlQueries).toContain('c_scope.partner_user_id IN');
    });
  });
});
