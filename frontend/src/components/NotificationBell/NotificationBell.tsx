import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Heart, MessageCircle, MessageSquare, UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useChat } from '../../context/ChatContext';
import { parseDbDate } from '../../lib/timeAgo';
import './NotificationBell.css';

type Notification = {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'message';
  is_read: boolean;
  created_at: string;
  post_id: string | null;
  conversation_id: string | null;
  actor: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  conversation: {
    id: string;
    is_group: boolean;
    name: string | null;
  } | null;
};

type Props = {
  currentUserId: string;
};

const SELECT =
  'id, type, is_read, created_at, post_id, conversation_id, ' +
  'actor:actor_id(id, username, avatar_url), ' +
  'conversation:conversation_id(id, is_group, name)';

export default function NotificationBell({ currentUserId }: Props) {
  const navigate = useNavigate();
  const { openChat } = useChat();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select(SELECT)
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (data) {
      const rows = data as unknown as Notification[];
      setNotifications(rows);
      setUnreadCount(rows.filter((n) => !n.is_read).length);
    }
  }, [currentUserId]);

  /* Marking a conversation read updates several rows at once — coalesce the refetch */
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => { fetchNotifications(); }, 250);
  }, [fetchNotifications]);

  useEffect(() => {
    fetchNotifications();

    /* Realtime: new rows, plus rows marked read elsewhere (opening a chat clears its entry) */
    const channel = supabase
      .channel(`notifications:${currentUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${currentUserId}`
      }, () => { scheduleRefetch(); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, [currentUserId, fetchNotifications, scheduleRefetch]);

  /* Close on outside click */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  /* Opening a notification takes you to whatever it is about.
     A null conversation means we already left it — fall back to the sender. */
  const handleClick = (n: Notification) => {
    setOpen(false);
    if (n.type === 'message' && n.conversation) openChat(n.conversation.id);
    else if (n.post_id) navigate(`/post/${n.post_id}`);
    else navigate(`/profile/${n.actor.id}`);
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - parseDbDate(dateStr).getTime();
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
      case 'message': return n.conversation?.is_group
        ? `messaged ${n.conversation.name || 'the group'}`
        : 'sent you a message';
    }
  };

  /* Lucide icon per notification type */
  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart size={12} fill="currentColor" />;
      case 'comment': return <MessageCircle size={12} />;
      case 'follow': return <UserPlus size={12} />;
      case 'message': return <MessageSquare size={12} />;
    }
  };

  return (
    <div className="bell-wrapper" ref={wrapperRef}>
      <button className="bell-btn" onClick={handleOpen} title="Notifications">
        <Bell size={18} />
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
                  onClick={() => handleClick(n)}
                >
                  <div className={`bell-item-icon bell-item-icon--${n.type}`}>
                    {getIcon(n.type)}
                  </div>
                  <div className="bell-item-avatar">
                    {n.actor.avatar_url
                      ? <img src={n.actor.avatar_url} alt={n.actor.username} loading="lazy" />
                      : <span>{(n.actor.username[0] || '?').toUpperCase()}</span>
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
