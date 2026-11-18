import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Regressão: o índice único idx_webhook_events_provider_external_id é PARCIAL
 * (WHERE external_id IS NOT NULL). No PostgreSQL, um `ON CONFLICT (provider, external_id)`
 * sem o mesmo predicado não infere índices parciais e o INSERT falha com 42P10
 * ("there is no unique or exclusion constraint matching the ON CONFLICT specification").
 * Isso derrubou os webhooks Asaas (fila interrompida) e ZapSign em produção.
 * Os testes de rota usam `sql` mockado e não detectam o erro, por isso a checagem textual.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const ROUTES = ['app/api/webhook/asaas/route.ts', 'app/api/webhook/zapsign/route.ts'];

describe('webhook_events ON CONFLICT compatível com o índice único parcial', () => {
  it('o índice único continua parcial (premissa do teste)', () => {
    const migration = readFileSync(
      path.join(ROOT, 'db/migrations/029-add-unique-index-webhook-events.sql'),
      'utf8'
    );
    expect(migration).toMatch(/ON webhook_events \(provider, external_id\)\s*WHERE external_id IS NOT NULL/);
  });

  for (const route of ROUTES) {
    it(`${route} inclui o predicado do índice no ON CONFLICT`, () => {
      const source = readFileSync(path.join(ROOT, route), 'utf8');
      const clauses = source.match(/ON CONFLICT \(provider, external_id\)[^\n]*/g) || [];
      expect(clauses.length).toBeGreaterThan(0);
      for (const clause of clauses) {
        expect(clause).toContain('WHERE external_id IS NOT NULL');
      }
    });
  }
});
