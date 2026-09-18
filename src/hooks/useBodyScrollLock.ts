'use client';

import { useEffect } from 'react';

let lockCount = 0;
let originalOverflow = '';

/**
 * useBodyScrollLock
 *
 * Trava o scroll do body quando isLocked for true e garante a restauração
 * limpa e perfeita do scroll ao fechar ou desmontar o componente.
 *
 * Suporta múltiplos modais/drawers abertos simultaneamente sem corromper
 * o estilo original do DOM (contador com locks aninhados).
 */
export function useBodyScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked || typeof document === 'undefined') return;

    if (lockCount === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        if (originalOverflow && originalOverflow !== 'hidden') {
          document.body.style.overflow = originalOverflow;
        } else {
          document.body.style.overflow = '';
          document.body.style.removeProperty('overflow');
        }
      }
    };
  }, [isLocked]);
}

export default useBodyScrollLock;
