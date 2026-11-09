import { sql } from '@/lib/pg';
import { somenteDigitos } from '@/lib/documento';
import { isInternalUser, verifyAuth, verifyPartnerAuth, type AuthUser } from '@/lib/auth';
import { roleIsCorretora } from '@/lib/roles';

// Rascunhos do fluxo interno de cotação (TD-009). São pessoais: só o autor lista, retoma ou descarta.
export const RASCUNHO_TTL_DAYS = 30; // manter em sincronia com INTERVAL '30 days' abaixo e na migração 031
export const RASCUNHO_MAX_POR_USUARIO = 50;
export const RASCUNHO_MAX_PAYLOAD_BYTES = 200_000;

export interface RascunhoInput {
  id?: string;
  productId?: string | null;
  partnerId?: string | null;
  step: number;
  clientName?: string | null;
  clientCpfCnpj?: string | null;
  payload: Record<string, unknown>;
}

export interface RascunhoResumo {
  id: string;
  product_id: string | null;
  partner_id: string | null;
  partner_name: string | null;
  step: number;
  client_name: string | null;
  client_cpf_cnpj: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

/** Usuário autenticado que pode ter rascunhos: parceiros, corretoras e qualquer perfil interno. */
export async function verifyDraftUser(): Promise<AuthUser | null> {
  const user = await verifyAuth();
  if (!user) return null;
  if (isInternalUser(user)) return user;
  return verifyPartnerAuth();
}

async function resolvePartnerId(user: AuthUser, requested?: string | null): Promise<string | null> {
  if (user.partnerId && !isInternalUser(user) && !roleIsCorretora(user.role)) return user.partnerId;
  if (!requested) return user.partnerId || null;

  if (isInternalUser(user)) {
    const [p] = await sql`SELECT id FROM partners WHERE id = ${requested} LIMIT 1`;
    return p?.id || null;
  }
  if (roleIsCorretora(user.role) && user.corretoraId) {
    const [p] = await sql`
      SELECT id FROM partners WHERE id = ${requested} AND corretora_id = ${user.corretoraId} LIMIT 1
    `;
    return p?.id || null;
  }
  return null;
}

export async function listRascunhos(user: AuthUser): Promise<RascunhoResumo[]> {
  const rows = await sql<RascunhoResumo[]>`
    SELECT r.id, r.product_id, r.partner_id, p.name AS partner_name, r.step,
           r.client_name, r.client_cpf_cnpj, r.created_at, r.updated_at, r.expires_at
    FROM cotacao_rascunhos r
    LEFT JOIN partners p ON p.id = r.partner_id
    WHERE r.user_id = ${user.userId} AND r.expires_at > NOW()
    ORDER BY r.updated_at DESC
    LIMIT ${RASCUNHO_MAX_POR_USUARIO}
  `;
  return rows;
}

export async function getRascunho(user: AuthUser, id: string) {
  const [row] = await sql`
    SELECT id, product_id, partner_id, step, client_name, client_cpf_cnpj, payload,
           created_at, updated_at, expires_at
    FROM cotacao_rascunhos
    WHERE id = ${id} AND user_id = ${user.userId} AND expires_at > NOW()
    LIMIT 1
  `;
  return row || null;
}

export async function saveRascunho(user: AuthUser, input: RascunhoInput) {
  const partnerId = await resolvePartnerId(user, input.partnerId);
  const doc = input.clientCpfCnpj ? somenteDigitos(input.clientCpfCnpj) || null : null;
  const name = input.clientName?.trim() ? input.clientName.trim().slice(0, 200) : null;
  const productId = input.productId || null;
  const step = Math.min(6, Math.max(1, Math.trunc(input.step || 1)));
  const payload = sql.json(input.payload as any);

  if (input.id) {
    const [updated] = await sql`
      UPDATE cotacao_rascunhos
      SET partner_id = ${partnerId},
          product_id = ${productId},
          step = ${step},
          client_name = ${name},
          client_cpf_cnpj = ${doc},
          payload = ${payload},
          updated_at = NOW(),
          expires_at = NOW() + INTERVAL '30 days'
      WHERE id = ${input.id} AND user_id = ${user.userId}
      RETURNING id, updated_at
    `;
    if (updated) return updated;
    // Rascunho expirou/foi descartado em outra aba: cria um novo em vez de falhar.
  }

  const [created] = await sql`
    INSERT INTO cotacao_rascunhos (user_id, partner_id, product_id, step, client_name, client_cpf_cnpj, payload, expires_at)
    VALUES (${user.userId}, ${partnerId}, ${productId}, ${step}, ${name}, ${doc}, ${payload},
            NOW() + INTERVAL '30 days')
    RETURNING id, updated_at
  `;

  // Mantém no máximo N rascunhos por usuário (descarta os mais antigos).
  await sql`
    DELETE FROM cotacao_rascunhos
    WHERE user_id = ${user.userId}
      AND id NOT IN (
        SELECT id FROM cotacao_rascunhos
        WHERE user_id = ${user.userId}
        ORDER BY updated_at DESC
        LIMIT ${RASCUNHO_MAX_POR_USUARIO}
      )
  `;

  return created;
}

export async function deleteRascunho(user: AuthUser, id: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM cotacao_rascunhos WHERE id = ${id} AND user_id = ${user.userId} RETURNING id
  `;
  return rows.length > 0;
}

export async function purgeExpiredRascunhos(): Promise<number> {
  const rows = await sql`DELETE FROM cotacao_rascunhos WHERE expires_at <= NOW() RETURNING id`;
  return rows.length;
}
