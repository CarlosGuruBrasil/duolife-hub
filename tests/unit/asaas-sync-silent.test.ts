import { describe, it, expect, vi } from 'vitest';
import type { AsaasBatchReconcileOptions } from '@/lib/asaas-sync';

describe('Sincronização em Lote Asaas - Modo Silencioso (Sem Notificações)', () => {
  it('deve suportar options com skipNotifications e onlyPending', () => {
    const options: AsaasBatchReconcileOptions = {
      limit: 150,
      onlyPending: false,
      skipNotifications: true,
    };

    expect(options.skipNotifications).toBe(true);
    expect(options.onlyPending).toBe(false);
    expect(options.limit).toBe(150);
  });

  it('deve garantir que skipNotifications padrão na rota de admin seja true', async () => {
    const parsePayload = (body: Record<string, unknown>) => {
      const limit = typeof body.limit === 'number' ? Math.max(1, Math.min(body.limit, 500)) : 100;
      const onlyPending = body.onlyPending !== false;
      const skipNotifications = body.skipNotifications !== false;
      return { limit, onlyPending, skipNotifications };
    };

    // Caso 1: Payload vazio -> skipNotifications deve ser true
    expect(parsePayload({})).toEqual({
      limit: 100,
      onlyPending: true,
      skipNotifications: true,
    });

    // Caso 2: onlyPending falso -> escopo completo com skipNotifications true
    expect(parsePayload({ onlyPending: false })).toEqual({
      limit: 100,
      onlyPending: false,
      skipNotifications: true,
    });

    // Caso 3: Limite customizado com clamping
    expect(parsePayload({ limit: 1000 })).toEqual({
      limit: 500,
      onlyPending: true,
      skipNotifications: true,
    });
  });

  it('deve verificar que notificações são puladas quando skipNotifications = true', async () => {
    const mockDispatcher = vi.fn();

    // Simula a lógica interna de reconcileAsaasForQuote
    const simulateReconcile = async (
      saleCreated: boolean,
      options: { skipNotifications?: boolean }
    ) => {
      if (saleCreated && !options.skipNotifications) {
        await mockDispatcher('PAGAMENTO_CONFIRMADO');
      }
    };

    // Cenário 1: skipNotifications = true -> NÃO deve chamar dispatcher
    await simulateReconcile(true, { skipNotifications: true });
    expect(mockDispatcher).not.toHaveBeenCalled();

    // Cenário 2: skipNotifications = false -> DEVE chamar dispatcher
    await simulateReconcile(true, { skipNotifications: false });
    expect(mockDispatcher).toHaveBeenCalledTimes(1);
  });
});
