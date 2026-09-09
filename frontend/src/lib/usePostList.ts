import { useState, useEffect, useCallback, useRef } from 'react';
import type { Post } from './supabaseClient';
import { fetchPosts } from './posts';
import type { PostsQuery } from './posts';

/*
 * Paged post list for the feed and profile pages.
 * The first page loads in an effect keyed by the query and refreshKey
 * (bump refreshKey to reload in place). loadMore() appends the next keyset
 * page and ignores its own result if the list was reset meanwhile.
 */
export function usePostList(query: PostsQuery, refreshKey = 0, enabled = true) {
  const { mode = 'all', author, postId } = query;
  const key = `${mode}:${author ?? ''}:${postId ?? ''}:${refreshKey}:${enabled ? 1 : 0}`;

  const [posts, setPosts] = useState<Post[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(key);
  const loading = enabled && loadedKey !== key;

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const page = await fetchPosts({ mode, author, postId });
      if (cancelled) return;
      setPosts(page.posts);
      setHasMore(page.hasMore);
      setError(page.error);
      setLoadedKey(key);
    })();
    return () => { cancelled = true; };
  }, [mode, author, postId, key, enabled]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const last = posts[posts.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const page = await fetchPosts({ mode, author, postId }, last);
    /* A tab switch or refresh while this was in flight: that list is gone */
    if (keyRef.current !== key) { setLoadingMore(false); return; }
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...page.posts.filter((p) => !seen.has(p.id))];
    });
    setHasMore(page.hasMore);
    if (page.error) setError(page.error);
    setLoadingMore(false);
  }, [loadingMore, hasMore, posts, mode, author, postId, key]);

  const prepend = useCallback((post: Post) => setPosts((prev) => [post, ...prev]), []);
  const remove = useCallback((id: string) => setPosts((prev) => prev.filter((p) => p.id !== id)), []);

  return { posts, loading, loadingMore, hasMore, error, loadMore, prepend, remove };
}
