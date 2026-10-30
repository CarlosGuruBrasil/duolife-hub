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
  sqlMock.unsafe = vi.fn().mockResolvedValue([]);
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

import { ensureSchema, resetSchemaReadyForTesting } from '@/lib/schema';

describe('White-Label Links & Duplicidade Cadastral - Schema Migration', () => {
  beforeEach(() => {
    executedQueries.length = 0;
    process.env.ALLOW_RUNTIME_SCHEMA = 'true';
    if (typeof resetSchemaReadyForTesting === 'function') {
      resetSchemaReadyForTesting();
    }
  });

  it('deve executar migrações de schema com idempotência para public_sale_links e conflito cadastral', async () => {
    await ensureSchema();

    const hasExclusiveColumn = executedQueries.some((q) =>
      q.includes('ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS is_exclusive')
    );
    const hasTargetDocColumn = executedQueries.some((q) =>
      q.includes('ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS target_document')
    );
    const hasTargetNameColumn = executedQueries.some((q) =>
      q.includes('ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS target_name')
    );
    const hasMaxUsesColumn = executedQueries.some((q) =>
      q.includes('ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS max_uses')
    );
    const hasUsedCountColumn = executedQueries.some((q) =>
      q.includes('ALTER TABLE public_sale_links ADD COLUMN IF NOT EXISTS used_count')
    );
    const hasCadastralConflict = executedQueries.some((q) =>
      q.includes('ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS cadastral_conflict')
    );

    expect(hasExclusiveColumn).toBe(true);
    expect(hasTargetDocColumn).toBe(true);
    expect(hasTargetNameColumn).toBe(true);
    expect(hasMaxUsesColumn).toBe(true);
    expect(hasUsedCountColumn).toBe(true);
    expect(hasCadastralConflict).toBe(true);
  });
});
