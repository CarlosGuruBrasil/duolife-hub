'use client';

import { useEffect } from 'react';
import { toast } from './toast';

interface ToastOnMountProps {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

/**
 * Componente cliente sem renderização visual no DOM que dispara um Toast
 * imediatamente ao ser montado. Ideal para Server Components ou páginas
 * que recebem feedback via query params / searchParams.
 */
export function ToastOnMount({ message, type = 'info', duration }: ToastOnMountProps) {
  useEffect(() => {
    if (!message) return;
    if (type === 'error') {
      toast.error(message, { duration });
    } else if (type === 'warning') {
      toast.warning(message, { duration });
    } else if (type === 'success') {
      toast.success(message, { duration });
    } else {
      toast.info(message, { duration });
    }
  }, [message, type, duration]);

  return null;
}
