/*
 * User input for an ilike() pattern. Without this, `%` matches every
 * user and `_` (common in usernames) matches any single character.
 * Postgres treats backslash as the escape character by default.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
