import { useEffect } from 'react';

let locks = 0;

/*
 * Body scroll lock shared by every modal and lightbox. Counted, so when a
 * confirm dialog opens on top of another modal, closing the dialog does not
 * unlock the page underneath the modal that is still open.
 */
export function useScrollLock(): void {
  useEffect(() => {
    locks += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      locks = Math.max(0, locks - 1);
      if (locks === 0) document.body.style.overflow = '';
    };
  }, []);
}
