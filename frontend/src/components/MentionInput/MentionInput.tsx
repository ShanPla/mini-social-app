import { useState, useEffect, useRef, useId } from 'react';
import { searchProfiles } from '../../lib/searchProfiles';
import type { FoundProfile } from '../../lib/searchProfiles';
import { findMentionQuery, insertMention } from '../../lib/mentions';
import { displayName } from '../../lib/names';
import './MentionInput.css';

type Field = HTMLInputElement | HTMLTextAreaElement;

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  /* A textarea instead of a one-line input */
  multiline?: boolean;
  className?: string;
  id?: string;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  autoFocus?: boolean;
  'aria-label'?: string;
  'aria-keyshortcuts'?: string;
  /* Runs for keys the suggestions did not use (the submit shortcut, Escape) */
  onKeyDown?: (e: React.KeyboardEvent<Field>) => void;
};

const MAX_SUGGESTIONS = 5;

/*
 * A text field that suggests people while you type @name. Up to five matches
 * come from search_profiles; arrows move, Enter or Tab inserts @username,
 * Escape closes, and a click works too. Same combobox pattern as SearchBar.
 */
export default function MentionInput({
  value, onValueChange, multiline = false, className, id, placeholder, maxLength, rows, autoFocus,
  'aria-label': ariaLabel, 'aria-keyshortcuts': keyShortcuts, onKeyDown,
}: Props) {
  const fieldRef = useRef<Field>(null);
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  /* Results remember the query that produced them, so loading is derived */
  const [results, setResults] = useState<{ q: string; list: FoundProfile[] }>({ q: '', list: [] });
  const [activeIndex, setActiveIndex] = useState(0);
  /* Escape hides the list until the typed @name changes */
  const [dismissed, setDismissed] = useState<string | null>(null);

  const mention = findMentionQuery(value, caret);
  const q = mention?.query ?? '';
  const mentionKey = mention ? `${mention.start}:${mention.query}` : null;
  const shown = results.q === q ? results.list : [];
  const open = focused && !!mention && dismissed !== mentionKey && shown.length > 0;
  const active = activeIndex < shown.length ? activeIndex : 0;
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { rows } = await searchProfiles(q, null, MAX_SUGGESTIONS);
      if (cancelled) return;
      setResults({ q, list: rows });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q]);

  const syncCaret = () => {
    const el = fieldRef.current;
    if (el) setCaret(el.selectionStart ?? el.value.length);
  };

  const choose = (person: FoundProfile) => {
    if (!mention) return;
    const next = insertMention(value, caret, mention.start, person.username);
    onValueChange(next.text);
    setCaret(next.caret);
    setActiveIndex(0);
    /* The new text lands on the next render; put the caret after it then */
    requestAnimationFrame(() => {
      fieldRef.current?.focus();
      fieldRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<Field>) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((active + step + shown.length) % shown.length);
        return;
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault();
        choose(shown[active]);
        return;
      }
      if (e.key === 'Escape') {
        /* Closes the suggestions only, not a dialog or reply form around them */
        e.preventDefault();
        e.stopPropagation();
        setDismissed(mentionKey);
        return;
      }
    }
    onKeyDown?.(e);
  };

  const shared = {
    id,
    className,
    value,
    placeholder,
    maxLength,
    autoFocus,
    'aria-label': ariaLabel,
    'aria-keyshortcuts': keyShortcuts,
    autoComplete: 'off',
    role: 'combobox' as const,
    'aria-autocomplete': 'list' as const,
    'aria-expanded': open,
    'aria-controls': open ? listId : undefined,
    'aria-activedescendant': open ? optionId(active) : undefined,
    onChange: (e: React.ChangeEvent<Field>) => {
      onValueChange(e.target.value);
      setCaret(e.target.selectionStart ?? e.target.value.length);
      setActiveIndex(0);
    },
    onSelect: syncCaret,
    onKeyDown: handleKeyDown,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };

  return (
    <div className={`mention-wrap ${multiline ? 'mention-wrap--multi' : ''}`}>
      {multiline
        ? <textarea ref={fieldRef as React.RefObject<HTMLTextAreaElement>} rows={rows} {...shared} />
        : <input ref={fieldRef as React.RefObject<HTMLInputElement>} type="text" {...shared} />}

      {open && (
        <div className="mention-list" id={listId} role="listbox" aria-label="People to mention">
          {shown.map((person, i) => (
            <div
              key={person.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={`mention-option ${i === active ? 'mention-option--active' : ''}`}
              /* Keeps focus in the field, so the click does not blur and close the list first */
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(person)}
            >
              <span className="mention-avatar">
                {person.avatar_url
                  ? <img src={person.avatar_url} alt="" width={22} height={22} loading="lazy" />
                  : <span aria-hidden="true">{(person.username[0] || '?').toUpperCase()}</span>}
              </span>
              <span className="mention-name">{displayName(person)}</span>
              <span className="mention-handle">@{person.username}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
