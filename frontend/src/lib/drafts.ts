/*
 * Unfinished post text, kept on this device only so a reload or a trip to
 * another page does not lose it. Keys carry the user id, so another account
 * on the same browser never sees it. Cleared on publish and on logout. Storage
 * can throw (private mode, blocked site data), so every call is wrapped and
 * a failure just means no draft.
 */
const PREFIX = 'chronicle-draft:';

export function readDraft(key: string): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? '';
  } catch {
    return '';
  }
}

export function writeDraft(key: string, value: string): void {
  try {
    if (value.trim()) localStorage.setItem(PREFIX + key, value);
    else localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable: the draft is simply not kept */
  }
}

export function clearAllDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* nothing to clear if storage is unavailable */
  }
}
