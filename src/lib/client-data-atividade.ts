/**
 * Utilitários para parsing, normalização e sincronização da data de atividade profissional
 * e dados cadastrais de clientes e cotações.
 */

/**
 * Converte entradas de datas seguras (YYYY-MM-DD, ISO string ou DD/MM/YYYY) para 'YYYY-MM-DD'.
 * Retorna null se o valor for nulo, indefinido, vazio ou uma data inválida.
 */
export function parseDateInput(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  if (!str) return null;

  let y: string, m: string, d: string;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    [d, m, y] = str.split('/');
  } else if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    [y, m, d] = str.slice(0, 10).split('-');
  } else {
    return null;
  }

  const yearNum = parseInt(y, 10);
  const monthNum = parseInt(m, 10);
  const dayNum = parseInt(d, 10);
  if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum)) return null;
  if (yearNum < 1900 || yearNum > 2100 || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    return null;
  }

  // Validação estrita de calendário para dias inválidos (ex: 31 de fevereiro)
  const checkDate = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
  if (
    checkDate.getUTCFullYear() !== yearNum ||
    checkDate.getUTCMonth() !== monthNum - 1 ||
    checkDate.getUTCDate() !== dayNum
  ) {
    return null;
  }

  return `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
}

/**
 * Extrai a data de atividade profissional a partir de:
 * metadata.dataAtividade || latestClientData.dataAtividade || latestClientData.inicioProfissional || null
 * e formata para 'YYYY-MM-DD'.
 */
export function extractClientDataAtividade(
  metadata?: Record<string, unknown> | null,
  latestClientData?: Record<string, unknown> | null
): string | null {
  const raw =
    (metadata && (metadata.dataAtividade || (metadata as any).data_atividade || (metadata as any).inicioProfissional)) ||
    (latestClientData && (latestClientData.dataAtividade || latestClientData.inicioProfissional || (latestClientData as any).data_atividade)) ||
    null;

  return parseDateInput(raw);
}

export interface SyncQuoteClientDataParams {
  fullName: string;
  documentNumber: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  parsedDataAtividade?: string | null;
  hasDataAtividadePayload?: boolean;
  address?: Record<string, unknown>;
  status?: string;
}

/**
 * Sincroniza e atualiza os dados do cliente dentro do JSONB client_data de uma cotação.
 * Se a cotação estiver em 'contrato_gerado' ou possuir 'contratoToken',
 * sinaliza minutaDesatualizada com o motivo estrito.
 */
export function syncQuoteClientData(
  currentCd: Record<string, unknown>,
  params: SyncQuoteClientDataParams
): Record<string, unknown> {
  const updatedCd: Record<string, unknown> = {
    ...currentCd,
    nome: params.fullName,
    cpfCnpj: params.documentNumber,
    ...(params.email !== undefined ? { email: params.email } : {}),
    ...(params.phone !== undefined ? { celular: params.phone, telefone: params.phone } : {}),
    ...(params.birthDate !== null && params.birthDate !== undefined ? { dataNascto: params.birthDate } : {}),
  };

  if (params.hasDataAtividadePayload) {
    updatedCd.dataAtividade = params.parsedDataAtividade ?? null;
    updatedCd.inicioProfissional = params.parsedDataAtividade ?? null;
  }

  if (params.address) {
    updatedCd.cep = params.address.cep || currentCd.cep;
    updatedCd.logradouro = params.address.logradouro || currentCd.logradouro;
    updatedCd.rua = params.address.logradouro || currentCd.rua;
    updatedCd.numero = params.address.numero || currentCd.numero;
    updatedCd.complemento = params.address.complemento || currentCd.complemento;
    updatedCd.bairro = params.address.bairro || currentCd.bairro;
    updatedCd.cidade = params.address.cidade || currentCd.cidade;
    updatedCd.uf = params.address.uf || currentCd.uf;
  }

  if (params.status === 'contrato_gerado' || Boolean(currentCd.contratoToken)) {
    updatedCd.minutaDesatualizada = true;
    updatedCd.minutaAlteradaEm = new Date().toISOString();
    updatedCd.minutaDesatualizadaMotivo = 'Início profissional ou dados cadastrais do cliente alterados';
  }

  return updatedCd;
}
