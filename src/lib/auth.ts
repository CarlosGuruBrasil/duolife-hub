import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
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

export async function verifyAuth(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('duolife_token')?.value;
    if (!token) return null;
    return jwt.verify(token, getJwtSecret()) as AuthUser;
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
