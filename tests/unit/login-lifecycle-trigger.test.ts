import { describe, it, expect } from 'vitest';
import { triggerLifecycleScanIfPending } from '@/lib/lifecycle-service';

describe('Gatilho de Contingência no Login (triggerLifecycleScanIfPending)', () => {
  it('deve exportar a função triggerLifecycleScanIfPending', () => {
    expect(typeof triggerLifecycleScanIfPending).toBe('function');
  });

  it('deve retornar resultado estruturado com triggered booleano e reason', async () => {
    // Se o banco não estiver configurado nos testes unitários sem DB, deve tratar com segurança
    const result = await triggerLifecycleScanIfPending({
      userId: 'test-user',
      email: 'test@duolife.com.br',
    });

    expect(result).toBeDefined();
    expect(typeof result.triggered).toBe('boolean');
    expect(typeof result.reason).toBe('string');
  });
});
