import { redirect } from 'next/navigation';
import PartnerProfileForm from '@/components/portal/PartnerProfileForm';
import PartnerTeamManager from '@/components/portal/PartnerTeamManager';
import ChangePasswordForm from '@/components/portal/ChangePasswordForm';
import { canManageOwnCompany, verifyPartnerAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';
import { getWhiteLabelConfig } from '@/lib/white-label';
import { getOrCreatePartnerSaleLink } from '@/lib/referral';

interface PartnerRow {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  cpf: string | null;
  person_type: string;
  email: string;
  phone: string | null;
  address: {
    city?: string;
    state?: string;
    street?: string;
  } | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface TeamUserRow {
  id: string;
  name: string;
  email: string;
  role: 'director' | 'manager' | 'broker' | 'partner';
  manager_user_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

const statusLabel: Record<string, string> = {
  pending: 'Pendente',
  active: 'Ativo',
  suspended: 'Suspenso',
  inactive: 'Inativo',
};

function formatDocumento(p: PartnerRow): string {
  const doc = p.person_type === 'pf' ? p.cpf : p.cnpj;
  if (!doc) return '-';
  const n = doc.replace(/\D/g, '');
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
}

export default async function PerfilPage() {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  const canManageCompany = canManageOwnCompany(user);

  await ensureSchema();

  const [partner] = await sql<PartnerRow[]>`
    SELECT id, razao_social, nome_fantasia, cnpj, cpf, person_type, email, phone, address, status, metadata, created_at
    FROM partners
    WHERE id = ${user.partnerId!}
  `;

  if (!partner) redirect('/login');

  const [saleLink, teamUsers] = await Promise.all([
    getOrCreatePartnerSaleLink(partner.id),
    canManageCompany
      ? sql<TeamUserRow[]>`
          SELECT
            id,
            name,
            email,
            role,
            manager_user_id,
            is_active,
            last_login_at,
            created_at
          FROM partner_users
          WHERE partner_id = ${user.partnerId!}
          ORDER BY
            CASE role
              WHEN 'director' THEN 1
              WHEN 'manager' THEN 2
              WHEN 'broker' THEN 3
              ELSE 4
            END,
            created_at ASC
        `
      : Promise.resolve([]),
  ]);

  const whiteLabel = getWhiteLabelConfig(partner.metadata);

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="page-title">Perfil & Configurações da Corretora</h1>
        <p className="muted mt-1 text-sm">
          Gerencie seus links de vendas, código de indicação, identidade visual White Label e equipe.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Razão Social / Nome</div>
          <div className="mt-2 text-base font-bold text-gray-900">{partner.razao_social}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {partner.person_type === 'pf' ? 'CPF' : 'CNPJ'}
          </div>
          <div className="mt-2 text-base font-bold text-gray-900">{formatDocumento(partner)}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status Operacional</div>
          <div className="mt-2 text-base font-bold text-[#0e4a5a]">{statusLabel[partner.status] || partner.status}</div>
        </div>
      </div>

      <PartnerProfileForm
        partner={partner}
        whiteLabel={whiteLabel}
        saleLink={saleLink}
        canEdit={canManageCompany}
      />

      {canManageCompany ? (
        <div className="mt-6">
          <PartnerTeamManager users={teamUsers} />
        </div>
      ) : null}

      <ChangePasswordForm />
    </div>
  );
}
