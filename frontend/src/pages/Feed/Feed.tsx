import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import PostCard from '../../components/PostCard/PostCard';
import ComposePost from '../../components/ComposePost/ComposePost';
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
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedType, setFeedType] = useState<'all' | 'following'>('all');
  const [newPostsBanner, setNewPostsBanner] = useState(false);

  usePageTitle('Feed');

  useEffect(() => { fetchPosts(); }, [feedType, userId]);

  useEffect(() => {
    if (feedType !== 'all') return;
    const channel = supabase
      .channel('feed-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
        if (payload.new.user_id !== userId) setNewPostsBanner(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [feedType, userId]);

  const fetchPosts = async () => {
    setLoading(true);
    setNewPostsBanner(false);
    let query = supabase
      .from('posts')
      .select('*, profiles(id, username, avatar_url), likes(id, user_id), comments(id), post_images(id, image_url, position)')
      .order('created_at', { ascending: false });

    if (feedType === 'following' && userId) {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
      const ids = follows?.map((f) => f.following_id) || [];
      if (ids.length === 0) { setPosts([]); setLoading(false); return; }
      query = query.in('user_id', ids);
    }

    const { data } = await query.limit(50);
    setPosts((data as Post[]) || []);
    setLoading(false);
  };

  const handleDelete = (postId: string) => setPosts(posts.filter((p) => p.id !== postId));

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
            <button className="new-posts-banner" onClick={fetchPosts}>
              ↑ New posts available — click to refresh
            </button>
          )}

          {userId && (
            <ComposePost userId={userId} onPosted={(post) => setPosts((prev) => [post, ...prev])} />
          )}

          {/* Feed tabs */}
          <div className="feed-tabs">
            <button className={`feed-tab ${feedType === 'all' ? 'active' : ''}`} onClick={() => setFeedType('all')}>All Posts</button>
            {userId && <button className={`feed-tab ${feedType === 'following' ? 'active' : ''}`} onClick={() => setFeedType('following')}>Following</button>}
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
              <EmptyState icon="users" title="Your following feed is empty" subtitle="Follow some users to see their posts here." />
            ) : (
              <EmptyState icon="sparkles" title="Nothing here yet" subtitle="Be the first to publish something!" />
            )
          ) : (
            <div className="posts-list">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} currentUserId={userId} isAdmin={isAdmin} onDelete={handleDelete} />
              ))}
            </div>
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
