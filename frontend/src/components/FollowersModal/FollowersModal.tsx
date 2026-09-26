import { useState, useEffect, useRef, useId } from 'react';
import { Link } from 'react-router-dom';
import { X, UserCheck, Users } from 'lucide-react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabaseClient';
import type { Profile } from '../../lib/supabaseClient';
import { displayName } from '../../lib/names';
import { useScrollLock } from '../../lib/useScrollLock';
import { useDialog } from '../../lib/useDialog';
import './FollowersModal.css';

type Props = {
  userId: string;
  type: 'followers' | 'following';
  onClose: () => void;
};

type FollowRow = { profiles: Profile | null };

/* Enough for any profile on this site today; the note below shows when it is not */
const FOLLOW_LIST_CAP = 200;

export default function FollowersModal({ userId, type, onClose }: Props) {
  const [users, setUsers] = useState<Profile[]>([]);
  /* Which (user, tab) the list belongs to; loading is derived from it */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = `${userId}:${type}`;
  const loading = loadedFor !== key;

  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useScrollLock();
  /* Focus in, Tab kept inside, Escape closes, focus back to the opener */
  useDialog(boxRef, onClose);

  useEffect(() => {
    /* Flipping followers/following mid-fetch must not show the wrong list */
    let cancelled = false;
    (async () => {
      const { data } = type === 'followers'
        ? await supabase.from('follows').select('profiles!follows_follower_id_fkey(id, username, display_name, avatar_url, bio)').eq('following_id', userId).limit(FOLLOW_LIST_CAP)
        : await supabase.from('follows').select('profiles!follows_following_id_fkey(id, username, display_name, avatar_url, bio)').eq('follower_id', userId).limit(FOLLOW_LIST_CAP);
      if (cancelled) return;
      const rows = (data as unknown as FollowRow[]) || [];
      setUsers(rows.map((r) => r.profiles).filter((p): p is Profile => !!p));
      setLoadedFor(key);
    })();
    return () => { cancelled = true; };
  }, [userId, type, key]);

  const title = type === 'followers' ? 'Followers' : 'Following';

  return createPortal(
    <div className="fw-backdrop" onClick={onClose}>
      <div
        className="fw-modal"
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="fw-header">
          <div className="fw-title">
            {type === 'followers' ? <Users size={16} /> : <UserCheck size={16} />}
            <h3 id={titleId}>{title}</h3>
          </div>
          <button className="fw-close" onClick={onClose} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </div>

        {/* List */}
        <div className="fw-list">
          {loading ? (
            /* Skeleton */
            [1, 2, 3].map((i) => (
              <div key={i} className="fw-skeleton">
                <div className="fw-skeleton-avatar" />
                <div className="fw-skeleton-info">
                  <div className="fw-skeleton-line fw-skeleton-line--short" />
                  <div className="fw-skeleton-line fw-skeleton-line--medium" />
                </div>
              </div>
            ))
          ) : users.length === 0 ? (
            <div className="fw-empty">
              <p>{type === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</p>
            </div>
          ) : (
            <>
            {users.map((user) => (
              <Link
                key={user.id}
                to={`/profile/${user.id}`}
                className="fw-user-item"
                onClick={onClose}
              >
                {/* Avatar */}
                <div className="fw-avatar">
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt={user.username} loading="lazy" />
                    : <span>{(user.username[0] || '?').toUpperCase()}</span>
                  }
                </div>

                {/* Info */}
                <div className="fw-user-info">
                  <span className="fw-username">{displayName(user)}</span>
                  {user.display_name && <span className="fw-handle">@{user.username}</span>}
                  {user.bio && <span className="fw-bio">{user.bio}</span>}
                </div>

                {/* Arrow */}
                <span className="fw-arrow">→</span>
              </Link>
            ))}
            {users.length >= FOLLOW_LIST_CAP && (
              <p className="fw-cap">Showing the first {FOLLOW_LIST_CAP}. Search finds anyone else.</p>
            )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
