import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, UserCheck, Users } from 'lucide-react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabaseClient';
import type { Profile } from '../../lib/supabaseClient';
import './FollowersModal.css';

type Props = {
  userId: string;
  type: 'followers' | 'following';
  onClose: () => void;
};

export default function FollowersModal({ userId, type, onClose }: Props) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    fetchUsers();
    return () => { document.body.style.overflow = ''; };
  }, [userId, type]);

  /* Close on Escape */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const fetchUsers = async () => {
    setLoading(true);

    if (type === 'followers') {
      /* People who follow this user */
      const { data } = await supabase
        .from('follows')
        .select('profiles!follows_follower_id_fkey(id, username, avatar_url, bio)')
        .eq('following_id', userId);
      setUsers((data?.map((d: any) => d.profiles).filter(Boolean) || []) as Profile[]);
    } else {
      /* People this user follows */
      const { data } = await supabase
        .from('follows')
        .select('profiles!follows_following_id_fkey(id, username, avatar_url, bio)')
        .eq('follower_id', userId);
      setUsers((data?.map((d: any) => d.profiles).filter(Boolean) || []) as Profile[]);
    }

    setLoading(false);
  };

  const title = type === 'followers' ? 'Followers' : 'Following';

  return createPortal(
    <div className="fw-backdrop" onClick={onClose}>
      <div className="fw-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="fw-header">
          <div className="fw-title">
            {type === 'followers' ? <Users size={16} /> : <UserCheck size={16} />}
            <h3>{title}</h3>
          </div>
          <button className="fw-close" onClick={onClose}>
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
            users.map((user) => (
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
                  <span className="fw-username">@{user.username}</span>
                  {user.bio && <span className="fw-bio">{user.bio}</span>}
                </div>

                {/* Arrow */}
                <span className="fw-arrow">→</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
