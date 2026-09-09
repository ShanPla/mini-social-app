import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { usePresence } from '../../context/PresenceContext';
import SidebarWidget, { WidgetAvatar, WidgetSkeleton, WidgetEmpty } from '../SidebarWidget/SidebarWidget';
import { displayName } from '../../lib/names';
import './ActiveThisWeek.css';

type Poster = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url: string | null;
  post_count: number;
};

const LIMIT = 5;
const DAYS = 7;

/* Most active posters in the last 7 days (counts only posts you can see) */
export default function ActiveThisWeek() {
  const { isOnline } = usePresence();
  const [posters, setPosters] = useState<Poster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      /* Grouped in Postgres (active_posters in schema.sql), RLS decides what counts */
      const { data } = await supabase.rpc('active_posters', { p_days: DAYS, p_limit: LIMIT });
      if (cancelled) return;
      setPosters((data as Poster[]) || []);
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
              <span className="widget-row-name">{displayName(p)}</span>
              <span className="widget-row-sub">{p.post_count} post{p.post_count === 1 ? '' : 's'}</span>
            </span>
          </Link>
        ))
      )}
    </SidebarWidget>
  );
}
