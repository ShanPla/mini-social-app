import { useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../../lib/useScrollLock';
import { useDialog } from '../../lib/useDialog';
import './ConfirmModal.css';

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
};

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useScrollLock();
  /* Focus lands on Cancel (first in the box), the safe choice; Escape cancels */
  useDialog(boxRef, onCancel);

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-box"
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title" id={`${id}-title`}>{title}</h3>
        <p className="modal-message" id={`${id}-message`}>{message}</p>
        <div className="modal-actions">
          <button className="modal-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`modal-confirm ${danger ? 'modal-confirm--danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
