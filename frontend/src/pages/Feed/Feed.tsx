import { useState, useEffect, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import PostCard from '../../components/PostCard/PostCard';
import EmptyState from '../../components/EmptyState/EmptyState';
import ProfileCard from '../../components/ProfileCard/ProfileCard';
import QuickLinks from '../../components/QuickLinks/QuickLinks';
import WhoToFollow from '../../components/WhoToFollow/WhoToFollow';
import RecentChats from '../../components/RecentChats/RecentChats';
import ActiveThisWeek from '../../components/ActiveThisWeek/ActiveThisWeek';
import OnlineNow from '../../components/OnlineNow/OnlineNow';
import { usePageTitle } from '../../lib/usePageTitle';
import { useCooldown } from '../../lib/useCooldown';
import './Feed.css';

type FeedProps = {
  userId: string | null;
  isAdmin: boolean;
};

export default function Feed({ userId, isAdmin }: FeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [feedType, setFeedType] = useState<'all' | 'following'>('all');
  const [newPostsBanner, setNewPostsBanner] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOnCooldown, triggerCooldown] = useCooldown(3000);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 10);
    setImageFiles(files);
    setImagePreviews(files.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const clearImages = () => {
    setImageFiles([]);
    setImagePreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || (!newPostContent.trim() && !imageFiles.length) || posting || isOnCooldown) return;
    setPosting(true);

    const { data: postData, error: postError } = await supabase
      .from('posts')
      .insert({ user_id: userId, content: newPostContent.trim(), visibility })
      .select('*, profiles(id, username, avatar_url), likes(id, user_id), comments(id)')
      .single();

    if (postError || !postData) { setPosting(false); return; }

    if (imageFiles.length > 0) {
      const uploadedImages: { post_id: string; image_url: string; position: number }[] = [];

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const ext = file.name.split('.').pop();
        const path = `${userId}/${postData.id}/${i}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('post-images').upload(path, file);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
          uploadedImages.push({ post_id: postData.id, image_url: urlData.publicUrl, position: i });
        }
      }

      if (uploadedImages.length > 0) {
        await supabase.from('post_images').insert(uploadedImages);
        (postData as Post).post_images = uploadedImages.map((img, i) => ({
          id: `temp-${i}`,
          post_id: postData.id,
          image_url: img.image_url,
          position: img.position,
        }));
      }
    }

    setPosts([postData as Post, ...posts]);
    setNewPostContent('');
    clearImages();
    setPosting(false);
    triggerCooldown();
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

                {/* Image previews */}
                {imagePreviews.length > 0 && (
                  <div className="compose-previews">
                    {imagePreviews.map((src, i) => (
                      <div key={i} className="compose-preview-item">
                        <img src={src} alt={`Preview ${i + 1}`} />
                        <button type="button" className="preview-remove" onClick={() => removeImage(i)}>
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload button */}
                <div className="compose-image-section">
                  <div className="file-upload-area" onClick={() => fileInputRef.current?.click()}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    <ImagePlus size={15} />
                    <span>{imageFiles.length > 0 ? `${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} selected` : 'Add photos (up to 10)…'}</span>
                  </div>
                  {imageFiles.length > 0 && (
                    <button type="button" className="clear-images-btn" onClick={clearImages}>Clear all</button>
                  )}
                </div>

                {/* Visibility selector */}
                <div className="compose-visibility">
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as any)}
                    className="visibility-select"
                  >
                    <option value="public">Public</option>
                    <option value="followers">Followers only</option>
                    <option value="private">Private</option>
                  </select>
                </div>

                <div className="compose-footer">
                  <span className="char-count">{newPostContent.length}/500</span>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={posting || (!newPostContent.trim() && !imageFiles.length)}
                  >
                    {posting ? 'Publishing…' : 'Publish'}
                  </button>
                </div>
              </form>
            </div>
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
