import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { Toast } from '../../context/ToastContext';
import './Toaster.css';

type Props = {
  toasts: Toast[];
  onDismiss: (id: number) => void;
};

const ICONS = {
  success: <CheckCircle2 size={16} />,
  error: <AlertCircle size={16} />,
  info: <Info size={16} />,
};

/* Presentational stack. State lives in ToastProvider. */
export default function Toaster({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span className="toast-icon">{ICONS[t.kind]}</span>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss" title="Dismiss">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
