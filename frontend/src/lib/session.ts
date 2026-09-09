/*
 * Tells the session watcher that the next sign-out was the user clicking
 * Logout, so it does not announce an expired session for it.
 */
let intentional = false;

export function markIntentionalSignOut(): void {
  intentional = true;
}

export function consumeIntentionalSignOut(): boolean {
  const was = intentional;
  intentional = false;
  return was;
}
