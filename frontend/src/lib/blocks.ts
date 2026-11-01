import { supabase } from './supabaseClient';
import type { Profile } from './supabaseClient';

/*
 * Blocking and saving, the thin database calls. The effects of a block
 * (hidden posts, no DMs, follows removed) are all done by the database.
 * select on blocks and saved_posts only ever returns your own rows.
 */
export async function blockUser(userId: string) {
  const { error } = await supabase.from('blocks').insert({ blocked_id: userId });
  /* 23505: already blocked, which is the state that was asked for */
  return error && error.code !== '23505' ? error : null;
}

export async function unblockUser(userId: string) {
  const { error } = await supabase.from('blocks').delete().eq('blocked_id', userId);
  return error ?? null;
}

/* Whether you blocked this person */
export async function haveBlocked(userId: string): Promise<boolean> {
  const { data } = await supabase.from('blocks').select('blocked_id').eq('blocked_id', userId).maybeSingle();
  return !!data;
}

/* Ids of everyone you blocked */
export async function fetchBlockedIds(): Promise<string[] | null> {
  const { data, error } = await supabase.from('blocks').select('blocked_id').order('created_at', { ascending: false });
  if (error) return null;
  return (data ?? []).map((r) => r.blocked_id as string);
}

/* The people you blocked, newest block first, in two reads */
export async function fetchBlockedProfiles(): Promise<Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>[] | null> {
  const ids = await fetchBlockedIds();
  if (!ids) return null;
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', ids);
  if (error) return null;
  const byId = new Map((data ?? []).map((p) => [p.id as string, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
}

export async function savePost(postId: string) {
  const { error } = await supabase.from('saved_posts').insert({ post_id: postId });
  /* 23505: already saved */
  return error && error.code !== '23505' ? error : null;
}

export async function unsavePost(postId: string) {
  const { error } = await supabase.from('saved_posts').delete().eq('post_id', postId);
  return error ?? null;
}
