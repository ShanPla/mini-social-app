import { useState, useEffect, useRef } from 'react';
import { Search, X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Profile } from '../../lib/supabaseClient';
import { escapeLike } from '../../lib/search';
import { displayName } from '../../lib/names';
import './UserPicker.css';

type PickedUser = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

type Props = {
  /* Users that cannot be picked (yourself, existing members) */
  excludeIds: string[];
  selected: PickedUser[];
  onChange: (users: PickedUser[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

/*
 * Search-and-select users. Shows chips for the selection above a debounced
 * username search (same query as SearchBar). Used to start chats and to
 * add people to a group.
 */
export default function UserPicker({ excludeIds, selected, onChange, placeholder = 'Search people…', autoFocus = false }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      setSearched(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) return;

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `%${escapeLike(q)}%`)
        .limit(8);
      setResults(((data as PickedUser[]) || []).filter((u) => !excludeIds.includes(u.id)));
      setSearched(true);
      setLoading(false);
    }, 250);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const isSelected = (id: string) => selected.some((u) => u.id === id);

  const toggle = (user: PickedUser) => {
    if (isSelected(user.id)) onChange(selected.filter((u) => u.id !== user.id));
    else onChange([...selected, user]);
  };

  return (
    <div className="picker">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="picker-chips">
          {selected.map((u) => (
            <span key={u.id} className="picker-chip">
              {displayName(u)}
              <button type="button" onClick={() => toggle(u)} title="Remove"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="picker-search">
        <Search size={14} className="picker-search-icon" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
        {loading && <span className="picker-spinner">✦</span>}
      </div>

      {/* Results */}
      <div className="picker-results">
        {searched && results.length === 0 && !loading && (
          <div className="picker-empty">No users found</div>
        )}
        {results.map((u) => {
          const on = isSelected(u.id);
          return (
            <button
              key={u.id}
              type="button"
              className={`picker-result ${on ? 'picker-result--on' : ''}`}
              onClick={() => toggle(u)}
            >
              <div className="picker-avatar">
                {u.avatar_url
                  ? <img src={u.avatar_url} alt={u.username} loading="lazy" />
                  : <span>{(u.username[0] || '?').toUpperCase()}</span>
                }
              </div>
              <span className="picker-username">{displayName(u)}</span>
              <span className="picker-check">{on && <Check size={14} />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
