import { describe, it, expect, vi, beforeEach } from 'vitest';

const executedQueries: string[] = [];

vi.mock('@/lib/pg', () => {
  const sqlMock: any = (strings: TemplateStringsArray, ...values: any[]) => {
    let query = '';
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      if (i < values.length) {
        query += values[i];
      }
    }
    executedQueries.push(query);
    if (query.includes('SELECT id FROM admin_users')) {
      return Promise.resolve([{ id: 'admin-existing' }]);
    }
    return Promise.resolve([]);
  };
  return { sql: sqlMock };
});

vi.mock('@/lib/secrets', () => ({
  getBootstrapAdminConfig: vi.fn(() => ({
    email: 'admin@duolife.com.br',
    password: 'password123',
    name: 'Admin',
    role: 'super_admin',
  })),
}));

vi.mock('@/lib/contract-templates-service', () => ({
  ensureDefaultContractTemplates: vi.fn().mockResolvedValue(undefined),
}));

import { EXPECTED_TABLES, ensureSchema, resetSchemaReadyForTesting } from '@/lib/schema';

describe('Link Tracker Schema & Migrations', () => {
  beforeEach(() => {
    executedQueries.length = 0;
    process.env.ALLOW_RUNTIME_SCHEMA = 'true';
    if (typeof resetSchemaReadyForTesting === 'function') {
      resetSchemaReadyForTesting();
    }
  });

  it('deve incluir sale_link_access_logs na lista EXPECTED_TABLES', () => {
    expect(EXPECTED_TABLES).toContain('sale_link_access_logs');
  });

  it('deve executar comandos DDL para colunas de contadores e auditoria em public_sale_links ao rodar ensureSchema()', async () => {
    await ensureSchema();

    const normalizedQueries = executedQueries.map((q) => q.replace(/\s+/g, ' ').trim());

    // 1. Colunas adicionadas em public_sale_links
    expect(
      normalizedQueries.some((q) =>
        /ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS views_count INT NOT NULL DEFAULT 0/i.test(q)
      )
    ).toBe(true);

    expect(
      normalizedQueries.some((q) =>
        /ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS unique_views_count INT NOT NULL DEFAULT 0/i.test(q)
      )
    ).toBe(true);

    expect(
      normalizedQueries.some((q) =>
        /ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ/i.test(q)
      )
    ).toBe(true);
  });

  it('deve criar a tabela sale_link_access_logs com a estrutura correta de colunas e constraints', async () => {
    await ensureSchema();

    const tableCreationQuery = executedQueries.find((q) =>
      q.includes('CREATE TABLE IF NOT EXISTS sale_link_access_logs')
    );

    expect(tableCreationQuery).toBeDefined();
    const normalized = tableCreationQuery!.replace(/\s+/g, ' ');

    expect(normalized).toMatch(/id\s+TEXT PRIMARY KEY DEFAULT gen_random_uuid\(\)::text/i);
    expect(normalized).toMatch(/link_id\s+TEXT NOT NULL REFERENCES public_sale_links\(id\) ON DELETE CASCADE/i);
    expect(normalized).toMatch(/token\s+TEXT NOT NULL/i);
    expect(normalized).toMatch(/partner_id\s+TEXT NOT NULL REFERENCES partners\(id\) ON DELETE CASCADE/i);
    expect(normalized).toMatch(/ip_hash\s+TEXT NOT NULL/i);
    expect(normalized).toMatch(/user_agent\s+TEXT/i);
    expect(normalized).toMatch(/referer\s+TEXT/i);
    expect(normalized).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/i);
  });

  it('deve criar índices necessários na tabela sale_link_access_logs', async () => {
    await ensureSchema();

    const normalizedQueries = executedQueries.map((q) => q.replace(/\s+/g, ' ').trim());

    // Índice em link_id
    expect(
      normalizedQueries.some((q) =>
        /CREATE INDEX IF NOT EXISTS \w+ ON sale_link_access_logs \(\s*link_id\s*\)/i.test(q)
      )
    ).toBe(true);

    // Índice em token
    expect(
      normalizedQueries.some((q) =>
        /CREATE INDEX IF NOT EXISTS \w+ ON sale_link_access_logs \(\s*token\s*\)/i.test(q)
      )
    ).toBe(true);

    // Índice em partner_id
    expect(
      normalizedQueries.some((q) =>
        /CREATE INDEX IF NOT EXISTS \w+ ON sale_link_access_logs \(\s*partner_id\s*\)/i.test(q)
      )
    ).toBe(true);

    // Índice composto em (link_id, ip_hash)
    expect(
      normalizedQueries.some((q) =>
        /CREATE INDEX IF NOT EXISTS \w+ ON sale_link_access_logs \(\s*link_id,\s*ip_hash\s*\)/i.test(q)
      )
    ).toBe(true);
  });
});
