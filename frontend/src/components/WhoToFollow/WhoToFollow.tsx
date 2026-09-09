import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { usePresence } from '../../context/PresenceContext';
import SidebarWidget, { WidgetAvatar, WidgetSkeleton, WidgetEmpty } from '../SidebarWidget/SidebarWidget';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import { displayName } from '../../lib/names';
import './WhoToFollow.css';

type Props = {
  userId: string;
};

type Suggestion = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  follower_count: number;
};

const LIMIT = 5;

/* People you don't follow yet, most-followed first */
export default function WhoToFollow({ userId }: Props) {
  const { isOnline } = usePresence();
  const [users, setUsers] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      /* Counted and ranked in Postgres (suggested_follows in schema.sql) */
      const { data } = await supabase.rpc('suggested_follows', { p_limit: LIMIT });
      if (cancelled) return;
      setUsers((data as Suggestion[]) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const handleFollow = async (target: Suggestion) => {
    if (busy) return;
    setBusy(target.id);
    const isFollowed = followed.has(target.id);

    if (isFollowed) {
      const { error } = await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', target.id);
      if (error) toast.error(describeError(error, 'Could not unfollow. Please try again.'));
      else setFollowed((prev) => { const n = new Set(prev); n.delete(target.id); return n; });
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: target.id });
      /* The bell notification is raised server-side by trg_notify_follow */
      if (error) toast.error(describeError(error, 'Could not follow. Please try again.'));
      else setFollowed((prev) => new Set(prev).add(target.id));
    }
    setBusy(null);
  };

  return (
    <SidebarWidget title="Who to follow" icon={<UserPlus size={15} />} footer={{ to: '/search', label: 'Find more people' }}>
      {loading ? (
        <WidgetSkeleton rows={4} />
      ) : users.length === 0 ? (
        <WidgetEmpty>You already follow everyone here.</WidgetEmpty>
      ) : (
        users.map((u) => {
          const on = followed.has(u.id);
          return (
            <div key={u.id} className="widget-row wtf-row">
              <Link to={`/profile/${u.id}`} className="wtf-link">
                <WidgetAvatar username={u.username} avatarUrl={u.avatar_url} online={isOnline(u.id)} />
                <span className="widget-row-info">
                  <span className="widget-row-name">{displayName(u)}</span>
                  <span className="widget-row-sub">
                    {u.follower_count} follower{u.follower_count === 1 ? '' : 's'}
                  </span>
                </span>
              </Link>
              <button
                className={`wtf-btn ${on ? 'wtf-btn--on' : ''}`}
                onClick={() => handleFollow(u)}
                disabled={busy === u.id}
              >
                {busy === u.id ? '…' : on ? 'Following' : 'Follow'}
              </button>
            </div>
          );
        })
      )}
    </SidebarWidget>
  );
}
