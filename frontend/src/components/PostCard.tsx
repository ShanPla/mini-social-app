import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { Post } from '../lib/supabaseClient';
import CommentSection from './CommentSection';
import ImageCollage from './ImageCollage';
import ConfirmModal from './ConfirmModal';
import './PostCard.css';

type PostCardProps = {
  post: Post;
  currentUserId: string | null;
  isAdmin?: boolean;
  onDelete?: (postId: string) => void;
};

const CHAR_LIMIT = 200;

export default function PostCard({ post, currentUserId, isAdmin = false, onDelete }: PostCardProps) {
  const [likes, setLikes] = useState(post.likes || []);
  const [showComments, setShowComments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isLiked = likes.some((l) => l.user_id === currentUserId);
  const likeCount = likes.length;
  const isOwner = currentUserId === post.user_id;
  const canDelete = isOwner || isAdmin;
  const isTruncated = post.content && post.content.length > CHAR_LIMIT;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const images: string[] = post.post_images?.length
    ? post.post_images.sort((a, b) => a.position - b.position).map((img) => img.image_url)
    : post.image_url ? [post.image_url] : [];

  const handleLike = async () => {
    if (!currentUserId || loading) return;
    setLoading(true);

    if (isLiked) {
      const { error } = await supabase.from('likes').delete()
        .eq('post_id', post.id).eq('user_id', currentUserId);
      if (!error) setLikes(likes.filter((l) => l.user_id !== currentUserId));
    } else {
      const { data, error } = await supabase.from('likes')
        .insert({ post_id: post.id, user_id: currentUserId })
        .select().single();

      if (!error && data) {
        setLikes([...likes, data]);
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

  const handleDeleteConfirmed = async () => {
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (!error && onDelete) onDelete(post.id);
    setShowDeleteModal(false);
  };

  const displayText = isTruncated && !expanded
    ? post.content.slice(0, CHAR_LIMIT).trimEnd()
    : post.content;

  return (
    <>
      <article className="post-card">
        <header className="post-header">
          <Link to={`/profile/${post.user_id}`} className="post-author">
            <div className="author-avatar">
              {post.profiles?.avatar_url
                ? <img src={post.profiles.avatar_url} alt={post.profiles.username} />
                : <span>{post.profiles?.username?.[0]?.toUpperCase() || '?'}</span>
              }
            </div>
            <div>
              <span className="author-name">{post.profiles?.username || 'Unknown'}</span>
              <span className="post-date">{formatDate(post.created_at)}</span>
            </div>
          </Link>

          {canDelete && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className={`post-delete ${isAdmin && !isOwner ? 'post-delete--admin' : ''}`}
              title={isAdmin && !isOwner ? 'Delete as admin' : 'Delete post'}
            >
              {isAdmin && !isOwner ? '🛡️' : '✕'}
            </button>
          )}
        </header>

        {post.content && (
          <p className="post-content">
            {displayText}
            {isTruncated && !expanded && (
              <>{'… '}<button className="see-more-btn" onClick={() => setExpanded(true)}>see more</button></>
            )}
            {isTruncated && expanded && (
              <>{' '}<button className="see-more-btn" onClick={() => setExpanded(false)}>see less</button></>
            )}
          </p>
        )}

        {images.length > 0 && <ImageCollage images={images} />}

        <footer className="post-footer">
          <button
            className={`post-action like-btn ${isLiked ? 'liked' : ''}`}
            onClick={handleLike}
            disabled={!currentUserId}
          >
            <span className="like-icon">{isLiked ? '♥' : '♡'}</span>
            <span>{likeCount} {likeCount === 1 ? 'like' : 'likes'}</span>
          </button>

          <button className="post-action comment-btn" onClick={() => setShowComments(!showComments)}>
            <span>✦</span>
            <span>{post.comments?.length || 0} {(post.comments?.length || 0) === 1 ? 'comment' : 'comments'}</span>
          </button>
        </footer>

        {showComments && (
          <CommentSection
            postId={post.id}
            postAuthorId={post.user_id}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
          />
        )}
      </article>

      {showDeleteModal && (
        <ConfirmModal
          title={isAdmin && !isOwner ? 'Delete this post?' : 'Delete post?'}
          message={
            isAdmin && !isOwner
              ? `You are deleting @${post.profiles?.username || 'this user'}'s post as an admin. This cannot be undone.`
              : 'This can\'t be undone. The post and all its images will be permanently removed.'
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}
