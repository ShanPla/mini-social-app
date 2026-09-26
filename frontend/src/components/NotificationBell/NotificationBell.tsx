import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Heart, MessageCircle, MessageSquare, UserPlus, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useChat } from '../../context/ChatContext';
import { shortTime } from '../../lib/chat';
import { displayName } from '../../lib/names';
import './NotificationBell.css';

type Notification = {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'message' | 'added';
  is_read: boolean;
  created_at: string;
  post_id: string | null;
  conversation_id: string | null;
  actor: {
    id: string;
    username: string;
    display_name: string | null;
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
  'actor:actor_id(id, username, display_name, avatar_url), ' +
  'conversation:conversation_id(id, is_group, name)';

export default function NotificationBell({ currentUserId }: Props) {
  const navigate = useNavigate();
  const { openChat } = useChat();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Bumped by realtime events; the effect below owns the fetch */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('notifications')
        .select(SELECT)
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (cancelled || !data) return;
      const rows = data as unknown as Notification[];
      setNotifications(rows);
      setUnreadCount(rows.filter((n) => !n.is_read).length);
    })();
    return () => { cancelled = true; };
  }, [currentUserId, version]);

  /* Marking a conversation read updates several rows at once — coalesce the refetch */
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => setVersion((v) => v + 1), 250);
  }, []);

  useEffect(() => {
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
  }, [currentUserId, scheduleRefetch]);

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
    if ((n.type === 'message' || n.type === 'added') && n.conversation) openChat(n.conversation.id);
    else if (n.post_id) navigate(`/post/${n.post_id}`);
    else navigate(`/profile/${n.actor.id}`);
  };

  const getMessage = (n: Notification) => {
    switch (n.type) {
      case 'like': return 'liked your post';
      case 'comment': return 'commented on your post';
      case 'follow': return 'followed you';
      case 'message': return n.conversation?.is_group
        ? `messaged ${n.conversation.name || 'the group'}`
        : 'sent you a message';
      case 'added': return `added you to ${n.conversation?.name || 'a group'}`;
    }
  };

  /* Lucide icon per notification type */
  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart size={12} fill="currentColor" />;
      case 'comment': return <MessageCircle size={12} />;
      case 'follow': return <UserPlus size={12} />;
      case 'message': return <MessageSquare size={12} />;
      case 'added': return <Users size={12} />;
    }
  };

  return (
    <div className="bell-wrapper" ref={wrapperRef}>
      <button
        className="bell-btn"
        onClick={handleOpen}
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
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
                /* A button, so the keyboard can open it; its text is its name */
                <button
                  type="button"
                  key={n.id}
                  className={`bell-item ${!n.is_read ? 'unread' : ''}`}
                  onClick={() => handleClick(n)}
                >
                  <span className={`bell-item-icon bell-item-icon--${n.type}`}>
                    {getIcon(n.type)}
                  </span>
                  <span className="bell-item-avatar">
                    {n.actor.avatar_url
                      ? <img src={n.actor.avatar_url} alt="" loading="lazy" />
                      : <span aria-hidden="true">{(n.actor.username[0] || '?').toUpperCase()}</span>
                    }
                  </span>
                  <span className="bell-item-body">
                    <span className="bell-item-text"><strong>{displayName(n.actor)}</strong> {getMessage(n)}</span>
                    <span className="bell-item-time">{shortTime(n.created_at)}</span>
                  </span>
                </button>
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
