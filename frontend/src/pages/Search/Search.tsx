import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { Profile } from '../../lib/supabaseClient';
import './Search.css';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

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
          <h2>Search results for <em>"{query}"</em></h2>
          <span className="result-count">{results.length} user{results.length !== 1 ? 's' : ''} found</span>
        </div>

        {loading ? (
          <div className="search-loading">
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        ) : results.length === 0 ? (
          <div className="search-empty">
            <span>✦</span>
            <p>No users found for "<strong>{query}</strong>"</p>
          </div>
        ) : (
          <div className="search-results-list">
            {results.map((user) => (
              <Link to={`/profile/${user.id}`} key={user.id} className="search-result-card">
                <div className="result-avatar">
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt={user.username} />
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
