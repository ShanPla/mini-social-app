/*
 * Turn a Supabase error into one line a person can act on.
 *
 * Server-raised errors (rate limits in schema.sql) already carry a
 * friendly message, so those pass through. Everything else gets the
 * caller's fallback: the raw PostgREST text is rarely helpful.
 */
type DbError = { code?: string; message?: string; hint?: string } | null | undefined;

export function describeError(error: DbError, fallback: string): string {
  if (!error) return fallback;
  /* P0001 = raise exception in a trigger; hint rate_limit marks ours */
  if (error.code === 'P0001' && error.message) return error.message;
  /* 23505 = unique violation */
  if (error.code === '23505') return 'That already exists.';
  return fallback;
}
