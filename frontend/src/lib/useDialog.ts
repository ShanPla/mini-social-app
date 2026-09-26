import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/*
 * Keyboard behaviour shared by every modal:
 * - focus moves into the dialog when it opens (unless a field inside already
 *   took it with autoFocus),
 * - Tab and Shift+Tab stay inside it,
 * - Escape closes it,
 * - focus goes back to whatever opened it when it closes.
 * Dialogs can stack (a confirm over the conversation panel): only the top
 * one reacts to keys, so Escape closes one layer at a time.
 */

const stack: HTMLElement[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), ' +
  'textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  /* Read during render, before any autoFocus inside the dialog moves focus */
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    stack.push(dialog);

    if (!dialog.contains(document.activeElement)) {
      (focusables(dialog)[0] ?? dialog).focus({ preventScroll: true });
    }

    const handleKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== dialog) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(dialog);
      if (items.length === 0) { e.preventDefault(); dialog.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      const i = stack.lastIndexOf(dialog);
      if (i !== -1) stack.splice(i, 1);
      /* Give focus back only if it is still ours to give: the opener exists
         and focus has not already moved somewhere meaningful */
      const active = document.activeElement;
      const lost = !active || active === document.body || dialog.contains(active);
      if (lost && opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref, opener]);
}
