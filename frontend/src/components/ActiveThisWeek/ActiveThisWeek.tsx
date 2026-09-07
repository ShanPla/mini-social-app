import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { usePresence } from '../../context/PresenceContext';
import SidebarWidget, { WidgetAvatar, WidgetSkeleton, WidgetEmpty } from '../SidebarWidget/SidebarWidget';
import './ActiveThisWeek.css';

type Poster = {
  id: string;
  username: string;
  avatar_url: string | null;
  posts: number;
};

const LIMIT = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/* Most active posters in the last 7 days (counts only posts you can see) */
export default function ActiveThisWeek() {
  const { isOnline } = usePresence();
  const [posters, setPosters] = useState<Poster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - WEEK_MS).toISOString();
      const { data } = await supabase
        .from('posts')
        .select('user_id, profiles(id, username, avatar_url)')
        .gte('created_at', since)
        .limit(500);
      if (cancelled) return;

      const tally = new Map<string, Poster>();
      for (const row of (data || []) as unknown as { user_id: string; profiles: { id: string; username: string; avatar_url: string | null } | null }[]) {
        if (!row.profiles) continue;
        const existing = tally.get(row.user_id);
        if (existing) existing.posts += 1;
        else tally.set(row.user_id, { id: row.profiles.id, username: row.profiles.username, avatar_url: row.profiles.avatar_url, posts: 1 });
      }
      setPosters([...tally.values()].sort((a, b) => b.posts - a.posts).slice(0, LIMIT));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SidebarWidget title="Active this week" icon={<Flame size={15} />}>
      {loading ? (
        <WidgetSkeleton rows={3} />
      ) : posters.length === 0 ? (
        <WidgetEmpty>Quiet week. No posts in the last 7 days.</WidgetEmpty>
      ) : (
        posters.map((p, i) => (
          <Link key={p.id} to={`/profile/${p.id}`} className="widget-row atw-row">
            <span className="atw-rank">{i + 1}</span>
            <WidgetAvatar username={p.username} avatarUrl={p.avatar_url} size={30} online={isOnline(p.id)} />
            <span className="widget-row-info">
              <span className="widget-row-name">@{p.username}</span>
              <span className="widget-row-sub">{p.posts} post{p.posts === 1 ? '' : 's'}</span>
            </span>
          </Link>
        ))
      )}
    </SidebarWidget>
  );
}
