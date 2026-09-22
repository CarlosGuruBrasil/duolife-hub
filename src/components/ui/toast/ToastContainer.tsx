'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import {
  toastManager,
  type ToastItem,
  type ToastType,
} from './toast';

const TOAST_ICONS: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_STYLES: Record<
  ToastType,
  {
    container: string;
    iconWrapper: string;
    iconColor: string;
    titleColor: string;
    progressBar: string;
    badgeLabel: string;
  }
> = {
  success: {
    container: 'border-emerald-200/90 bg-white text-emerald-950 shadow-emerald-900/5',
    iconWrapper: 'bg-emerald-100/70 text-emerald-600',
    iconColor: 'text-emerald-600',
    titleColor: 'text-emerald-900',
    progressBar: 'bg-emerald-500',
    badgeLabel: 'Sucesso',
  },
  error: {
    container: 'border-rose-200/90 bg-white text-rose-950 shadow-rose-900/5',
    iconWrapper: 'bg-rose-100/70 text-rose-600',
    iconColor: 'text-rose-600',
    titleColor: 'text-rose-900',
    progressBar: 'bg-rose-500',
    badgeLabel: 'Erro',
  },
  warning: {
    container: 'border-amber-200/90 bg-white text-amber-950 shadow-amber-900/5',
    iconWrapper: 'bg-amber-100/70 text-amber-600',
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-900',
    progressBar: 'bg-amber-500',
    badgeLabel: 'Atenção',
  },
  info: {
    container: 'border-sky-200/90 bg-white text-sky-950 shadow-sky-900/5',
    iconWrapper: 'bg-sky-100/70 text-sky-600',
    iconColor: 'text-sky-600',
    titleColor: 'text-sky-900',
    progressBar: 'bg-sky-500',
    badgeLabel: 'Informação',
  },
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const [remainingTime, setRemainingTime] = useState(toast.duration);
  const [isPaused, setIsPaused] = useState(false);
  const startTimeRef = useRef(Date.now());
  const remainingAtPauseRef = useRef(toast.duration);

  useEffect(() => {
    if (toast.duration <= 0) return;

    if (isPaused) return;

    startTimeRef.current = Date.now();
    remainingAtPauseRef.current = remainingTime;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const nextRemaining = Math.max(0, remainingAtPauseRef.current - elapsed);
      setRemainingTime(nextRemaining);

      if (nextRemaining <= 0) {
        clearInterval(interval);
        toastManager.dismiss(toast.id);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isPaused, toast.duration, toast.id]);

  const style = TOAST_STYLES[toast.type];
  const Icon = TOAST_ICONS[toast.type];
  const progressPercent = toast.duration > 0 ? (remainingTime / toast.duration) * 100 : 0;

  return (
    <div
      role="alert"
      aria-live="assertive"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`pointer-events-auto relative w-full overflow-hidden rounded-2xl border bg-white/95 p-4 shadow-xl backdrop-blur-md transition-all duration-200 hover:shadow-2xl animate-in fade-in slide-in-from-top-3 ${style.container}`}
    >
      <div className="flex items-start gap-3">
        {/* Ícone Contextual */}
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${style.iconWrapper}`}>
          <Icon className="h-4 w-4" />
        </div>

        {/* Conteúdo do Toast */}
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-extrabold uppercase tracking-wider ${style.titleColor}`}>
              {toast.title || style.badgeLabel}
            </span>
          </div>

          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-gray-800 break-words">
            {toast.message}
          </p>

          {toast.description && (
            <div className="mt-1.5 text-xs text-gray-600">
              {toast.description}
            </div>
          )}

          {toast.action && (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                }}
                className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-gray-800 transition-colors cursor-pointer"
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>

        {/* Botão Fechar */}
        <button
          type="button"
          onClick={() => toastManager.dismiss(toast.id)}
          aria-label="Fechar notificação"
          className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Barra de Progresso do Tempo de Exibição */}
      {toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100">
          <div
            className={`h-full transition-all duration-75 ease-linear ${style.progressBar}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toastManager.subscribe((items) => {
      setToasts(items);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notificações do Sistema"
      className="fixed top-4 right-4 sm:top-5 sm:right-5 z-[99999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none px-3 sm:px-0"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

export default ToastContainer;
