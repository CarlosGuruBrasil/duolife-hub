import { redirect } from 'next/navigation';
import { isPlatformAdmin, verifyAdminAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { getWhiteLabelConfig } from '@/lib/white-label';
import PartnerWhiteLabelClient from './_client';

interface ProductRow {
  id: string;
  name: string;
  code: string;
  category: string | null;
  is_active: boolean;
  enabled: boolean;
}

interface LinkRow {
  id: string;
  token: string;
  label: string | null;
  flow_type: string;
  status: string;
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
  product_name: string | null;
  product_code: string | null;
}

interface PartnerUserRow {
  id: string;
  name: string;
  email: string;
  role: 'director' | 'manager' | 'broker' | 'partner';
  manager_user_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface CorretoraOption {
  id: string;
  razao_social: string;
  nome_fantasia: string;
}

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  const { id } = await params;
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

  if (!partner) redirect('/admin/parceiros');

  const corretoras = await sql<CorretoraOption[]>`
    SELECT id, razao_social, nome_fantasia
    FROM corretoras
    ORDER BY nome_fantasia ASC
  `;

  const products = await sql<ProductRow[]>`
    SELECT
      p.id,
      p.name,
      p.code,
      p.category,
      p.is_active,
      COALESCE(ppa.is_active, false) AS enabled
    FROM products p
    LEFT JOIN partner_product_availability ppa
      ON ppa.product_id = p.id AND ppa.partner_id = ${id}
    ORDER BY p.is_active DESC, p.name ASC
  `;

  const links = await sql<LinkRow[]>`
    SELECT
      pl.id,
      pl.token,
      pl.label,
      pl.flow_type,
      pl.status,
      pl.expires_at,
      pl.used_at,
      pl.created_at,
      pr.name AS product_name,
      pr.code AS product_code
    FROM public_sale_links pl
    LEFT JOIN products pr ON pr.id = pl.product_id
    WHERE pl.partner_id = ${id}
    ORDER BY pl.created_at DESC
  `;

  const partnerUsers = await sql<PartnerUserRow[]>`
    SELECT
      pu.id,
      pu.name,
      pu.email,
      pu.role,
      pu.manager_user_id,
      pu.is_active,
      pu.last_login_at,
      pu.created_at
    FROM partner_users pu
    WHERE pu.partner_id = ${id}
    ORDER BY
      CASE pu.role
        WHEN 'director' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'broker' THEN 3
        ELSE 4
      END,
      pu.created_at ASC
  `;

  return (
    <PartnerWhiteLabelClient
      partner={{
        id: partner.id,
        razao_social: partner.razao_social,
        nome_fantasia: partner.nome_fantasia,
        cnpj: partner.cnpj,
        cpf: partner.cpf,
        person_type: partner.person_type || 'pj',
        email: partner.email,
        phone: partner.phone,
        address: partner.address || {},
        status: partner.status,
        corretora_id: partner.corretora_id,
        corretora_nome: partner.corretora_nome,
        created_at: partner.created_at,
        updated_at: partner.updated_at,
        whiteLabel: getWhiteLabelConfig(partner.metadata),
      }}
      corretoras={corretoras}
      products={products}
      links={links}
      partnerUsers={partnerUsers}
      canManageConfig={isPlatformAdmin(user)}
    />
  );
}
