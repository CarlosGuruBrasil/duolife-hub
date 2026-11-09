import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/schema', () => ({ ensureSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/auth', () => ({
  unauthorized: vi.fn(() => Response.json({ error: 'Não autorizado' }, { status: 401 })),
  isInternalUser: vi.fn((u: any) => String(u?.role || '').startsWith('duolife_')),
  verifyAuth: vi.fn(),
  verifyPartnerAuth: vi.fn(),
}));
vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  sqlMock.json = vi.fn((v: unknown) => v);
  return { sql: sqlMock };
});

import { GET as LIST, PUT } from '../../app/api/portal/rascunhos/route';
import { GET as GET_ONE, DELETE } from '../../app/api/portal/rascunhos/[id]/route';
import { verifyAuth, verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { saveRascunho } from '@/lib/cotacao-rascunhos-service';

const mockSql = vi.mocked(sql as any);

const broker = {
  userId: 'user-1',
  partnerId: 'partner-1',
  role: 'partner_broker',
  partnerRole: 'broker',
  name: 'Corretor',
  email: 'c@x.com',
  permissions: {},
} as any;

function putReq(body: unknown) {
  return new NextRequest('http://localhost/api/portal/rascunhos', {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Valores interpolados na chamada N do tagged template `sql`. */
function sqlValues(call: number) {
  return (mockSql.mock.calls[call] as any[]).slice(1);
}
function sqlText(call: number) {
  return ((mockSql.mock.calls[call][0] as unknown as string[]) || []).join('?');
}

describe('Rascunhos de cotação (TD-009)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 sem sessão', async () => {
    vi.mocked(verifyAuth).mockResolvedValueOnce(null);
    const res = await LIST();
    expect(res.status).toBe(401);
  });

  it('rejeita etapa inválida com 400', async () => {
    vi.mocked(verifyAuth).mockResolvedValueOnce(broker);
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(broker);
    const res = await PUT(putReq({ step: 9, payload: {} }));
    expect(res.status).toBe(400);
  });

  it('rejeita payload acima do limite com 413', async () => {
    vi.mocked(verifyAuth).mockResolvedValueOnce(broker);
    vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(broker);
    const res = await PUT(putReq({ step: 2, payload: { big: 'x'.repeat(210_000) } }));
    expect(res.status).toBe(413);
  });

  it('cria rascunho com o parceiro do próprio corretor, ignorando partnerId enviado', async () => {
    mockSql.mockResolvedValueOnce([{ id: 'r-1', updated_at: '2026-11-09' }] as any); // INSERT
    mockSql.mockResolvedValueOnce([] as any); // limpeza dos excedentes
    const saved = await saveRascunho(broker, {
      step: 3,
      partnerId: 'outro-parceiro',
      clientName: ' Fulano ',
      clientCpfCnpj: '123.456.789-09',
      payload: { form: {} },
    });
    expect(saved).toEqual({ id: 'r-1', updated_at: '2026-11-09' });
    expect(sqlText(0)).toContain('INSERT INTO cotacao_rascunhos');
    const values = sqlValues(0);
    expect(values).toContain('user-1');
    expect(values).toContain('partner-1');
    expect(values).not.toContain('outro-parceiro');
    expect(values).toContain('12345678909');
    expect(values).toContain('Fulano');
  });

  it('atualização é sempre restrita ao autor (user_id na cláusula WHERE)', async () => {
    mockSql.mockResolvedValueOnce([{ id: 'r-1', updated_at: 'x' }] as any); // UPDATE
    await saveRascunho(broker, { id: 'r-1', step: 4, payload: {} });
    expect(sqlText(0)).toContain('UPDATE cotacao_rascunhos');
    expect(sqlText(0)).toMatch(/WHERE id = \? AND user_id = \?/);
    expect(sqlValues(0).slice(-2)).toEqual(['r-1', 'user-1']);
  });

  it('GET/DELETE de rascunho de outro usuário retornam 404', async () => {
    vi.mocked(verifyAuth).mockResolvedValue(broker);
    vi.mocked(verifyPartnerAuth).mockResolvedValue(broker);
    mockSql.mockResolvedValue([] as any);
    const params = Promise.resolve({ id: 'r-de-outro' });

    const resGet = await GET_ONE(new NextRequest('http://localhost/x'), { params });
    expect(resGet.status).toBe(404);

    const resDel = await DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), { params });
    expect(resDel.status).toBe(404);
    expect(sqlValues(1)).toEqual(['r-de-outro', 'user-1']);
  });

  it('usuário interno (staff) também pode ter rascunhos', async () => {
    const staff = { ...broker, userId: 'staff-1', partnerId: null, role: 'duolife_staff' };
    vi.mocked(verifyAuth).mockResolvedValueOnce(staff);
    mockSql.mockResolvedValueOnce([] as any);
    const res = await LIST();
    expect(res.status).toBe(200);
    expect(verifyPartnerAuth).not.toHaveBeenCalled();
  });
});
