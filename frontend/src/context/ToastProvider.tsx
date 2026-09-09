import { useState, useRef, useCallback, useMemo } from 'react';
import { ToastContext } from './ToastContext';
import type { Toast, ToastKind, ToastApi } from './ToastContext';
import Toaster from '../components/Toaster/Toaster';

type Props = { children: React.ReactNode };

const MAX_VISIBLE = 3;
const DURATION: Record<ToastKind, number> = { success: 3500, info: 4000, error: 6000 };

/*
 * App-wide toasts. Any component calls useToast().success(...) or .error(...);
 * the stack renders once, portaled to body, top-centre under the navbar.
 * Newest at the bottom of the stack, oldest dropped past MAX_VISIBLE.
 */
export default function ToastProvider({ children }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((prev) => {
      const next = [...prev, { id, kind, message }];
      /* Drop the oldest so the stack never grows past MAX_VISIBLE */
      while (next.length > MAX_VISIBLE) {
        const dropped = next.shift()!;
        const t = timers.current.get(dropped.id);
        if (t) { clearTimeout(t); timers.current.delete(dropped.id); }
      }
      return next;
    });
    timers.current.set(id, setTimeout(() => dismiss(id), DURATION[kind]));
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
