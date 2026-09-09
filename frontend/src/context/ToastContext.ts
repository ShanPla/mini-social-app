import { createContext, useContext } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

export type ToastApi = {
  /* Short confirmations: [Profile saved], [Post deleted] */
  success: (message: string) => void;
  /* Something the user tried did not happen. Say what, and what to do. */
  error: (message: string) => void;
  info: (message: string) => void;
  dismiss: (id: number) => void;
};

const noop = () => {};

export const ToastContext = createContext<ToastApi>({
  success: noop,
  error: noop,
  info: noop,
  dismiss: noop,
});

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
