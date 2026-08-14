import { z } from 'zod';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { issuePasswordResetEmail } from '@/lib/password-reset';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

const inviteSchema = z.object({
  userId: z.string().trim().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  try {
    await ensureSchema();
    const parsed = inviteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const { id: partnerId } = await params;
    const [user] = await sql<{ id: string; name: string; email: string; is_active: boolean }[]>`
      SELECT id, name, email, is_active
      FROM partner_users
      WHERE id = ${parsed.data.userId}
        AND partner_id = ${partnerId}
      LIMIT 1
    `;

    if (!user) {
      return Response.json({ error: 'Acesso não encontrado' }, { status: 404 });
    }

    if (!user.is_active) {
      return Response.json({ error: 'Ative este acesso antes de enviar o convite' }, { status: 400 });
    }

    await issuePasswordResetEmail({
      userId: user.id,
      userType: 'partner',
      email: user.email,
      userName: user.name,
      origin: req.headers.get('origin'),
      purpose: 'invite',
    });

    return Response.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'admin.partner_users.invite.failed');
    return Response.json({ error: 'Erro interno ao enviar convite' }, { status: 500 });
  }
}
