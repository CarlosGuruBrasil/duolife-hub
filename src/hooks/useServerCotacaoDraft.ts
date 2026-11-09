'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Rascunho no servidor para o fluxo interno de cotação (portal/admin) — TD-009.
// O fluxo de link público continua usando o rascunho em localStorage (client-draft-storage).

export interface ServerDraftPayload {
  form: Record<string, unknown>;
  planoSel?: unknown;
  parcelaSel?: unknown;
  formaPagamento?: string;
  descontoPercentual?: number;
}

interface Options {
  /** Fluxo interno sem cotação já existente. */
  active: boolean;
  /** Etapa atual: só salva entre 2 e 5 (antes do POST /api/cotacoes). */
  step: number;
  productId?: string | null;
  partnerId?: string | null;
  clientName?: string | null;
  clientCpfCnpj?: string | null;
  payload: ServerDraftPayload;
  onRestore: (payload: ServerDraftPayload, step: number) => void;
  debounceMs?: number;
}

export function useServerCotacaoDraft({
  active,
  step,
  productId,
  partnerId,
  clientName,
  clientCpfCnpj,
  payload,
  onRestore,
  debounceMs = 2000,
}: Options) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [restored, setRestored] = useState(false);
  const [ready, setReady] = useState(false);

  const draftIdRef = useRef<string | null>(null);
  const closedRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSerializedRef = useRef<string>('');
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // 1. Restaura rascunho indicado em ?rascunho=<id>
  useEffect(() => {
    if (!active) {
      setReady(true);
      return;
    }
    const id = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('rascunho')
      : null;
    if (!id) {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/portal/rascunhos/${encodeURIComponent(id)}`);
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && data?.rascunho) {
          const r = data.rascunho;
          draftIdRef.current = r.id;
          setDraftId(r.id);
          setLastSavedAt(r.updated_at ? new Date(r.updated_at) : null);
          const restoredPayload = (r.payload || {}) as ServerDraftPayload;
          onRestoreRef.current(restoredPayload, Number(r.step) || 1);
          setRestored(true);
        }
      } catch {
        // falha de rede: segue com formulário vazio
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const persist = useCallback(async (body: Record<string, unknown>, serialized: string) => {
    if (closedRef.current) return;
    try {
      const res = await fetch('/api/portal/rascunhos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, id: draftIdRef.current }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.rascunho?.id && !closedRef.current) {
        draftIdRef.current = data.rascunho.id;
        setDraftId(data.rascunho.id);
        setLastSavedAt(new Date());
        lastSerializedRef.current = serialized;
      }
    } catch {
      // autosave é best-effort; tenta de novo na próxima alteração
    }
  }, []);

  // 2. Autosave com debounce entre as etapas 2 e 5
  const hasIdentity = Boolean((clientName || '').trim() || (clientCpfCnpj || '').trim());
  const serialized = JSON.stringify({ step, productId, partnerId, payload });

  useEffect(() => {
    if (!active || !ready || closedRef.current) return;
    if (step < 2 || step > 5 || !hasIdentity) return;
    if (serialized === lastSerializedRef.current) return;

    const timer = setTimeout(() => {
      const body = {
        step,
        productId: productId || null,
        partnerId: partnerId || null,
        clientName: clientName || null,
        clientCpfCnpj: clientCpfCnpj || null,
        payload,
      };
      queueRef.current = queueRef.current.then(() => persist(body, serialized));
    }, debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready, serialized, hasIdentity, debounceMs, persist]);

  /** Encerra o rascunho: a cotação real foi criada. */
  const close = useCallback(() => {
    closedRef.current = true;
    const id = draftIdRef.current;
    draftIdRef.current = null;
    setDraftId(null);
    if (!id) return;
    queueRef.current = queueRef.current.then(async () => {
      try {
        await fetch(`/api/portal/rascunhos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {
        // expira sozinho em 30 dias
      }
    });
  }, []);

  /** Descarta o rascunho a pedido do usuário e volta a permitir um novo. */
  const discard = useCallback(async () => {
    const id = draftIdRef.current;
    closedRef.current = true;
    await queueRef.current;
    if (id) {
      try {
        await fetch(`/api/portal/rascunhos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {
        // ignore
      }
    }
    draftIdRef.current = null;
    lastSerializedRef.current = '';
    setDraftId(null);
    setLastSavedAt(null);
    setRestored(false);
    closedRef.current = false;
  }, []);

  return { draftId, lastSavedAt, restored, close, discard };
}
