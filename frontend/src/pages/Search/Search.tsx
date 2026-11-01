import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { Profile } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { escapeLike } from '../../lib/search';
import { displayName } from '../../lib/names';
import './Search.css';
import EmptyState from '../../components/EmptyState/EmptyState';
import LoadMore from '../../components/LoadMore/LoadMore';

const PAGE_SIZE = 20;

/* Alphabetical by username (unique), so the next page is simply "after the last one seen" */
async function searchUsers(query: string, after?: string) {
  let q = supabase
    .from('profiles')
    .select('*')
    .ilike('username', `%${escapeLike(query)}%`)
    .order('username', { ascending: true })
    .limit(PAGE_SIZE + 1);
  if (after) q = q.gt('username', after);
  const { data, error } = await q;
  const rows = (data as Profile[]) || [];
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, error: !!error };
}

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q')?.trim() || '';
  const [results, setResults] = useState<Profile[]>([]);
  /* Which query the results belong to. Loading is derived, so the effect
     never has to set state synchronously. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  /* Bumped by Retry to run the same search again */
  const [version, setVersion] = useState(0);
  const key = `${query}:${version}`;
  const keyRef = useRef(key);
  const loading = !!query && loadedFor !== key;

  usePageTitle(query ? `Search: ${query}` : 'Search');

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    if (!query) return;
    /* A slow earlier search must not overwrite a faster later one */
    let cancelled = false;
    (async () => {
      const page = await searchUsers(query);
      if (cancelled) return;
      setResults(page.rows);
      setHasMore(page.hasMore);
      setFailed(page.error);
      setMoreFailed(false);
      setLoadedFor(key);
    })();
    return () => { cancelled = true; };
  }, [query, key]);

  const loadMore = useCallback(async () => {
    const last = results[results.length - 1];
    if (!last || loadingMore || !hasMore) return;
    const startedFor = key;
    setLoadingMore(true);
    setMoreFailed(false);
    const page = await searchUsers(query, last.username);
    if (keyRef.current !== startedFor) { setLoadingMore(false); return; }
    if (page.error) {
      setMoreFailed(true);
      setLoadingMore(false);
      return;
    }
    setResults((prev) => {
      const seen = new Set(prev.map((u) => u.id));
      return [...prev, ...page.rows.filter((u) => !seen.has(u.id))];
    });
    setHasMore(page.hasMore);
    setLoadingMore(false);
  }, [results, loadingMore, hasMore, key, query]);

  const shown = query ? results : [];

  return (
    <div className="search-page">
      <div className="search-page-inner">
        <div className="search-page-header">
          {query
            ? <h1>Results for <em>"{query}"</em></h1>
            : <h1>Search</h1>}
          {query && !loading && !failed && (
            <span className="result-count">{shown.length}{hasMore ? '+' : ''} user{shown.length !== 1 ? 's' : ''} found</span>
          )}
        </div>

        {!query ? (
          <EmptyState icon="search" title="Type a name to search" subtitle="Use the search bar above to find people by username." />
        ) : loading ? (
          <div className="search-skeletons">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-result">
                <div className="skeleton-avatar-sm" />
                <div className="skeleton-info">
                  <div className="skeleton-line short" />
                  <div className="skeleton-line medium" />
                </div>
              </div>
            ))}
          </div>
        ) : failed ? (
          <EmptyState
            icon="alert"
            title="Could not search right now"
            subtitle="Check your connection and try again."
            action={<button type="button" className="btn-ghost" onClick={() => setVersion((v) => v + 1)}>Retry</button>}
          />
        ) : shown.length === 0 ? (
          <EmptyState icon="search" title={`No users found for "${query}"`} subtitle="Try a different username." />
        ) : (
          <>
          <div className="search-results-list">
            {shown.map((user) => (
              <Link to={`/profile/${user.id}`} key={user.id} className="search-result-card">
                <div className="result-avatar">
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt={user.username} loading="lazy" />
                    : <span>{(user.username[0] || '?').toUpperCase()}</span>
                  }
                </div>
                <div className="result-info">
                  <span className="result-username">{displayName(user)}</span>
                  {user.display_name && <span className="result-handle">@{user.username}</span>}
                  {user.bio && <span className="result-bio">{user.bio}</span>}
                </div>
                <span className="result-arrow">→</span>
              </Link>
            ))}
          </div>
          <LoadMore hasMore={hasMore} loading={loadingMore} onMore={loadMore} failed={moreFailed} endLabel="That is everyone" />
          </>
        )}
      </div>
    </div>
  );
}
