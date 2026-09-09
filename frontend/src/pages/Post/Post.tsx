import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Post } from '../../lib/supabaseClient';
import { fetchPosts } from '../../lib/posts';
import PostCard from '../../components/PostCard/PostCard';
import EmptyState from '../../components/EmptyState/EmptyState';
import { usePageTitle } from '../../lib/usePageTitle';
import './Post.css';

type PostPageProps = {
  currentUserId: string | null;
  isAdmin: boolean;
};

/* /post/:postId. App remounts this per path, so state starts fresh for each post. */
export default function PostPage({ currentUserId, isAdmin }: PostPageProps) {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  usePageTitle(post?.profiles?.username ? `Post by @${post.profiles.username}` : 'Post');

  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    (async () => {
      /* Same shape as the feed. A missing or hidden post is simply no rows. */
      const page = await fetchPosts({ postId }, null, 1);
      if (cancelled) return;
      setPost(page.posts[0] || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [postId]);

  const handleDelete = () => navigate('/feed');

  if (loading) return <div className="post-page-loading">Loading…</div>;

  return (
    <div className="post-detail-page">
      <div className="post-detail-inner">
        <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
        {post ? (
          /* Someone arriving from a comment notification wants the comments open */
          <PostCard post={post} currentUserId={currentUserId} isAdmin={isAdmin} onDelete={handleDelete} defaultShowComments />
        ) : (
          <EmptyState
            icon="search"
            title="Post not found"
            subtitle="It may have been deleted, or it is not visible to you."
            action={<button className="btn-ghost" onClick={() => navigate('/feed')}>Back to feed</button>}
          />
        )}
      </div>
    </div>
  );
}
