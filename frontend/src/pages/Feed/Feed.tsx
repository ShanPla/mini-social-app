import { useState, useEffect, useRef, useId } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePostList } from '../../lib/usePostList';
import PostCard from '../../components/PostCard/PostCard';
import ComposePost from '../../components/ComposePost/ComposePost';
import PostSkeletons from '../../components/PostSkeletons/PostSkeletons';
import LoadMore from '../../components/LoadMore/LoadMore';
import EmptyState from '../../components/EmptyState/EmptyState';
import ProfileCard from '../../components/ProfileCard/ProfileCard';
import QuickLinks from '../../components/QuickLinks/QuickLinks';
import WhoToFollow from '../../components/WhoToFollow/WhoToFollow';
import RecentChats from '../../components/RecentChats/RecentChats';
import ActiveThisWeek from '../../components/ActiveThisWeek/ActiveThisWeek';
import OnlineNow from '../../components/OnlineNow/OnlineNow';
import { usePageTitle } from '../../lib/usePageTitle';
import './Feed.css';

type FeedProps = {
  userId: string | null;
  isAdmin: boolean;
};

type FeedTab = 'all' | 'following';

/* Where the reader was when they left, per history entry, so Back returns there */
const scrollKey = (locationKey: string) => `chronicle-feed-scroll:${locationKey}`;

function readSavedScroll(locationKey: string): { y: number; tab: FeedTab } | null {
  try {
    const raw = sessionStorage.getItem(scrollKey(locationKey));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { y?: unknown; tab?: unknown };
    if (typeof saved.y !== 'number') return null;
    return { y: saved.y, tab: saved.tab === 'following' ? 'following' : 'all' };
  } catch {
    return null;
  }
}

