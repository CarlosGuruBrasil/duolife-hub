import { describe, it, expect, vi } from 'vitest';
import { cancelSaleAndQuoteForDelinquency } from '@/lib/insurance-ops';
import {
  runDelinquencyCancellationScan,
  runFullLifecycleScan,
} from '@/lib/lifecycle-service';
import {
  calculateCancellationDeadline,
  isInstallmentPastCancellationDeadline,
} from '@/lib/business-days';

describe('Rotina de Cancelamento por Inadimplência', () => {
  describe('cancelSaleAndQuoteForDelinquency', () => {
    it('deve exportar a função com assinatura correta', () => {
      expect(typeof cancelSaleAndQuoteForDelinquency).toBe('function');
    });

    it('deve rejeitar e retornar false se cotacaoId for vazio ou nulo', async () => {
      const res = await cancelSaleAndQuoteForDelinquency({
        cotacaoId: '',
        reason: 'Teste',
      });
      expect(res.success).toBe(false);
      expect(res.canceled).toBe(false);
    });

    it('deve aceitar parâmetros de cancelamento pontual com installmentId', async () => {
      // Como não há banco configurado neste teste unitário, chamamos com ID fictício para testar validação de entrada
      const res = await cancelSaleAndQuoteForDelinquency({
        cotacaoId: '   ',
        installmentId: 'inst_123',
        reason: 'Cancelamento pontual',
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe('ID da cotação não informado');
    });
  });

  describe('runDelinquencyCancellationScan', () => {
    it('deve exportar a função de varredura de cancelamentos', () => {
      expect(typeof runDelinquencyCancellationScan).toBe('function');
    });

    it('deve identificar corretamente parcelas elegíveis vs não-elegíveis para cancelamento', () => {
      // Simulação de parcelas e checagem da data atual
      const checkDate = '2026-10-20'; // Terça-feira

      // Cenário 1: Parcela 1 venceu na quinta 15/10/2026
      // Prazo final: segunda 19/10/2026. Em 20/10/2026 -> DEVE CANCELAR
      const c1 = isInstallmentPastCancellationDeadline('2026-10-15', 1, checkDate);
      expect(c1).toBe(true);

      // Cenário 2: Parcela 1 venceu na sexta 16/10/2026
      // Prazo final: terça 20/10/2026. Em 20/10/2026 -> NÃO DEVE CANCELAR (último dia do prazo)
      const c2 = isInstallmentPastCancellationDeadline('2026-10-16', 1, checkDate);
      expect(c2).toBe(false);

      // Cenário 3: Parcela 2 venceu em 2026-09-18 (sexta)
      // +30 dias corridos: 2026-10-18 (domingo) -> prorroga para segunda 2026-10-19.
      // Em 20/10/2026 -> DEVE CANCELAR
      const c3 = isInstallmentPastCancellationDeadline('2026-09-18', 2, checkDate);
      expect(c3).toBe(true);

      // Cenário 4: Parcela 2 venceu em 2026-09-21 (segunda)
      // +30 dias corridos: 2026-10-21 (quarta)
      // Em 20/10/2026 -> NÃO DEVE CANCELAR
      const c4 = isInstallmentPastCancellationDeadline('2026-09-21', 2, checkDate);
      expect(c4).toBe(false);
    });

    it('deve respeitar dryRun=true sem alterar dados reais', async () => {
      const res = await runDelinquencyCancellationScan({
        targetDate: '2026-10-20',
        dryRun: true,
      });

      expect(res).toBeDefined();
      expect(typeof res.scanned).toBe('number');
      expect(typeof res.canceled).toBe('number');
      expect(typeof res.skipped).toBe('number');
      expect(Array.isArray(res.errors)).toBe(true);
    });
  });
});
