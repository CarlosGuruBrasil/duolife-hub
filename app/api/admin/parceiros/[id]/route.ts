import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isPlatformAdmin, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { validarCnpj, validarCpf, somenteDigitos } from '@/lib/documento';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { getWhiteLabelConfig } from '@/lib/white-label';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { id } = await params;

  try {
    await ensureSchema();

    const [partner] = await sql`
      SELECT
        p.id,
        p.razao_social,
        p.nome_fantasia,
        p.cnpj,
        p.cpf,
        p.person_type,
        p.email,
        p.phone,
        p.address,
        p.status,
        p.corretora_id,
        c.nome_fantasia AS corretora_nome,
        p.metadata,
        p.created_at,
        p.updated_at
      FROM partners p
      LEFT JOIN corretoras c ON c.id = p.corretora_id
      WHERE p.id = ${id}
      LIMIT 1
    `;

    if (!partner) {
      return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });
    }

    const [user] = await sql`
      SELECT id, name, email, role, manager_user_id, is_active, last_login_at
      FROM partner_users
      WHERE partner_id = ${id}
      ORDER BY created_at ASC
      LIMIT 1
    `;

    return Response.json({
      partner: {
        ...partner,
        whiteLabel: getWhiteLabelConfig(partner.metadata),
      },
      user: user || null,
      canManage: isPlatformAdmin(admin),
    });
  } catch (err) {
    logger.error({ err, partnerId: id }, 'admin.partner.get.failed');
    return Response.json({ error: 'Erro interno ao buscar parceiro' }, { status: 500 });
  }
}