export default function Feed({ userId, isAdmin }: FeedProps) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const tabsId = useId();
  /* Only a Back/Forward visit restores; a fresh visit starts at the top on the first tab */
  const [saved] = useState(() => (navigationType === 'POP' ? readSavedScroll(location.key) : null));
  const [feedType, setFeedType] = useState<FeedTab>(saved?.tab === 'following' && userId ? 'following' : 'all');
  /* Posts published by others since this list loaded, counted once each */
  const [newPostCount, setNewPostCount] = useState(0);
  const newPostIds = useRef(new Set<string>());
  /* Authors the reader follows, for counting on the Following tab; null while unknown */
  const [followingIds, setFollowingIds] = useState<Set<string> | null>(null);
  /* Bumped by the [new posts] banner to reload the current tab in place */
  const [refreshKey, setRefreshKey] = useState(0);
  const { posts, loading, loadingMore, hasMore, error, moreError, loadMore, prepend, remove, removeByAuthor } = usePostList({ mode: feedType }, refreshKey);
  const restored = useRef(false);

  usePageTitle('Feed');

  const tabs: { id: FeedTab; label: string }[] = userId
    ? [{ id: 'all', label: 'All Posts' }, { id: 'following', label: 'Following' }]
    : [{ id: 'all', label: 'All Posts' }];
  const tabId = (t: FeedTab) => `${tabsId}-tab-${t}`;
  const panelId = `${tabsId}-panel`;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error: followError } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
      if (cancelled || followError || !data) return;
      setFollowingIds(new Set(data.map((r) => r.following_id as string)));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    const channel = supabase
      .channel(`feed:${userId ?? 'anon'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
        const author = payload.new.user_id as string;
        if (author === userId) return;
        /* On Following only people the reader follows count; an unknown list counts everyone */
        if (feedType === 'following' && followingIds && !followingIds.has(author)) return;
        newPostIds.current.add(payload.new.id as string);
        setNewPostCount(newPostIds.current.size);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [feedType, userId, followingIds]);

  /* Remember the scroll position for Back. The last value is written when the
     page goes away or the tab changes. */
  useEffect(() => {
    let y = window.scrollY;
    const onScroll = () => { y = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    const tab = feedType;
    const key = scrollKey(location.key);
    return () => {
      window.removeEventListener('scroll', onScroll);
      try { sessionStorage.setItem(key, JSON.stringify({ y, tab })); } catch { /* storage blocked */ }
    };
  }, [feedType, location.key]);

  /* Back/forward: put the reader where they were once the posts are in */
  useEffect(() => {
    if (!saved || restored.current || loading) return;
    restored.current = true;
    window.scrollTo(0, saved.y);
  }, [saved, loading]);

  const clearNewPosts = () => {
    newPostIds.current.clear();
    setNewPostCount(0);
  };

  const refresh = () => {
    clearNewPosts();
    setRefreshKey((k) => k + 1);
  };

  const showNewPosts = () => {
    window.scrollTo(0, 0);
    refresh();
  };

  const switchTab = (tab: FeedTab) => {
    clearNewPosts();
    setFeedType(tab);
  };

  /* Arrow keys, Home and End move between the tabs, as in a native tab list */
  const handleTabKey = (e: React.KeyboardEvent) => {
    const index = tabs.findIndex((t) => t.id === feedType);
    let next: number;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    if (next === index) return;
    switchTab(tabs[next].id);
    document.getElementById(tabId(tabs[next].id))?.focus();
  };

  const bannerLabel = feedType === 'following' && !followingIds
    ? 'New posts available'
    : `${newPostCount} new post${newPostCount === 1 ? '' : 's'}`;

  return (
    <div className="feed-page">
      <h1 className="sr-only">Feed</h1>
      <div className="feed-inner">
        {/* Left column: you + shortcuts */}
        {userId && (
          <aside className="feed-sidebar feed-sidebar--left">
            <ProfileCard userId={userId} />
            <QuickLinks userId={userId} />
          </aside>
        )}

        <div className={`feed-main ${loading ? 'feed-main--loading' : ''}`}>
          {newPostCount > 0 && (
            <div className="new-posts-slot" role="status">
              <button type="button" className="new-posts-banner" onClick={showNewPosts}>
                ↑ {bannerLabel} — show
              </button>
            </div>
          )}

          {userId && <ComposePost userId={userId} onPosted={prepend} />}

          {/* Feed tabs */}
          <div className="feed-tabs" role="tablist" aria-label="Feed" onKeyDown={handleTabKey}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={tabId(t.id)}
                aria-selected={feedType === t.id}
                aria-controls={panelId}
                tabIndex={feedType === t.id ? 0 : -1}
                className={`feed-tab ${feedType === t.id ? 'active' : ''}`}
                onClick={() => switchTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={panelId} aria-labelledby={tabId(feedType)} className="feed-panel">
            {loading ? (
              <PostSkeletons count={3} />
            ) : error && posts.length === 0 ? (
              <EmptyState
                icon="alert"
                title="Could not load posts"
                subtitle="Check your connection and try again."
                action={<button type="button" className="btn-ghost" onClick={refresh}>Retry</button>}
              />
            ) : posts.length === 0 ? (
              feedType === 'following' ? (
                <EmptyState icon="users" title="Nothing from people you follow yet" subtitle="Follow some users, or check back once they post." />
              ) : (
                <EmptyState icon="sparkles" title="Nothing here yet" subtitle="Be the first to publish something!" />
              )
            ) : (
              <>
                <div className="posts-list">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} currentUserId={userId} isAdmin={isAdmin} onDelete={remove} onBlocked={removeByAuthor} />
                  ))}
                </div>
                <LoadMore hasMore={hasMore} loading={loadingMore} onMore={loadMore} failed={!!moreError} />
              </>
            )}
          </div>
        </div>

        {/* Right column: discovery + activity */}
        <aside className="feed-sidebar feed-sidebar--right">
          {userId && <OnlineNow userId={userId} />}
          {userId && <WhoToFollow userId={userId} />}
          <RecentChats />
          <ActiveThisWeek />
        </aside>
      </div>
    </div>
  );
}
