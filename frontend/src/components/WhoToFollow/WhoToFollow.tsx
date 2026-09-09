import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { usePresence } from '../../context/PresenceContext';
import SidebarWidget, { WidgetAvatar, WidgetSkeleton, WidgetEmpty } from '../SidebarWidget/SidebarWidget';
import './WhoToFollow.css';

type Props = {
  userId: string;
};

type Suggestion = {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  followerCount: number;
};

const LIMIT = 5;

/* People you don't follow yet, most-followed first */
export default function WhoToFollow({ userId }: Props) {
  const { isOnline } = usePresence();
  const [users, setUsers] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      /* Follower counts are tallied client-side: PostgREST aggregates are off by default on Supabase */
      const [{ data: myFollows }, { data: allFollows }, { data: profiles }] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', userId),
        supabase.from('follows').select('following_id').limit(5000),
        supabase.from('profiles').select('id, username, avatar_url, bio').neq('id', userId).limit(100),
      ]);
      if (cancelled) return;
      const followingIds = new Set((myFollows || []).map((f) => f.following_id as string));
      const counts = new Map<string, number>();
      for (const f of allFollows || []) counts.set(f.following_id, (counts.get(f.following_id) || 0) + 1);
      const list = ((profiles || []) as Omit<Suggestion, 'followerCount'>[])
        .filter((p) => !followingIds.has(p.id))
        .map((p) => ({ ...p, followerCount: counts.get(p.id) || 0 }))
        .sort((a, b) => b.followerCount - a.followerCount)
        .slice(0, LIMIT);
      setUsers(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const handleFollow = async (target: Suggestion) => {
    if (busy) return;
    setBusy(target.id);
    const isFollowed = followed.has(target.id);

    if (isFollowed) {
      await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', target.id);
      setFollowed((prev) => { const n = new Set(prev); n.delete(target.id); return n; });
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: target.id });
      /* The bell notification is raised server-side by trg_notify_follow */
      if (!error) setFollowed((prev) => new Set(prev).add(target.id));
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
                  <span className="widget-row-name">@{u.username}</span>
                  <span className="widget-row-sub">
                    {u.followerCount} follower{u.followerCount === 1 ? '' : 's'}
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
