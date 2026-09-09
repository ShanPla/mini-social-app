import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Reply, Trash2, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useTimeAgo } from '../../lib/timeAgo';
import { useCooldown } from '../../lib/useCooldown';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import './CommentSection.css';

type CommentData = {
  id: string;
  user_id: string;
  post_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  profiles?: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  comment_likes?: { id: string; user_id: string }[];
  replies?: CommentData[];
};

type Props = {
  postId: string;
  currentUserId: string | null;
  isAdmin?: boolean;
};

export default function CommentSection({ postId, currentUserId, isAdmin = false }: Props) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOnCooldown, triggerCooldown] = useCooldown(3000);

  useEffect(() => { fetchComments(); }, [postId]);

  const fetchComments = async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(id, username, avatar_url), comment_likes(id, user_id)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (!data) return;

    /* Build nested tree */
    const map = new Map<string, CommentData>();
    const roots: CommentData[] = [];

    data.forEach((c) => map.set(c.id, { ...c, replies: [] }));
    data.forEach((c) => {
      if (c.parent_id && map.has(c.parent_id)) {
        map.get(c.parent_id)!.replies!.push(map.get(c.id)!);
      } else {
        roots.push(map.get(c.id)!);
      }
    });

    setComments(roots);
  };

  const handleSubmit = async (e: React.FormEvent, parentId: string | null, content: string, clearFn: () => void) => {
    e.preventDefault();
    if (!currentUserId || !content.trim() || loading || isOnCooldown) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: currentUserId,
        content: content.trim(),
        parent_id: parentId,
      })
      .select('*, profiles(id, username, avatar_url), comment_likes(id, user_id)')
      .single();

    if (!error && data) {
      /* The post owner's bell notification is raised server-side by trg_notify_comment */
      clearFn();
      fetchComments();
      triggerCooldown();
    }
    setLoading(false);
  };

  const handleDelete = async (commentId: string) => {
    await supabase.from('comments').delete().eq('id', commentId);
    fetchComments();
  };

  const handleLikeComment = async (commentId: string, isLiked: boolean) => {
    if (!currentUserId) return;
    if (isLiked) {
      await supabase.from('comment_likes').delete()
        .eq('comment_id', commentId).eq('user_id', currentUserId);
    } else {
      await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: currentUserId });
    }
    fetchComments();
  };

  return (
    <div className="comment-section">
      {/* Top-level comments */}
      <div className="comments-list">
        {comments.length === 0 && (
          <p className="no-comments">No comments yet. Be the first.</p>
        )}
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            postId={postId}
            onDelete={handleDelete}
            onLike={handleLikeComment}
            onReply={handleSubmit}
            loading={loading}
            isOnCooldown={isOnCooldown}
            depth={0}
          />
        ))}
      </div>

      {/* New top-level comment form */}
      {currentUserId && (
        <TopLevelForm onSubmit={handleSubmit} loading={loading} isOnCooldown={isOnCooldown} />
      )}
    </div>
  );
}

/* ── Top-level comment form ── */
function TopLevelForm({ onSubmit, loading, isOnCooldown }: {
  onSubmit: (e: React.FormEvent, parentId: null, content: string, clearFn: () => void) => void;
  loading: boolean;
  isOnCooldown: boolean;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => onSubmit(e, null, value, () => setValue(''))}
      className="comment-form"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a comment..."
        maxLength={300}
      />
      <button type="submit" disabled={loading || isOnCooldown || !value.trim()}>
        {isOnCooldown ? 'Wait…' : 'Post'}
      </button>
    </form>
  );
}

/* ── Single comment item (recursive) ── */
type CommentItemProps = {
  comment: CommentData;
  currentUserId: string | null;
  isAdmin: boolean;
  postId: string;
  onDelete: (id: string) => void;
  onLike: (id: string, isLiked: boolean) => void;
  onReply: (e: React.FormEvent, parentId: string, content: string, clearFn: () => void) => void;
  loading: boolean;
  isOnCooldown: boolean;
  depth: number;
};

