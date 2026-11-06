import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyAdminAuth: vi.fn(),
  unauthorized: vi.fn(() => new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 })),
}));

vi.mock('@/lib/cancelamentos-indevidos-service', () => ({
  listarCanceladosIndevidos: vi.fn(async () => [
    {
      cotacaoId: 'cot_test_1',
      clienteNome: 'Antonio Clovis Garcia',
      clienteCpfCnpj: '12345678900',
      valorTotalContratado: 1200,
      totalPago: 400,
      saldoFaltante: 800,
      statusReativacao: 'pendente',
      parcelasPagas: [{ numero: 1, amount: 400, dueDate: '2026-10-02', status: 'paid' }],
      parcelasCanceladas: [{ numero: 2, amount: 400, dueDate: '2026-11-02', status: 'cancelled' }],
      datasProjetadasRestantes: [{ numero: 2, dueDate: '2026-12-02', dueDateFormatted: '02/12/2026' }],
    },
  ]),
  reativarCobrancaFaltante: vi.fn(async (params: { cotacaoId: string }) => {
    if (!params.cotacaoId) return { ok: false, error: 'ID da cotação não informado', cotacaoId: '' };
    return {
      ok: true,
      cotacaoId: params.cotacaoId,
      saldoReativado: 800,
      qtdParcelas: 2,
      checkoutId: 'pay_test_123',
      linkBoleto: 'https://asaas.com/i/test123',
    };
  }),
}));

import { verifyAdminAuth } from '@/lib/auth';
import { GET } from '../../app/api/admin/cancelamentos-indevidos/route';
import { POST } from '../../app/api/admin/cancelamentos-indevidos/reativar/route';

describe('API de Cancelamentos Indevidos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/cancelamentos-indevidos', () => {
    it('deve rejeitar requisição sem autenticação de administrador', async () => {
      (verifyAdminAuth as any).mockResolvedValue(null);
      const req = new NextRequest('http://localhost/api/admin/cancelamentos-indevidos');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('deve retornar lista e KPIs agregados com sucesso para admin', async () => {
      (verifyAdminAuth as any).mockResolvedValue({ id: 'adm_1', role: 'duolife_admin' });
      const req = new NextRequest('http://localhost/api/admin/cancelamentos-indevidos');
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.kpis.totalContratos).toBe(1);
      expect(json.kpis.totalValorContratado).toBe(1200);
      expect(json.kpis.totalValorPago).toBe(400);
      expect(json.kpis.totalSaldoFaltante).toBe(800);
      expect(json.items).toHaveLength(1);
      expect(json.items[0].clienteNome).toBe('Antonio Clovis Garcia');
    });
  });

  describe('POST /api/admin/cancelamentos-indevidos/reativar', () => {
    it('deve rejeitar se faltar cotacaoId e cotacaoIds', async () => {
      (verifyAdminAuth as any).mockResolvedValue({ id: 'adm_1', role: 'duolife_admin' });
      const req = new NextRequest('http://localhost/api/admin/cancelamentos-indevidos/reativar', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });

    it('deve reativar com sucesso quando cotacaoId válido for informado', async () => {
      (verifyAdminAuth as any).mockResolvedValue({ id: 'adm_1', role: 'duolife_admin' });
      const req = new NextRequest('http://localhost/api/admin/cancelamentos-indevidos/reativar', {
        method: 'POST',
        body: JSON.stringify({ cotacaoId: 'cot_test_1' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.saldoReativado).toBe(800);
      expect(json.checkoutId).toBe('pay_test_123');
    });

    it('deve suportar reativação em lote via cotacaoIds', async () => {
      (verifyAdminAuth as any).mockResolvedValue({ id: 'adm_1', role: 'duolife_admin' });
      const req = new NextRequest('http://localhost/api/admin/cancelamentos-indevidos/reativar', {
        method: 'POST',
        body: JSON.stringify({ cotacaoIds: ['cot_test_1', 'cot_test_2'] }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.batch).toBe(true);
      expect(json.total).toBe(2);
      expect(json.successCount).toBe(2);
    });
  });
});
