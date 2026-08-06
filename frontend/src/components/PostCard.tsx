import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { Post } from '../lib/supabaseClient';
import CommentSection from './CommentSection';
import './PostCard.css';

type PostCardProps = {
  post: Post;
  currentUserId: string | null;
  onDelete?: (postId: string) => void;
};

export default function PostCard({ post, currentUserId, onDelete }: PostCardProps) {
  const [likes, setLikes] = useState(post.likes || []);
  const [showComments, setShowComments] = useState(false);
  const [loading, setLoading] = useState(false);

  const isLiked = likes.some((l) => l.user_id === currentUserId);
  const likeCount = likes.length;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleLike = async () => {
    if (!currentUserId || loading) return;
    setLoading(true);

    if (isLiked) {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', currentUserId);
      if (!error) setLikes(likes.filter((l) => l.user_id !== currentUserId));
    } else {
      const { data, error } = await supabase
        .from('likes')
        .insert({ post_id: post.id, user_id: currentUserId })
        .select()
        .single();

      if (!error && data) {
        setLikes([...likes, data]);

        // Fire notification if liking someone else's post
        if (post.user_id !== currentUserId) {
          await supabase.from('notifications').insert({
            user_id: post.user_id,
            actor_id: currentUserId,
            type: 'like',
            post_id: post.id,
          });
        }
      }
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!currentUserId || post.user_id !== currentUserId) return;
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (!error && onDelete) onDelete(post.id);
  };

  return (
    <article className="post-card">
      <header className="post-header">
        <Link to={`/profile/${post.user_id}`} className="post-author">
          <div className="author-avatar">
            {post.profiles?.avatar_url ? (
              <img src={post.profiles.avatar_url} alt={post.profiles.username} />
            ) : (
              <span>{post.profiles?.username?.[0]?.toUpperCase() || '?'}</span>
            )}
          </div>
          <div>
            <span className="author-name">{post.profiles?.username || 'Unknown'}</span>
            <span className="post-date">{formatDate(post.created_at)}</span>
          </div>
        </Link>
        {currentUserId === post.user_id && (
          <button onClick={handleDelete} className="post-delete" title="Delete post">✕</button>
        )}
      </header>

      <p className="post-content">{post.content}</p>

      <footer className="post-footer">
        <button
          className={`post-action like-btn ${isLiked ? 'liked' : ''}`}
          onClick={handleLike}
          disabled={!currentUserId}
        >
          <span className="like-icon">{isLiked ? '♥' : '♡'}</span>
          <span>{likeCount} {likeCount === 1 ? 'like' : 'likes'}</span>
        </button>

        <button
          className="post-action comment-btn"
          onClick={() => setShowComments(!showComments)}
        >
          <span>✦</span>
          <span>{post.comments?.length || 0} {(post.comments?.length || 0) === 1 ? 'comment' : 'comments'}</span>
        </button>
      </footer>

      {showComments && (
        <CommentSection
          postId={post.id}
          postAuthorId={post.user_id}
          currentUserId={currentUserId}
        />
      )}
    </article>
  );
}
