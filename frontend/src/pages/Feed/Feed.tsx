import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import PostCard from '../../components/PostCard';
import EmptyState from '../../components/EmptyState';
import { usePageTitle } from '../../lib/usePageTitle';
import './Feed.css';

type FeedProps = {
  userId: string | null;
};

export default function Feed({ userId }: FeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [feedType, setFeedType] = useState<'all' | 'following'>('all');
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [newPostsBanner, setNewPostsBanner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  usePageTitle('Feed');

  useEffect(() => {
    fetchPosts();
  }, [feedType, userId]);

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
      .select('*, profiles(id, username, avatar_url), likes(id, user_id), comments(id)')
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageUrl(e.target.value);
    setImagePreview(e.target.value || null);
  };

  const clearImage = () => {
    setImageFile(null);
    setImageUrl('');
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || (!newPostContent.trim() && !imageFile && !imageUrl) || posting) return;
    setPosting(true);

    let finalImageUrl: string | null = null;
    if (imageFile) {
      const ext = imageFile.name.split('.').pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('post-images').upload(path, imageFile);
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
        finalImageUrl = urlData.publicUrl;
      }
    } else if (imageUrl.trim()) {
      finalImageUrl = imageUrl.trim();
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({ user_id: userId, content: newPostContent.trim(), image_url: finalImageUrl })
      .select('*, profiles(id, username, avatar_url), likes(id, user_id), comments(id)')
      .single();

    if (!error && data) {
      setPosts([data as Post, ...posts]);
      setNewPostContent('');
      clearImage();
    }
    setPosting(false);
  };

  const handleDelete = (postId: string) => setPosts(posts.filter((p) => p.id !== postId));

  return (
    <div className="feed-page">
      <div className="feed-inner">
        <div className="feed-main">
          {newPostsBanner && (
            <button className="new-posts-banner" onClick={fetchPosts}>
              ↑ New posts available — click to refresh
            </button>
          )}

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
                {imagePreview && (
                  <div className="compose-preview">
                    <img src={imagePreview} alt="Preview" onError={() => setImagePreview(null)} />
                    <button type="button" className="preview-remove" onClick={clearImage}>✕</button>
                  </div>
                )}
                <div className="compose-image-section">
                  <div className="image-mode-tabs">
                    <button type="button" className={`image-mode-tab ${uploadMode === 'file' ? 'active' : ''}`} onClick={() => setUploadMode('file')}>📁 Upload</button>
                    <button type="button" className={`image-mode-tab ${uploadMode === 'url' ? 'active' : ''}`} onClick={() => setUploadMode('url')}>🔗 URL</button>
                  </div>
                  {uploadMode === 'file' ? (
                    <div className="file-upload-area" onClick={() => fileInputRef.current?.click()}>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                      <span>{imageFile ? imageFile.name : 'Click to choose an image…'}</span>
                    </div>
                  ) : (
                    <input type="url" className="url-input" placeholder="Paste image URL…" value={imageUrl} onChange={handleUrlChange} />
                  )}
                </div>
                <div className="compose-footer">
                  <span className="char-count">{newPostContent.length}/500</span>
                  <button type="submit" className="btn-primary" disabled={posting || (!newPostContent.trim() && !imageFile && !imageUrl.trim())}>
                    {posting ? 'Publishing…' : 'Publish'}
                  </button>
                </div>
              </form>
            </div>
          )}

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
              <EmptyState
                icon="👥"
                title="Your following feed is empty"
                subtitle="Follow some users to see their posts here."
              />
            ) : (
              <EmptyState
                icon="✦"
                title="Nothing here yet"
                subtitle="Be the first to publish something!"
              />
            )
          ) : (
            <div className="posts-list">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} currentUserId={userId} onDelete={handleDelete} />
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
