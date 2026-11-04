import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyMcpApiKey } from '@/lib/mcp/security';
import { verifyWixIntegrationAuth } from '@/lib/wix-integration-auth';

// Mock do pg
vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn((strings: TemplateStringsArray, ...values: any[]) => {
    return Promise.resolve([]);
  });
  return { sql: sqlMock };
});

describe('Task 9: Isolamento Multi-Tenant MCP e Limpeza de Backdoors de Teste (VULN-10)', () => {
  const originalVitestEnv = process.env.VITEST;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.VITEST = originalVitestEnv;
    (process.env as any).NODE_ENV = originalNodeEnv;
  });

  describe('1. Rejeição de chave estática dev fora do ambiente de teste Vitest', () => {
    it('deve rejeitar dlmcp_live_dev_test_key_001_secret em verifyMcpApiKey se VITEST !== "true"', async () => {
      // Simula ambiente de desenvolvimento ativo (fora do executor Vitest)
      process.env.VITEST = 'false';
      (process.env as any).NODE_ENV = 'development';

      const result = await verifyMcpApiKey('Bearer dlmcp_live_dev_test_key_001_secret');
      expect(result).toBeNull();
    });

    it('deve rejeitar dlmcp_live_dev_test_key_001_secret em verifyWixIntegrationAuth se VITEST !== "true"', async () => {
      process.env.VITEST = 'false';
      (process.env as any).NODE_ENV = 'development';

      const mockReq = {
        headers: new Headers({
          authorization: 'Bearer dlmcp_live_dev_test_key_001_secret',
        }),
      } as any;

      const result = await verifyWixIntegrationAuth(mockReq);
      expect(result).toBeNull();
    });

    it('deve aceitar dlmcp_live_dev_test_key_001_secret quando VITEST === "true" para testes unitarios locais', async () => {
      process.env.VITEST = 'true';

      const result = await verifyMcpApiKey('Bearer dlmcp_live_dev_test_key_001_secret');
      expect(result).not.toBeNull();
      expect(result?.clientId).toBe('dev-mock-client-id');
    });
  });
});
