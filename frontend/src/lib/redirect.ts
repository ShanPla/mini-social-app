/*
 * Where to send someone after they sign in: the page they first asked for.
 * App puts it in the router state as `from` when it bounces a signed-out
 * visitor to /login. Only a same-site path is accepted, so a crafted link
 * can never turn the login page into an open redirect.
 */
export type FromState = { from?: unknown } | null | undefined;

export function safeRedirect(from: unknown): string | null {
  if (typeof from !== 'string') return null;
  /* Must be a path on this site: one leading slash, not // or /\ (both read as another host) */
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return null;
  /* Control characters (a newline in a path) are never legitimate */
  for (const ch of from) if (ch.charCodeAt(0) < 32) return null;
  /* Never loop back into the sign-in pages themselves */
  if (/^\/(login|register|forgot-password|reset-password)(\/|\?|#|$)/.test(from)) return null;
  return from;
}

export function redirectTarget(state: FromState, fallback = '/feed'): string {
  return safeRedirect(state?.from) ?? fallback;
}
