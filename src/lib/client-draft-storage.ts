import { somenteDigitos } from './documento';

export interface LocalDraftData {
  step: number;
  form: Record<string, any>;
  planoSel?: any;
  parcelaSel?: { qtd: number; valor: number } | null;
  formaPagamento?: string;
  savedAt: string;
}

const DRAFT_PREFIX = 'duolife_draft_';
const TOKEN_PREFIX = 'duolife_client_token_';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * Salva o progresso/rascunho de preenchimento do cliente associado ao token do link.
 */
export function saveLocalDraft(publicToken: string, data: Omit<LocalDraftData, 'savedAt'>): boolean {
  if (!isBrowser() || !publicToken) return false;
  try {
    const payload: LocalDraftData = {
      ...data,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(`${DRAFT_PREFIX}${publicToken}`, JSON.stringify(payload));
    return true;
  } catch (err) {
    // QuotaExceededError ou Storage desabilitado
    return false;
  }
}

/**
 * Recupera o rascunho de preenchimento para o token público informado.
 */
export function loadLocalDraft(publicToken: string): LocalDraftData | null {
  if (!isBrowser() || !publicToken) return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${publicToken}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as LocalDraftData;
  } catch (err) {
    return null;
  }
}

/**
 * Limpa o rascunho do navegador após a conclusão bem-sucedida ou a pedido do usuário.
 */
export function clearLocalDraft(publicToken: string): boolean {
  if (!isBrowser() || !publicToken) return false;
  try {
    window.localStorage.removeItem(`${DRAFT_PREFIX}${publicToken}`);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Gera um token de sessão seguro com prefixo `cst_` (Client Session Token)
 */
export function generateClientSessionToken(): string {
  // Gera token aleatório de alta entropia
  const randomChars = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 36).toString(36)
  ).join('');
  return `cst_${randomChars}_${Date.now()}`;
}

/**
 * Recupera o token de sessão local do cliente associado ao CPF/CNPJ.
 */
export function getClientSessionToken(documentNumber: string): string | null {
  if (!isBrowser() || !documentNumber) return null;
  try {
    const cleanDoc = somenteDigitos(documentNumber);
    if (!cleanDoc) return null;
    return window.localStorage.getItem(`${TOKEN_PREFIX}${cleanDoc}`);
  } catch (err) {
    return null;
  }
}

/**
 * Persiste o token de sessão local do cliente associado ao CPF/CNPJ.
 */
export function setClientSessionToken(documentNumber: string, token: string): boolean {
  if (!isBrowser() || !documentNumber || !token) return false;
  try {
    const cleanDoc = somenteDigitos(documentNumber);
    if (!cleanDoc) return false;
    window.localStorage.setItem(`${TOKEN_PREFIX}${cleanDoc}`, token);
    return true;
  } catch (err) {
    return false;
  }
}
