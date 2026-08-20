import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isPlatformAdmin, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { validarCnpj, validarCpf, somenteDigitos } from '@/lib/documento';
import { issuePasswordResetEmail } from '@/lib/password-reset';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  try {
    await ensureSchema();

    const parceiros = status
      ? await sql`
          SELECT id, razao_social, nome_fantasia, cnpj, cpf, person_type, email, phone, status, created_at
          FROM partners
          WHERE status = ${status}
          ORDER BY created_at DESC
          LIMIT 200
        `
      : await sql`
          SELECT id, razao_social, nome_fantasia, cnpj, cpf, person_type, email, phone, status, created_at
          FROM partners
          ORDER BY created_at DESC
          LIMIT 200
        `;

    return Response.json({ parceiros, canManageStatus: isPlatformAdmin(admin) });
  } catch (err) {
    logger.error({ err }, 'admin.parceiros.list.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

const updateStatusSchema = z.object({
  parceiro_id: z.string().min(1),
  status: z.enum(['active', 'pending', 'suspended']),
});

export async function PATCH(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isPlatformAdmin(admin)) {
    return Response.json({ error: 'Apenas administradores podem alterar o status de parceiros' }, { status: 403 });
  }

  const parsed = updateStatusSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const { parceiro_id, status } = parsed.data;

    const [partner] = await sql`
      UPDATE partners SET status = ${status}, updated_at = NOW()
      WHERE id = ${parceiro_id}
      RETURNING id, razao_social, status
    `;

    if (!partner) return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });

    logger.info({ adminId: admin.userId, parceiro_id, status }, 'admin.partner.status.updated');
    return Response.json({ ok: true, partner });
  } catch (err) {
    logger.error({ err }, 'admin.parceiros.update.failed');
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

const createPartnerSchema = z.object({
  person_type: z.enum(['pj', 'pf']),
  razao_social: z.string().trim().min(2, 'Informe a razão social ou o nome do corretor'),
  nome_fantasia: z.string().trim().optional(),
  documento: z.string().trim().min(11, 'Informe o CNPJ ou CPF'),
  email: z.string().trim().email('E-mail da operação inválido'),
  phone: z.string().trim().min(8, 'Informe um telefone'),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  status: z.enum(['active', 'pending']).default('active'),
  director_name: z.string().trim().min(2, 'Informe o nome do diretor'),
  director_email: z.string().trim().email('E-mail do diretor inválido'),
}).superRefine((data, ctx) => {
  const doc = somenteDigitos(data.documento);
  const valido = data.person_type === 'pj' ? validarCnpj(doc) : validarCpf(doc);
  if (!valido) {
    ctx.addIssue({
      code: 'custom',
      path: ['documento'],
      message: data.person_type === 'pj' ? 'CNPJ inválido' : 'CPF inválido',
    });
  }
});

export async function POST(req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isPlatformAdmin(admin)) {
    return Response.json({ error: 'Seu perfil não pode cadastrar corretoras' }, { status: 403 });
  }

  const parsed = createPartnerSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    // Devolve todos os problemas de uma vez: com 8 campos no formulário, corrigir um por
    // requisição transforma um cadastro em cinco tentativas.
    const issues = parsed.error.issues.map((issue) => issue.message);
    return Response.json({ error: issues[0] ?? 'Dados inválidos', issues }, { status: 400 });
  }

  const data = parsed.data;
  const documento = somenteDigitos(data.documento);
  const cnpj = data.person_type === 'pj' ? documento : null;
  const cpf = data.person_type === 'pf' ? documento : null;
  const email = data.email.toLowerCase();
  const directorEmail = data.director_email.toLowerCase();

  try {
    await ensureSchema();

    const criado = await sql.begin(async (tx) => {
      const [docEmUso] = data.person_type === 'pj'
        ? await tx`SELECT id FROM partners WHERE cnpj = ${cnpj} LIMIT 1`
        : await tx`SELECT id FROM partners WHERE cpf = ${cpf} LIMIT 1`;
      if (docEmUso) return { erro: 'Já existe um parceiro com este documento' };

      const [emailEmUso] = await tx`SELECT id FROM partners WHERE email = ${email} LIMIT 1`;
      if (emailEmUso) return { erro: 'Já existe um parceiro com este e-mail' };

      // partner_users.email é único no sistema inteiro, não por parceiro — avisar antes de
      // estourar a constraint, senão o operador recebe "erro interno" sem saber o motivo.
      const [diretorEmUso] = await tx`SELECT id FROM partner_users WHERE email = ${directorEmail} LIMIT 1`;
      if (diretorEmUso) return { erro: 'Este e-mail de diretor já tem acesso em outra operação' };

      const [partner] = await tx`
        INSERT INTO partners (razao_social, nome_fantasia, person_type, cnpj, cpf, email, phone, address, status, metadata)
        VALUES (
          ${data.razao_social},
          ${data.nome_fantasia || data.razao_social},
          ${data.person_type},
          ${cnpj},
          ${cpf},
          ${email},
          ${data.phone},
          ${JSON.stringify({ city: data.city ?? null, state: data.state ?? null })}::jsonb,
          ${data.status},
          ${JSON.stringify({ source: 'admin', created_by: admin.userId })}::jsonb
        )
        RETURNING id, razao_social, nome_fantasia, person_type, status
      `;

      // Senha aleatória e descartada: o diretor só entra pelo convite, definindo a própria
      // senha. Ninguém da DuoLife chega a conhecer a credencial do parceiro.
      const senhaDescartada = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

      const [director] = await tx`
        INSERT INTO partner_users (partner_id, name, email, password_hash, role, permissions, is_active, updated_at)
        VALUES (${partner.id}, ${data.director_name}, ${directorEmail}, ${senhaDescartada}, 'director', '{}'::jsonb, true, NOW())
        RETURNING id, name, email
      `;

      // Sem isso o diretor entra e não encontra nenhum produto para cotar: a tela de nova
      // cotação lê de partner_product_availability, e em produção não há backfill automático.
      // Liberação total por padrão — restringir produto a produto é feito na tela de Produtos.
      await tx`
        INSERT INTO partner_product_availability (partner_id, product_id, is_active)
        SELECT ${partner.id}, pr.id, true
        FROM products pr
        WHERE pr.is_active = true
        ON CONFLICT (partner_id, product_id) DO NOTHING
      `;

      return { partner, director };
    });

    if ('erro' in criado) {
      return Response.json({ error: criado.erro }, { status: 409 });
    }

    // O convite é o caminho normal de primeiro acesso, mas uma falha de SMTP não pode
    // desfazer um cadastro válido — o parceiro fica criado e o convite é reenviado na tela dele.
    let inviteSent = true;
    try {
      await issuePasswordResetEmail({
        userId: criado.director.id,
        userType: 'partner',
        email: criado.director.email,
        userName: criado.director.name,
        origin: req.headers.get('origin'),
        purpose: 'invite',
      });
    } catch (err) {
      inviteSent = false;
      logger.error({ err, partnerId: criado.partner.id }, 'admin.parceiros.create.invite_failed');
    }

    logger.info(
      { adminId: admin.userId, partnerId: criado.partner.id, personType: data.person_type, inviteSent },
      'admin.parceiros.created'
    );

    return Response.json({ ok: true, partner: criado.partner, director: criado.director, inviteSent }, { status: 201 });
  } catch (err) {
    logger.error({ err }, 'admin.parceiros.create.failed');
    return Response.json({ error: 'Erro interno ao cadastrar parceiro' }, { status: 500 });
  }
}
