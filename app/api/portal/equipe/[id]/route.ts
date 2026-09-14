import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { sql } from '@/lib/pg';
import { canManageTeam, verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/mailer';

const updateVendedorSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(['broker', 'manager']).optional(),
  isActive: z.boolean().optional(),
  managerUserId: z.string().trim().optional().nullable(),
  newPassword: z.string().min(6, 'Senha mínima de 6 caracteres').optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyPartnerAuth();
  if (!user || !canManageTeam(user)) {
    return unauthorized();
  }

  const { id: partnerId } = await params;
  await ensureSchema();

  let corretoraId = user.corretoraId;
  if (!corretoraId && user.partnerId) {
    const [p] = await sql`SELECT corretora_id FROM partners WHERE id = ${user.partnerId}`;
    corretoraId = p?.corretora_id || null;
  }

  if (!corretoraId) {
    return NextResponse.json({ error: 'Nenhuma corretora vinculada' }, { status: 400 });
  }

  try {
    // Garante que o parceiro pertence estritamente a esta corretora (Isolamento Multi-tenant)
    const [partner] = await sql`
      SELECT p.id, p.email, p.razao_social, pu.id AS user_id
      FROM partners p
      LEFT JOIN partner_users pu ON pu.partner_id = p.id
      WHERE p.id = ${partnerId} AND p.corretora_id = ${corretoraId}
      LIMIT 1
    `;

    if (!partner) {
      return NextResponse.json({ error: 'Vendedor não encontrado nesta corretora' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateVendedorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
    }

    const { name, phone, role, isActive, managerUserId, newPassword } = parsed.data;

    // Atualiza tabela partners se houver alterações
    if (name !== undefined || phone !== undefined || isActive !== undefined) {
      const statusValue = isActive === false ? 'suspended' : 'active';
      await sql`
        UPDATE partners
        SET
          razao_social = COALESCE(${name ?? null}, razao_social),
          nome_fantasia = COALESCE(${name ?? null}, nome_fantasia),
          phone = COALESCE(${phone ?? null}, phone),
          status = COALESCE(${statusValue ?? null}, status),
          updated_at = NOW()
        WHERE id = ${partnerId}
      `;
    }

    // Atualiza partner_users
    if (partner.user_id) {
      let passwordHash: string | null = null;
      if (newPassword && newPassword.trim().length >= 6) {
        passwordHash = await bcrypt.hash(newPassword.trim(), 10);
      }

      await sql`
        UPDATE partner_users
        SET
          name = COALESCE(${name ?? null}, name),
          role = COALESCE(${role ?? null}, role),
          is_active = COALESCE(${isActive ?? null}, is_active),
          manager_user_id = ${managerUserId === undefined ? sql`manager_user_id` : managerUserId},
          password_hash = COALESCE(${passwordHash}, password_hash),
          updated_at = NOW()
        WHERE id = ${partner.user_id}
      `;
    }

    return NextResponse.json({ ok: true, message: 'Dados do vendedor atualizados com sucesso' });
  } catch (err) {
    logger.error({ err }, 'portal.equipe.patch.error');
    return NextResponse.json({ error: 'Erro ao atualizar vendedor' }, { status: 500 });
  }
}

// Reenviar convite de acesso para o vendedor
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyPartnerAuth();
  if (!user || !canManageTeam(user)) {
    return unauthorized();
  }

  const { id: partnerId } = await params;
  await ensureSchema();

  let corretoraId = user.corretoraId;
  if (!corretoraId && user.partnerId) {
    const [p] = await sql`SELECT corretora_id FROM partners WHERE id = ${user.partnerId}`;
    corretoraId = p?.corretora_id || null;
  }

  if (!corretoraId) {
    return NextResponse.json({ error: 'Nenhuma corretora vinculada' }, { status: 400 });
  }

  try {
    const [partner] = await sql`
      SELECT p.id, p.razao_social, p.email, pu.id AS user_id
      FROM partners p
      JOIN partner_users pu ON pu.partner_id = p.id
      WHERE p.id = ${partnerId} AND p.corretora_id = ${corretoraId}
      LIMIT 1
    `;

    if (!partner) {
      return NextResponse.json({ error: 'Vendedor não encontrado nesta corretora' }, { status: 404 });
    }

    // Gera nova senha provisória e atualiza
    const novaSenhaProvisoria = crypto.randomBytes(6).toString('hex');
    const passwordHash = await bcrypt.hash(novaSenhaProvisoria, 10);

    await sql`
      UPDATE partner_users
      SET password_hash = ${passwordHash}, is_active = true, updated_at = NOW()
      WHERE id = ${partner.user_id}
    `;

    // Dispara e-mail
    const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://duolife.com.br';
    const loginUrl = `${portalUrl}/login`;
    const emailSubject = `Dados de Acesso ao Portal DuoLife Hub`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #0e4a5a; margin-top: 0;">Seu Acesso ao Portal do Parceiro</h2>
        <p>Olá, <strong>${partner.razao_social}</strong>,</p>
        <p>Seus dados de acesso ao <strong>DuoLife Hub</strong> foram atualizados pela gestão da sua corretora.</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Suas credenciais de login:</strong></p>
          <p style="margin: 0 0 4px 0;"><strong>Link de Acesso:</strong> <a href="${loginUrl}" style="color: #0e4a5a;">${loginUrl}</a></p>
          <p style="margin: 0 0 4px 0;"><strong>E-mail:</strong> ${partner.email}</p>
          <p style="margin: 0;"><strong>Nova Senha Provisória:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${novaSenhaProvisoria}</code></p>
        </div>
        <p style="font-size: 13px; color: #64748b;">Recomendamos alterar sua senha após o login no menu "Meu Perfil".</p>
        <div style="text-align: center; margin-top: 24px;">
          <a href="${loginUrl}" style="background: #00d4e0; color: #072a33; padding: 12px 24px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block;">Fazer Login Agora</a>
        </div>
      </div>
    `;

    await sendEmail({
      to: partner.email,
      subject: emailSubject,
      html: emailHtml,
    });

    return NextResponse.json({
      ok: true,
      message: `Convite e nova senha enviados com sucesso para ${partner.email}`,
      temporaryPassword: novaSenhaProvisoria,
    });
  } catch (err) {
    logger.error({ err }, 'portal.equipe.resend_invite.error');
    return NextResponse.json({ error: 'Erro ao reenviar convite por e-mail' }, { status: 500 });
  }
}
