import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { useChat } from '../../context/ChatContext';
import { parseDbDate } from '../../lib/timeAgo';
import EmptyState from '../../components/EmptyState/EmptyState';
import './Notifications.css';

type Notification = {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'message';
  is_read: boolean;
  created_at: string;
  post_id: string | null;
  conversation_id: string | null;
  actor: { id: string; username: string; avatar_url: string | null; };
  conversation: { id: string; is_group: boolean; name: string | null } | null;
};

type NotificationsPageProps = {
  currentUserId: string | null;
};

export default function NotificationsPage({ currentUserId }: NotificationsPageProps) {
  const { openChat } = useChat();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  usePageTitle('Notifications');

  useEffect(() => {
    if (currentUserId) fetchNotifications();
  }, [currentUserId]);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select(
        'id, type, is_read, created_at, post_id, conversation_id, ' +
        'actor:actor_id(id, username, avatar_url), ' +
        'conversation:conversation_id(id, is_group, name)'
      )
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setNotifications(data as unknown as Notification[]);
    setLoading(false);

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', currentUserId)
      .eq('is_read', false);
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - parseDbDate(dateStr).getTime();
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
      case 'message': return n.conversation?.is_group
        ? `messaged ${n.conversation.name || 'the group'}`
        : 'sent you a message';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return '♥';
      case 'comment': return '✦';
      case 'follow': return '→';
      case 'message': return '✉';
    }
  };

  return (
    <div className="notif-page">
      <div className="notif-page-inner">
        <div className="notif-page-header">
          <h2>Notifications</h2>
          {!loading && <span className="notif-count">{notifications.length} total</span>}
        </div>

        {loading ? (
          <div className="notif-skeletons">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton-notif">
                <div className="skeleton-icon-sm" />
                <div className="skeleton-avatar-sm" />
                <div className="skeleton-info">
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon="bell"
            title="No notifications yet"
            subtitle="When someone likes, comments, follows you, or sends a message — it'll show up here."
          />
        ) : (
          <div className="notif-list">
            {notifications.map((n) => (
              <div key={n.id} className={`notif-item ${!n.is_read ? 'unread' : ''}`}>
                <div className={`notif-icon notif-icon--${n.type}`}>{getIcon(n.type)}</div>
                <div className="notif-avatar">
                  {n.actor.avatar_url
                    ? <img src={n.actor.avatar_url} alt={n.actor.username} loading="lazy" />
                    : <span>{n.actor.username[0].toUpperCase()}</span>
                  }
                </div>
                <div className="notif-body">
                  <p>
                    <Link to={`/profile/${n.actor.id}`} className="notif-actor">@{n.actor.username}</Link>
                    {' '}{getMessage(n)}
                    {n.post_id && <>{' '}<Link to={`/post/${n.post_id}`} className="notif-post-link">→ view post</Link></>}
                    {n.type === 'message' && n.conversation && (
                      <>{' '}<button className="notif-post-link notif-chat-link" onClick={() => openChat(n.conversation!.id)}>→ open chat</button></>
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
