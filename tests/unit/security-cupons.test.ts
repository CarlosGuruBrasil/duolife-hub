import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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
  verifyAuth: vi.fn(),
  verifyPartnerAuth: vi.fn(),
  unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })),
  getPartnerAccessContext: vi.fn(),
}));

vi.mock('@/lib/access', () => ({
  getAccessibleQuoteById: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/pricing', () => ({
  calcularPrecoServidor: vi.fn(),
}));

vi.mock('@/lib/system-settings', () => ({
  getAsaasConfig: vi.fn().mockResolvedValue({
    apiKey: 'asaas_mock_key',
    baseUrl: 'https://sandbox.asaas.com/api/v3',
  }),
  getZapSignConfig: vi.fn().mockResolvedValue({
    docGenerationMode: 'template',
    templateOficial: 'tpl-123',
    template100k: 'tpl-100k',
    templateRenovacao: 'tpl-renov',
  }),
}));

vi.mock('@/lib/corretora-resolver', () => ({
  getCorretoraParaContrato: vi.fn().mockResolvedValue({
    id: 'corr-01',
    nomeFantasia: 'Net4Life Corretora',
  }),
  isNet4LifeCorretora: vi.fn().mockReturnValue(true),
}));

import { verifyAuth, getPartnerAccessContext } from '@/lib/auth';
import { getAccessibleQuoteById } from '@/lib/access';
import { calcularPrecoServidor } from '@/lib/pricing';
import { POST } from '../../app/api/portal/cotacoes/[id]/gerar-contrato/route';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';

describe('Task 3: Trava Atômica em Cupons e Prevenção de Evasão (VULN-03)', () => {
  beforeEach(() => {
    mockSql.mockReset();
    vi.clearAllMocks();
  });

  describe('1. Trava em gerar-contrato quando cupom_usos atinge o limite', () => {
    it('deve REJEITAR com 409 Conflict quando o cupom estiver esgotado no momento da emissao', async () => {
      vi.mocked(verifyAuth).mockResolvedValue({
        userId: 'user-01',
        partnerId: 'partner-01',
        role: 'partner_sales',
      } as any);

      vi.mocked(getPartnerAccessContext).mockResolvedValue({
        isCorretoraUser: false,
        partnerId: 'partner-01',
        visibleUserIds: null,
      } as any);

      vi.mocked(calcularPrecoServidor).mockResolvedValue({
        valorTotal: 1000,
        qtdParcelas: 1,
        valorParcela: 1000,
      } as any);

      vi.mocked(getAccessibleQuoteById).mockResolvedValue({
        id: 'quote-cupom-01',
        partner_id: 'partner-01',
        product_id: 'prod-01',
        client_name: 'Segurado Teste',
        client_cpf_cnpj: '12345678901',
        client_email: 'segurado@teste.com',
        client_phone: '11999990000',
        premio_calculado: 1000,
        status: 'rascunho',
        client_data: {
          cupomCodigo: 'PROMO10',
          tipoDePlano: 'anual',
        },
      } as any);

      // 1. INSERT cupom_uso_eventos
      mockSql.mockResolvedValueOnce([{ id: 'evento-cupom-01' }]);

      // 2. SELECT wix_items com cupons
      mockSql.mockResolvedValueOnce([
        {
          payload: JSON.stringify({
            codigo: 'PROMO10',
            quantidade: 5,
          }),
        },
      ]);

      // 3. INSERT ... ON CONFLICT DO UPDATE WHERE usos < limite RETURNING usos
      // Retorna vazio (cupom esgotado!)
      mockSql.mockResolvedValueOnce([]);

      const req = new NextRequest('http://localhost:3000/api/portal/cotacoes/quote-cupom-01/gerar-contrato', {
        method: 'POST',
      });

      const res = await POST(req, { params: Promise.resolve({ id: 'quote-cupom-01' }) });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toMatch(/cupom promocional esgotado|limite de utilizações/i);
    });
  });

  describe('2. Desacoplamento entre cupomDescontoPercentual e descontoManualPercent no Asaas', () => {
    it('nao deve repassar descontoPercentual como descontoManualPercent se descontoManualPercent for nulo', async () => {
      // 1. SELECT cotacao
      mockSql.mockResolvedValueOnce([
        {
          id: 'quote-pay-01',
          status: 'rascunho',
          client_name: 'Segurado Teste',
          client_cpf_cnpj: '12345678901',
          client_email: 'segurado@teste.com',
          client_phone: '11999990000',
          client_data: {
            tipoDePlano: 'advogado-anual',
            clienteId: 'cust_123',
            cupomCodigo: 'CUPOM_REVOGADO',
            descontoPercentual: 25, // Originado de cupom
          },
        },
      ]);
      // 2. SELECT sales
      mockSql.mockResolvedValueOnce([]);
      // 3. SELECT payment_orders
      mockSql.mockResolvedValueOnce([]);

      vi.mocked(calcularPrecoServidor).mockResolvedValue({
        valorTotal: 1000,
        qtdParcelas: 1,
        valorParcela: 1000,
      } as any);

      await generateAsaasPaymentForQuote('quote-pay-01');

      expect(calcularPrecoServidor).toHaveBeenCalled();
      const calledParams = vi.mocked(calcularPrecoServidor).mock.calls[0][0];

      // O descontoManualPercent DEVE ser 0 e NÃO 25!
      expect(calledParams.descontoManualPercent).toBe(0);
      expect(calledParams.cupomCodigo).toBe('CUPOM_REVOGADO');
    });
  });
});
