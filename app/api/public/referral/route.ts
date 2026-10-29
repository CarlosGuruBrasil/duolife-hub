import { NextRequest, NextResponse } from 'next/server';
import { resolvePartnerOrLink } from '@/lib/referral';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
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
      },
    });

    response.cookies.set('duolife_ref', resolved.partner.code, {
      maxAge: 2592000,
      path: '/',
      sameSite: 'lax',
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
