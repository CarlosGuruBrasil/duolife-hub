import { getZapSignConfig, sanitizeApiToken } from './system-settings';
import { logger } from './logger';

export interface EnviarContratoZapSignParams {
  base64Pdf: string;
  docName: string;
  externalId: string;
  deadlineAt?: string;
  signatario: {
    nome: string;
    email: string;
    phone?: string | null;
  };
}

export interface ZapSignDocResponse {
  docToken: string;
  signUrl: string;
  rawPayload: any;
}

/**
 * Cria um documento avulso diretamente na ZapSign enviando o PDF em Base64,
 * sem depender de modelos pré-existentes (/api/v1/docs/).
 */
export async function criarDocumentoZapSignDireto(
  params: EnviarContratoZapSignParams
): Promise<ZapSignDocResponse> {
  const zapConfig = await getZapSignConfig();
  const token = sanitizeApiToken(zapConfig.apiToken);
  const baseUrl = zapConfig.baseUrl;

  if (!token) {
    throw new Error('Token da API ZapSign não configurado nas configurações de sistema.');
  }

  // Limpeza e extração de telefone para signatário
  const rawPhone = String(params.signatario.phone || '').replace(/\D/g, '');
  let phoneNumber = rawPhone;
  let phoneCountry = '55';
  if (rawPhone.startsWith('55') && rawPhone.length >= 12) {
    phoneNumber = rawPhone.slice(2);
  }

  const payload: Record<string, any> = {
    name: params.docName,
    base64_pdf: params.base64Pdf,
    sandbox: zapConfig.isSandbox,
    lang: 'pt-br',
    external_id: params.externalId,
    ...(params.deadlineAt ? { deadline_at: params.deadlineAt } : {}),
    signers: [
      {
        name: params.signatario.nome,
        email: params.signatario.email || 'suporte@duolife.net.br',
        phone_country: phoneCountry,
        phone_number: phoneNumber || undefined,
        auth_mode: 'signature',
        send_automatic_email: false,
        send_automatic_whatsapp: false,
      },
    ],
  };

  logger.info(
    {
      docName: params.docName,
      externalId: params.externalId,
      signer: params.signatario.email,
      isSandbox: zapConfig.isSandbox,
    },
    'zapsign_direct.create_doc.request'
  );

  const response = await fetch(`${baseUrl}/docs/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  if (!response.ok) {
    logger.error(
      { status: response.status, body: responseText, externalId: params.externalId },
      'zapsign_direct.create_doc.failed'
    );
    throw new Error(`Falha na API da ZapSign (/docs/): ${responseText}`);
  }

  const resJson = JSON.parse(responseText);
  const docToken = resJson.token || resJson.doc_token;
  const signUrl = resJson.signers?.[0]?.sign_url || '';

  if (!docToken) {
    logger.error({ body: responseText }, 'zapsign_direct.create_doc.missing_token');
    throw new Error('Resposta da ZapSign não continha o token do documento criado.');
  }

  return {
    docToken,
    signUrl,
    rawPayload: resJson,
  };
}

/**
 * Cancela/deleta um documento pendente na ZapSign (/docs/{token}/).
 * Se o documento não existir ou já tiver sido excluído/cancelado, trata sem quebrar o fluxo.
 */
export async function cancelarDocumentoZapSign(
  docToken: string
): Promise<{ success: boolean; status: number; message?: string }> {
  const cleanToken = String(docToken || '').trim();
  if (!cleanToken) {
    return { success: false, status: 400, message: 'Token de documento inválido ou vazio.' };
  }

  try {
    const zapConfig = await getZapSignConfig();
    const token = sanitizeApiToken(zapConfig.apiToken);
    const baseUrl = zapConfig.baseUrl;

    if (!token) {
      logger.warn({ docToken: cleanToken }, 'zapsign_direct.cancel_doc.missing_api_token');
      return { success: false, status: 500, message: 'Token da API ZapSign não configurado.' };
    }

    logger.info({ docToken: cleanToken }, 'zapsign_direct.cancel_doc.request');
    const response = await fetch(`${baseUrl}/docs/${cleanToken}/`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok || response.status === 204 || response.status === 404) {
      logger.info(
        { docToken: cleanToken, status: response.status },
        'zapsign_direct.cancel_doc.success_or_already_removed'
      );
      return { success: true, status: response.status };
    }

    const responseText = await response.text();
    logger.warn(
      { docToken: cleanToken, status: response.status, body: responseText },
      'zapsign_direct.cancel_doc.warn'
    );
    return { success: false, status: response.status, message: responseText };
  } catch (err) {
    logger.error({ err, docToken: cleanToken }, 'zapsign_direct.cancel_doc.failed');
    return {
      success: false,
      status: 500,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

