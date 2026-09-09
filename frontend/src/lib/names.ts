/* What to call someone: their display name when they set one, else the handle. */
export function displayName(p: { username: string; display_name?: string | null }): string {
  return p.display_name?.trim() || p.username;
}
