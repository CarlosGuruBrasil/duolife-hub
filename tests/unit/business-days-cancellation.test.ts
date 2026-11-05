import { describe, it, expect } from 'vitest';
import {
  calculateCancellationDeadline,
  isInstallmentPastCancellationDeadline,
  ensureNextBusinessDay,
} from '@/lib/business-days';

describe('business-days.ts - Regras de Cancelamento por Inadimplência', () => {
  describe('ensureNextBusinessDay', () => {
    it('deve manter a data inalterada se já for dia útil', () => {
      // 2026-10-19 é Segunda-feira (dia útil normal)
      expect(ensureNextBusinessDay('2026-10-19')).toBe('2026-10-19');
    });

    it('deve avançar para segunda-feira se cair em sábado ou domingo', () => {
      // 2026-10-17 = Sábado -> Prorroga para Segunda 2026-10-19
      expect(ensureNextBusinessDay('2026-10-17')).toBe('2026-10-19');
      // 2026-10-18 = Domingo -> Prorroga para Segunda 2026-10-19
      expect(ensureNextBusinessDay('2026-10-18')).toBe('2026-10-19');
    });

    it('deve avançar para o próximo dia útil se cair em feriado nacional', () => {
      // 2026-11-20 = Sexta-feira (Feriado Nacional da Consciência Negra)
      // Deve pular o fim de semana (21 e 22) e ir para Segunda 2026-11-23
      expect(ensureNextBusinessDay('2026-11-20')).toBe('2026-11-23');
    });
  });

  describe('Parcela 1 (Entrada/Ativação) - Tolerância de 2 dias úteis', () => {
    it('deve tolerar 2 dias úteis a partir de vencimento em dia de semana', () => {
      // Quinta-feira 2026-10-15
      // 1º dia útil: 2026-10-16 (sexta)
      // 2º dia útil: 2026-10-19 (segunda)
      const res = calculateCancellationDeadline('2026-10-15', 1);
      expect(res.deadlineDate).toBe('2026-10-19');

      // No dia do limite (segunda 19/10), ainda NÃO cancelou
      expect(isInstallmentPastCancellationDeadline('2026-10-15', 1, '2026-10-19')).toBe(false);

      // No dia seguinte ao prazo (terça 20/10), está CANCELADO
      expect(isInstallmentPastCancellationDeadline('2026-10-15', 1, '2026-10-20')).toBe(true);
    });

    it('deve pular fim de semana ao vencer na sexta-feira', () => {
      // Sexta-feira 2026-10-16
      // 1º dia útil: 2026-10-19 (segunda)
      // 2º dia útil: 2026-10-20 (terça)
      const res = calculateCancellationDeadline('2026-10-16', 1);
      expect(res.deadlineDate).toBe('2026-10-20');

      expect(isInstallmentPastCancellationDeadline('2026-10-16', 1, '2026-10-20')).toBe(false);
      expect(isInstallmentPastCancellationDeadline('2026-10-16', 1, '2026-10-21')).toBe(true);
    });

    it('deve pular feriados nacionais no cômputo dos 2 dias úteis', () => {
      // Sexta-feira 2026-10-09
      // 12/10/2026 é feriado de Nossa Senhora Aparecida (segunda)
      // 1º dia útil: 2026-10-13 (terça)
      // 2º dia útil: 2026-10-14 (quarta)
      const res = calculateCancellationDeadline('2026-10-09', 1);
      expect(res.deadlineDate).toBe('2026-10-14');

      expect(isInstallmentPastCancellationDeadline('2026-10-09', 1, '2026-10-14')).toBe(false);
      expect(isInstallmentPastCancellationDeadline('2026-10-09', 1, '2026-10-15')).toBe(true);
    });
  });

  describe('Demais Parcelas (> 1) - Tolerância de 30 dias corridos prorrogáveis', () => {
    it('deve manter o 30º dia se cair em dia útil', () => {
      // Vencimento: 2026-08-01 (sábado)
      // + 30 dias corridos: 2026-08-31 (segunda-feira, dia útil)
      const res = calculateCancellationDeadline('2026-08-01', 2);
      expect(res.deadlineDate).toBe('2026-08-31');

      expect(isInstallmentPastCancellationDeadline('2026-08-01', 2, '2026-08-31')).toBe(false);
      expect(isInstallmentPastCancellationDeadline('2026-08-01', 2, '2026-09-01')).toBe(true);
    });

    it('deve prorrogar o termo final se os 30 dias corridos caírem em domingo', () => {
      // Vencimento: 2026-07-03
      // + 30 dias corridos: 2026-08-02 (Domingo!)
      // Deve prorrogar para Segunda 2026-08-03
      const res = calculateCancellationDeadline('2026-07-03', 2);
      expect(res.deadlineDate).toBe('2026-08-03');

      // No domingo 02/08 ou na segunda prorrogada 03/08 ainda NÃO cancelou
      expect(isInstallmentPastCancellationDeadline('2026-07-03', 2, '2026-08-02')).toBe(false);
      expect(isInstallmentPastCancellationDeadline('2026-07-03', 2, '2026-08-03')).toBe(false);

      // Na terça 04/08 está cancelado
      expect(isInstallmentPastCancellationDeadline('2026-07-03', 2, '2026-08-04')).toBe(true);
    });

    it('deve prorrogar o termo final se os 30 dias corridos caírem em feriado nacional', () => {
      // Vencimento: 2026-10-21
      // + 30 dias corridos: 2026-11-20 (Sexta-feira, Consciência Negra)
      // Prorroga pulando fim de semana para Segunda-feira 2026-11-23
      const res = calculateCancellationDeadline('2026-10-21', 3);
      expect(res.deadlineDate).toBe('2026-11-23');

      expect(isInstallmentPastCancellationDeadline('2026-10-21', 3, '2026-11-20')).toBe(false);
      expect(isInstallmentPastCancellationDeadline('2026-10-21', 3, '2026-11-23')).toBe(false);
      expect(isInstallmentPastCancellationDeadline('2026-10-21', 3, '2026-11-24')).toBe(true);
    });
  });
});
