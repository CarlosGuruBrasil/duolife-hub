import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { getZapSignConfig, sanitizeApiToken } from '@/lib/system-settings';

export async function POST(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito a usuários internos.' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const currentConfig = await getZapSignConfig();

    // Permite testar credenciais passadas no body antes de salvar, ou usa as configurações salvas
    const rawToken = body.apiToken !== undefined && !String(body.apiToken).startsWith('********')
      ? String(body.apiToken)
      : currentConfig.apiToken;

    const token = sanitizeApiToken(rawToken);

    const env = (body.environment || (currentConfig.isSandbox ? 'sandbox' : 'production')).trim().toLowerCase();
    const isSandbox = env === 'sandbox';
    const baseUrl = isSandbox
      ? 'https://sandbox.api.zapsign.com.br/api/v1'
      : 'https://api.zapsign.com.br/api/v1';

    if (!token) {
      return Response.json(
        {
          ok: false,
          message: 'Token de API da ZapSign não informado. Preencha o campo do token para realizar o teste.',
          environment: isSandbox ? 'sandbox' : 'production',
        },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // Chamada leve à lista de documentos ou templates da ZapSign para validar a autenticação
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/docs/?page=1`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const latencyMs = Date.now() - startTime;
    const responseText = await response.text();

    if (response.ok) {
      return Response.json({
        ok: true,
        message: `Conexão estabelecida com sucesso com a ZapSign (${isSandbox ? 'Modo Sandbox' : 'Produção Real'})!`,
        latencyMs,
        environment: isSandbox ? 'sandbox' : 'production',
        status: response.status,
      });
    }

    // Diagnóstico detalhado para status não-200
    let friendlyMessage = `A ZapSign respondeu com status ${response.status}.`;
    if (responseText.includes('API token not found') || responseText.includes('Token da API não encontrado')) {
      friendlyMessage = `Token não localizado no ambiente ${isSandbox ? 'Sandbox (Testes)' : 'Produção Real'}. ` +
        `Certifique-se de que o token foi gerado na plataforma correta (${isSandbox ? 'sandbox.app.zapsign.com.br' : 'app.zapsign.com.br'}) ` +
        `e que o botão de ambiente no painel está alinhado com sua conta.`;
    } else if (response.status === 401) {
      friendlyMessage = 'Token inválido ou não autorizado pela ZapSign. Verifique se o token não foi revogado ou alterado no painel da ZapSign.';
    } else if (response.status === 403) {
      friendlyMessage = 'Acesso negado pela ZapSign. Verifique se a sua conta/plano possui permissão de acesso à API.';
    }

    return Response.json({
      ok: false,
      message: friendlyMessage,
      latencyMs,
      environment: isSandbox ? 'sandbox' : 'production',
      status: response.status,
      rawDetail: responseText.slice(0, 300),
    });
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    return Response.json(
      {
        ok: false,
        message: isTimeout
          ? 'Tempo limite esgotado (timeout) ao tentar conectar aos servidores da ZapSign.'
          : `Falha na comunicação de rede com a ZapSign: ${err?.message || 'Erro desconhecido'}`,
      },
      { status: 500 }
    );
  }
}
