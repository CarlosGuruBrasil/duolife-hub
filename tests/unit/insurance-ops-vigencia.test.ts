import { describe, it, expect } from 'vitest';
import { parseVigenciaDate } from '@/lib/insurance-ops';

describe('parseVigenciaDate', () => {
  it('deve extrair data ISO YYYY-MM-DD corretamente', () => {
    expect(parseVigenciaDate('2026-12-15')).toBe('2026-12-15');
    expect(parseVigenciaDate('2026-01-01T00:00:00.000Z')).toBe('2026-01-01');
  });

  it('deve converter data brasileira DD/MM/YYYY para ISO YYYY-MM-DD', () => {
    expect(parseVigenciaDate('15/12/2026')).toBe('2026-12-15');
    expect(parseVigenciaDate('01/05/2027')).toBe('2027-05-01');
  });

  it('deve retornar null para formatos invalidos ou valores nulos/vazios', () => {
    expect(parseVigenciaDate('')).toBeNull();
    expect(parseVigenciaDate(null)).toBeNull();
    expect(parseVigenciaDate(undefined)).toBeNull();
    expect(parseVigenciaDate('data-invalida')).toBeNull();
  });
});
