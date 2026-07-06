import bcrypt from 'bcryptjs';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Shield, UserPlus } from 'lucide-react';
import { verifyAdminAuth } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

export const dynamic = 'force-dynamic';

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

async function createOrUpdateAdmin(formData: FormData) {
  'use server';

  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  await ensureSchema();

  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const id = String(formData.get('id') || '').trim();
  const role = String(formData.get('role') || 'duolife_staff');

  if (!name || !email) {
    redirect('/admin/usuarios?error=invalid');
  }

  if (!id && password.length < 8) {
    redirect('/admin/usuarios?error=invalid');
  }

  const existing = id
    ? await sql`
        SELECT password_hash
        FROM admin_users
        WHERE id = ${id}
      `
    : [];

  const passwordHash = password
    ? await bcrypt.hash(password, 10)
    : existing[0]?.password_hash;

  if (!passwordHash) {
    redirect('/admin/usuarios?error=invalid');
  }

  if (id) {
    await sql`
      UPDATE admin_users
      SET name = ${name},
          email = ${email},
          password_hash = ${passwordHash},
          role = ${role},
          is_active = true
      WHERE id = ${id}
    `;
  } else {
    await sql`
      INSERT INTO admin_users (name, email, password_hash, role, is_active)
      VALUES (${name}, ${email}, ${passwordHash}, ${role}, true)
      ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            is_active = true
    `;
  }

  revalidatePath('/admin/usuarios');
}

async function toggleAdminStatus(formData: FormData) {
  'use server';

  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  await ensureSchema();

  const id = String(formData.get('id') || '');
  const nextActive = String(formData.get('is_active') || '') === 'true' ? 'false' : 'true';

  if (!id || id === user.userId) {
    redirect('/admin/usuarios?error=forbidden');
  }

  await sql`
    UPDATE admin_users
    SET is_active = ${nextActive === 'true'}
    WHERE id = ${id}
  `;

  revalidatePath('/admin/usuarios');
}

export default async function AdminUsuariosPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await verifyAdminAuth();
  if (!user) redirect('/login');

  await ensureSchema();

  const params = searchParams ? await searchParams : {};
  const error = typeof params.error === 'string' ? params.error : '';
  const editId = typeof params.edit === 'string' ? params.edit : '';

  const admins = await sql<AdminUserRow[]>`
    SELECT id, name, email, role, is_active, created_at
    FROM admin_users
    ORDER BY created_at DESC
  `;

  const editing = editId ? admins.find((admin) => admin.id === editId) ?? null : null;

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Shield size={24} style={{ color: 'var(--primary)' }} />
          <div>
            <h1 className="text-2xl font-black" style={{ color: 'var(--primary)' }}>Usuários</h1>
            <p className="text-gray-500 text-sm mt-1">Administração de acessos internos da DuoLife.</p>
          </div>
        </div>
      </div>

      <div className="mb-6 card">
        <div className="mb-4 flex items-center gap-2 font-bold" style={{ color: 'var(--primary)' }}>
          <UserPlus size={18} /> {editing ? 'Editar admin' : 'Criar admin'}
        </div>
        <form action={createOrUpdateAdmin} className="grid gap-4 md:grid-cols-4">
          <input type="hidden" name="id" value={editing?.id || ''} />
          <label className="block">
            <span className="field-label">Nome</span>
            <input name="name" required className="form-input" placeholder="Nome completo" defaultValue={editing?.name || ''} />
          </label>
          <label className="block">
            <span className="field-label">E-mail</span>
            <input name="email" type="email" required className="form-input" placeholder="admin@duolife.net.br" defaultValue={editing?.email || ''} />
          </label>
          <label className="block">
            <span className="field-label">Senha {editing ? '(deixe em branco para manter)' : ''}</span>
            <input
              name="password"
              type="password"
              minLength={editing ? 0 : 8}
              className="form-input"
              placeholder={editing ? 'Nova senha opcional' : 'Mínimo 8 caracteres'}
            />
          </label>
          <label className="block">
            <span className="field-label">Perfil</span>
            <select name="role" defaultValue={editing?.role || 'duolife_staff'} className="form-input">
              <option value="duolife_staff">Staff</option>
              <option value="duolife_admin">Admin</option>
            </select>
          </label>
          <div className="md:col-span-4 flex justify-end">
            {editing && (
              <Link href="/admin/usuarios" className="btn-outline px-6 py-3 mr-3">
                Novo cadastro
              </Link>
            )}
            <button type="submit" className="btn-primary px-6 py-3">
              {editing ? 'Salvar alteração' : 'Salvar acesso'}
            </button>
          </div>
        </form>
        {error && (
          <p className="mt-3 text-sm text-red-600">
            {error === 'invalid'
              ? editing
                ? 'Preencha nome e e-mail. A senha é opcional na edição, obrigatória no cadastro novo.'
                : 'Preencha nome, e-mail e senha com no mínimo 8 caracteres.'
              : 'Ação não permitida.'}
          </p>
        )}
        <p className="mt-3 text-xs text-gray-500">
          A senha atual não pode ser exibida. Para alterar, preencha uma nova senha acima.
        </p>
      </div>

      <div className="card overflow-hidden p-0">
        {admins.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nenhum usuário admin encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3 font-semibold">Nome</th>
                  <th className="px-5 py-3 font-semibold">E-mail</th>
                  <th className="px-5 py-3 font-semibold">Perfil</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Cadastro</th>
                  <th className="px-5 py-3 font-semibold text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map((admin) => (
                  <tr key={admin.id} className="table-row">
                    <td className="px-5 py-4 font-semibold" style={{ color: 'var(--primary)' }}>{admin.name}</td>
                    <td className="px-5 py-4 text-gray-600">{admin.email}</td>
                    <td className="px-5 py-4 text-gray-600">{admin.role}</td>
                    <td className="px-5 py-4">
                      <span className="status-pill">{admin.is_active ? 'Ativo' : 'Inativo'}</span>
                    </td>
                    <td className="px-5 py-4 text-gray-500">{new Date(admin.created_at).toLocaleDateString('pt-BR')}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/usuarios?edit=${admin.id}`} className="btn-outline text-xs px-3 py-1.5 min-h-0">
                          Editar
                        </Link>
                        <form action={toggleAdminStatus} className="inline-flex">
                          <input type="hidden" name="id" value={admin.id} />
                          <input type="hidden" name="is_active" value={String(admin.is_active)} />
                          <button
                            type="submit"
                            disabled={admin.id === user.userId}
                            className="btn-outline text-xs px-3 py-1.5 min-h-0"
                          >
                            {admin.is_active ? 'Desativar' : 'Ativar'}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