const updatePartnerSchema = z.object({
  person_type: z.enum(['pj', 'pf']).optional(),
  razao_social: z.string().trim().min(2, 'Informe a razão social ou o nome').optional(),
  nome_fantasia: z.string().trim().optional().nullable(),
  documento: z.string().trim().optional().nullable(),
  email: z.string().trim().email('E-mail inválido').optional(),
  phone: z.string().trim().min(8, 'Telefone inválido').optional().nullable(),
  status: z.enum(['active', 'pending', 'suspended']).optional(),
  corretora_id: z.string().trim().optional().nullable(),
  address: z.record(z.string(), z.unknown()).optional(),
  // Credenciais de acesso ao portal integradas
  role: z.enum(['director', 'manager', 'broker', 'partner']).optional(),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres').optional().or(z.literal('')),
  user_is_active: z.boolean().optional(),
  manager_user_id: z.string().trim().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.documento) {
    const doc = somenteDigitos(data.documento);
    if (doc) {
      const pType = data.person_type || (doc.length > 11 ? 'pj' : 'pf');
      const valido = pType === 'pj' ? validarCnpj(doc) : validarCpf(doc);
      if (!valido) {
        ctx.addIssue({
          code: 'custom',
          path: ['documento'],
          message: pType === 'pj' ? 'CNPJ inválido' : 'CPF inválido',
        });
      }
    }
  }
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isPlatformAdmin(admin)) {
    return Response.json({ error: 'Apenas administradores podem alterar parceiros' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await ensureSchema();

    const parsed = updatePartnerSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      return Response.json({ error: issues[0] ?? 'Dados inválidos', issues }, { status: 400 });
    }

    const data = parsed.data;

    const [current] = await sql`
      SELECT id, razao_social, nome_fantasia, person_type, cnpj, cpf, email, phone, status, corretora_id, address
      FROM partners
      WHERE id = ${id}
      LIMIT 1
    `;
    if (!current) {
      return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });
    }

    const newPersonType = data.person_type ?? current.person_type ?? 'pj';
    let newCnpj = current.cnpj;
    let newCpf = current.cpf;

    if (data.documento !== undefined) {
      const docLimpo = data.documento ? somenteDigitos(data.documento) : null;
      if (newPersonType === 'pj') {
        newCnpj = docLimpo;
        newCpf = null;
      } else {
        newCpf = docLimpo;
        newCnpj = null;
      }
    }

    // Checar duplicidade de documento se informado
    if (newCnpj) {
      const [emUso] = await sql`SELECT id FROM partners WHERE cnpj = ${newCnpj} AND id != ${id} LIMIT 1`;
      if (emUso) return Response.json({ error: 'Já existe outro parceiro cadastrado com este CNPJ' }, { status: 409 });
    }
    if (newCpf) {
      const [emUso] = await sql`SELECT id FROM partners WHERE cpf = ${newCpf} AND id != ${id} LIMIT 1`;
      if (emUso) return Response.json({ error: 'Já existe outro parceiro cadastrado com este CPF' }, { status: 409 });
    }

    // Checar duplicidade de email se alterado
    const newEmail = data.email ? data.email.toLowerCase() : current.email;
    if (newEmail && newEmail !== current.email) {
      const [emailEmUso] = await sql`SELECT id FROM partners WHERE email = ${newEmail} AND id != ${id} LIMIT 1`;
      if (emailEmUso) return Response.json({ error: 'Já existe outro parceiro cadastrado com este e-mail' }, { status: 409 });
    }

    const newRazaoSocial = data.razao_social ?? current.razao_social;
    const newNomeFantasia = data.nome_fantasia !== undefined ? data.nome_fantasia : current.nome_fantasia;
    const newPhone = data.phone !== undefined ? data.phone : current.phone;
    const newStatus = data.status ?? current.status;
    const newCorretoraId = data.corretora_id !== undefined ? data.corretora_id : current.corretora_id;

    // Concatenação/Merge seguro do endereço JSONB
    const nextAddress = data.address !== undefined
      ? { ...((current.address as Record<string, unknown>) || {}), ...data.address }
      : current.address;

    // 1. Atualiza os dados cadastrais da tabela partners
    const [updatedPartner] = await sql`
      UPDATE partners
      SET
        razao_social = ${newRazaoSocial},
        nome_fantasia = ${newNomeFantasia || newRazaoSocial},
        person_type = ${newPersonType},
        cnpj = ${newCnpj},
        cpf = ${newCpf},
        email = ${newEmail},
        phone = ${newPhone},
        status = ${newStatus},
        corretora_id = ${newCorretoraId},
        address = ${JSON.stringify(nextAddress)}::jsonb,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, razao_social, nome_fantasia, person_type, cnpj, cpf, email, phone, status, corretora_id, address, updated_at
    `;

    // 2. Sincroniza a credencial de acesso em partner_users
    let [pUser] = await sql`SELECT id, password_hash, role, is_active FROM partner_users WHERE partner_id = ${id} LIMIT 1`;
    if (!pUser) {
      const [byEmail] = await sql`SELECT id, password_hash, role, is_active FROM partner_users WHERE email = ${newEmail} LIMIT 1`;
      pUser = byEmail;
      if (pUser) {
        await sql`UPDATE partner_users SET partner_id = ${id} WHERE id = ${pUser.id}`;
      }
    }

    const newPasswordHash = (data.password && data.password.trim().length >= 8)
      ? await bcrypt.hash(data.password.trim(), 10)
      : null;

    const newRole = data.role ?? pUser?.role ?? 'broker';
    const newUserActive = data.user_is_active !== undefined ? data.user_is_active : (pUser?.is_active ?? true);
    const newManagerId = newRole === 'director' ? null : (data.manager_user_id ?? null);

    let updatedUser = null;
    if (pUser) {
      const [u] = await sql`
        UPDATE partner_users
        SET
          name = ${newRazaoSocial},
          email = ${newEmail},
          role = ${newRole},
          is_active = ${newUserActive},
          manager_user_id = ${newManagerId},
          password_hash = COALESCE(${newPasswordHash}, password_hash),
          updated_at = NOW()
        WHERE id = ${pUser.id}
        RETURNING id, name, email, role, manager_user_id, is_active, last_login_at
      `;
      updatedUser = u;
    } else {
      const initialHash = newPasswordHash || (await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10));
      const [u] = await sql`
        INSERT INTO partner_users (partner_id, name, email, password_hash, role, permissions, is_active, manager_user_id, updated_at)
        VALUES (${id}, ${newRazaoSocial}, ${newEmail}, ${initialHash}, ${newRole}, '{}'::jsonb, ${newUserActive}, ${newManagerId}, NOW())
        RETURNING id, name, email, role, manager_user_id, is_active, last_login_at
      `;
      updatedUser = u;
    }

    logger.info({ adminId: admin.userId, partnerId: id, changes: data }, 'admin.partner.unified.updated');
    return Response.json({ ok: true, partner: updatedPartner, user: updatedUser });
  } catch (err) {
    logger.error({ err, partnerId: id }, 'admin.parceiro.update.failed');
    return Response.json({ error: 'Erro interno ao atualizar parceiro' }, { status: 500 });
  }
}
