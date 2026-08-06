import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import PostCard from '../../components/PostCard';
import { usePageTitle } from '../../lib/usePageTitle';
import './Post.css';

type PostPageProps = {
  currentUserId: string | null;
};

export default function PostPage({ currentUserId }: PostPageProps) {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  usePageTitle('Post');

  useEffect(() => {
    if (postId) fetchPost();
  }, [postId]);

  const fetchPost = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, profiles(id, username, avatar_url), likes(id, user_id), comments(id, user_id, content, created_at, profiles(id, username))')
      .eq('id', postId)
      .single();
    setPost(data as Post);
    setLoading(false);
  };

  const handleDelete = () => navigate('/feed');

  if (loading) return <div className="post-page-loading">Loading…</div>;
  if (!post) return <div className="post-page-loading">Post not found.</div>;

  return (
    <div className="post-detail-page">
      <div className="post-detail-inner">
        <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
        <PostCard post={post} currentUserId={currentUserId} onDelete={handleDelete} />
      </div>
    </div>
  );
}
