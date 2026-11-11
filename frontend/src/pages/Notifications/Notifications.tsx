import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, UserPlus, MessageSquare, Users, AtSign } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { useToast } from '../../context/ToastContext';
import { timeAgo, fullDate, parseDbDate } from '../../lib/timeAgo';
import { displayName } from '../../lib/names';
import EmptyState from '../../components/EmptyState/EmptyState';
import LoadMore from '../../components/LoadMore/LoadMore';
import './Notifications.css';

type Notification = {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'message' | 'added' | 'mention';
  is_read: boolean;
  created_at: string;
  post_id: string | null;
  /* Set on a mention inside a comment; null for a mention in the post text */
  comment_id: string | null;
  conversation_id: string | null;
  actor: { id: string; username: string; display_name: string | null; avatar_url: string | null; };
  conversation: { id: string; is_group: boolean; name: string | null } | null;
};

type NotificationsPageProps = {
  currentUserId: string | null;
};

const PAGE_SIZE = 20;
const SELECT =
  'id, type, is_read, created_at, post_id, comment_id, conversation_id, ' +
  'actor:actor_id(id, username, display_name, avatar_url), ' +
  'conversation:conversation_id(id, is_group, name)';

/* Newest first, by (created_at, id). The next page starts after the last row seen. */
async function fetchNotifications(userId: string, before?: Notification) {
  let q = supabase
    .from('notifications')
    .select(SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (before) {
    q = q.or(`created_at.lt."${before.created_at}",and(created_at.eq."${before.created_at}",id.lt.${before.id})`);
  }
  const { data, error } = await q;
  const rows = (data as unknown as Notification[]) || [];
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, error: !!error };
}

