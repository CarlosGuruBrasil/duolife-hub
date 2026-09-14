import { cookies } from 'next/headers';
import { INTERNAL_ROLES, CORRETORA_ROLES, roleIsDev, roleIsInternal, roleIsPlatformAdmin, roleIsCorretora, type UserRole } from './roles';
import jwt from 'jsonwebtoken';
import { sql } from './pg';
import { getJwtSecret } from './secrets';

export type { UserRole } from './roles';

export type PartnerRole = 'director' | 'manager' | 'broker' | 'partner';

export { INTERNAL_ROLES, INTERNAL_ROLE_LABEL, CORRETORA_ROLES, CORRETORA_ROLE_LABEL, roleIsCorretora } from './roles';

export interface AuthUser {
  userId:         string;
  partnerId:      string | null; // null = usuário interno DuoLife ou gestor de corretora
  corretoraId?:   string | null;
  corretoraNome?: string | null;
  name:           string;
  email:          string;
  role:           UserRole;
  partnerRole?:   PartnerRole | null;
  managerUserId?: string | null;
  permissions:    Record<string, boolean>;
}

export interface PartnerAccessContext {
  partnerId: string | null;
  corretoraId: string | null;
  isCorretoraUser: boolean;
  role: PartnerRole | UserRole;
  visibleUserIds: string[] | null;
}

export function normalizePartnerRole(value: unknown): PartnerRole {
  switch (String(value || '').toLowerCase()) {
    case 'admin':
    case 'director':
      return 'director';
    case 'manager':
      return 'manager';
    case 'seller':
    case 'broker':
      return 'broker';
    case 'viewer':
    case 'partner':
      return 'partner';
    default:
      return 'broker';
  }
}

export function toPartnerUserRole(role: PartnerRole): UserRole {
  return `partner_${role}` as UserRole;
}

export function normalizePermissions(value: unknown): Record<string, boolean> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return normalizePermissions(parsed);
    } catch {
      return {};
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, boolean>;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuthUser>;
  return typeof candidate.userId === 'string'
    && (typeof candidate.partnerId === 'string' || candidate.partnerId === null || candidate.partnerId === undefined)
    && (typeof candidate.corretoraId === 'string' || candidate.corretoraId === null || candidate.corretoraId === undefined)
    && typeof candidate.name === 'string'
    && typeof candidate.email === 'string'
    && typeof candidate.role === 'string'
    && typeof candidate.permissions === 'object'
    && candidate.permissions !== null;
}

export async function verifyAuth(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('duolife_token')?.value;
    if (!token) return null;

    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (!isAuthUser(decoded)) return null;

    if (roleIsInternal(decoded.role)) {
      const [admin] = await sql`
        SELECT id, name, email, role
        FROM admin_users
        WHERE id = ${decoded.userId} AND is_active = true
      `;

      if (!admin) return null;

      return {
        userId: admin.id,
        partnerId: null,
        corretoraId: null,
        corretoraNome: null,
        name: admin.name,
        email: admin.email,
        role: admin.role as UserRole,
        partnerRole: null,
        managerUserId: null,
        permissions: normalizePermissions({}),
      };
    }

    if (roleIsCorretora(decoded.role)) {
      const [corretoraUser] = await sql`
        SELECT cu.id, cu.corretora_id, cu.name, cu.email, cu.role, cu.permissions,
               c.nome_fantasia as corretora_nome
        FROM corretora_users cu
        JOIN corretoras c ON c.id = cu.corretora_id
        WHERE cu.id = ${decoded.userId}
          AND cu.is_active = true
          AND c.status = 'active'
      `;

      if (!corretoraUser) return null;

      return {
        userId: corretoraUser.id,
        partnerId: null,
        corretoraId: corretoraUser.corretora_id,
        corretoraNome: corretoraUser.corretora_nome,
        name: corretoraUser.name,
        email: corretoraUser.email,
        role: corretoraUser.role as UserRole,
        partnerRole: null,
        managerUserId: null,
        permissions: normalizePermissions(corretoraUser.permissions),
      };
    }

    const [partnerUser] = await sql`
      SELECT pu.id, pu.name, pu.email, pu.role, pu.permissions, pu.partner_id, pu.manager_user_id,
             p.corretora_id, c.nome_fantasia as corretora_nome
      FROM partner_users pu
      JOIN partners p ON p.id = pu.partner_id
      LEFT JOIN corretoras c ON c.id = p.corretora_id
      WHERE pu.id = ${decoded.userId}
        AND pu.is_active = true
        AND p.status = 'active'
    `;

    if (!partnerUser) return null;

    return {
      userId: partnerUser.id,
      partnerId: partnerUser.partner_id,
      corretoraId: partnerUser.corretora_id || null,
      corretoraNome: partnerUser.corretora_nome || null,
      name: partnerUser.name,
      email: partnerUser.email,
      role: toPartnerUserRole(normalizePartnerRole(partnerUser.role)),
      partnerRole: normalizePartnerRole(partnerUser.role),
      managerUserId: partnerUser.manager_user_id,
      permissions: normalizePermissions(partnerUser.permissions),
    };
  } catch {
    return null;
  }
}

