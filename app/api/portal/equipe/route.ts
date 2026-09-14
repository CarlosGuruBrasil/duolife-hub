import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { sql } from '@/lib/pg';
import { canManageTeam, roleIsCorretora, verifyPartnerAuth, unauthorized } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/mailer';

const createVendedorSchema = z.object({
  name: z.string().trim().min(2, 'Nome é obrigatório'),
  email: z.string().trim().email('E-mail inválido'),
  phone: z.string().trim().optional().nullable(),
  cpfCnpj: z.string().trim().optional().nullable(),
  personType: z.enum(['pf', 'pj']).default('pf'),
  role: z.enum(['broker', 'manager']).default('broker'),
  password: z.string().optional().nullable(),
  sendInviteEmail: z.boolean().default(true),
});

export async function GET() {
  const user = await verifyPartnerAuth();
  if (!user || !canManageTeam(user)) {
    return unauthorized();
  }

  await ensureSchema();

  // Identifica a corretora alvo
  let corretoraId = user.corretoraId;
  if (!corretoraId && user.partnerId) {
    const [p] = await sql`SELECT corretora_id FROM partners WHERE id = ${user.partnerId}`;
    corretoraId = p?.corretora_id || null;
  }

  if (!corretoraId) {
    return NextResponse.json({ error: 'Nenhuma corretora vinculada' }, { status: 400 });
  }

  try {
    const [corretora] = await sql`
      SELECT id, nome_fantasia, razao_social, email, status
      FROM corretoras
      WHERE id = ${corretoraId}
    `;

    if (!corretora) {
      return NextResponse.json({ error: 'Corretora não encontrada' }, { status: 404 });
    }

    const vendedores = await sql`
      SELECT
        p.id AS partner_id,
        p.razao_social,
        p.nome_fantasia,
        p.cpf,
        p.cnpj,
        p.person_type,
        p.email,
        p.phone,
        p.status AS partner_status,
        p.created_at,
        pu.id AS user_id,
        pu.name AS user_name,
        pu.email AS user_email,
        pu.role AS user_role,
        pu.is_active AS user_active,
        pu.last_login_at,
        pu.manager_user_id,
        m.name AS manager_name,
        COALESCE(sales_agg.total_vendas, 0) AS total_vendas,
        COALESCE(sales_agg.volume_vendas, 0) AS volume_vendas,
        COALESCE(quotes_agg.total_cotacoes, 0) AS total_cotacoes
      FROM partners p
      LEFT JOIN partner_users pu ON pu.partner_id = p.id
      LEFT JOIN partner_users m ON m.id = pu.manager_user_id
      LEFT JOIN (
        SELECT partner_id, COUNT(*) AS total_vendas, SUM(premio_total) AS volume_vendas
        FROM sales
        WHERE corretora_id = ${corretoraId}
        GROUP BY partner_id
      ) sales_agg ON sales_agg.partner_id = p.id
      LEFT JOIN (
        SELECT partner_id, COUNT(*) AS total_cotacoes
        FROM cotacoes
        WHERE corretora_id = ${corretoraId}
        GROUP BY partner_id
      ) quotes_agg ON quotes_agg.partner_id = p.id
      WHERE p.corretora_id = ${corretoraId}
      ORDER BY pu.is_active DESC, p.created_at DESC
    `;

    // Lista de possíveis gestores (diretores e managers da corretora)
    const managers = await sql`
      SELECT pu.id, pu.name, pu.role
      FROM partner_users pu
      JOIN partners p ON p.id = pu.partner_id
      WHERE p.corretora_id = ${corretoraId}
        AND pu.role IN ('director', 'manager')
        AND pu.is_active = true
      ORDER BY pu.name ASC
    `;

    const stats = {
      totalVendedores: vendedores.length,
      ativos: vendedores.filter(v => v.user_active).length,
      inativos: vendedores.filter(v => !v.user_active).length,
      totalCotacoes: vendedores.reduce((acc, v) => acc + Number(v.total_cotacoes || 0), 0),
      totalVendas: vendedores.reduce((acc, v) => acc + Number(v.total_vendas || 0), 0),
      volumeTotal: vendedores.reduce((acc, v) => acc + Number(v.volume_vendas || 0), 0),
    };

    return NextResponse.json({
      ok: true,
      corretora: {
        id: corretora.id,
        nome_fantasia: corretora.nome_fantasia,
        razao_social: corretora.razao_social,
      },
      vendedores,
      managers,
      stats,
    });
  } catch (err) {
    logger.error({ err }, 'portal.equipe.get.error');
    return NextResponse.json({ error: 'Erro ao listar equipe de vendedores' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyPartnerAuth();
  if (!user || !canManageTeam(user)) {
    return unauthorized();
  }

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
    const body = await req.json();
    const parsed = createVendedorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
    }

    const { name, email, phone, cpfCnpj, personType, role, password, sendInviteEmail } = parsed.data;
    const cleanEmail = email.toLowerCase().trim();

    // Verifica unicidade de e-mail em partner_users e corretora_users
    const [existingPartnerUser] = await sql`SELECT id FROM partner_users WHERE email = ${cleanEmail}`;
    if (existingPartnerUser) {
      return NextResponse.json({ error: 'Já existe um vendedor cadastrado com este e-mail' }, { status: 409 });
    }

    const [existingAdminUser] = await sql`SELECT id FROM admin_users WHERE email = ${cleanEmail}`;
    if (existingAdminUser) {
      return NextResponse.json({ error: 'Este e-mail pertence a um usuário administrativo' }, { status: 409 });
    }

    // Define senha
    const plainPassword = password && password.trim().length >= 6
      ? password.trim()
      : crypto.randomBytes(6).toString('hex'); // 12 caracteres hex se não definida
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    // Cria registro em partners vinculado à corretora
    const digitsOnly = (cpfCnpj || '').replace(/\D/g, '');
    const isPj = personType === 'pj' || digitsOnly.length > 11;
    const cpf = !isPj && digitsOnly.length === 11 ? digitsOnly : null;
    const cnpj = isPj && digitsOnly.length === 14 ? digitsOnly : null;

    const [newPartner] = await sql`
      INSERT INTO partners (
        corretora_id,
        razao_social,
        nome_fantasia,
        cnpj,
        cpf,
        person_type,
        email,
        phone,
        status,
        metadata
      )
      VALUES (
        ${corretoraId},
        ${name},
        ${name},
        ${cnpj},
        ${cpf},
        ${isPj ? 'pj' : 'pf'},
        ${cleanEmail},
        ${phone || null},
        'active',
        '{"source": "portal_equipe"}'::jsonb
      )
      RETURNING id, razao_social, nome_fantasia, email, status, created_at
    `;

    // Cria credencial de login em partner_users
    const [newUser] = await sql`
      INSERT INTO partner_users (
        partner_id,
        name,
        email,
        password_hash,
        role,
        permissions,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        ${newPartner.id},
        ${name},
        ${cleanEmail},
        ${passwordHash},
        ${role},
        '{}'::jsonb,
        true,
        NOW(),
        NOW()
      )
      RETURNING id, name, email, role, is_active, created_at
    `;

    // Dispara e-mail de convite se solicitado
    let emailEnviado = false;
    if (sendInviteEmail) {
      try {
        const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://duolife.com.br';
        const loginUrl = `${portalUrl}/login`;
        const emailSubject = `Bem-vindo ao Portal de Vendas DuoLife Hub`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; rounded: 12px; background: #ffffff;">
            <h2 style="color: #0e4a5a; margin-top: 0;">Bem-vindo à equipe comercial!</h2>
            <p>Olá, <strong>${name}</strong>,</p>
            <p>Você foi credenciado como corretor/vendedor parceiro no <strong>DuoLife Hub</strong>.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0 0 8px 0;"><strong>Seus dados de acesso:</strong></p>
              <p style="margin: 0 0 4px 0;"><strong>Link do Portal:</strong> <a href="${loginUrl}" style="color: #0e4a5a;">${loginUrl}</a></p>
              <p style="margin: 0 0 4px 0;"><strong>E-mail:</strong> ${cleanEmail}</p>
              <p style="margin: 0;"><strong>Senha Provisória:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${plainPassword}</code></p>
            </div>
            <p style="font-size: 13px; color: #64748b;">Recomendamos alterar sua senha após o primeiro acesso no menu "Meu Perfil".</p>
            <div style="text-align: center; margin-top: 24px;">
              <a href="${loginUrl}" style="background: #00d4e0; color: #072a33; padding: 12px 24px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block;">Acessar o Portal</a>
            </div>
          </div>
        `;

        await sendEmail({
          to: cleanEmail,
          subject: emailSubject,
          html: emailHtml,
        });
        emailEnviado = true;
      } catch (emailErr) {
        logger.warn({ err: emailErr }, 'portal.equipe.invite_email_failed');
      }
    }

    return NextResponse.json({
      ok: true,
      partner: newPartner,
      user: newUser,
      passwordGenerated: plainPassword,
      emailSent: emailEnviado,
    });
  } catch (err) {
    logger.error({ err }, 'portal.equipe.post.error');
    return NextResponse.json({ error: 'Erro ao cadastrar vendedor' }, { status: 500 });
  }
}
