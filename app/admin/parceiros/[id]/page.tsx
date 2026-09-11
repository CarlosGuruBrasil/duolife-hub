import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
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

interface ManagerOption {
  id: string;
  name: string;
  role: string;
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

  // Buscar ou auto-provisionar a credencial deste corretor/vendedor
  let [partnerUser] = await sql<PartnerUserRow[]>`
    SELECT id, name, email, role, manager_user_id, is_active, last_login_at, created_at
    FROM partner_users
    WHERE partner_id = ${id}
    ORDER BY created_at ASC
    LIMIT 1
  `;

  if (!partnerUser) {
    const [existingByEmail] = await sql<PartnerUserRow[]>`
      SELECT id, name, email, role, manager_user_id, is_active, last_login_at, created_at
      FROM partner_users
      WHERE email = ${partner.email.toLowerCase()}
      LIMIT 1
    `;

    if (existingByEmail) {
      await sql`UPDATE partner_users SET partner_id = ${id} WHERE id = ${existingByEmail.id}`;
      partnerUser = { ...existingByEmail };
    } else {
      const senhaDescartada = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const [created] = await sql<PartnerUserRow[]>`
        INSERT INTO partner_users (partner_id, name, email, password_hash, role, permissions, is_active, updated_at)
        VALUES (${id}, ${partner.razao_social}, ${partner.email.toLowerCase()}, ${senhaDescartada}, 'broker', '{}'::jsonb, true, NOW())
        RETURNING id, name, email, role, manager_user_id, is_active, last_login_at, created_at
      `;
      partnerUser = created;
    }
  }

  const corretoras = await sql<CorretoraOption[]>`
    SELECT id, razao_social, nome_fantasia
    FROM corretoras
    ORDER BY nome_fantasia ASC
  `;

  // Gestores disponíveis na mesma corretora (para vincular vendedores a um gestor comercial)
  const managers = await sql<ManagerOption[]>`
    SELECT pu.id, pu.name, pu.role
    FROM partner_users pu
    JOIN partners p ON p.id = pu.partner_id
    WHERE p.corretora_id = ${partner.corretora_id}
      AND pu.role IN ('director', 'manager')
      AND pu.id != ${partnerUser?.id ?? ''}
      AND pu.is_active = true
    ORDER BY pu.name ASC
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
      partnerUser={partnerUser}
      managers={managers}
      corretoras={corretoras}
      products={products}
      links={links}
      canManageConfig={isPlatformAdmin(user)}
    />
  );
}
