import { supabase } from './supabaseClient';
import type { Post } from './supabaseClient';

export const POSTS_PAGE_SIZE = 20;

export type PostsQuery = {
  /* all posts the caller can see, or only from people they follow */
  mode?: 'all' | 'following';
  /* only this author's posts */
  author?: string;
  /* exactly this post */
  postId?: string;
};

export type PostsPage = {
  posts: Post[];
  hasMore: boolean;
  error: string | null;
};

/*
 * One read for the feed, a profile or a single post. fetch_posts in
 * schema.sql returns like/comment counts and whether the caller liked it,
 * instead of every like row, and pages by keyset: hand back the last post
 * seen and the next page starts after it.
 */
export async function fetchPosts(q: PostsQuery, before?: Post | null, limit = POSTS_PAGE_SIZE): Promise<PostsPage> {
  const { data, error } = await supabase.rpc('fetch_posts', {
    p_mode: q.mode ?? 'all',
    p_author: q.author ?? null,
    p_post_id: q.postId ?? null,
    p_before: before?.created_at ?? null,
    p_before_id: before?.id ?? null,
    p_limit: limit,
  });
  if (error) return { posts: [], hasMore: false, error: error.message };
  const posts = (data as Post[]) || [];
  return { posts, hasMore: posts.length === limit, error: null };
}
