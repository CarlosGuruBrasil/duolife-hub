import { NextRequest, NextResponse } from 'next/server';
import { resolvePartnerOrLink } from '@/lib/referral';
import { getReferralTokenTtlSeconds } from '@/lib/system-settings';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rl = rateLimit(`referral:${clientIp}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const ref = req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('code');

    if (!ref || !ref.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Código de indicação não encontrado ou inativo' },
        { status: 404 }
      );
    }

    const resolved = await resolvePartnerOrLink(ref.trim());
    if (!resolved || resolved.partner.status === 'suspended' || resolved.partner.status === 'inactive') {
      return NextResponse.json(
        { ok: false, error: 'Código de indicação não encontrado ou inativo' },
        { status: 404 }
      );
    }

    const ttlSeconds = await getReferralTokenTtlSeconds();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const response = NextResponse.json({
      ok: true,
      referral: {
        code: resolved.partner.code,
        partnerName: resolved.partner.nomeFantasia || resolved.partner.razaoSocial,
        companyName:
          resolved.partner.whiteLabel?.companyName ||
          resolved.partner.nomeFantasia ||
          resolved.partner.razaoSocial,
        logoUrl: resolved.partner.whiteLabel?.logoUrl || null,
        primaryColor: resolved.partner.whiteLabel?.primaryColor || null,
        directUrl: resolved.directUrl,
        discountPercent: resolved.discountPercent ?? 0,
        token: resolved.token,
        ttlSeconds,
        expiresAt,
      },
    });

    response.cookies.set('duolife_ref', resolved.partner.code, {
      maxAge: ttlSeconds,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err) {
    logger.error({ err }, 'public.referral.get.failed');
    return NextResponse.json(
      { ok: false, error: 'Erro interno ao resolver indicação' },
      { status: 500 }
    );
  }
}
