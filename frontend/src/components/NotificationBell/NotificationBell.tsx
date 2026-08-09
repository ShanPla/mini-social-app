import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import './NotificationBell.css';

type Notification = {
  id: string;
  type: 'like' | 'comment' | 'follow';
  is_read: boolean;
  created_at: string;
  post_id: string | null;
  actor: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
};

type Props = {
  currentUserId: string;
};

export default function NotificationBell({ currentUserId }: Props) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();

    // Realtime subscription for new notifications
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${currentUserId}`
      }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, type, is_read, created_at, post_id, actor:actor_id(id, username, avatar_url)')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (data) {
      setNotifications(data as unknown as Notification[]);
      setUnreadCount(data.filter((n: any) => !n.is_read).length);
    }
  };

  const handleOpen = async () => {
    setOpen(!open);
    if (!open && unreadCount > 0) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', currentUserId)
        .eq('is_read', false);
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    if (hrs < 24) return `${hrs}h`;
    return `${days}d`;
  };

  const getMessage = (n: Notification) => {
    switch (n.type) {
      case 'like': return 'liked your post';
      case 'comment': return 'commented on your post';
      case 'follow': return 'followed you';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return '♥';
      case 'comment': return '✦';
      case 'follow': return '→';
    }
  };

  return (
    <div className="bell-wrapper" ref={wrapperRef}>
      <button className="bell-btn" onClick={handleOpen} title="Notifications">
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="bell-dropdown-header">
            <span>Notifications</span>
          </div>

          {notifications.length === 0 ? (
            <div className="bell-empty">Nothing yet</div>
          ) : (
            <>
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`bell-item ${!n.is_read ? 'unread' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    if (n.post_id) navigate(`/post/${n.post_id}`);
                    else navigate(`/profile/${n.actor.id}`);
                  }}
                >
                  <div className={`bell-item-icon bell-item-icon--${n.type}`}>
                    {getIcon(n.type)}
                  </div>
                  <div className="bell-item-avatar">
                    {n.actor.avatar_url
                      ? <img src={n.actor.avatar_url} alt={n.actor.username} />
                      : <span>{n.actor.username[0].toUpperCase()}</span>
                    }
                  </div>
                  <div className="bell-item-body">
                    <p><strong>@{n.actor.username}</strong> {getMessage(n)}</p>
                    <span className="bell-item-time">{formatTime(n.created_at)}</span>
                  </div>
                </div>
              ))}
              <Link
                to="/notifications"
                className="bell-see-all"
                onClick={() => setOpen(false)}
              >
                See all notifications →
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
