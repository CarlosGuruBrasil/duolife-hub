import { describe, it, expect } from 'vitest';
import {
  calculateMatrixStatus,
  isValidMatrixCombination,
  MATRIX_RULES,
  normalizeStatusCliente,
  normalizeStatusGeral,
  normalizeStatusPagamento,
  getStatusClienteBadge,
  getStatusGeralBadge,
  getStatusPagamentoBadge,
} from '@/lib/status-matrix';

describe('status-matrix.test.ts - Matriz de Status Unificada da DuoLife', () => {
  describe('9 Regras Canônicas da Matriz', () => {
    it('deve possuir exatamente as 9 regras canônicas homologadas', () => {
      expect(MATRIX_RULES).toHaveLength(9);
      const ruleIds = MATRIX_RULES.map((r) => r.id);
      expect(ruleIds).toEqual([
        'VIGENTE_EM_DIA',
        'VIGENTE_ATRASO_LE_50',
        'NEGOCIACAO_PENDENTE_ASSINATURA',
        'NEGOCIACAO_PENDENTE_PAGAMENTO',
        'CADASTRADO_INATIVO',
        'EXPIRADO_QUITADO',
        'CANCELADO_PENDENTE_ASSINATURA',
        'CANCELADO_PENDENTE_PAGAMENTO',
        'CANCELADO_INADIMPLENCIA_GT_50',
      ]);
    });

    it('isValidMatrixCombination deve validar positivamente todas as 9 combinações canônicas', () => {
      for (const rule of MATRIX_RULES) {
        const valid = isValidMatrixCombination(
          rule.statusCliente,
          rule.statusGeral,
          rule.statusPagamento
        );
        expect(valid, `Regra ${rule.id} deveria ser válida`).toBe(true);
      }
    });

    it('isValidMatrixCombination deve rejeitar combinações inválidas ou incoerentes', () => {
      expect(isValidMatrixCombination('Cadastrado', 'Negócio Fechado', 'Em dia')).toBe(false);
      expect(isValidMatrixCombination('Vigente / Renovado', 'Pendente de Assinatura', 'Em dia')).toBe(false);
      expect(isValidMatrixCombination('Cancelado', 'Negócio Fechado', 'Em dia')).toBe(false);
      expect(isValidMatrixCombination('Expirado', 'Inativo', 'Quitado')).toBe(false);
    });
  });

  describe('calculateMatrixStatus - Cenários Operacionais', () => {
    it('1. VIGENTE_EM_DIA: Apólice emitida com pagamentos em dia', () => {
      const res = calculateMatrixStatus({
        hasSale: true,
        saleStatus: 'ativa',
        paymentStatus: 'paid',
        daysOverdue: 0,
      });

      expect(res.ruleId).toBe('VIGENTE_EM_DIA');
      expect(res.statusCliente).toBe('Vigente / Renovado');
      expect(res.statusGeral).toBe('Negócio Fechado');
      expect(res.statusPagamento).toBe('Em dia');
    });

    it('1.1. VIGENTE_EM_DIA: Apólice ativa com pagamento parcial (partially_paid) sem parcelas vencidas', () => {
      const res = calculateMatrixStatus({
        hasSale: true,
        saleStatus: 'ativa',
        paymentStatus: 'partially_paid',
        paidInstallments: 1,
        totalInstallments: 3,
        daysOverdue: 0,
      });

      expect(res.ruleId).toBe('VIGENTE_EM_DIA');
      expect(res.statusPagamento).toBe('Em dia');
    });

    it('2. VIGENTE_ATRASO_LE_50: Apólice emitida com atraso tolerado <= 50 dias', () => {
      const res = calculateMatrixStatus({
        hasSale: true,
        saleStatus: 'ativa',
        daysOverdue: 15,
      });

      expect(res.ruleId).toBe('VIGENTE_ATRASO_LE_50');
      expect(res.statusCliente).toBe('Vigente / Renovado');
      expect(res.statusGeral).toBe('Negócio Fechado');
      expect(res.statusPagamento).toBe('Em atraso <= 50 dias');
    });

    it('2.1. VIGENTE_ATRASO_LE_50: No limite exato de 50 dias de atraso', () => {
      const res = calculateMatrixStatus({
        hasSale: true,
        saleStatus: 'ativa',
        daysOverdue: 50,
      });

      expect(res.ruleId).toBe('VIGENTE_ATRASO_LE_50');
      expect(res.statusPagamento).toBe('Em atraso <= 50 dias');
    });

    it('3. NEGOCIACAO_PENDENTE_ASSINATURA: Proposta/cotação em andamento aguardando assinatura', () => {
      const res = calculateMatrixStatus({
        hasCotacao: true,
        cotacaoStatus: 'enviada',
        isContractSigned: false,
      });

      expect(res.ruleId).toBe('NEGOCIACAO_PENDENTE_ASSINATURA');
      expect(res.statusCliente).toBe('Em negociação');
      expect(res.statusGeral).toBe('Pendente de Assinatura');
      expect(res.statusPagamento).toBe('Falta Assinatura');
    });

    it('4. NEGOCIACAO_PENDENTE_PAGAMENTO: Contrato assinado aguardando primeiro pagamento', () => {
      const res = calculateMatrixStatus({
        hasCotacao: true,
        cotacaoStatus: 'assinado',
        isContractSigned: true,
        paymentStatus: 'pending',
      });

      expect(res.ruleId).toBe('NEGOCIACAO_PENDENTE_PAGAMENTO');
      expect(res.statusCliente).toBe('Em negociação');
      expect(res.statusGeral).toBe('Pendente de Pagamento');
      expect(res.statusPagamento).toBe('Falta Pagamento');
    });

    it('5. CADASTRADO_INATIVO: Cliente apenas cadastrado sem cotações nem apólices ativas', () => {
      const res = calculateMatrixStatus({
        hasCotacao: false,
        hasSale: false,
      });

      expect(res.ruleId).toBe('CADASTRADO_INATIVO');
      expect(res.statusCliente).toBe('Cadastrado');
      expect(res.statusGeral).toBe('Inativo');
      expect(res.statusPagamento).toBe('Inativo');
    });

    it('5.1. CADASTRADO_INATIVO: Cotação que expirou sem prosseguimento', () => {
      const res = calculateMatrixStatus({
        hasCotacao: true,
        cotacaoStatus: 'expirada',
      });

      expect(res.ruleId).toBe('CADASTRADO_INATIVO');
    });

    it('6. EXPIRADO_QUITADO: Apólice finalizada por data de expiração e quitada', () => {
      const res = calculateMatrixStatus({
        hasSale: true,
        saleStatus: 'ativa',
        expiryDate: '2025-01-01',
        referenceDate: '2026-01-01', // Data de referência após término da vigência
        isFullyPaid: true,
      });

      expect(res.ruleId).toBe('EXPIRADO_QUITADO');
      expect(res.statusCliente).toBe('Expirado');
      expect(res.statusGeral).toBe('Negócio Fechado');
      expect(res.statusPagamento).toBe('Quitado');
    });

    it('7. CANCELADO_PENDENTE_ASSINATURA: Cancelamento ocorrido na etapa de assinatura', () => {
      const res = calculateMatrixStatus({
        hasCotacao: true,
        cotacaoStatus: 'recusada',
        isContractSigned: false,
      });

      expect(res.ruleId).toBe('CANCELADO_PENDENTE_ASSINATURA');
      expect(res.statusCliente).toBe('Cancelado');
      expect(res.statusGeral).toBe('Pendente de Assinatura');
      expect(res.statusPagamento).toBe('Cancelado');
    });

    it('8. CANCELADO_PENDENTE_PAGAMENTO: Cancelamento com contrato já assinado por falta de pagamento ou desistência', () => {
      const res = calculateMatrixStatus({
        hasCotacao: true,
        isContractSigned: true,
        isCanceled: true,
      });

      expect(res.ruleId).toBe('CANCELADO_PENDENTE_PAGAMENTO');
      expect(res.statusCliente).toBe('Cancelado');
      expect(res.statusGeral).toBe('Pendente de Pagamento');
      expect(res.statusPagamento).toBe('Cancelado');
    });

    it('9. CANCELADO_INADIMPLENCIA_GT_50: Inadimplência superior a 50 dias cancela apólice', () => {
      const res = calculateMatrixStatus({
        hasSale: true,
        saleStatus: 'ativa',
        daysOverdue: 51,
        isFullyPaid: false,
      });

      expect(res.ruleId).toBe('CANCELADO_INADIMPLENCIA_GT_50');
      expect(res.statusCliente).toBe('Cancelado');
      expect(res.statusGeral).toBe('Negócio Fechado');
      expect(res.statusPagamento).toBe('Falta Pagamento > 50 dias');
    });

    it('Salvaguarda: Cliente quitado (isFullyPaid: true) nunca pode ser classificado como inadimplente', () => {
      const res = calculateMatrixStatus({
        hasSale: true,
        saleStatus: 'ativa',
        isFullyPaid: true,
        daysOverdue: 99, // Resíduo errôneo
      });

      expect(res.ruleId).toBe('VIGENTE_EM_DIA');
      expect(res.statusPagamento).toBe('Em dia');
    });
  });

  describe('Funções de Normalização e Badges (Design System)', () => {
    it('normalizeStatusCliente deve normalizar termos brutos', () => {
      expect(normalizeStatusCliente('vigente')).toBe('Vigente / Renovado');
      expect(normalizeStatusCliente('Renovado')).toBe('Vigente / Renovado');
      expect(normalizeStatusCliente('em negociação')).toBe('Em negociação');
      expect(normalizeStatusCliente('proposta enviada')).toBe('Em negociação');
      expect(normalizeStatusCliente('cadastrado')).toBe('Cadastrado');
      expect(normalizeStatusCliente('expirada')).toBe('Expirado');
      expect(normalizeStatusCliente('cancelada')).toBe('Cancelado');
    });

    it('normalizeStatusGeral deve normalizar termos brutos', () => {
      expect(normalizeStatusGeral('negócio fechado')).toBe('Negócio Fechado');
      expect(normalizeStatusGeral('pendente de assinatura')).toBe('Pendente de Assinatura');
      expect(normalizeStatusGeral('pendente de pagamento')).toBe('Pendente de Pagamento');
      expect(normalizeStatusGeral('inativo')).toBe('Inativo');
    });

    it('normalizeStatusPagamento deve normalizar termos brutos', () => {
      expect(normalizeStatusPagamento('em dia')).toBe('Em dia');
      expect(normalizeStatusPagamento('em atraso <= 50 dias')).toBe('Em atraso <= 50 dias');
      expect(normalizeStatusPagamento('falta pagamento > 50 dias')).toBe('Falta Pagamento > 50 dias');
      expect(normalizeStatusPagamento('quitado')).toBe('Quitado');
    });

    it('Badges do Design System devem seguir padrão Light Theme bg-[cor]-50 border-[cor]-200 text-[cor]-800', () => {
      const badgeCliente = getStatusClienteBadge('Vigente / Renovado');
      expect(badgeCliente.bgClass).toBe('bg-emerald-50');
      expect(badgeCliente.borderClass).toBe('border-emerald-200');
      expect(badgeCliente.textClass).toBe('text-emerald-800');

      const badgeGeral = getStatusGeralBadge('Negócio Fechado');
      expect(badgeGeral.bgClass).toBe('bg-emerald-50');
      expect(badgeGeral.borderClass).toBe('border-emerald-200');
      expect(badgeGeral.textClass).toBe('text-emerald-800');

      const badgePagamento = getStatusPagamentoBadge('Falta Pagamento > 50 dias');
      expect(badgePagamento.bgClass).toBe('bg-rose-50');
      expect(badgePagamento.borderClass).toBe('border-rose-200');
      expect(badgePagamento.textClass).toBe('text-rose-800');
    });
  });
});
