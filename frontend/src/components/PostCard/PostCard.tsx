import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import { timeAgo } from '../../lib/timeAgo';
import CommentSection from '../CommentSection/CommentSection';
import ImageCollage from '../ImageCollage/ImageCollage';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import EditPostModal from '../EditPostModal/EditPostModal';
import './PostCard.css';

type PostCardProps = {
  post: Post;
  currentUserId: string | null;
  isAdmin?: boolean;
  onDelete?: (postId: string) => void;
};

const CHAR_LIMIT = 200;

/* Visibility badge helper */
const VisibilityBadge = ({ visibility }: { visibility?: string }) => {
  if (!visibility || visibility === 'public') return null;
  return (
    <span className="post-visibility-badge">
      {visibility === 'followers' ? '👥 Followers' : '🔒 Private'}
    </span>
  );
};

export default function PostCard({ post, currentUserId, isAdmin = false, onDelete }: PostCardProps) {
  const [currentPost, setCurrentPost] = useState(post);
  const [likes, setLikes] = useState(post.likes || []);
  const [showComments, setShowComments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [likeAnim, setLikeAnim] = useState<'pop' | 'unpop' | null>(null);
  const [showActions, setShowActions] = useState(false);

  const isLiked = likes.some((l) => l.user_id === currentUserId);
  const likeCount = likes.length;
  const isOwner = currentUserId === currentPost.user_id;
  const canDelete = isOwner || isAdmin;
  const isTruncated = currentPost.content && currentPost.content.length > CHAR_LIMIT;

  const handleLike = async () => {
    if (!currentUserId || loading) return;
    setLoading(true);

    if (isLiked) {
      setLikeAnim('unpop');
      const { error } = await supabase.from('likes').delete()
        .eq('post_id', currentPost.id).eq('user_id', currentUserId);
      if (!error) setLikes(likes.filter((l) => l.user_id !== currentUserId));
    } else {
      setLikeAnim('pop');
      const { data, error } = await supabase.from('likes')
        .insert({ post_id: currentPost.id, user_id: currentUserId })
        .select().single();

      if (!error && data) {
        setLikes([...likes, data]);
        if (currentPost.user_id !== currentUserId) {
          await supabase.from('notifications').insert({
            user_id: currentPost.user_id,
            actor_id: currentUserId,
            type: 'like',
            post_id: currentPost.id,
          });
        }
      }
    }
    setTimeout(() => setLikeAnim(null), 400);
    setLoading(false);
  };

  const handleDeleteConfirmed = async () => {
    const { error } = await supabase.from('posts').delete().eq('id', currentPost.id);
    if (!error && onDelete) onDelete(currentPost.id);
    setShowDeleteModal(false);
  };

  const handleEditSave = (updated: Post) => {
    setCurrentPost(updated);
  };

  const displayText = isTruncated && !expanded
    ? currentPost.content.slice(0, CHAR_LIMIT).trimEnd()
    : currentPost.content;

  const images = currentPost.post_images?.length
    ? currentPost.post_images.sort((a, b) => a.position - b.position).map((img) => img.image_url)
    : currentPost.image_url ? [currentPost.image_url] : [];

  return (
    <>
      <article className="post-card">
        {/* Header */}
        <header className="post-header">
          <Link to={`/profile/${currentPost.user_id}`} className="post-author">
            <div className="author-avatar">
              {currentPost.profiles?.avatar_url
                ? <img src={currentPost.profiles.avatar_url} alt={currentPost.profiles.username} />
                : <span>{currentPost.profiles?.username?.[0]?.toUpperCase() || '?'}</span>
              }
            </div>
            <div>
              <span className="author-name">{currentPost.profiles?.username || 'Unknown'}</span>
              <span className="post-date">{timeAgo(currentPost.created_at)}</span>
            </div>
          </Link>

          {/* Actions menu — only for owner or admin */}
          {canDelete && (
            <div className="post-actions-wrap">
              <button
                className="post-actions-btn"
                onClick={() => setShowActions(!showActions)}
                title="Post options"
              >
                ···
              </button>
              {showActions && (
                <div className="post-actions-dropdown">
                  {/* Edit — only for owner */}
                  {isOwner && (
                    <button
                      className="post-action-item"
                      onClick={() => { setShowActions(false); setShowEditModal(true); }}
                    >
                      ✏️ Edit post
                    </button>
                  )}
                  {/* Delete — for owner or admin */}
                  <button
                    className="post-action-item post-action-item--danger"
                    onClick={() => { setShowActions(false); setShowDeleteModal(true); }}
                  >
                    {isAdmin && !isOwner ? '🛡️ Delete as admin' : '🗑️ Delete post'}
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Visibility badge */}
        <VisibilityBadge visibility={(currentPost as any).visibility} />

        {/* Content */}
        {currentPost.content && (
          <p className="post-content">
            {displayText}
            {/* See more / see less */}
            {isTruncated && !expanded && (
              <>{'… '}<button className="see-more-btn" onClick={() => setExpanded(true)}>see more</button></>
            )}
            {isTruncated && expanded && (
              <>{' '}<button className="see-more-btn" onClick={() => setExpanded(false)}>see less</button></>
            )}
          </p>
        )}

        {/* Images */}
        {images.length > 0 && <ImageCollage images={images} />}

        {/* Footer */}
        <footer className="post-footer">
          <button
            className={`post-action like-btn ${isLiked ? 'liked' : ''}`}
            onClick={handleLike}
            disabled={!currentUserId}
          >
            <span className={`like-icon ${likeAnim === 'pop' ? 'like-icon--popping' : likeAnim === 'unpop' ? 'like-icon--unpopping' : ''}`}>
              {isLiked ? '♥' : '♡'}
            </span>
            <span>{likeCount} {likeCount === 1 ? 'like' : 'likes'}</span>
          </button>

          <button className="post-action comment-btn" onClick={() => setShowComments(!showComments)}>
            <span>✦</span>
            <span>{currentPost.comments?.length || 0} {(currentPost.comments?.length || 0) === 1 ? 'comment' : 'comments'}</span>
          </button>
        </footer>

        {/* Comments */}
        {showComments && (
          <CommentSection
            postId={currentPost.id}
            postAuthorId={currentPost.user_id}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
          />
        )}
      </article>

      {/* Edit modal */}
      {showEditModal && (
        <EditPostModal
          post={currentPost}
          onClose={() => setShowEditModal(false)}
          onSave={handleEditSave}
        />
      )}

      {/* Delete confirmation */}
      {showDeleteModal && (
        <ConfirmModal
          title={isAdmin && !isOwner ? 'Delete this post?' : 'Delete post?'}
          message={
            isAdmin && !isOwner
              ? `You are deleting @${currentPost.profiles?.username || 'this user'}'s post as an admin. This cannot be undone.`
              : "This can't be undone. The post and all its images will be permanently removed."
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
