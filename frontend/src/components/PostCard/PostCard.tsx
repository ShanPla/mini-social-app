import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, MoreHorizontal, Pencil, Trash2, Shield, Users, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import { useTimeAgo } from '../../lib/timeAgo';
import CommentSection from '../CommentSection/CommentSection';
import ImageCollage from '../ImageCollage/ImageCollage';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import EditPostModal from '../EditPostModal/EditPostModal';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import { pruneFolder, removePostImageFiles } from '../../lib/storage';
import { displayName } from '../../lib/names';
import './PostCard.css';

type PostCardProps = {
  post: Post;
  currentUserId: string | null;
  isAdmin?: boolean;
  onDelete?: (postId: string) => void;
  /* /post/:id opens with the thread visible */
  defaultShowComments?: boolean;
};

const CHAR_LIMIT = 200;

/* Visibility badge helper */
const VisibilityBadge = ({ visibility }: { visibility?: string }) => {
  if (!visibility || visibility === 'public') return null;
  return (
    <span className="post-visibility-badge">
      {visibility === 'followers'
        ? <><Users size={11} /> Followers</>
        : <><Lock size={11} /> Private</>
      }
    </span>
  );
};

export default function PostCard({ post, currentUserId, isAdmin = false, onDelete, defaultShowComments = false }: PostCardProps) {
  const [currentPost, setCurrentPost] = useState(post);
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [showComments, setShowComments] = useState(defaultShowComments);
  /* Seeded from fetch_posts; CommentSection reports the live total once open */
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [likeAnim, setLikeAnim] = useState<'pop' | 'unpop' | null>(null);
  const [showActions, setShowActions] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const postDate = useTimeAgo(currentPost.created_at);

  /* Close actions dropdown on outside click — listener only lives while open */
  useEffect(() => {
    if (!showActions) return;
    const handleClick = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showActions]);

  const isOwner = currentUserId === currentPost.user_id;
  const canDelete = isOwner || isAdmin;
  const isTruncated = currentPost.content && currentPost.content.length > CHAR_LIMIT;

  const toast = useToast();

  const handleLike = async () => {
    if (!currentUserId || loading) return;
    setLoading(true);
    const wasLiked = liked;

    /* Optimistic: flip now, roll back if the write fails.
       The bell notification is raised server-side by trg_notify_like. */
    setLiked(!wasLiked);
    setLikeCount((c) => c + (wasLiked ? -1 : 1));
    setLikeAnim(wasLiked ? 'unpop' : 'pop');

    const { error } = wasLiked
      ? await supabase.from('likes').delete().eq('post_id', currentPost.id).eq('user_id', currentUserId)
      : await supabase.from('likes').insert({ post_id: currentPost.id, user_id: currentUserId });

    if (error) {
      setLiked(wasLiked);
      setLikeCount((c) => c + (wasLiked ? 1 : -1));
      toast.error(describeError(error, wasLiked ? 'Could not remove your like.' : 'Could not like this post.'));
    }
    setTimeout(() => setLikeAnim(null), 400);
    setLoading(false);
  };

  const handleDeleteConfirmed = async () => {
    const { error } = await supabase.from('posts').delete().eq('id', currentPost.id);
    if (error) {
      toast.error(describeError(error, 'Could not delete the post.'));
    } else {
      toast.success('Post deleted');
      onDelete?.(currentPost.id);
      /* Best effort, after the row is gone: every file under {user}/{post},
         plus the legacy single image if the post predates post_images */
      void pruneFolder('post-images', `${currentPost.user_id}/${currentPost.id}`);
      if (currentPost.image_url) void removePostImageFiles([currentPost.image_url]);
    }
    setShowDeleteModal(false);
  };

  const handleEditSave = (updated: Post) => {
    setCurrentPost(updated);
  };

  const displayText = isTruncated && !expanded
    ? currentPost.content.slice(0, CHAR_LIMIT).trimEnd()
    : currentPost.content;

  const images = currentPost.post_images?.length
    ? [...currentPost.post_images].sort((a, b) => a.position - b.position).map((img) => img.image_url)
    : currentPost.image_url ? [currentPost.image_url] : [];

  return (
    <>
      <article className="post-card">
        {/* Header */}
        <header className="post-header">
          <Link to={`/profile/${currentPost.user_id}`} className="post-author">
            <div className="author-avatar">
              {currentPost.profiles?.avatar_url
                ? <img src={currentPost.profiles.avatar_url} alt={currentPost.profiles.username} loading="lazy" />
                : <span>{currentPost.profiles?.username?.[0]?.toUpperCase() || '?'}</span>
              }
            </div>
            <div>
              <span className="author-name">
                {currentPost.profiles ? displayName(currentPost.profiles) : 'Unknown'}
                {currentPost.profiles?.display_name && <span className="author-handle">@{currentPost.profiles.username}</span>}
              </span>
              <span className="post-date">{postDate}</span>
            </div>
          </Link>

          {/* Actions menu */}
          {canDelete && (
            <div className="post-actions-wrap" ref={actionsRef}>
              <button
                className="post-actions-btn"
                onClick={() => setShowActions(!showActions)}
                title="Post options"
                aria-label="Post options"
              >
                <MoreHorizontal size={18} />
              </button>
              {showActions && (
                <div className="post-actions-dropdown">
                  {/* Edit — owner only */}
                  {isOwner && (
                    <button
                      className="post-action-item"
                      onClick={() => { setShowActions(false); setShowEditModal(true); }}
                    >
                      <Pencil size={14} /> Edit post
                    </button>
                  )}
                  {/* Delete */}
                  <button
                    className="post-action-item post-action-item--danger"
                    onClick={() => { setShowActions(false); setShowDeleteModal(true); }}
                  >
                    {isAdmin && !isOwner
                      ? <><Shield size={14} /> Delete as admin</>
                      : <><Trash2 size={14} /> Delete post</>
                    }
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Visibility badge */}
        <VisibilityBadge visibility={currentPost.visibility} />

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
            className={`post-action like-btn ${liked ? 'liked' : ''}`}
            onClick={handleLike}
            disabled={!currentUserId}
            aria-pressed={liked}
          >
            <span className={`like-icon ${likeAnim === 'pop' ? 'like-icon--popping' : likeAnim === 'unpop' ? 'like-icon--unpopping' : ''}`}>
              <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
            </span>
            <span>{likeCount} {likeCount === 1 ? 'like' : 'likes'}</span>
          </button>

          <button className="post-action comment-btn" onClick={() => setShowComments(!showComments)}>
            <MessageCircle size={15} />
            <span>{commentCount} {commentCount === 1 ? 'comment' : 'comments'}</span>
          </button>
        </footer>

        {/* Comments */}
        {showComments && (
          <CommentSection
            postId={currentPost.id}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onCountChange={setCommentCount}
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
