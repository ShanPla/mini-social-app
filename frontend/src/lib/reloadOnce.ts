/*
 * After a deploy, a tab that still holds the old index.html asks for hashed
 * chunks that no longer exist. One reload fixes it. This decides whether that
 * reload may happen: only if the decision can be remembered, and not more than
 * once per window, so a genuinely broken build shows an error card instead of
 * spinning the tab forever.
 */
const RELOAD_FLAG = 'chunk-reload-at';
const WINDOW_MS = 15000;

/* What browsers and Vite say when a lazily loaded chunk or its CSS is missing */
const CHUNK_LOAD_ERROR = /(dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk|Loading CSS chunk)/i;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return CHUNK_LOAD_ERROR.test(message);
}

/* True when a reload is allowed now. Does not reload; the caller does. */
export function canReloadForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
    return Date.now() - last > WINDOW_MS;
  } catch {
    /* Storage blocked: nothing could stop a loop, so do not start one */
    return false;
  }
}

/* Records the reload and performs it. Returns false if it was not allowed. */
export function reloadForStaleChunk(): boolean {
  if (!canReloadForStaleChunk()) return false;
  try {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
