import React from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string;
  title?: string;
  duration?: number;
  description?: React.ReactNode;
  action?: ToastAction;
}

export interface ToastItem extends ToastOptions {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
  duration: number;
}

/**
 * Padrão rigoroso de temporização solicitado pelo usuário:
 * - 6 segundos para erros (6000ms)
 * - 5 segundos para alertas (5000ms)
 * - 4 segundos para sucesso (4000ms)
 */
export const DEFAULT_TOAST_DURATIONS: Record<ToastType, number> = {
  error: 6000,
  warning: 5000,
  success: 4000,
  info: 4000,
};

type ToastListener = (toasts: ToastItem[]) => void;

class ToastManager {
  private listeners: Set<ToastListener> = new Set();
  private toasts: ToastItem[] = [];

  private notify() {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  show(type: ToastType, message: string, options?: ToastOptions): string {
    const id = options?.id || `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const duration = options?.duration ?? DEFAULT_TOAST_DURATIONS[type];

    const newItem: ToastItem = {
      ...options,
      id,
      type,
      message,
      duration,
      createdAt: Date.now(),
    };

    // Remove toast com mesmo id se já existir
    this.toasts = this.toasts.filter((t) => t.id !== id);
    // Adiciona o novo toast no topo (limita a 5 simultâneos para evitar saturação)
    this.toasts = [newItem, ...this.toasts].slice(0, 5);
    this.notify();

    return id;
  }

  success(message: string, options?: ToastOptions): string {
    return this.show('success', message, options);
  }

  error(message: string, options?: ToastOptions): string {
    return this.show('error', message, options);
  }

  warning(message: string, options?: ToastOptions): string {
    return this.show('warning', message, options);
  }

  alert(message: string, options?: ToastOptions): string {
    return this.warning(message, options);
  }

  info(message: string, options?: ToastOptions): string {
    return this.show('info', message, options);
  }

  dismiss(id?: string): void {
    if (!id) {
      this.clear();
      return;
    }
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clear(): void {
    this.toasts = [];
    this.notify();
  }
}

export const toastManager = new ToastManager();

export const toast = {
  success: (message: string, options?: ToastOptions) => toastManager.success(message, options),
  error: (message: string, options?: ToastOptions) => toastManager.error(message, options),
  warning: (message: string, options?: ToastOptions) => toastManager.warning(message, options),
  alert: (message: string, options?: ToastOptions) => toastManager.alert(message, options),
  info: (message: string, options?: ToastOptions) => toastManager.info(message, options),
  dismiss: (id?: string) => toastManager.dismiss(id),
  clear: () => toastManager.clear(),
};
