import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Guarda de efeitos colaterais externos (e-mails, gatilhos, geração de cobranças).
 *
 * Usada no reprocessamento administrativo de webhooks: por padrão o admin reexecuta
 * apenas a atualização de estado interno, sem disparar notificações nem criar cobranças.
 * Somente quando o admin marca explicitamente "permitir disparos" os efeitos rodam.
 */
interface SideEffectsContext {
  suppressed: boolean;
  reason: string;
}

const storage = new AsyncLocalStorage<SideEffectsContext>();

export function runWithSideEffectsSuppressed<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ suppressed: true, reason }, fn);
}

export function getSideEffectsSuppression(): SideEffectsContext | null {
  const ctx = storage.getStore();
  return ctx?.suppressed ? ctx : null;
}