export async function verifyAdminAuth(): Promise<AuthUser | null> {
  const user = await verifyAuth();
  if (!user) return null;
  return isInternalUser(user) ? user : null;
}

export async function verifyPartnerAuth(): Promise<AuthUser | null> {
  const user = await verifyAuth();
  if (!user) return null;
  if ((user.partnerId && user.role.startsWith('partner_')) || roleIsCorretora(user.role)) return user;
  return null;
}

export function isInternalUser(user: AuthUser): boolean {
  return roleIsInternal(user.role);
}

// Desenvolvedor: ações irreversíveis (exclusão em cascata, ferramentas de diagnóstico).
// Separado de administrador de propósito — quem toca o negócio no dia a dia não precisa
// do poder de apagar registro real.
export function isDevUser(user: AuthUser): boolean {
  return roleIsDev(user.role);
}

// Administra a plataforma: cadastra e ativa corretora, define produtos, planos e repasses,
// configura white-label e links públicos, gerencia usuários internos.
// É o nível que o perfil Administrador sempre teve — `isDevUser` fica só para o irreversível.
export function isPlatformAdmin(user: AuthUser): boolean {
  return roleIsPlatformAdmin(user.role);
}

export function canManageOwnCompany(user: AuthUser): boolean {
  return roleIsCorretora(user.role) || user.partnerRole === 'director';
}

export function canManageTeam(user: AuthUser): boolean {
  return roleIsCorretora(user.role) || user.partnerRole === 'director' || user.partnerRole === 'manager';
}

export async function getPartnerAccessContext(user: AuthUser): Promise<PartnerAccessContext | null> {
  if (roleIsCorretora(user.role)) {
    return {
      partnerId: null,
      corretoraId: user.corretoraId || null,
      isCorretoraUser: true,
      role: user.role,
      visibleUserIds: null,
    };
  }

  if (!user.partnerId || !user.partnerRole) return null;

  const corretoraId = user.corretoraId || null;

  if (user.partnerRole === 'director') {
    return {
      partnerId: user.partnerId,
      corretoraId,
      isCorretoraUser: false,
      role: user.partnerRole,
      visibleUserIds: null,
    };
  }

  if (user.partnerRole === 'manager') {
    const rows = await sql<{ id: string }[]>`
      WITH RECURSIVE team AS (
        SELECT id
        FROM partner_users
        WHERE id = ${user.userId}
          AND partner_id = ${user.partnerId}
          AND is_active = true
        UNION
        SELECT pu.id
        FROM partner_users pu
        JOIN team t ON pu.manager_user_id = t.id
        WHERE pu.partner_id = ${user.partnerId}
          AND pu.is_active = true
      )
      SELECT id FROM team
    `;

    return {
      partnerId: user.partnerId,
      corretoraId,
      isCorretoraUser: false,
      role: user.partnerRole,
      visibleUserIds: rows.map((row) => row.id),
    };
  }

  return {
    partnerId: user.partnerId,
    corretoraId,
    isCorretoraUser: false,
    role: user.partnerRole,
    visibleUserIds: [user.userId],
  };
}

export function unauthorized() {
  return Response.json({ error: 'Não autorizado' }, { status: 401 });
}
