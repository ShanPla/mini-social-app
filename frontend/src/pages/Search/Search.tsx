import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { Profile } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import './Search.css';
import EmptyState from '../../components/EmptyState/EmptyState';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  usePageTitle(query ? `Search: ${query}` : 'Search');

  useEffect(() => {
    if (query.trim()) fetchResults();
    else setResults([]);
  }, [query]);

  const fetchResults = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${query}%`)
      .limit(20);
    setResults((data as Profile[]) || []);
    setLoading(false);
  };

  return (
    <div className="search-page">
      <div className="search-page-inner">
        <div className="search-page-header">
          <h2>Results for <em>"{query}"</em></h2>
          {!loading && <span className="result-count">{results.length} user{results.length !== 1 ? 's' : ''} found</span>}
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
        ) : results.length === 0 ? (
          <EmptyState icon="search" title={`No users found for "${query}"`} subtitle="Try a different username." />
        ) : (
          <div className="search-results-list">
            {results.map((user) => (
              <Link to={`/profile/${user.id}`} key={user.id} className="search-result-card">
                <div className="result-avatar">
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt={user.username} loading="lazy" />
                    : <span>{user.username[0].toUpperCase()}</span>
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
