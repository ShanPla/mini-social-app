import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePostList } from '../../lib/usePostList';
import PostCard from '../../components/PostCard/PostCard';
import ComposePost from '../../components/ComposePost/ComposePost';
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

export default function Feed({ userId, isAdmin }: FeedProps) {
  const [feedType, setFeedType] = useState<'all' | 'following'>('all');
  const [newPostsBanner, setNewPostsBanner] = useState(false);
  /* Bumped by the [new posts] banner to reload the current tab in place */
  const [refreshKey, setRefreshKey] = useState(0);
  const { posts, loading, loadingMore, hasMore, loadMore, prepend, remove } = usePostList({ mode: feedType }, refreshKey);

  usePageTitle('Feed');

  useEffect(() => {
    if (feedType !== 'all') return;
    const channel = supabase
      .channel(`feed:${userId ?? 'anon'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
        if (payload.new.user_id !== userId) setNewPostsBanner(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [feedType, userId]);

  const refresh = () => {
    setNewPostsBanner(false);
    setRefreshKey((k) => k + 1);
  };

  const switchTab = (tab: 'all' | 'following') => {
    setNewPostsBanner(false);
    setFeedType(tab);
  };

  return (
    <div className="feed-page">
      <div className="feed-inner">
        {/* Left column: you + shortcuts */}
        {userId && (
          <aside className="feed-sidebar feed-sidebar--left">
            <ProfileCard userId={userId} />
            <QuickLinks userId={userId} />
          </aside>
        )}

        <div className="feed-main">
          {newPostsBanner && (
            <button className="new-posts-banner" onClick={refresh}>
              ↑ New posts available — click to refresh
            </button>
          )}

          {userId && <ComposePost userId={userId} onPosted={prepend} />}

          {/* Feed tabs */}
          <div className="feed-tabs">
            <button className={`feed-tab ${feedType === 'all' ? 'active' : ''}`} onClick={() => switchTab('all')}>All Posts</button>
            {userId && <button className={`feed-tab ${feedType === 'following' ? 'active' : ''}`} onClick={() => switchTab('following')}>Following</button>}
          </div>

          {loading ? (
            <div className="feed-skeletons">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-post-card">
                  <div className="skeleton-header">
                    <div className="skeleton-avatar-sm" />
                    <div className="skeleton-meta">
                      <div className="skeleton-line short" />
                      <div className="skeleton-line xshort" />
                    </div>
                  </div>
                  <div className="skeleton-line wide" />
                  <div className="skeleton-line medium" />
                </div>
              ))}
            </div>
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
                  <PostCard key={post.id} post={post} currentUserId={userId} isAdmin={isAdmin} onDelete={remove} />
                ))}
              </div>
              <LoadMore hasMore={hasMore} loading={loadingMore} onMore={loadMore} />
            </>
          )}
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
