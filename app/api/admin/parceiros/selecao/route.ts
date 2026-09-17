import { NextRequest } from 'next/server';
import { verifyAuth, isInternalUser, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const user = await verifyAuth();
    if (!user || !isInternalUser(user)) {
      return unauthorized();
    }

    // Busca todos os parceiros (ordenando os ativos primeiro)
    const partners = await sql<Array<{
      id: string;
      nome_fantasia: string | null;
      razao_social: string;
      cnpj: string | null;
      cpf: string | null;
      status: string;
      corretora_id: string | null;
    }>>`
      SELECT id, nome_fantasia, razao_social, cnpj, cpf, status, corretora_id
      FROM partners
      ORDER BY (status = 'active') DESC, COALESCE(nome_fantasia, razao_social) ASC
    `;

    // Busca usuários vinculados aos parceiros
    const users = await sql<Array<{
      id: string;
      partner_id: string;
      name: string;
      email: string;
      role: string;
      is_active: boolean;
    }>>`
      SELECT id, partner_id, name, email, role, is_active
      FROM partner_users
      WHERE is_active = true
      ORDER BY name ASC
    `;

    const usersByPartner = new Map<string, Array<{ id: string; name: string; email: string; role: string }>>();
    for (const u of users) {
      const list = usersByPartner.get(u.partner_id) || [];
      list.push({ id: u.id, name: u.name, email: u.email, role: u.role });
      usersByPartner.set(u.partner_id, list);
    }

    const items = partners.map((p) => ({
      id: p.id,
      name: p.nome_fantasia || p.razao_social,
      razaoSocial: p.razao_social,
      documento: p.cnpj || p.cpf || '',
      status: p.status,
      isActive: p.status === 'active',
      corretoraId: p.corretora_id,
      users: usersByPartner.get(p.id) || [],
    }));

    return Response.json({
      ok: true,
      partners: items,
    });
  } catch (err) {
    logger.error({ err }, 'api.admin.parceiros.selecao.failed');
    return Response.json({ error: 'Erro ao listar parceiros' }, { status: 500 });
  }
}
