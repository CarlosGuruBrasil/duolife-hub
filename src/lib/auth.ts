import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { sql } from './pg';
import { getJwtSecret } from './secrets';

export type UserRole =
  | 'duolife_admin'
  | 'duolife_staff'
  | 'partner_director'
  | 'partner_manager'
  | 'partner_broker'
  | 'partner_partner';

export type PartnerRole = 'director' | 'manager' | 'broker' | 'partner';

export interface AuthUser {
  userId:      string;
  partnerId:   string | null; // null = usuário interno DuoLife
  name:        string;
  email:       string;
  role:        UserRole;
  partnerRole?: PartnerRole | null;
  managerUserId?: string | null;
  permissions: Record<string, boolean>;
}

export interface PartnerAccessContext {
  partnerId: string;
  role: PartnerRole;
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
    && (typeof candidate.partnerId === 'string' || candidate.partnerId === null)
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

    const decoded = jwt.verify(token, getJwtSecret());
    if (!isAuthUser(decoded)) return null;

    if (decoded.role === 'duolife_admin' || decoded.role === 'duolife_staff') {
      const [admin] = await sql`
        SELECT id, name, email, role
        FROM admin_users
        WHERE id = ${decoded.userId} AND is_active = true
      `;

      if (!admin) return null;

      return {
        userId: admin.id,
        partnerId: null,
        name: admin.name,
        email: admin.email,
        role: admin.role as UserRole,
        partnerRole: null,
        managerUserId: null,
        permissions: normalizePermissions({}),
      };
    }

    const [partnerUser] = await sql`
      SELECT pu.id, pu.name, pu.email, pu.role, pu.permissions, pu.partner_id, pu.manager_user_id
      FROM partner_users pu
      JOIN partners p ON p.id = pu.partner_id
      WHERE pu.id = ${decoded.userId}
        AND pu.is_active = true
        AND p.status = 'active'
    `;

    if (!partnerUser) return null;

    return {
      userId: partnerUser.id,
      partnerId: partnerUser.partner_id,
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
  if (user.role === 'duolife_admin' || user.role === 'duolife_staff') return user;
  return null;
}

export async function verifyPartnerAuth(): Promise<AuthUser | null> {
  const user = await verifyAuth();
  if (!user) return null;
  if (user.partnerId && user.role.startsWith('partner_')) return user;
  return null;
}

export function isInternalUser(user: AuthUser): boolean {
  return user.role === 'duolife_admin' || user.role === 'duolife_staff';
}

export function isDevUser(user: AuthUser): boolean {
  return user.role === 'duolife_admin';
}

export function hasPartnerWideAccess(user: AuthUser): boolean {
  return user.partnerRole === 'director';
}

export function canManageOwnCompany(user: AuthUser): boolean {
  return user.partnerRole === 'director';
}

export async function getPartnerAccessContext(user: AuthUser): Promise<PartnerAccessContext | null> {
  if (!user.partnerId || !user.partnerRole) return null;

  if (user.partnerRole === 'director') {
    return {
      partnerId: user.partnerId,
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
      role: user.partnerRole,
      visibleUserIds: rows.map((row) => row.id),
    };
  }

  return {
    partnerId: user.partnerId,
    role: user.partnerRole,
    visibleUserIds: [user.userId],
  };
}

export function signToken(payload: AuthUser): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '15m' });
}

export function unauthorized() {
  return Response.json({ error: 'Não autorizado' }, { status: 401 });
}
