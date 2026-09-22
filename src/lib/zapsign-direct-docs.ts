import { getZapSignConfig, sanitizeApiToken } from './system-settings';
import { logger } from './logger';

export interface EnviarContratoZapSignParams {
  base64Pdf: string;
  docName: string;
  externalId: string;
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

  const payload = {
    name: params.docName,
    base64_pdf: params.base64Pdf,
    sandbox: zapConfig.isSandbox,
    lang: 'pt-br',
    external_id: params.externalId,
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
