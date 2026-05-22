import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import PostCard from '../../components/PostCard';
import './Feed.css';

type FeedProps = {
  userId: string | null;
};

export default function Feed({ userId }: FeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [feedType, setFeedType] = useState<'all' | 'following'>('all');

  useEffect(() => {
    fetchPosts();
  }, [feedType, userId]);

  const fetchPosts = async () => {
    setLoading(true);
    let query = supabase
      .from('posts')
      .select('*, profiles(id, username, avatar_url), likes(id, user_id), comments(id)')
      .order('created_at', { ascending: false });

    if (feedType === 'following' && userId) {
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId);
      const ids = follows?.map((f) => f.following_id) || [];
      if (ids.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }
      query = query.in('user_id', ids);
    }

    const { data } = await query.limit(50);
    setPosts((data as Post[]) || []);
    setLoading(false);
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !newPostContent.trim() || posting) return;
    setPosting(true);

    const { data, error } = await supabase
      .from('posts')
      .insert({ user_id: userId, content: newPostContent.trim() })
      .select('*, profiles(id, username, avatar_url), likes(id, user_id), comments(id)')
      .single();

    if (!error && data) {
      setPosts([data as Post, ...posts]);
      setNewPostContent('');
    }
    setPosting(false);
  };

  const handleDelete = (postId: string) => {
    setPosts(posts.filter((p) => p.id !== postId));
  };

  return (
    <div className="feed-page">
      <div className="feed-inner">
        <div className="feed-main">

          {/* Compose box */}
          {userId && (
            <div className="compose-card">
              <h3 className="compose-label">What's on your mind?</h3>
              <form onSubmit={handlePost}>
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="Share something with the world…"
                  maxLength={500}
                  rows={3}
                />
                <div className="compose-footer">
                  <span className="char-count">{newPostContent.length}/500</span>
                  <button type="submit" className="btn-primary" disabled={posting || !newPostContent.trim()}>
                    {posting ? 'Publishing…' : 'Publish'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Feed tabs */}
          <div className="feed-tabs">
            <button
              className={`feed-tab ${feedType === 'all' ? 'active' : ''}`}
              onClick={() => setFeedType('all')}
            >
              All Posts
            </button>
            {userId && (
              <button
                className={`feed-tab ${feedType === 'following' ? 'active' : ''}`}
                onClick={() => setFeedType('following')}
              >
                Following
              </button>
            )}
          </div>

          {/* Posts */}
          {loading ? (
            <div className="feed-loading">
              <div className="loading-dots"><span /><span /><span /></div>
            </div>
          ) : posts.length === 0 ? (
            <div className="feed-empty">
              <span className="empty-icon">✦</span>
              <p>
                {feedType === 'following'
                  ? 'Follow some users to see their posts here.'
                  : 'No posts yet. Be the first to publish!'}
              </p>
            </div>
          ) : (
            <div className="posts-list">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={userId}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="feed-sidebar">
          <div className="sidebar-card">
            <h4>The Chronicle</h4>
            <p>Share thoughts, connect with others, build your story — one post at a time.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
