import { describe, it, expect } from 'vitest';
import { calculateMatrixStatus } from '@/lib/status-matrix';

describe('Matriz de Status - Regra de Cancelamento por Inadimplência', () => {
  it('deve classificar Parcela 1 com atraso > 2 dias úteis como CANCELADO', () => {
    // Parcela 1 venceu em 2026-10-15 (quinta). Prazo final era 19/10/2026 (segunda).
    // Em 20/10/2026 está cancelada por inadimplência.
    const result = calculateMatrixStatus({
      hasSale: true,
      saleStatus: 'ativa',
      installmentNumber: 1,
      dueDate: '2026-10-15',
      referenceDate: '2026-10-20',
      daysOverdue: 5,
    });

    expect(result.statusCliente).toBe('Cancelado');
    expect(result.statusGeral).toBe('Negócio Fechado');
    expect(result.ruleId).toBe('CANCELADO_INADIMPLENCIA_GT_50');
  });

  it('deve manter Parcela 1 dentro dos 2 dias úteis como VIGENTE / EM ATRASO', () => {
    // Parcela 1 venceu em 2026-10-16 (sexta). Prazo final é 20/10/2026 (terça).
    // Em 20/10/2026 ainda está no prazo de tolerância (não cancelou).
    const result = calculateMatrixStatus({
      hasSale: true,
      saleStatus: 'ativa',
      installmentNumber: 1,
      dueDate: '2026-10-16',
      referenceDate: '2026-10-20',
      daysOverdue: 4,
    });

    expect(result.statusCliente).toBe('Vigente / Renovado');
    expect(result.statusPagamento).toBe('Em atraso <= 50 dias');
  });

  it('deve classificar Parcela 2 com atraso > 30 dias corridos prorrogados como CANCELADO', () => {
    // Parcela 2 venceu em 2026-07-03. +30 dias = 02/08 (domingo) -> prorroga para 03/08 (segunda).
    // Em 04/08/2026 está cancelada.
    const result = calculateMatrixStatus({
      hasSale: true,
      saleStatus: 'ativa',
      installmentNumber: 2,
      dueDate: '2026-07-03',
      referenceDate: '2026-08-04',
      daysOverdue: 32,
    });

    expect(result.statusCliente).toBe('Cancelado');
    expect(result.statusGeral).toBe('Negócio Fechado');
  });

  it('deve manter Parcela 2 com menos de 30 dias de atraso como VIGENTE / EM ATRASO', () => {
    // Parcela 2 venceu em 2026-09-21. Em 2026-10-10 tem 19 dias de atraso (< 30 dias).
    const result = calculateMatrixStatus({
      hasSale: true,
      saleStatus: 'ativa',
      installmentNumber: 2,
      dueDate: '2026-09-21',
      referenceDate: '2026-10-10',
      daysOverdue: 19,
    });

    expect(result.statusCliente).toBe('Vigente / Renovado');
    expect(result.statusPagamento).toBe('Em atraso <= 50 dias');
  });

  it('deve aceitar a flag isPastCancellationDeadline explicitamente', () => {
    const result = calculateMatrixStatus({
      hasSale: true,
      saleStatus: 'ativa',
      isPastCancellationDeadline: true,
    });

    expect(result.statusCliente).toBe('Cancelado');
    expect(result.statusGeral).toBe('Negócio Fechado');
  });
});
