import { useState, useEffect, useRef, useId } from 'react';
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
  /* Highlighted suggestion for the arrow keys; focus itself stays in the input */
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
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

  const open = showDropdown && !!q && !loading;
  /* Suggestions are the users plus [See all results] at the end */
  const optionCount = open && shown.length > 0 ? shown.length + 1 : 0;
  const active = activeIndex < optionCount ? activeIndex : -1;
  const optionId = (i: number) => `${listId}-${i}`;

  const goToResults = () => {
    setShowDropdown(false);
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open) { if (shown.length > 0) setShowDropdown(true); return; }
      if (optionCount === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(active === -1 ? (step === 1 ? 0 : optionCount - 1) : (active + step + optionCount) % optionCount);
      return;
    }
    if (e.key === 'Enter' && query.trim()) {
      if (open && active >= 0 && active < shown.length) {
        handleResultClick();
        navigate(`/profile/${shown[active].id}`);
      } else {
        goToResults();
      }
    }
    if (e.key === 'Escape') { setShowDropdown(false); setActiveIndex(-1); }
  };

  /* Tabbing away closes the suggestions */
  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setShowDropdown(false);
  };

  const handleResultClick = () => {
    setQuery('');
    setShowDropdown(false);
  };

  return (
    <div className="searchbar-wrapper" ref={wrapperRef} onBlur={handleBlur}>
      <div className="searchbar-inner">
        <div className="searchbar-input-wrap">
          {/* Search icon */}
          <Search size={15} className="searchbar-icon" />
          <input
            type="text"
            className="searchbar-input"
            placeholder="Search users…"
            aria-label="Search users"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(-1); }}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
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
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {open && (
          <div className="searchbar-dropdown" id={listId} role="listbox" aria-label="People">
            {shown.length === 0 ? (
              <div className="dropdown-empty" role="option" aria-disabled="true" aria-selected="false">No users found</div>
            ) : (
              <>
                {shown.map((user, i) => (
                  <Link
                    to={`/profile/${user.id}`}
                    key={user.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    tabIndex={-1}
                    className={`dropdown-item ${i === active ? 'dropdown-item--active' : ''}`}
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
                  id={optionId(shown.length)}
                  role="option"
                  aria-selected={active === shown.length}
                  tabIndex={-1}
                  className={`dropdown-see-all ${active === shown.length ? 'dropdown-see-all--active' : ''}`}
                  onClick={goToResults}
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
