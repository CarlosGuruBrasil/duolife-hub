import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPartnerAuth, getPartnerAccessContext, unauthorized } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

const resolveSchema = z.object({
  choice: z.enum(['MANTER_ORIGINAL', 'USAR_NOVOS']),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyPartnerAuth();
    if (!user) return unauthorized();

    const access = await getPartnerAccessContext(user);
    if (!access) return unauthorized();

    await ensureSchema();
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = resolveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Escolha de resolução inválida', details: parsed.error.issues },
        { status: 400 }
      );
    }
    const { choice } = parsed.data;

    // Busca a cotação verificando permissão
    const [cotacao] = access.isCorretoraUser
      ? await sql`
          SELECT c.*
          FROM cotacoes c
          WHERE c.id = ${id}
            AND c.corretora_id = ${access.corretoraId}
          LIMIT 1
        `
      : access.visibleUserIds?.length
      ? await sql`
          SELECT c.*
          FROM cotacoes c
          WHERE c.id = ${id}
            AND c.partner_id = ${access.partnerId}
            AND (c.partner_user_id IN ${sql(access.visibleUserIds)} OR c.partner_user_id IS NULL)
          LIMIT 1
        `
      : await sql`
          SELECT c.*
          FROM cotacoes c
          WHERE c.id = ${id}
            AND c.partner_id = ${access.partnerId}
          LIMIT 1
        `;

    if (!cotacao) {
      return NextResponse.json({ error: 'Cotação não encontrada ou acesso negado' }, { status: 404 });
    }

    const conflict = typeof cotacao.cadastral_conflict === 'string'
      ? JSON.parse(cotacao.cadastral_conflict)
      : cotacao.cadastral_conflict;

    if (!conflict || !conflict.hasConflict) {
      return NextResponse.json({ error: 'Esta cotação não possui conflito de duplicidade cadastral' }, { status: 400 });
    }

    if (conflict.resolved) {
      return NextResponse.json({ error: 'Este conflito já foi resolvido anteriormente' }, { status: 409 });
    }

    if (choice === 'USAR_NOVOS') {
      const [existingActiveSale] = await sql<{ id: string; policy_number: string }[]>`
        SELECT id, policy_number
        FROM sales
        WHERE client_id = ${cotacao.client_id}
          AND status = 'ativa'
        LIMIT 1
      `;
      if (existingActiveSale) {
        return NextResponse.json(
          {
            error: `Não é permitido sobrescrever o cadastro mestre com USAR_NOVOS porque este cliente possui apólice ativa emitida (${existingActiveSale.policy_number || 'ativa'}). Utilize MANTER_ORIGINAL para preservar o titular original.`,
          },
          { status: 422 }
        );
      }

      // Bloqueio Trans-Tenant: se o cliente possui vínculo cadastral com outra corretora ou outro parceiro
      const [otherTenantQuote] = await sql<{ id: string }[]>`
        SELECT id FROM cotacoes
        WHERE client_id = ${cotacao.client_id}
          AND id != ${cotacao.id}
          AND (
            (corretora_id IS NOT NULL AND corretora_id IS DISTINCT FROM ${user.corretoraId || cotacao.corretora_id})
            OR (partner_id IS NOT NULL AND partner_id IS DISTINCT FROM ${user.partnerId || cotacao.partner_id})
          )
        LIMIT 1
      `;
      if (otherTenantQuote) {
        return NextResponse.json(
          {
            error: 'Não é permitido sobrescrever o cadastro mestre com USAR_NOVOS porque este cliente possui vínculo cadastral com outra corretora/parceiro. Utilize MANTER_ORIGINAL.',
          },
          { status: 403 }
        );
      }
    }

    const updatedConflict = {
      ...conflict,
      resolved: true,
      resolvedAt: new Date().toISOString(),
      resolution: choice,
      resolvedByUserId: user.userId,
    };

    await sql.begin(async (tx) => {
      if (choice === 'MANTER_ORIGINAL') {
        const [clientRecord] = await tx<{ full_name: string; email: string | null; phone: string | null; birth_date: string | null }[]>`
          SELECT full_name, email, phone, birth_date
          FROM insurance_clients
          WHERE id = ${cotacao.client_id}
          LIMIT 1
        `;
        const origName = clientRecord?.full_name || conflict.originalData?.fullName || cotacao.client_name;
        const origEmail = clientRecord?.email || cotacao.client_email;
        const origPhone = clientRecord?.phone || cotacao.client_phone;
        const origBirth = clientRecord?.birth_date ? String(clientRecord.birth_date).slice(0, 10) : conflict.originalData?.birthDate;

        const clientData = (typeof cotacao.client_data === 'string' ? JSON.parse(cotacao.client_data) : cotacao.client_data) || {};
        const updatedClientData = {
          ...clientData,
          nome: origName,
          email: origEmail,
          celular: origPhone,
          dataNascto: origBirth || clientData.dataNascto,
        };

        await tx`
          UPDATE cotacoes
          SET
            client_name = ${origName},
            client_email = ${origEmail || null},
            client_phone = ${origPhone || null},
            client_data = ${JSON.stringify(updatedClientData)}::jsonb,
            cadastral_conflict = ${JSON.stringify(updatedConflict)}::jsonb,
            status = 'rascunho',
            updated_at = NOW()
          WHERE id = ${cotacao.id}
        `;
      } else {
        const sub = conflict.submittedData || {};
        await tx`
          UPDATE insurance_clients
          SET
            full_name = ${sub.fullName || cotacao.client_name},
            email = COALESCE(${sub.email || null}, email),
            phone = COALESCE(${sub.phone || null}, phone),
            birth_date = COALESCE(${sub.birthDate ? sub.birthDate : null}::date, birth_date),
            updated_at = NOW()
          WHERE id = ${cotacao.client_id}
        `;

        await tx`
          UPDATE cotacoes
          SET
            cadastral_conflict = ${JSON.stringify(updatedConflict)}::jsonb,
            status = 'rascunho',
            updated_at = NOW()
          WHERE id = ${cotacao.id}
        `;
      }

      await tx`
        INSERT INTO action_audit_logs (
          action,
          entity_type,
          entity_id,
          actor_id,
          metadata
        )
        VALUES (
          'RESOLVER_DUPLICIDADE_CADASTRAL',
          'cotacao',
          ${cotacao.id},
          ${user.userId},
          ${JSON.stringify({
            choice,
            partnerId: user.partnerId,
            clientId: cotacao.client_id,
            divergentFields: conflict.divergentFields,
          })}::jsonb
        )
      `;
    });

    return NextResponse.json({
      ok: true,
      resolution: choice,
      status: 'rascunho',
      message: choice === 'MANTER_ORIGINAL'
        ? 'Dados originais mantidos na proposta. Fluxo liberado com sucesso.'
        : 'Cadastro do cliente atualizado com os novos dados. Fluxo liberado com sucesso.',
    });
  } catch (err) {
    logger.error({ err }, 'portal.cotacoes.resolver_duplicidade.failed');
    return NextResponse.json({ error: 'Erro interno ao resolver duplicidade' }, { status: 500 });
  }
}