export default function NotificationsPage({ currentUserId }: NotificationsPageProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  /* Loading is derived from which fetch the rows belong to; Retry bumps version */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  /* Unread rows on pages not loaded yet, so Mark all read stays offered for them */
  const [olderUnread, setOlderUnread] = useState(0);
  const key = `${currentUserId}:${version}`;
  const keyRef = useRef(key);
  const loading = loadedKey !== key;
  const toast = useToast();

  usePageTitle('Notifications');

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  /* The rows are marked read in the database once they are on screen, but the
     list keeps its own is_read as loaded, so what was new still looks new until
     the reader leaves or presses Mark all read. */
  const markShownRead = useCallback(async (rows: Notification[]) => {
    const unreadIds = rows.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    if (error) toast.error('Could not mark your notifications as read.');
  }, [toast]);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    (async () => {
      const page = await fetchNotifications(currentUserId);
      if (cancelled) return;
      setNotifications(page.rows);
      setHasMore(page.hasMore);
      setMoreFailed(false);
      setLoadFailed(page.error);
      setLoadedKey(key);
      if (page.error) return;
      await markShownRead(page.rows);
      if (!page.hasMore) { setOlderUnread(0); return; }
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', currentUserId)
        .eq('is_read', false);
      if (!cancelled) setOlderUnread(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [currentUserId, key, markShownRead]);

  const loadMore = useCallback(async () => {
    const last = notifications[notifications.length - 1];
    if (!currentUserId || !last || loadingMore || !hasMore) return;
    const startedFor = key;
    setLoadingMore(true);
    setMoreFailed(false);
    const page = await fetchNotifications(currentUserId, last);
    if (keyRef.current !== startedFor) { setLoadingMore(false); return; }
    if (page.error) {
      setMoreFailed(true);
      setLoadingMore(false);
      return;
    }
    setNotifications((prev) => {
      const seen = new Set(prev.map((n) => n.id));
      return [...prev, ...page.rows.filter((n) => !seen.has(n.id))];
    });
    setHasMore(page.hasMore);
    setLoadingMore(false);
    void markShownRead(page.rows);
    setOlderUnread((n) => Math.max(0, n - page.rows.filter((row) => !row.is_read).length));
  }, [currentUserId, notifications, loadingMore, hasMore, key, markShownRead]);

  const canMarkAll = olderUnread > 0 || notifications.some((n) => !n.is_read);

  /* Also clears older unread rows that are not loaded yet */
  const markAllRead = async () => {
    if (!currentUserId || markingAll) return;
    setMarkingAll(true);
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', currentUserId)
      .eq('is_read', false);
    setMarkingAll(false);
    if (error) { toast.error('Could not mark your notifications as read.'); return; }
    setNotifications((prev) => prev.map((n) => (n.is_read ? n : { ...n, is_read: true })));
    setOlderUnread(0);
  };

  /* Where the whole row leads */
  const targetFor = (n: Notification): string => {
    if (n.type === 'follow') return `/profile/${n.actor.id}`;
    if ((n.type === 'message' || n.type === 'added') && n.conversation_id) return `/messages/${n.conversation_id}`;
    if (n.post_id) return `/post/${n.post_id}`;
    return `/profile/${n.actor.id}`;
  };

  const getMessage = (n: Notification) => {
    switch (n.type) {
      case 'like': return 'liked your post';
      case 'comment': return 'commented on your post';
      case 'follow': return 'started following you';
      case 'message': return n.conversation?.is_group
        ? `messaged ${n.conversation.name || 'the group'}`
        : 'sent you a message';
      case 'added': return `added you to ${n.conversation?.name || 'a group'}`;
      case 'mention': return n.comment_id ? 'mentioned you in a comment' : 'mentioned you in a post';
    }
  };

  /* Same icons as the bell. Lucide marks them aria-hidden, so the text beside them is what is read */
  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart size={10} fill="currentColor" />;
      case 'comment': return <MessageCircle size={10} />;
      case 'follow': return <UserPlus size={10} />;
      case 'message': return <MessageSquare size={10} />;
      case 'added': return <Users size={10} />;
      case 'mention': return <AtSign size={10} />;
    }
  };

  return (
    <div className="notif-page">
      <div className="notif-page-inner">
        <div className="notif-page-header">
          <h1>Notifications</h1>
          {!loading && !loadFailed && canMarkAll && (
            <button type="button" className="btn-ghost notif-mark-all" onClick={markAllRead} disabled={markingAll}>
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="notif-skeletons">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton-notif">
                <div className="skeleton-avatar-sm" />
                <div className="skeleton-info">
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : loadFailed ? (
          <EmptyState
            icon="alert"
            title="Could not load notifications"
            subtitle="Check your connection and try again."
            action={<button type="button" className="btn-ghost" onClick={() => setVersion((v) => v + 1)}>Retry</button>}
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon="bell"
            title="No notifications yet"
            subtitle="When someone likes, comments, follows you, or sends a message — it'll show up here."
          />
        ) : (
          <>
            <div className="notif-list">
              {notifications.map((n) => (
                <div key={n.id} className={`notif-item ${!n.is_read ? 'unread' : ''}`}>
                  {/* Avatar first; the type icon is a small badge on its bottom-right corner */}
                  <div className="notif-lead">
                    <div className="notif-avatar">
                      {n.actor.avatar_url
                        ? <img src={n.actor.avatar_url} alt="" loading="lazy" />
                        : <span>{(n.actor.username[0] || '?').toUpperCase()}</span>
                      }
                    </div>
                    <div className={`notif-icon notif-icon--${n.type}`}>{getIcon(n.type)}</div>
                  </div>
                  <div className="notif-body">
                    <p>
                      {/* The name keeps its own link above the row-wide one */}
                      <Link to={`/profile/${n.actor.id}`} className="notif-actor">{displayName(n.actor)}</Link>
                      {' '}
                      {/* Stretched link: its ::after covers the whole row */}
                      <Link to={targetFor(n)} className="notif-main-link">{getMessage(n)}</Link>
                    </p>
                    <time className="notif-time" dateTime={parseDbDate(n.created_at).toISOString()} title={fullDate(n.created_at)}>{timeAgo(n.created_at)}</time>
                  </div>
                  {!n.is_read && <div className="notif-dot" aria-hidden="true" />}
                  {!n.is_read && <span className="sr-only">Unread</span>}
                </div>
              ))}
            </div>
            <LoadMore hasMore={hasMore} loading={loadingMore} onMore={loadMore} failed={moreFailed} endLabel="That is all of your notifications" />
          </>
        )}
      </div>
    </div>
  );
}