function CommentItem({ comment, currentUserId, isAdmin, onDelete, onLike, onReply, loading, isOnCooldown, depth }: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showReplies, setShowReplies] = useState(depth < 1);
  const [replyValue, setReplyValue] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const commentTime = useTimeAgo(comment.created_at);

  const isOwner = currentUserId === comment.user_id;
  const canDelete = isOwner || isAdmin;
  const isLiked = comment.comment_likes?.some((l) => l.user_id === currentUserId) ?? false;
  const likeCount = comment.comment_likes?.length ?? 0;
  const replyCount = comment.replies?.length ?? 0;
  const indentDepth = Math.min(depth, 3);

  return (
    <>
      <div className={`comment-thread depth-${indentDepth}`}>
        <div className="comment-item">
          {/* Avatar */}
          <Link to={`/profile/${comment.user_id}`} className="comment-avatar">
            {comment.profiles?.avatar_url
              ? <img src={comment.profiles.avatar_url} alt={comment.profiles.username} loading="lazy" />
              : <span>{comment.profiles?.username?.[0]?.toUpperCase() || '?'}</span>
            }
          </Link>

          {/* Content bubble */}
          <div className="comment-body">
            <Link to={`/profile/${comment.user_id}`} className="comment-author">
              {comment.profiles?.username || 'Unknown'}
            </Link>
            <span className="comment-content">{comment.content}</span>
          </div>

          {/* Delete — opens confirmation modal */}
          {canDelete && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className={`comment-delete ${isAdmin && !isOwner ? 'comment-delete--admin' : ''}`}
              title={isAdmin && !isOwner ? 'Delete as admin' : 'Delete comment'}
            >
              {isAdmin && !isOwner ? <Shield size={11} /> : <Trash2 size={11} />}
            </button>
          )}
        </div>

        {/* Actions row */}
        <div className="comment-actions">
          <span className="comment-time">{commentTime}</span>

          {/* Like */}
          <button
            className={`comment-action-btn ${isLiked ? 'liked' : ''}`}
            onClick={() => onLike(comment.id, isLiked)}
            disabled={!currentUserId}
          >
            <Heart size={11} fill={isLiked ? 'currentColor' : 'none'} />
            {likeCount > 0 && <span>{likeCount}</span>}
          </button>

          {/* Reply */}
          {currentUserId && (
            <button
              className="comment-action-btn"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              <Reply size={11} />
              <span>Reply</span>
            </button>
          )}

          {/* Toggle replies */}
          {replyCount > 0 && (
            <button
              className="comment-action-btn comment-toggle-replies"
              onClick={() => setShowReplies(!showReplies)}
            >
              {showReplies ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              <span>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
            </button>
          )}
        </div>

        {/* Reply form */}
        {showReplyForm && (
          <form
            className="comment-reply-form"
            onSubmit={(e) => onReply(e, comment.id, replyValue, () => {
              setReplyValue('');
              setShowReplyForm(false);
              setShowReplies(true);
            })}
          >
            <input
              type="text"
              value={replyValue}
              onChange={(e) => setReplyValue(e.target.value)}
              placeholder={`Reply to @${comment.profiles?.username}…`}
              maxLength={300}
              autoFocus
            />
            <button type="submit" disabled={loading || isOnCooldown || !replyValue.trim()}>
              {isOnCooldown ? 'Wait…' : 'Reply'}
            </button>
            <button type="button" className="reply-cancel" onClick={() => setShowReplyForm(false)}>Cancel</button>
          </form>
        )}

        {/* Nested replies */}
        {showReplies && replyCount > 0 && (
          <div className="comment-replies">
            {comment.replies!.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                postId={comment.post_id}
                onDelete={onDelete}
                onLike={onLike}
                onReply={onReply}
                loading={loading}
                isOnCooldown={isOnCooldown}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <ConfirmModal
          title="Delete comment?"
          message={
            isAdmin && !isOwner
              ? `You are deleting @${comment.profiles?.username || 'this user'}'s comment as an admin. This cannot be undone.`
              : "This can't be undone. The comment and all its replies will be removed."
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          onConfirm={() => { onDelete(comment.id); setShowDeleteModal(false); }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}
