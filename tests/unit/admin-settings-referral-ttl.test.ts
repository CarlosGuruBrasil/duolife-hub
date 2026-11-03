import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyAuth: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: 'Não autorizado' }, { status: 401 })),
}));

let mockDbSettings: Record<string, string> = {};

vi.mock('@/lib/system-settings', () => ({
  getAllSystemSettings: vi.fn().mockImplementation(() => Promise.resolve(mockDbSettings)),
  updateSystemSettings: vi.fn().mockImplementation((settings: Record<string, string>) => {
    mockDbSettings = { ...mockDbSettings, ...settings };
    return Promise.resolve();
  }),
  sanitizeApiToken: vi.fn((val: string) => val.trim()),
}));

vi.mock('@/lib/action-audit', () => ({
  recordActionAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { GET, POST } from '../../app/api/admin/chaves-api/route';
import { verifyAuth } from '@/lib/auth';

describe('Admin Settings API - Validade de Token de Indicação (/api/admin/chaves-api)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSettings = {};
  });

  it('deve permitir acesso para administrador (duolife_admin) e desenvolvedor (duolife_dev)', async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      userId: 'user-admin-1',
      email: 'admin@duolife.net.br',
      name: 'Administrador DuoLife',
      role: 'duolife_admin',
      partnerId: null,
      permissions: {},
    } as any);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.settings.REFERRAL_TOKEN_EXPIRATION_VALUE).toBe('24');
    expect(data.settings.REFERRAL_TOKEN_EXPIRATION_UNIT).toBe('hours');
  });

  it('deve bloquear usuário sem privilégio de administração (ex: corretora_admin ou duolife_staff)', async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      userId: 'user-staff-1',
      email: 'staff@duolife.net.br',
      name: 'Staff DuoLife',
      role: 'duolife_staff',
      partnerId: null,
      permissions: {},
    } as any);

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('deve salvar novas configurações de validade do token (ex: 48 horas ou 7 dias) via POST', async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      userId: 'user-admin-1',
      email: 'admin@duolife.net.br',
      name: 'Administrador DuoLife',
      role: 'duolife_admin',
      partnerId: null,
      permissions: {},
    } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/chaves-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          REFERRAL_TOKEN_EXPIRATION_VALUE: '48',
          REFERRAL_TOKEN_EXPIRATION_UNIT: 'hours',
        },
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockDbSettings.REFERRAL_TOKEN_EXPIRATION_VALUE).toBe('48');
    expect(mockDbSettings.REFERRAL_TOKEN_EXPIRATION_UNIT).toBe('hours');
  });

  it('deve validar e ajustar valores inválidos de tempo de expiração no POST', async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      userId: 'user-admin-1',
      email: 'admin@duolife.net.br',
      name: 'Administrador DuoLife',
      role: 'duolife_admin',
      partnerId: null,
      permissions: {},
    } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/chaves-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          REFERRAL_TOKEN_EXPIRATION_VALUE: 'invalid_number',
          REFERRAL_TOKEN_EXPIRATION_UNIT: 'unknown_unit',
        },
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockDbSettings.REFERRAL_TOKEN_EXPIRATION_VALUE).toBe('24');
    expect(mockDbSettings.REFERRAL_TOKEN_EXPIRATION_UNIT).toBe('hours');
  });
});
