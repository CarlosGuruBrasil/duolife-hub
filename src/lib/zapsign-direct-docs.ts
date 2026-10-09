import { getZapSignConfig, sanitizeApiToken } from './system-settings';
import { logger } from './logger';

export interface SignatarioZapSignItem {
  nome: string;
  email: string;
  phone?: string | null;
  signaturePattern?: string;
  order?: number;
  sendAutomaticEmail?: boolean;
}

export interface EnviarContratoZapSignParams {
  base64Pdf: string;
  docName: string;
  externalId: string;
  deadlineAt?: string;
  signatario?: {
    nome: string;
    email: string;
    phone?: string | null;
  };
  signatarios?: SignatarioZapSignItem[];
}

export interface ZapSignDocResponse {
  docToken: string;
  signUrl: string;
  signers?: Array<{
    token: string;
    name: string;
    email: string;
    signUrl: string;
    status: string;
  }>;
  rawPayload: any;
}

/**
 * Cria um documento avulso diretamente na ZapSign enviando o PDF em Base64,
 * sem depender de modelos pré-existentes (/api/v1/docs/).
 * Suporta múltiplos signatários com ordem sequencial e âncoras distintas.
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

  // Prepara lista de signatários (usa signatarios se fornecido, senão faz fallback para signatario único)
  const listaSignatarios: SignatarioZapSignItem[] = params.signatarios && params.signatarios.length > 0
    ? params.signatarios
    : params.signatario
      ? [{ ...params.signatario, signaturePattern: '{{assinatura_proponente}}', order: 1, sendAutomaticEmail: true }]
      : [];

  if (listaSignatarios.length === 0) {
    throw new Error('Nenhum signatário informado para criação do documento na ZapSign.');
  }

  const signersPayload = listaSignatarios.map((s, idx) => {
    const rawPhone = String(s.phone || '').replace(/\D/g, '');
    let phoneNumber = rawPhone;
    let phoneCountry = '55';
    if (rawPhone.startsWith('55') && rawPhone.length >= 12) {
      phoneNumber = rawPhone.slice(2);
    }

    return {
      name: s.nome,
      email: s.email || 'suporte@duolife.net.br',
      phone_country: phoneCountry,
      phone_number: phoneNumber || undefined,
      auth_mode: 'signature',
      signature_pattern: s.signaturePattern || (idx === 0 ? '{{assinatura_corretora}}' : '{{assinatura_proponente}}'),
      send_automatic_email: s.sendAutomaticEmail ?? true,
      send_automatic_whatsapp: false,
      ...(s.order !== undefined && s.order !== null ? { order: s.order } : {}),
    };
  });

  const payload: Record<string, any> = {
    name: params.docName,
    base64_pdf: params.base64Pdf,
    sandbox: zapConfig.isSandbox,
    lang: 'pt-br',
    external_id: params.externalId,
    ...(params.deadlineAt ? { deadline_at: params.deadlineAt } : {}),
    signers: signersPayload,
  };

  logger.info(
    {
      docName: params.docName,
      externalId: params.externalId,
      signersCount: signersPayload.length,
      signers: signersPayload.map(s => ({ name: s.name, email: s.email, order: s.order, pattern: s.signature_pattern })),
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

  if (!docToken) {
    logger.error({ body: responseText }, 'zapsign_direct.create_doc.missing_token');
    throw new Error('Resposta da ZapSign não continha o token do documento criado.');
  }

  const signersList = (resJson.signers || []).map((s: any) => ({
    token: s.token || '',
    name: s.name || '',
    email: s.email || '',
    signUrl: s.sign_url || '',
    status: s.status || 'pending',
  }));

  // Resolve o signUrl prioritariamente para o proponente (cliente final)
  const proponenteEmail = params.signatarios?.find(s => s.signaturePattern === '{{assinatura_proponente}}')?.email || params.signatario?.email;
  const proponenteSigner =
    (proponenteEmail ? signersList.find((s: any) => s.email?.toLowerCase() === proponenteEmail.toLowerCase()) : null) ||
    signersList.find((s: any) => s.signUrl && !s.email?.toLowerCase().includes('net4life') && !s.email?.toLowerCase().includes('duolife.com.br')) ||
    signersList[0];

  const signUrl = proponenteSigner?.signUrl || signersList[0]?.signUrl || '';

  return {
    docToken,
    signUrl,
    signers: signersList,
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

