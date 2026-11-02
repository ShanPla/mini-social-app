import { useState, useEffect, useCallback, useRef } from 'react';
import type { Post } from './supabaseClient';
import { fetchPosts } from './posts';
import type { PostsQuery } from './posts';

/* The first page, with any post published while it was loading in front: the
   query may have run before that post existed. */
export function keepPublished(published: Post[], page: Post[]): Post[] {
  if (published.length === 0) return page;
  const inPage = new Set(page.map((p) => p.id));
  return [...published.filter((p) => !inPage.has(p.id)), ...page];
}

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
  /* A failed Load more keeps the list and hasMore, so it can be retried */
  const [moreError, setMoreError] = useState<string | null>(null);
  const keyRef = useRef(key);
  /* Posts added with prepend since the first page started loading */
  const publishedRef = useRef<Post[]>([]);
  const loading = enabled && loadedKey !== key;

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    publishedRef.current = [];
    (async () => {
      const page = await fetchPosts({ mode, author, postId });
      if (cancelled) return;
      setPosts(keepPublished(publishedRef.current, page.posts));
      setHasMore(page.hasMore);
      setError(page.error);
      setMoreError(null);
      setLoadedKey(key);
    })();
    return () => { cancelled = true; };
  }, [mode, author, postId, key, enabled]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const last = posts[posts.length - 1];
    if (!last) return;
    setLoadingMore(true);
    setMoreError(null);
    const page = await fetchPosts({ mode, author, postId }, last);
    /* A tab switch or refresh while this was in flight: that list is gone */
    if (keyRef.current !== key) { setLoadingMore(false); return; }
    if (page.error) {
      setMoreError(page.error);
      setLoadingMore(false);
      return;
    }
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...page.posts.filter((p) => !seen.has(p.id))];
    });
    setHasMore(page.hasMore);
    setLoadingMore(false);
  }, [loadingMore, hasMore, posts, mode, author, postId, key]);

  /* Drops any copy already in the list: a refetch can land while a post is
     still being published, and the new post would otherwise show twice */
  const prepend = useCallback((post: Post) => {
    publishedRef.current = [post, ...publishedRef.current.filter((p) => p.id !== post.id)];
    setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);
  }, []);
  const remove = useCallback((id: string) => {
    publishedRef.current = publishedRef.current.filter((p) => p.id !== id);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);
  /* After a block: everything by that author leaves the list */
  const removeByAuthor = useCallback((userId: string) => setPosts((prev) => prev.filter((p) => p.user_id !== userId)), []);

  return { posts, loading, loadingMore, hasMore, error, moreError, loadMore, prepend, remove, removeByAuthor };
}
