import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { sql } from '@/lib/pg';
import {
  canManageTeam,
  canManageCorretoraWide,
  isIndividualPartnerManager,
  isInternalUser,
  normalizePartnerRole,
  verifyPartnerAuth,
  unauthorized,
} from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/mailer';

const updateVendedorSchema = z.object({
  type: z.enum(['partner', 'member']).optional(),
  userId: z.string().trim().optional().nullable(),
  name: z.string().trim().min(2).optional(),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(['broker', 'manager', 'partner']).optional(),
  isActive: z.boolean().optional(),
  managerUserId: z.string().trim().optional().nullable(),
  newPassword: z.string().min(6, 'Senha mínima de 6 caracteres').optional().nullable(),
});

async function resolveTargetMemberOrPartner(id: string, corretoraId: string, preferredUserId?: string | null) {
  if (preferredUserId) {
    const [byUserId] = await sql`
      SELECT
        p.id AS partner_id,
        p.corretora_id,
        p.email AS partner_email,
        p.razao_social,
        pu.id AS user_id,
        pu.partner_id AS user_partner_id,
        pu.name AS user_name,
        pu.email AS user_email,
        pu.role AS user_role
      FROM partner_users pu
      JOIN partners p ON p.id = pu.partner_id
      WHERE pu.id = ${preferredUserId}
        AND p.corretora_id = ${corretoraId}
      LIMIT 1
    `;
    if (byUserId) return byUserId;
  }

  // Tenta localizar primeiro pelo ID do membro (partner_users.id)
  const [byMember] = await sql`
    SELECT
      p.id AS partner_id,
      p.corretora_id,
      p.email AS partner_email,
      p.razao_social,
      pu.id AS user_id,
      pu.partner_id AS user_partner_id,
      pu.name AS user_name,
      pu.email AS user_email,
      pu.role AS user_role
    FROM partner_users pu
    JOIN partners p ON p.id = pu.partner_id
    WHERE pu.id = ${id}
      AND p.corretora_id = ${corretoraId}
    LIMIT 1
  `;
  if (byMember) return byMember;

  // Fallback para localizar pelo ID do parceiro (partners.id)
  const [byPartner] = await sql`
    SELECT
      p.id AS partner_id,
      p.corretora_id,
      p.email AS partner_email,
      p.razao_social,
      pu.id AS user_id,
      pu.partner_id AS user_partner_id,
      pu.name AS user_name,
      pu.email AS user_email,
      pu.role AS user_role
    FROM partners p
    LEFT JOIN partner_users pu ON pu.partner_id = p.id
    WHERE p.id = ${id}
      AND p.corretora_id = ${corretoraId}
    ORDER BY
      CASE WHEN pu.role = 'director' THEN 0 ELSE 1 END,
      pu.created_at ASC
    LIMIT 1
  `;
  return byPartner || null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyPartnerAuth();
  if (!user || !canManageTeam(user)) {
    return unauthorized();
  }

  const isCorretoraWide = canManageCorretoraWide(user);
  const isPartnerManager = isIndividualPartnerManager(user);

  if (!isCorretoraWide && !isPartnerManager) {
    return NextResponse.json({ error: 'Acesso negado à gestão de equipe' }, { status: 403 });
  }

  const { id } = await params;
  await ensureSchema();

  let corretoraId = user.corretoraId;
  if (!corretoraId && user.partnerId) {
    const [p] = await sql`SELECT corretora_id FROM partners WHERE id = ${user.partnerId}`;
    corretoraId = p?.corretora_id || null;
  }
  if (!corretoraId && isInternalUser(user)) {
    const [defaultCorretora] = await sql`SELECT id FROM corretoras WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`;
    corretoraId = defaultCorretora?.id || null;
  }

  if (!corretoraId) {
    return NextResponse.json({ error: 'Nenhuma corretora vinculada' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const parsed = updateVendedorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
    }

    const { type, userId, name, phone, role, isActive, managerUserId, newPassword } = parsed.data;

    // Bloqueia edição de outro parceiro quando o usuário é diretor/gerente de um parceiro individual
    if (isPartnerManager && type === 'partner' && id !== user.partnerId) {
      return NextResponse.json(
        { error: 'Acesso negado: você não pode alterar dados de outra empresa parceira' },
        { status: 403 }
      );
    }

    const target = await resolveTargetMemberOrPartner(id, corretoraId, userId);

    if (!target) {
      return NextResponse.json({ error: 'Vendedor não encontrado nesta corretora' }, { status: 404 });
    }

    // Isolamento Multi-Tenant: diretor/gerente de parceiro individual só pode gerenciar membros do seu próprio user.partnerId
    if (isPartnerManager) {
      if (target.partner_id !== user.partnerId || (target.user_partner_id && target.user_partner_id !== user.partnerId)) {
        return NextResponse.json(
          { error: 'Acesso negado: este membro pertence a outro parceiro' },
          { status: 403 }
        );
      }

      if (user.partnerRole === 'manager' && normalizePartnerRole(target.user_role) === 'director') {
        return NextResponse.json(
          { error: 'Gerentes não têm permissão para alterar o diretor do parceiro' },
          { status: 403 }
        );
      }
    }

    if (managerUserId) {
      const [validManager] = await sql`
        SELECT id FROM partner_users
        WHERE id = ${managerUserId}
          AND partner_id = ${target.partner_id}
          AND is_active = true
        LIMIT 1
      `;
      if (!validManager) {
        return NextResponse.json({ error: 'Gestor informado não pertence a este parceiro' }, { status: 400 });
      }
    }

    // Atualiza tabela partners apenas se for gestor da corretora/admin (ou o próprio diretor editando type === 'partner')
    const canUpdatePartnerEntity =
      isCorretoraWide || (isPartnerManager && user.partnerRole === 'director' && type === 'partner' && target.partner_id === user.partnerId);

    if (canUpdatePartnerEntity && (name !== undefined || phone !== undefined || isActive !== undefined)) {
      const statusValue = isActive === undefined ? null : isActive === false ? 'suspended' : 'active';
      await sql`
        UPDATE partners
        SET
          razao_social = COALESCE(${name ?? null}, razao_social),
          nome_fantasia = COALESCE(${name ?? null}, nome_fantasia),
          phone = COALESCE(${phone ?? null}, phone),
          status = COALESCE(${statusValue}, status),
          updated_at = NOW()
        WHERE id = ${target.partner_id}
          AND corretora_id = ${corretoraId}
      `;
    }

    // Atualiza partner_users (sempre restrito ao partner_id verificado)
    if (target.user_id) {
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
        WHERE id = ${target.user_id}
          AND partner_id = ${target.partner_id}
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

  const isCorretoraWide = canManageCorretoraWide(user);
  const isPartnerManager = isIndividualPartnerManager(user);

  if (!isCorretoraWide && !isPartnerManager) {
    return NextResponse.json({ error: 'Acesso negado à gestão de equipe' }, { status: 403 });
  }

  const { id } = await params;
  await ensureSchema();

  let corretoraId = user.corretoraId;
  if (!corretoraId && user.partnerId) {
    const [p] = await sql`SELECT corretora_id FROM partners WHERE id = ${user.partnerId}`;
    corretoraId = p?.corretora_id || null;
  }
  if (!corretoraId && isInternalUser(user)) {
    const [defaultCorretora] = await sql`SELECT id FROM corretoras WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`;
    corretoraId = defaultCorretora?.id || null;
  }

  if (!corretoraId) {
    return NextResponse.json({ error: 'Nenhuma corretora vinculada' }, { status: 400 });
  }

  try {
    let bodyType: string | undefined;
    let bodyUserId: string | undefined;
    try {
      const rawBody = await req.json();
      if (rawBody && typeof rawBody === 'object') {
        bodyType = rawBody.type;
        bodyUserId = rawBody.userId;
      }
    } catch {
      // POST pode ser enviado sem body
    }

    if (isPartnerManager && bodyType === 'partner' && id !== user.partnerId) {
      return NextResponse.json(
        { error: 'Acesso negado: você não pode gerenciar outra empresa parceira' },
        { status: 403 }
      );
    }

    const target = await resolveTargetMemberOrPartner(id, corretoraId, bodyUserId);

    if (!target || !target.user_id) {
      return NextResponse.json({ error: 'Vendedor não encontrado nesta corretora' }, { status: 404 });
    }

    // Isolamento Multi-Tenant: diretor/gerente de parceiro individual só pode redefinir senha de membros do seu próprio user.partnerId
    if (isPartnerManager) {
      if (target.partner_id !== user.partnerId || (target.user_partner_id && target.user_partner_id !== user.partnerId)) {
        return NextResponse.json(
          { error: 'Acesso negado: este membro pertence a outro parceiro' },
          { status: 403 }
        );
      }

      if (user.partnerRole === 'manager' && normalizePartnerRole(target.user_role) === 'director') {
        return NextResponse.json(
          { error: 'Gerentes não têm permissão para redefinir a senha do diretor do parceiro' },
          { status: 403 }
        );
      }
    }

    // Gera nova senha provisória e atualiza
    const novaSenhaProvisoria = crypto.randomBytes(6).toString('hex');
    const passwordHash = await bcrypt.hash(novaSenhaProvisoria, 10);

    await sql`
      UPDATE partner_users
      SET password_hash = ${passwordHash}, is_active = true, updated_at = NOW()
      WHERE id = ${target.user_id}
        AND partner_id = ${target.partner_id}
    `;

    const recipientEmail = target.user_email || target.partner_email;
    const recipientName = target.user_name || target.razao_social;

    // Dispara e-mail
    const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://duolife.com.br';
    const loginUrl = `${portalUrl}/login`;
    const emailSubject = `Dados de Acesso ao Portal DuoLife Hub`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #0e4a5a; margin-top: 0;">Seu Acesso ao Portal do Parceiro</h2>
        <p>Olá, <strong>${recipientName}</strong>,</p>
        <p>Seus dados de acesso ao <strong>DuoLife Hub</strong> foram atualizados pela gestão da sua corretora.</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Suas credenciais de login:</strong></p>
          <p style="margin: 0 0 4px 0;"><strong>Link de Acesso:</strong> <a href="${loginUrl}" style="color: #0e4a5a;">${loginUrl}</a></p>
          <p style="margin: 0 0 4px 0;"><strong>E-mail:</strong> ${recipientEmail}</p>
          <p style="margin: 0;"><strong>Nova Senha Provisória:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${novaSenhaProvisoria}</code></p>
        </div>
        <p style="font-size: 13px; color: #64748b;">Recomendamos alterar sua senha após o login no menu "Meu Perfil".</p>
        <div style="text-align: center; margin-top: 24px;">
          <a href="${loginUrl}" style="background: #00d4e0; color: #072a33; padding: 12px 24px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block;">Fazer Login Agora</a>
        </div>
      </div>
    `;

    await sendEmail({
      to: recipientEmail,
      subject: emailSubject,
      html: emailHtml,
    });

    return NextResponse.json({
      ok: true,
      message: `Convite e nova senha enviados com sucesso para ${recipientEmail}`,
    });
  } catch (err) {
    logger.error({ err }, 'portal.equipe.resend_invite.error');
    return NextResponse.json({ error: 'Erro ao reenviar convite por e-mail' }, { status: 500 });
  }
}
