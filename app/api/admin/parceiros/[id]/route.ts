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

    return Response.json({
      partner: {
        ...partner,
        whiteLabel: getWhiteLabelConfig(partner.metadata),
      },
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

    const [updated] = await sql`
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

    logger.info({ adminId: admin.userId, partnerId: id, changes: data }, 'admin.partner.cadastral.updated');
    return Response.json({ ok: true, partner: updated });
  } catch (err) {
    logger.error({ err, partnerId: id }, 'admin.parceiro.update.failed');
    return Response.json({ error: 'Erro interno ao atualizar parceiro' }, { status: 500 });
  }
}
