import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isPlatformAdmin, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { validarCnpj, somenteDigitos } from '@/lib/documento';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { getWhiteLabelConfig } from '@/lib/white-label';
import { sendEmail } from '@/lib/mailer';

export async function GET(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  try {
    await ensureSchema();

    const corretoras = await sql`
      SELECT
        c.id,
        c.razao_social,
        c.nome_fantasia,
        c.cnpj,
        c.susep,
        c.email,
        c.phone,
        c.address,
        c.status,
        c.metadata,
        c.logo_base64,
        c.logo_mime_type,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*)::int FROM partners p WHERE p.corretora_id = c.id) AS partners_count,
        (SELECT COUNT(*)::int FROM cotacoes cot WHERE cot.corretora_id = c.id) AS cotacoes_count,
        (SELECT COUNT(*)::int FROM sales s WHERE s.corretora_id = c.id) AS sales_count
      FROM corretoras c
      WHERE (${status}::text IS NULL OR c.status = ${status})
      ORDER BY c.created_at ASC
    `;

    const formatted = corretoras.map((item) => ({
      ...item,
      whiteLabel: getWhiteLabelConfig(item.metadata),
    }));

    return Response.json({
      corretoras: formatted,
      canManage: isPlatformAdmin(admin),
    });
  } catch (err) {
    logger.error({ err }, 'admin.corretoras.list.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

const emptyToUndefined = (val: unknown) => {
  if (typeof val === 'string' && val.trim() === '') return undefined;
  return val;
};

const createCorretoraSchema = z.object({
  razao_social: z.string().trim().min(2, 'Informe a Razão Social'),
  nome_fantasia: z.string().trim().min(2, 'Informe o Nome Fantasia'),
  cnpj: z.string().trim().min(14, 'Informe o CNPJ'),
  susep: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  email: z.string().trim().email('E-mail institucional inválido'),
  phone: z.string().trim().min(8, 'Informe o telefone'),
  street: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  neighborhood: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  city: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  state: z.preprocess(emptyToUndefined, z.string().trim().max(2).optional()),
  slug: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(2, 'Slug deve ter no mínimo 2 caracteres').regex(/^[a-z0-9_-]+$/, 'Slug deve ter apenas letras minúsculas, números e hífens').optional()
  ),
  primaryColor: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  secondaryColor: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  logoUrl: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  logo_base64: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  logo_mime_type: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  admin_name: z.preprocess(emptyToUndefined, z.string().trim().min(2, 'Informe o nome do administrador').optional()),
  admin_email: z.preprocess(emptyToUndefined, z.string().trim().email('E-mail do administrador inválido').optional()),
  admin_password: z.preprocess(emptyToUndefined, z.string().trim().min(6, 'A senha deve ter no mínimo 6 caracteres').optional()),
  send_invite_email: z.boolean().default(true),
}).superRefine((data, ctx) => {
  const cnpjLimpo = somenteDigitos(data.cnpj);
  if (!validarCnpj(cnpjLimpo)) {
    ctx.addIssue({
      code: 'custom',
      path: ['cnpj'],
      message: 'CNPJ inválido',
    });
  }
});

export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isPlatformAdmin(admin)) {
    return Response.json({ error: 'Apenas administradores podem cadastrar corretoras' }, { status: 403 });
  }

  const parsed = createCorretoraSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message);
    return Response.json({ error: issues[0] ?? 'Dados inválidos', issues }, { status: 400 });
  }

  const data = parsed.data;
  const cnpj = somenteDigitos(data.cnpj);
  const email = data.email.toLowerCase();

  // Processamento do Logotipo da Corretora (máximo 2MB)
  let logoBase64: string | null = null;
  let logoMimeType: string | null = null;

  if (data.logo_base64) {
    const cleanBase64 = data.logo_base64.replace(/^data:[^;]+;base64,/, '');
    const sizeBytes = Buffer.byteLength(cleanBase64, 'base64');
    if (sizeBytes > 2 * 1024 * 1024) {
      return Response.json({ error: 'O arquivo de logotipo excede o limite máximo permitido de 2MB' }, { status: 400 });
    }
    logoBase64 = cleanBase64;
    logoMimeType = data.logo_mime_type || (data.logo_base64.includes('image/jpeg') ? 'image/jpeg' : 'image/png');
  }

  // Dados do Administrador Master da Corretora
  const adminName = (data.admin_name || data.nome_fantasia).trim();
  const adminEmail = (data.admin_email || email).toLowerCase().trim();

  try {
    await ensureSchema();

    const [cnpjExiste] = await sql`SELECT id FROM corretoras WHERE cnpj = ${cnpj} LIMIT 1`;
    if (cnpjExiste) {
      return Response.json({ error: 'Já existe uma corretora cadastrada com este CNPJ' }, { status: 409 });
    }

    // Valida se o email do administrador já está em uso em qualquer nível
    const [corretoraUserExiste] = await sql`SELECT id FROM corretora_users WHERE email = ${adminEmail} LIMIT 1`;
    if (corretoraUserExiste) {
      return Response.json({ error: 'Já existe um usuário de corretora cadastrado com este e-mail' }, { status: 409 });
    }

    const [adminUserExiste] = await sql`SELECT id FROM admin_users WHERE email = ${adminEmail} LIMIT 1`;
    if (adminUserExiste) {
      return Response.json({ error: 'Este e-mail pertence a um usuário administrativo da DuoLife' }, { status: 409 });
    }

    const [partnerUserExiste] = await sql`SELECT id FROM partner_users WHERE email = ${adminEmail} LIMIT 1`;
    if (partnerUserExiste) {
      return Response.json({ error: 'Este e-mail já pertence a um corretor/vendedor existente' }, { status: 409 });
    }

    // Define ou gera senha provisória
    const plainPassword = data.admin_password && data.admin_password.trim().length >= 6
      ? data.admin_password.trim()
      : crypto.randomBytes(6).toString('hex');
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const address = {
      street: data.street || '',
      neighborhood: data.neighborhood || '',
      city: data.city || '',
      state: data.state || '',
    };

    const whiteLabel = {
      slug: data.slug || data.nome_fantasia.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      companyName: data.nome_fantasia,
      companyPhone: data.phone,
      companyEmail: email,
      logoUrl: logoBase64 ? `data:${logoMimeType};base64,${logoBase64}` : (data.logoUrl || ''),
      primaryColor: data.primaryColor || '#004172',
      secondaryColor: data.secondaryColor || '#00a0af',
      susep: data.susep || '',
    };

    const [corretora] = await sql`
      INSERT INTO corretoras (
        razao_social,
        nome_fantasia,
        cnpj,
        susep,
        email,
        phone,
        address,
        status,
        metadata,
        logo_base64,
        logo_mime_type
      )
      VALUES (
        ${data.razao_social},
        ${data.nome_fantasia},
        ${cnpj},
        ${data.susep || null},
        ${email},
        ${data.phone},
        ${JSON.stringify(address)}::jsonb,
        'active',
        ${JSON.stringify({ whiteLabel, created_by: admin.userId })}::jsonb,
        ${logoBase64},
        ${logoMimeType}
      )
      RETURNING id, razao_social, nome_fantasia, cnpj, susep, email, phone, status, logo_base64, logo_mime_type, created_at
    `;

    // Cria o usuário gestor master da corretora
    const [corretoraUser] = await sql`
      INSERT INTO corretora_users (
        corretora_id,
        name,
        email,
        password_hash,
        role,
        permissions,
        is_active
      )
      VALUES (
        ${corretora.id},
        ${adminName},
        ${adminEmail},
        ${passwordHash},
        'corretora_admin',
        '{"admin": true, "manage_team": true, "view_all_sales": true}'::jsonb,
        true
      )
      RETURNING id, name, email, role, is_active, created_at
    `;

    // Dispara e-mail de convite se solicitado
    let emailEnviado = false;
    if (data.send_invite_email) {
      try {
        const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://duolife.com.br';
        const loginUrl = `${portalUrl}/login`;
        const emailSubject = `Acesso de Gestão — DuoLife Hub (${data.nome_fantasia})`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <h2 style="color: #0e4a5a; margin-top: 0;">Bem-vindo ao DuoLife Hub!</h2>
            <p>Olá, <strong>${adminName}</strong>,</p>
            <p>A sua corretora <strong>${data.nome_fantasia}</strong> foi cadastrada na plataforma DuoLife Hub como Corretora Master.</p>
            <p>A partir do portal você poderá administrar sua equipe comercial de corretores e acompanhar toda a produção.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0 0 8px 0;"><strong>Suas credenciais de acesso:</strong></p>
              <p style="margin: 0 0 4px 0;"><strong>Link do Portal:</strong> <a href="${loginUrl}" style="color: #0e4a5a;">${loginUrl}</a></p>
              <p style="margin: 0 0 4px 0;"><strong>E-mail:</strong> ${adminEmail}</p>
              <p style="margin: 0;"><strong>Senha Provisória:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${plainPassword}</code></p>
            </div>
            <p style="font-size: 13px; color: #64748b;">Recomendamos alterar sua senha após o primeiro acesso no menu "Meu Perfil".</p>
            <div style="text-align: center; margin-top: 24px;">
              <a href="${loginUrl}" style="background: #00d4e0; color: #072a33; padding: 12px 24px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block;">Acessar o Portal</a>
            </div>
          </div>
        `;

        await sendEmail({
          to: adminEmail,
          subject: emailSubject,
          html: emailHtml,
        });
        emailEnviado = true;
      } catch (mailErr) {
        logger.warn({ err: mailErr }, 'admin.corretoras.invite_email_failed');
      }
    }

    logger.info({ adminId: admin.userId, corretoraId: corretora.id, corretoraUserId: corretoraUser.id }, 'admin.corretoras.created');
    return Response.json({
      ok: true,
      corretora,
      adminUser: corretoraUser,
      temporaryPassword: plainPassword,
      emailSent: emailEnviado,
    }, { status: 201 });
  } catch (err) {
    logger.error({ err }, 'admin.corretoras.create.failed');
    return Response.json({ error: 'Erro interno ao cadastrar corretora' }, { status: 500 });
  }
}
