import { supabase } from './supabaseClient';

export type ProfileStats = { posts: number; followers: number; following: number };

type StatsRow = { posts_count: number; followers_count: number; following_count: number };

/* The row profile_stats returns, as numbers (counts only posts the caller can see) */
export function parseProfileStats(data: unknown): ProfileStats | null {
  const row = (Array.isArray(data) ? data[0] : data) as StatsRow | null | undefined;
  if (!row) return null;
  return {
    posts: Number(row.posts_count),
    followers: Number(row.followers_count),
    following: Number(row.following_count),
  };
}

/* null when the call fails: callers show dashes */
export async function fetchProfileStats(userId: string): Promise<ProfileStats | null> {
  const { data, error } = await supabase.rpc('profile_stats', { p_user: userId });
  return error ? null : parseProfileStats(data);
}
