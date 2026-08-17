import { redirect } from 'next/navigation';
import { UserCheck } from 'lucide-react';
import { verifyAuth, isInternalUser } from '@/lib/auth';
import { sql } from '@/lib/pg';
import PerfilClient from './_client';

export const dynamic = 'force-dynamic';

export default async function PerfilPage() {
  const user = await verifyAuth();
  if (!user) redirect('/login');

  let profileData = {
    id: user.userId,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: undefined as string | undefined,
  };

  if (isInternalUser(user)) {
    const [adminRow] = await sql<{ created_at: string }[]>`
      SELECT created_at FROM admin_users WHERE id = ${user.userId}
    `;
    if (adminRow) {
      profileData.createdAt = adminRow.created_at;
    }
  } else {
    const [partnerRow] = await sql<{ created_at: string }[]>`
      SELECT created_at FROM partner_users WHERE id = ${user.userId}
    `;
    if (partnerRow) {
      profileData.createdAt = partnerRow.created_at;
    }
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <UserCheck size={24} style={{ color: 'var(--primary)' }} />
          <div>
            <h1 className="page-title">Meu Perfil</h1>
            <p className="muted mt-1 text-sm">Gerencie suas credenciais de acesso, e-mail e preferências cadastrais.</p>
          </div>
        </div>
      </div>

      <PerfilClient initialUser={profileData} />
    </div>
  );
}
