import { supabase } from './supabaseClient';

export type FoundProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
};

/*
 * People search through the search_profiles RPC: contains-match on username
 * or display name, ordered by username, blocked pairs left out. The server
 * treats % and _ literally, so the query is passed as typed. For the next
 * page pass the last username seen as after.
 */
export async function searchProfiles(q: string, after?: string | null, limit = 20) {
  const { data, error } = await supabase.rpc('search_profiles', {
    q,
    p_after: after ?? null,
    p_limit: limit,
  });
  return { rows: (data as FoundProfile[] | null) ?? [], error: error ?? null };
}
