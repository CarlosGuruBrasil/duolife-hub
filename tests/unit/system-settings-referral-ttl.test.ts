import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

let mockDbRows: Array<{ key: string; value: string }> = [];

vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn().mockImplementation(() => Promise.resolve(mockDbRows));
  sqlMock.unsafe = vi.fn();
  return { sql: sqlMock };
});

import * as systemSettings from '@/lib/system-settings';

describe('Validade e TTL de Token de Indicação (system-settings)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRows = [];
  });

  it('deve calcular TTL padrão de 24 horas (86400 segundos) quando não houver configurações no banco', async () => {
    mockDbRows = [];

    const config = await systemSettings.getReferralTokenTtlConfig();
    expect(config.value).toBe(24);
    expect(config.unit).toBe('hours');
    expect(config.ttlSeconds).toBe(86400);

    const ttlSeconds = await systemSettings.getReferralTokenTtlSeconds();
    expect(ttlSeconds).toBe(86400);
  });

  it('deve converter corretamente horas para segundos (ex: 12 horas = 43200 segundos)', async () => {
    mockDbRows = [
      { key: 'REFERRAL_TOKEN_EXPIRATION_VALUE', value: '12' },
      { key: 'REFERRAL_TOKEN_EXPIRATION_UNIT', value: 'hours' },
    ];

    const config = await systemSettings.getReferralTokenTtlConfig();
    expect(config.value).toBe(12);
    expect(config.unit).toBe('hours');
    expect(config.ttlSeconds).toBe(12 * 3600);
  });

  it('deve converter corretamente dias para segundos (ex: 3 dias = 259200 segundos)', async () => {
    mockDbRows = [
      { key: 'REFERRAL_TOKEN_EXPIRATION_VALUE', value: '3' },
      { key: 'REFERRAL_TOKEN_EXPIRATION_UNIT', value: 'days' },
    ];

    const config = await systemSettings.getReferralTokenTtlConfig();
    expect(config.value).toBe(3);
    expect(config.unit).toBe('days');
    expect(config.ttlSeconds).toBe(3 * 24 * 3600);
  });

  it('deve tratar valores negativos, nulos ou strings inválidas retornando fallback seguro de 24 horas', async () => {
    mockDbRows = [
      { key: 'REFERRAL_TOKEN_EXPIRATION_VALUE', value: '-5' },
      { key: 'REFERRAL_TOKEN_EXPIRATION_UNIT', value: 'unknown_unit' },
    ];

    const config = await systemSettings.getReferralTokenTtlConfig();
    expect(config.value).toBe(24);
    expect(config.unit).toBe('hours');
    expect(config.ttlSeconds).toBe(86400);
  });

  it('deve exportar calculateTtlSeconds para cálculo determinístico síncrono', () => {
    expect(systemSettings.calculateTtlSeconds(1, 'hours')).toBe(3600);
    expect(systemSettings.calculateTtlSeconds(2, 'days')).toBe(172800);
    expect(systemSettings.calculateTtlSeconds(0, 'hours')).toBe(86400); // Fallback para 24h
  });
});
