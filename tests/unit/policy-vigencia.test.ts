import { describe, it, expect } from 'vitest';
import {
  calculatePolicyExpiryDate,
  resolvePolicyExpiryDate,
  formatPolicyValidity,
  formatDate,
} from '@/lib/format';

describe('policy-vigencia.test.ts - Regras de Vigência Anual de Apólices (Padrão SUSEP)', () => {
  describe('calculatePolicyExpiryDate', () => {
    it('deve calcular término de 1 ano para 07/10/2026 como 06/10/2027 (Exemplo Exato do Usuário)', () => {
      const expiry = calculatePolicyExpiryDate('2026-10-07');
      expect(expiry).toBe('2027-10-06');
    });

    it('deve calcular término de 1 ano para 06/10/2026 como 05/10/2027 (Caso do Print do Usuário)', () => {
      const expiry = calculatePolicyExpiryDate('2026-10-06');
      expect(expiry).toBe('2027-10-05');
    });

    it('deve calcular ano civil completo: início em 01/01/2026 termina em 31/12/2026', () => {
      const expiry = calculatePolicyExpiryDate('2026-01-01');
      expect(expiry).toBe('2026-12-31');
    });

    it('deve tratar ano bissexto iniciando em 29/02/2024 terminando em 28/02/2025', () => {
      const expiry = calculatePolicyExpiryDate('2024-02-29');
      expect(expiry).toBe('2025-02-28');
    });

    it('deve tratar início em 01/03/2023 terminando em ano bissexto como 29/02/2024', () => {
      const expiry = calculatePolicyExpiryDate('2023-03-01');
      expect(expiry).toBe('2024-02-29');
    });

    it('deve aceitar instâncias de Date como entrada', () => {
      const date = new Date(Date.UTC(2026, 9, 7)); // 2026-10-07
      const expiry = calculatePolicyExpiryDate(date);
      expect(expiry).toBe('2027-10-06');
    });

    it('deve retornar null para entradas inválidas, nulas ou indefinidas', () => {
      expect(calculatePolicyExpiryDate(null)).toBeNull();
      expect(calculatePolicyExpiryDate(undefined)).toBeNull();
      expect(calculatePolicyExpiryDate('')).toBeNull();
      expect(calculatePolicyExpiryDate('invalid-date')).toBeNull();
    });
  });

  describe('resolvePolicyExpiryDate', () => {
    it('deve auto-corrigir registro legado gravado com erro clássico de +1 ano exato (06/10/2026 -> 06/10/2027 para 05/10/2027)', () => {
      const resolved = resolvePolicyExpiryDate('2026-10-06', '2027-10-06');
      expect(resolved).toBe('2027-10-05');
    });

    it('deve preservar registros que já possuem a data de expiração correta', () => {
      const resolved = resolvePolicyExpiryDate('2026-10-06', '2027-10-05');
      expect(resolved).toBe('2027-10-05');
    });

    it('deve calcular a partir da data de início quando a data de expiração for nula', () => {
      const resolved = resolvePolicyExpiryDate('2026-10-07', null);
      expect(resolved).toBe('2027-10-06');

      const resolvedUndef = resolvePolicyExpiryDate('2026-10-07', undefined);
      expect(resolvedUndef).toBe('2027-10-06');
    });

    it('deve retornar null quando ambas as datas forem nulas ou ausentes', () => {
      expect(resolvePolicyExpiryDate(null, null)).toBeNull();
      expect(resolvePolicyExpiryDate(undefined, undefined)).toBeNull();
    });
  });

  describe('formatPolicyValidity', () => {
    it('deve formatar vigência canônica para visualização: 07/10/2026 — 06/10/2027', () => {
      const formatted = formatPolicyValidity('2026-10-07', '2027-10-06');
      expect(formatted).toBe('07/10/2026 — 06/10/2027');
    });

    it('deve corrigir e formatar registros legados exibindo a data correta na tabela', () => {
      // Entrada com erro legado no banco: 06/10/2026 até 06/10/2027
      const formatted = formatPolicyValidity('2026-10-06', '2027-10-06');
      expect(formatted).toBe('06/10/2026 — 05/10/2027');
    });

    it('deve auto-calcular o término quando apenas issueDate for fornecido', () => {
      const formatted = formatPolicyValidity('2026-10-07');
      expect(formatted).toBe('07/10/2026 — 06/10/2027');
    });

    it('deve retornar hífen "-" quando nenhuma data for informada', () => {
      expect(formatPolicyValidity(null, null)).toBe('-');
      expect(formatPolicyValidity(undefined, undefined)).toBe('-');
    });
  });
});
