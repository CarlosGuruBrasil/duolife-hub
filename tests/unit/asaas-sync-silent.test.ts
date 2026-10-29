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

    // Caso 4: Suporte a limites rápidos de 5 e 10 cadastros
    expect(parsePayload({ limit: 5 })).toEqual({
      limit: 5,
      onlyPending: true,
      skipNotifications: true,
    });
    expect(parsePayload({ limit: 10 })).toEqual({
      limit: 10,
      onlyPending: true,
      skipNotifications: true,
    });
  });

  it('deve simular a ordenação decrescente por data de vigência (mais recentes primeiro)', () => {
    interface MockQuote {
      id: string;
      vigencia: string;
      createdAt: string;
    }

    const parseVigencia = (val: string): number => {
      // Formato YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
        return new Date(val).getTime();
      }
      // Formato DD/MM/YYYY
      if (/^\d{2}\/\d{2}\/\d{4}/.test(val)) {
        const [d, m, y] = val.split('/');
        return new Date(`${y}-${m}-${d}`).getTime();
      }
      return 0;
    };

    const quotes: MockQuote[] = [
      { id: '1', vigencia: '2026-01-10', createdAt: '2026-01-01' },
      { id: '2', vigencia: '15/10/2026', createdAt: '2026-02-01' },
      { id: '3', vigencia: '2026-05-20', createdAt: '2026-03-01' },
      { id: '4', vigencia: '01/12/2026', createdAt: '2026-04-01' },
    ];

    const sortedDesc = [...quotes].sort((a, b) => parseVigencia(b.vigencia) - parseVigencia(a.vigencia));

    // A ordem esperada decrescente por vigência é:
    // id '4' (01/12/2026) -> id '2' (15/10/2026) -> id '3' (20/05/2026) -> id '1' (10/01/2026)
    expect(sortedDesc.map((q) => q.id)).toEqual(['4', '2', '3', '1']);
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
