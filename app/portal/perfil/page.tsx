import { redirect } from 'next/navigation';
import PartnerProfileForm from '@/components/portal/PartnerProfileForm';
import { verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

interface PartnerRow {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  email: string;
  phone: string | null;
  address: {
    city?: string;
    state?: string;
    street?: string;
  } | null;
  status: string;
  created_at: string;
}

const statusLabel: Record<string, string> = {
  pending: 'Pendente',
  active: 'Ativo',
  suspended: 'Suspenso',
  inactive: 'Inativo',
};

export default async function PerfilPage() {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');

  await ensureSchema();

  const [partner] = await sql<PartnerRow[]>`
    SELECT id, razao_social, nome_fantasia, cnpj, email, phone, address, status, created_at
    FROM partners
    WHERE id = ${user.partnerId!}
  `;

  if (!partner) redirect('/login');

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Perfil</h1>
        <p className="muted mt-1 text-sm">Dados cadastrais da corretora vinculada ao seu acesso.</p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Razão social</div>
          <div className="mt-2 text-base font-bold" style={{ color: 'var(--primary)' }}>{partner.razao_social}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">CNPJ</div>
          <div className="mt-2 text-base font-bold" style={{ color: 'var(--primary)' }}>{partner.cnpj}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</div>
          <div className="mt-2 text-base font-bold" style={{ color: 'var(--primary)' }}>{statusLabel[partner.status] || partner.status}</div>
        </div>
      </div>

      <PartnerProfileForm partner={partner} />
    </div>
  );
}
