import { supabase } from './supabaseClient';

/*
 * Resolves @usernames to profile ids so a mention can link to the profile.
 * Lookups are batched: names asked for in the same moment go out as one
 * profiles query. Answers are kept for the life of the page; null means no
 * such person, which keeps the text plain.
 */
const known = new Map<string, string | null>();
const waiting = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function cachedProfileId(username: string): string | null | undefined {
  return known.get(username);
}

async function flush() {
  timer = null;
  const names = [...waiting];
  waiting.clear();
  if (names.length === 0) return;
  const { data, error } = await supabase.from('profiles').select('id, username').in('username', names);
  if (error) {
    /* Leave them unknown, so the text stays plain and a later render can ask again */
    return;
  }
  const found = new Map((data ?? []).map((p) => [p.username as string, p.id as string]));
  for (const n of names) known.set(n, found.get(n) ?? null);
  listeners.forEach((fn) => fn());
}

/* Queues the names not seen yet; calls back once an answer has landed */
export function requestProfileIds(names: string[], onResolved: () => void): () => void {
  const missing = names.filter((n) => !known.has(n));
  if (missing.length === 0) return () => {};
  listeners.add(onResolved);
  missing.forEach((n) => waiting.add(n));
  if (!timer) timer = setTimeout(() => { void flush(); }, 20);
  return () => { listeners.delete(onResolved); };
}
