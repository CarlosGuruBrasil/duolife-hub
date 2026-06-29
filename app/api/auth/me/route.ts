import { verifyAuth, unauthorized } from '@/lib/auth';

export async function GET() {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  return Response.json({ user });
}
