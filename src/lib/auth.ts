import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { sql } from './pg';
import { getJwtSecret } from './secrets';

export type UserRole =
  | 'duolife_admin'
  | 'duolife_staff'
  | 'partner_admin'
  | 'partner_seller'
  | 'partner_viewer';

export interface AuthUser {
  userId:      string;
  partnerId:   string | null; // null = usuário interno DuoLife
  name:        string;
  email:       string;
  role:        UserRole;
  permissions: Record<string, boolean>;
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
        permissions: normalizePermissions({}),
      };
    }

    const [partnerUser] = await sql`
      SELECT pu.id, pu.name, pu.email, pu.role, pu.permissions, pu.partner_id
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
      role: `partner_${partnerUser.role}` as UserRole,
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

export function signToken(payload: AuthUser): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '15m' });
}

export function unauthorized() {
  return Response.json({ error: 'Não autorizado' }, { status: 401 });
}
