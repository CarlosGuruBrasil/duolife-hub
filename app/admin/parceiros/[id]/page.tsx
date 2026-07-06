import { redirect } from 'next/navigation';
import { verifyAdminAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { getWhiteLabelConfig } from '@/lib/white-label';
import PartnerWhiteLabelClient from './_client';

interface ProductRow {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
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

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  const { id } = await params;
  await ensureSchema();

  const [partner] = await sql`
    SELECT id, razao_social, nome_fantasia, email, phone, status, metadata, created_at
    FROM partners
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!partner) redirect('/admin/parceiros');

  const products = await sql<ProductRow[]>`
    SELECT id, name, code, is_active
    FROM products
    ORDER BY is_active DESC, name ASC
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
        email: partner.email,
        phone: partner.phone,
        status: partner.status,
        created_at: partner.created_at,
        whiteLabel: getWhiteLabelConfig(partner.metadata),
      }}
      products={products}
      links={links}
    />
  );
}
