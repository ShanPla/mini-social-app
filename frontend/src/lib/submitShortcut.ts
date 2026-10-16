/*
 * Ctrl+Enter (Cmd+Enter on a Mac) sends a form from inside a textarea,
 * where plain Enter has to stay a new line.
 */

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'isComposing'>;

export function isSubmitShortcut(e: KeyLike): boolean {
  /* isComposing: Enter that confirms an IME word (Japanese, Chinese…) is not a send */
  return e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/* What to show in a tooltip, and the matching aria-keyshortcuts value */
export const SUBMIT_SHORTCUT_LABEL = isMac ? '⌘+Enter' : 'Ctrl+Enter';
export const SUBMIT_SHORTCUT_ARIA = 'Control+Enter Meta+Enter';
