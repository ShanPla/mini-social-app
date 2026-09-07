import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { usePresence } from '../../context/PresenceContext';
import SidebarWidget, { WidgetAvatar, WidgetEmpty } from '../SidebarWidget/SidebarWidget';
import './OnlineNow.css';

type Props = {
  userId: string;
};

type Mini = { id: string; username: string; avatar_url: string | null };

const LIMIT = 8;

/* Everyone else currently connected (Supabase Presence) */
export default function OnlineNow({ userId }: Props) {
  const { onlineIds } = usePresence();
  const [profiles, setProfiles] = useState<Record<string, Mini>>({});

  const others = [...onlineIds].filter((id) => id !== userId);

  /* Fetch profiles for ids we haven't seen yet */
  useEffect(() => {
    const missing = others.filter((id) => !profiles[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    supabase.from('profiles').select('id, username, avatar_url').in('id', missing).then(({ data }) => {
      if (cancelled || !data) return;
      setProfiles((prev) => {
        const next = { ...prev };
        for (const p of data as Mini[]) next[p.id] = p;
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineIds]);

  const visible = others.map((id) => profiles[id]).filter((p): p is Mini => !!p).slice(0, LIMIT);
  const extra = others.length - visible.length;

  return (
    <SidebarWidget title="Online now" icon={<Radio size={15} />}>
      {others.length === 0 ? (
        <WidgetEmpty>No one else is online right now.</WidgetEmpty>
      ) : (
        <div className="online-list">
          {visible.map((p) => (
            <Link key={p.id} to={`/profile/${p.id}`} className="online-item" title={`@${p.username}`}>
              <WidgetAvatar username={p.username} avatarUrl={p.avatar_url} size={36} online />
              <span className="online-name">{p.username}</span>
            </Link>
          ))}
          {extra > 0 && <span className="online-more">+{extra}</span>}
        </div>
      )}
    </SidebarWidget>
  );
}
