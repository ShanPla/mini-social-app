import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Profile } from '../../lib/supabaseClient';
import { escapeLike } from '../../lib/search';
import { displayName } from '../../lib/names';
import './SearchBar.css';

export default function SearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  /* Results remember which query produced them, so a stale list is never
     shown for a newer query and loading needs no state of its own */
  const [results, setResults] = useState<{ q: string; list: Profile[] }>({ q: '', list: [] });
  const [showDropdown, setShowDropdown] = useState(false);
  const q = query.trim();
  const shown = results.q === q ? results.list : [];
  const loading = !!q && results.q !== q;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* Close dropdown when clicking outside */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* Debounced search */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!q) return;

    let cancelled = false;
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio, avatar_url')
        .ilike('username', `%${escapeLike(q)}%`)
        .limit(6);
      if (cancelled) return;
      setResults({ q, list: (data as Profile[]) || [] });
      setShowDropdown(true);
    }, 300);

    /* Unmount or a new keystroke: drop the pending timer and any in-flight result */
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      setShowDropdown(false);
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
    if (e.key === 'Escape') setShowDropdown(false);
  };

  const handleResultClick = () => {
    setQuery('');
    setShowDropdown(false);
  };

  return (
    <div className="searchbar-wrapper" ref={wrapperRef}>
      <div className="searchbar-inner">
        <div className="searchbar-input-wrap">
          {/* Search icon */}
          <Search size={15} className="searchbar-icon" />
          <input
            type="text"
            className="searchbar-input"
            placeholder="Search users…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => shown.length > 0 && setShowDropdown(true)}
          />
          {/* Loading spinner */}
          {loading && <span className="searchbar-spinner">✦</span>}
          {/* Clear button */}
          {query && (
            <button
              className="searchbar-clear"
              onClick={() => { setQuery(''); setShowDropdown(false); }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {showDropdown && q && !loading && (
          <div className="searchbar-dropdown">
            {shown.length === 0 ? (
              <div className="dropdown-empty">No users found</div>
            ) : (
              <>
                {shown.map((user) => (
                  <Link
                    to={`/profile/${user.id}`}
                    key={user.id}
                    className="dropdown-item"
                    onClick={handleResultClick}
                  >
                    <div className="dropdown-avatar">
                      {user.avatar_url
                        ? <img src={user.avatar_url} alt={user.username} loading="lazy" />
                        : <span>{(user.username[0] || '?').toUpperCase()}</span>
                      }
                    </div>
                    <div className="dropdown-info">
                      <span className="dropdown-username">{displayName(user)}</span>
                      {user.display_name && <span className="dropdown-handle">@{user.username}</span>}
                      {user.bio && <span className="dropdown-bio">{user.bio}</span>}
                    </div>
                  </Link>
                ))}
                <button
                  className="dropdown-see-all"
                  onClick={() => {
                    setShowDropdown(false);
                    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
                  }}
                >
                  See all results for "<strong>{query}</strong>" →
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
