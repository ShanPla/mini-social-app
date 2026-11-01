import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchBlockedProfiles, unblockUser } from '../../lib/blocks';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import { displayName } from '../../lib/names';
import './BlockedList.css';

type Person = NonNullable<Awaited<ReturnType<typeof fetchBlockedProfiles>>>[number];

/* Settings card body: the people you blocked, each with an Unblock button */
export default function BlockedList() {
  const toast = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [loadedKey, setLoadedKey] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  /* Bumped by Retry */
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loading = loadedKey !== version;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchBlockedProfiles();
      if (cancelled) return;
      setFailed(list === null);
      setPeople(list ?? []);
      setLoadedKey(version);
    })();
    return () => { cancelled = true; };
  }, [version]);

  const handleUnblock = async (person: Person) => {
    if (busyId) return;
    setBusyId(person.id);
    const error = await unblockUser(person.id);
    if (error) {
      toast.error(describeError(error, 'Could not unblock this person.'));
    } else {
      setPeople((prev) => prev.filter((p) => p.id !== person.id));
      toast.success(`Unblocked @${person.username}`);
    }
    setBusyId(null);
  };

  if (loading) return <p className="blocked-note">Loading…</p>;
  if (failed) {
    return (
      <p className="blocked-note" role="alert">
        Could not load your blocked list.{' '}
        <button type="button" className="btn-ghost" onClick={() => setVersion((v) => v + 1)}>Retry</button>
      </p>
    );
  }
  if (people.length === 0) return <p className="blocked-note">You have not blocked anyone.</p>;

  return (
    <ul className="blocked-list">
      {people.map((p) => (
        <li key={p.id} className="blocked-row">
          <Link to={`/profile/${p.id}`} className="blocked-who">
            <span className="blocked-avatar">
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" width={32} height={32} loading="lazy" />
                : <span aria-hidden="true">{(p.username[0] || '?').toUpperCase()}</span>}
            </span>
            <span className="blocked-names">
              <span className="blocked-name">{displayName(p)}</span>
              {p.display_name && <span className="blocked-handle">@{p.username}</span>}
            </span>
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => handleUnblock(p)}
            disabled={busyId === p.id}
            aria-label={`Unblock @${p.username}`}
          >
            {busyId === p.id ? '…' : 'Unblock'}
          </button>
        </li>
      ))}
    </ul>
  );
}
