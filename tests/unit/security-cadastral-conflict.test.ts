import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleClientRegistrationIntegrity } from '@/lib/insurance-ops';

const { mockSql } = vi.hoisted(() => {
  const fn: any = vi.fn();
  fn.unsafe = vi.fn().mockResolvedValue([]);
  fn.begin = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(fn));
  return { mockSql: fn };
});

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth', () => ({
  verifyPartnerAuth: vi.fn(),
  unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })),
  getPartnerAccessContext: vi.fn(),
}));

import { verifyPartnerAuth, getPartnerAccessContext } from '@/lib/auth';
import { POST } from '../../app/api/portal/cotacoes/[id]/resolver-duplicidade/route';
import { NextRequest } from 'next/server';

describe('Task 2: Blindagem Trans-Tenant e LGPD em Conflitos Cadastrais (VULN-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Sanitização de PII em handleClientRegistrationIntegrity', () => {
    it('deve mascarar email, celular e nao vazar metadata completa no snapshot originalData', async () => {
      // Mock existing client in DB
      mockSql.mockResolvedValueOnce([
        {
          id: 'client-existing-99',
          document_number: '12345678901',
          full_name: 'Dr. Roberto Secreto Santos',
          email: 'roberto.privado@clinica.med.br',
          phone: '11987654321',
          birth_date: '1980-05-15',
          metadata: {
            endereco: 'Rua das Flores 123, Cobertura 01, Bairro Nobre',
            rg: '12.345.678-9',
            anotacoes_internas: 'Cliente VIP transferido da filial matriz',
          },
        },
      ]);

      const res = await handleClientRegistrationIntegrity({
        documentNumber: '12345678901',
        fullName: 'Roberto Santos',
        email: 'outro@email.com',
        phone: '11911112222',
        isPublicRegistration: true, // Força detecção de duplicidade
      });

      expect(res.hasDuplicateConflict).toBe(true);
      expect(res.cadastralConflict).toBeDefined();

      const orig = res.cadastralConflict?.originalData;
      expect(orig).toBeDefined();
      // O email DEVE estar mascarado e nao conter o valor bruto
      expect(orig?.email).not.toBe('roberto.privado@clinica.med.br');
      expect(orig?.email).toContain('***@');
      // O telefone DEVE estar mascarado
      expect(orig?.phone).not.toBe('11987654321');
      expect(orig?.phone).toContain('*****');
      // A metadata NUNCA deve conter endereço residencial ou RG de outro tenant
      expect(orig?.metadata).toEqual({});
    });
  });

  describe('2. Bloqueio Trans-Tenant em resolver-duplicidade (USAR_NOVOS)', () => {
    it('deve rejeitar com 403 Forbidden se o cliente pertencer ou possuir cotacao em outra corretora/parceiro', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValue({
        userId: 'user-corretor-b',
        partnerId: 'partner-tenant-b',
        corretoraId: 'corretora-b',
        role: 'partner_broker',
      } as any);

      vi.mocked(getPartnerAccessContext).mockResolvedValue({
        isCorretoraUser: false,
        partnerId: 'partner-tenant-b',
        corretoraId: 'corretora-b',
        visibleUserIds: null,
      } as any);

      // 1. SELECT cotacao
      mockSql.mockResolvedValueOnce([
        {
          id: 'quote-tenant-b',
          partner_id: 'partner-tenant-b',
          corretora_id: 'corretora-b',
          client_id: 'client-shared-id',
          client_name: 'Novo Nome',
          status: 'pendente_duplicidade',
          cadastral_conflict: {
            hasConflict: true,
            resolved: false,
            originalClientId: 'client-shared-id',
          },
        },
      ]);

      // 2. SELECT sales ativa (nenhuma)
      mockSql.mockResolvedValueOnce([]);

      // 3. SELECT cotacoes de outro tenant (encontra cotação de corretora-a)
      mockSql.mockResolvedValueOnce([
        {
          id: 'quote-tenant-a',
          corretora_id: 'corretora-a',
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/portal/cotacoes/quote-tenant-b/resolver-duplicidade', {
        method: 'POST',
        body: JSON.stringify({ choice: 'USAR_NOVOS' }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: 'quote-tenant-b' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/vínculo cadastral com outra corretora|outro parceiro|trans-tenant/i);
    });
  });
});
