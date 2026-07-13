'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { uid } from '@/lib/dates';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  durationMs: number;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (opts: {
    kind?: ToastKind;
    title: string;
    message?: string;
    durationMs?: number;
  }) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (opts: { kind?: ToastKind; title: string; message?: string; durationMs?: number }) => {
      const id = uid('toast');
      const durationMs = opts.durationMs ?? (opts.kind === 'error' ? 7000 : 4200);
      const item: Toast = {
        id,
        kind: opts.kind || 'info',
        title: opts.title,
        message: opts.message,
        durationMs
      };
      setToasts((t) => [...t.slice(-4), item]);
      if (durationMs > 0) {
        window.setTimeout(() => dismiss(id), durationMs);
      }
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      toast,
      success: (title, message) => toast({ kind: 'success', title, message }),
      error: (title, message) => toast({ kind: 'error', title, message }),
      info: (title, message) => toast({ kind: 'info', title, message }),
      dismiss
    }),
    [toasts, toast, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(100vw-2rem,22rem)] flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-3.5 py-3 shadow-panel backdrop-blur-md ${
              t.kind === 'success'
                ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-100'
                : t.kind === 'error'
                  ? 'border-red-500/35 bg-red-500/15 text-red-100'
                  : 'border-surface-500 bg-surface-800/95 text-ink'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t.title}</div>
                {t.message && (
                  <p className="mt-0.5 text-xs leading-relaxed opacity-90">{t.message}</p>
                )}
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md px-1.5 py-0.5 text-xs opacity-70 hover:opacity-100"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
