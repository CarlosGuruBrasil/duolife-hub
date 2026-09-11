import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { testNet4LifeConnection } from '@/lib/net4life-service';
import { getNet4LifeInfoConfig } from '@/lib/system-settings';

export async function POST(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const currentConfig = await getNet4LifeInfoConfig();

    const configToTest = {
      apiUrl: body.apiUrl || currentConfig.apiUrl,
      apiToken: body.apiToken && !body.apiToken.startsWith('********') ? body.apiToken : currentConfig.apiToken,
      senderEmail: body.senderEmail || currentConfig.senderEmail,
      senderName: body.senderName || currentConfig.senderName,
      replyTo: body.replyTo || currentConfig.replyTo,
      smtpUser: body.smtpUser || currentConfig.smtpUser,
      enabled: true,
    };

    if (!configToTest.apiToken) {
      return Response.json(
        { ok: false, message: 'Informe o Token da Aplicação (Bearer em_...) para realizar o teste.' },
        { status: 400 }
      );
    }

    const testResult = await testNet4LifeConnection(configToTest);

    return Response.json({
      ok: testResult.success,
      message: testResult.message,
      latencyMs: testResult.latencyMs,
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, message: `Erro ao testar conexão: ${err?.message || 'Falha desconhecida'}` },
      { status: 500 }
    );
  }
}
