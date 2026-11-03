import { describe, it, expect, vi } from 'vitest';
import { handleAsaasPaymentRefund } from '@/lib/insurance-ops';

describe('Estorno de Comissões e Cancelamento de Apólices (handleAsaasPaymentRefund)', () => {
  it('deve retornar falso se cotacaoId for invalido ou vazio', async () => {
    const result = await handleAsaasPaymentRefund('', 'PAYMENT_REFUNDED');
    expect(result.success).toBe(false);
  });

  it('deve exportar handleAsaasPaymentRefund com a assinatura correta', () => {
    expect(typeof handleAsaasPaymentRefund).toBe('function');
  });
});
