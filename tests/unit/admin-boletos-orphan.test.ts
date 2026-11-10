import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyAdminAuth: vi.fn(),
  isDevUser: vi.fn((admin: any) => admin?.role === 'duolife_dev'),
  unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })),
}));

vi.mock('@/lib/pg', () => {
  const mockSql = vi.fn(async () => []);
  return { sql: mockSql };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/asaas-charges', () => ({
  deleteAsaasPayment: vi.fn(),
  getAsaasPayment: vi.fn(),
}));

import { verifyAdminAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { deleteAsaasPayment, getAsaasPayment } from '@/lib/asaas-charges';
import { DELETE } from '../../app/api/admin/boletos/[id]/route';

describe('DELETE /api/admin/boletos/[id] - Cobranças Órfãs Asaas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const devAdmin = { userId: 'admin-dev-1', role: 'duolife_dev' };
  const req = new NextRequest('http://localhost/api/admin/boletos/pay_orphan123', { method: 'DELETE' });

  it('bloqueia exclusão para usuário que não seja desenvolvedor', async () => {
    vi.mocked(verifyAdminAuth).mockResolvedValue({ userId: 'admin-1', role: 'duolife_admin' } as any);
    const res = await DELETE(req, { params: Promise.resolve({ id: 'pay_orphan123' }) });
    expect(res.status).toBe(403);
  });

  it('retorna 404 quando cobrança local não existe e ID não começa com pay_', async () => {
    vi.mocked(verifyAdminAuth).mockResolvedValue(devAdmin as any);
    vi.mocked(sql as any).mockResolvedValue([]);
    const res = await DELETE(req, { params: Promise.resolve({ id: 'uuid-invalido' }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Boleto/Cobrança não encontrada');
  });

  it('retorna 404 quando cobrança órfã pay_ não é encontrada no Asaas', async () => {
    vi.mocked(verifyAdminAuth).mockResolvedValue(devAdmin as any);
    vi.mocked(sql as any).mockResolvedValue([]);
    vi.mocked(getAsaasPayment).mockResolvedValue({ ok: false, error: 'Cobrança não encontrada no Asaas' });

    const res = await DELETE(req, { params: Promise.resolve({ id: 'pay_orphan123' }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Cobrança não encontrada no Asaas');
  });

  it('bloqueia exclusão com 400 se a cobrança órfã já estiver paga no Asaas', async () => {
    vi.mocked(verifyAdminAuth).mockResolvedValue(devAdmin as any);
    vi.mocked(sql as any).mockResolvedValue([]);
    vi.mocked(getAsaasPayment).mockResolvedValue({
      ok: true,
      charge: { id: 'pay_orphan123', status: 'RECEIVED' } as any,
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: 'pay_orphan123' }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('já foi compensada/paga');
  });

  it('cancela cobrança órfã pendente no Asaas com sucesso', async () => {
    vi.mocked(verifyAdminAuth).mockResolvedValue(devAdmin as any);
    vi.mocked(sql as any).mockResolvedValue([]);
    vi.mocked(getAsaasPayment).mockResolvedValue({
      ok: true,
      charge: { id: 'pay_orphan123', status: 'PENDING' } as any,
    });
    vi.mocked(deleteAsaasPayment).mockResolvedValue({ ok: true, deleted: true });

    const res = await DELETE(req, { params: Promise.resolve({ id: 'pay_orphan123' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      ok: true,
      deletedExternalPaymentId: 'pay_orphan123',
      orphan: true,
    });
    expect(deleteAsaasPayment).toHaveBeenCalledWith('pay_orphan123');
  });
});
