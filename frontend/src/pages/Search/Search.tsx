import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { Profile } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { escapeLike } from '../../lib/search';
import './Search.css';
import EmptyState from '../../components/EmptyState/EmptyState';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q')?.trim() || '';
  const [results, setResults] = useState<Profile[]>([]);
  /* Which query the results belong to. Loading is derived, so the effect
     never has to set state synchronously. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = !!query && loadedFor !== query;

  usePageTitle(query ? `Search: ${query}` : 'Search');

  useEffect(() => {
    if (!query) return;
    /* A slow earlier search must not overwrite a faster later one */
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${escapeLike(query)}%`)
        .limit(20);
      if (cancelled) return;
      setResults((data as Profile[]) || []);
      setLoadedFor(query);
    })();
    return () => { cancelled = true; };
  }, [query]);

  const shown = query ? results : [];

  return (
    <div className="search-page">
      <div className="search-page-inner">
        <div className="search-page-header">
          <h2>Results for <em>"{query}"</em></h2>
          {!loading && <span className="result-count">{shown.length} user{shown.length !== 1 ? 's' : ''} found</span>}
        </div>

        {loading ? (
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
        ) : shown.length === 0 ? (
          <EmptyState icon="search" title={`No users found for "${query}"`} subtitle="Try a different username." />
        ) : (
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
                  <span className="result-username">@{user.username}</span>
                  {user.bio && <span className="result-bio">{user.bio}</span>}
                </div>
                <span className="result-arrow">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
