import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import './Notifications.css';

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

type NotificationsPageProps = {
  currentUserId: string | null;
};

export default function NotificationsPage({ currentUserId }: NotificationsPageProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUserId) {
      fetchNotifications();
    }
  }, [currentUserId]);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, type, is_read, created_at, post_id, actor:actor_id(id, username, avatar_url)')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setNotifications(data as unknown as Notification[]);
    setLoading(false);

    // Mark all as read
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', currentUserId)
      .eq('is_read', false);
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${days}d ago`;
  };

  const getMessage = (n: Notification) => {
    switch (n.type) {
      case 'like': return 'liked your post';
      case 'comment': return 'commented on your post';
      case 'follow': return 'started following you';
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
    <div className="notif-page">
      <div className="notif-page-inner">
        <div className="notif-page-header">
          <h2>Notifications</h2>
          <span className="notif-count">{notifications.length} total</span>
        </div>

        {loading ? (
          <div className="notif-loading">
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="notif-empty">
            <span>✦</span>
            <p>No notifications yet.</p>
          </div>
        ) : (
          <div className="notif-list">
            {notifications.map((n) => (
              <div key={n.id} className={`notif-item ${!n.is_read ? 'unread' : ''}`}>
                <div className={`notif-icon notif-icon--${n.type}`}>
                  {getIcon(n.type)}
                </div>
                <div className="notif-avatar">
                  {n.actor.avatar_url
                    ? <img src={n.actor.avatar_url} alt={n.actor.username} />
                    : <span>{n.actor.username[0].toUpperCase()}</span>
                  }
                </div>
                <div className="notif-body">
                  <p>
                    <Link to={`/profile/${n.actor.id}`} className="notif-actor">
                      @{n.actor.username}
                    </Link>
                    {' '}{getMessage(n)}
                    {n.post_id && (
                      <>{' '}<Link to={`/post/${n.post_id}`} className="notif-post-link">→ view post</Link></>
                    )}
                  </p>
                  <span className="notif-time">{formatTime(n.created_at)}</span>
                </div>
                {!n.is_read && <div className="notif-dot" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
