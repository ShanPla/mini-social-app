import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { Heart, Reply, Trash2, Shield, ChevronDown, ChevronUp, Flag, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useTimeAgo, parseDbDate, fullDate } from '../../lib/timeAgo';
import { useCooldown } from '../../lib/useCooldown';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import CharCount from '../CharCount/CharCount';
import ReportModal from '../ReportModal/ReportModal';
import MentionInput from '../MentionInput/MentionInput';
import MentionText from '../MentionText/MentionText';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import { displayName } from '../../lib/names';
import './CommentSection.css';

/* Comments and replies stop at 300; the counter only shows once the end is in sight */
const COMMENT_MAX = 300;
const COMMENT_COUNT_FROM = 240;

type CommentData = {
  id: string;
  user_id: string;
  post_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  /* Null until the text is edited; set by the server */
  updated_at?: string | null;
  profiles?: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  comment_likes?: { id: string; user_id: string }[];
  replies?: CommentData[];
};

/* ── Pure helpers over the nested tree ── */
function countTree(list: CommentData[]): number {
  return list.reduce((n, c) => n + 1 + countTree(c.replies || []), 0);
}

function findInTree(list: CommentData[], id: string): CommentData | undefined {
  for (const c of list) {
    if (c.id === id) return c;
    const hit = findInTree(c.replies || [], id);
    if (hit) return hit;
  }
  return undefined;
}

/* A new reply goes under its parent only; a new top-level comment goes last. A reply whose parent is gone is not shown. */
function insertInTree(list: CommentData[], node: CommentData): CommentData[] {
  if (!node.parent_id) return [...list, node];
  return list.map((c) => c.id === node.parent_id
    ? { ...c, replies: [...(c.replies || []), node] }
    : { ...c, replies: insertInTree(c.replies || [], node) });
}

function removeFromTree(list: CommentData[], id: string): CommentData[] {
  return list.filter((c) => c.id !== id).map((c) => ({ ...c, replies: removeFromTree(c.replies || [], id) }));
}

function setEditInTree(list: CommentData[], id: string, content: string, updatedAt: string | null): CommentData[] {
  return list.map((c) => c.id === id
    ? { ...c, content, updated_at: updatedAt }
    : { ...c, replies: setEditInTree(c.replies || [], id, content, updatedAt) });
}

function setLikeInTree(list: CommentData[], id: string, userId: string, liked: boolean): CommentData[] {
  return list.map((c) => {
    if (c.id !== id) return { ...c, replies: setLikeInTree(c.replies || [], id, userId, liked) };
    const others = (c.comment_likes || []).filter((l) => l.user_id !== userId);
    return { ...c, comment_likes: liked ? [...others, { id: `local-${userId}`, user_id: userId }] : others };
  });
}

type Props = {
  postId: string;
  currentUserId: string | null;
  isAdmin?: boolean;
  /* The post's author may delete any comment on their post */
  postOwnerId?: string;
  /* Total comments including replies, so the card's counter stays honest */
  onCountChange?: (count: number) => void;
};

export default function CommentSection({ postId, currentUserId, isAdmin = false, postOwnerId, onCountChange }: Props) {
  const [comments, setComments] = useState<CommentData[]>([]);
  /* Total including replies; null until the first load */
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  /* The comments fetch failed: say so instead of claiming there are none */
  const [loadFailed, setLoadFailed] = useState(false);
  const [isOnCooldown, triggerCooldown] = useCooldown(3000);
  /* Bumped only to recover from a failed write; the effect below owns the fetch */
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  /* The card counter follows the running total, not a refetch */
  useEffect(() => {
    if (total !== null) onCountChange?.(total);
  }, [total, onCountChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('*, profiles(id, username, display_name, avatar_url), comment_likes(id, user_id)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error || !data) { setLoadFailed(true); return; }
      setLoadFailed(false);

      /* Build nested tree */
      const map = new Map<string, CommentData>();
      const roots: CommentData[] = [];

      data.forEach((c) => map.set(c.id, { ...c, replies: [] }));
      data.forEach((c) => {
        if (c.parent_id && map.has(c.parent_id)) {
          map.get(c.parent_id)!.replies!.push(map.get(c.id)!);
        } else if (!c.parent_id) {
          roots.push(map.get(c.id)!);
        }
        /* A reply whose parent is missing was hidden by a block: drop it too */
      });

      setComments(roots);
      setTotal(countTree(roots));
    })();
    return () => { cancelled = true; };
  }, [postId, version]);

  const toast = useToast();

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
      .select('*, profiles(id, username, display_name, avatar_url), comment_likes(id, user_id)')
      .single();

    if (!error && data) {
      /* The post owner's bell notification is raised server-side by trg_notify_comment.
         Slot the returned row straight into the tree instead of refetching everything. */
      const node = { ...(data as CommentData), replies: [] };
      setComments((prev) => insertInTree(prev, node));
      setTotal((t) => (t ?? 0) + 1);
      clearFn();
      triggerCooldown();
    } else {
      toast.error(describeError(error, 'Could not post your comment. Please try again.'));
    }
    setLoading(false);
  };

  const handleDelete = async (commentId: string) => {
    /* Optimistic: the subtree disappears now; a failed delete refetches the truth */
    const node = findInTree(comments, commentId);
    const removed = node ? 1 + countTree(node.replies || []) : 1;
    setComments((prev) => removeFromTree(prev, commentId));
    setTotal((t) => Math.max(0, (t ?? removed) - removed));
    /* RLS refuses a delete with no error and no rows, so count the rows back */
    const { data: deleted, error } = await supabase.from('comments').delete().eq('id', commentId).select('id');
    if (error || !deleted || deleted.length === 0) {
      toast.error(describeError(error, 'Could not delete the comment.'));
      refresh();
    }
  };

  /* True when saved, so the form knows it can close. RLS refuses an edit with
     no error and no rows, which counts as a failure too. */
  const handleEdit = async (commentId: string, content: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('comments')
      .update({ content })
      .eq('id', commentId)
      .select('content, updated_at')
      .maybeSingle();
    if (error || !data) {
      toast.error(describeError(error, 'Could not save your comment. Please try again.'));
      return false;
    }
    setComments((prev) => setEditInTree(prev, commentId, data.content, data.updated_at));
    return true;
  };

  const handleLikeComment = async (commentId: string, isLiked: boolean) => {
    if (!currentUserId) return;
    /* Optimistic: flip the heart now, flip it back if the write fails */
    setComments((prev) => setLikeInTree(prev, commentId, currentUserId, !isLiked));
    const { error } = isLiked
      ? await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', currentUserId)
      : await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: currentUserId });
    /* 23505: the like already exists, which is what was asked for */
    if (error && !(error.code === '23505' && !isLiked)) {
      setComments((prev) => setLikeInTree(prev, commentId, currentUserId, isLiked));
      toast.error(describeError(error, 'Could not update your like.'));
    }
  };

  return (
    <div className="comment-section">
      {/* Top-level comments */}
      <div className="comments-list">
        {loadFailed && (
          <p className="no-comments" role="alert">
            Could not load comments.{' '}
            <button type="button" className="btn-ghost" onClick={refresh}>Retry</button>
          </p>
        )}
        {!loadFailed && comments.length === 0 && (
          <p className="no-comments">No comments yet. Be the first.</p>
        )}
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            postOwnerId={postOwnerId}
            postId={postId}
            onDelete={handleDelete}
            onEdit={handleEdit}
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
      <MentionInput
        value={value}
        onValueChange={setValue}
        placeholder="Add a comment..."
        aria-label="Add a comment"
        maxLength={COMMENT_MAX}
      />
      {value.length >= COMMENT_COUNT_FROM && <CharCount length={value.length} max={COMMENT_MAX} className="comment-char-count" />}
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
  postOwnerId?: string;
  postId: string;
  onDelete: (id: string) => void;
  onEdit: (id: string, content: string) => Promise<boolean>;
  onLike: (id: string, isLiked: boolean) => void;
  onReply: (e: React.FormEvent, parentId: string, content: string, clearFn: () => void) => void;
  loading: boolean;
  isOnCooldown: boolean;
  depth: number;
};

function CommentItem({ comment, currentUserId, isAdmin, postOwnerId, onDelete, onEdit, onLike, onReply, loading, isOnCooldown, depth }: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showReplies, setShowReplies] = useState(depth < 1);
  const [replyValue, setReplyValue] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const commentTime = useTimeAgo(comment.created_at);
  const replyBtnRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const editBtnRef = useRef<HTMLButtonElement>(null);

  const isOwner = currentUserId === comment.user_id;
  const isPostOwner = !!currentUserId && currentUserId === postOwnerId;
  /* Shield = deleting someone else's comment with admin power only */
  const asAdmin = isAdmin && !isOwner && !isPostOwner;
  const canDelete = isOwner || isPostOwner || isAdmin;
  const isLiked = comment.comment_likes?.some((l) => l.user_id === currentUserId) ?? false;
  const likeCount = comment.comment_likes?.length ?? 0;
  const replyCount = comment.replies?.length ?? 0;
  const indentDepth = Math.min(depth, 3);
  const editTrimmed = editValue.trim();

  const closeEdit = () => {
    /* The Edit button is disabled while the form is open, and a disabled button can not take focus */
    flushSync(() => setEditing(false));
    editBtnRef.current?.focus();
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingEdit || !editTrimmed) return;
    if (editTrimmed === comment.content) { closeEdit(); return; }
    setSavingEdit(true);
    const saved = await onEdit(comment.id, editTrimmed);
    setSavingEdit(false);
    if (saved) closeEdit();
  };

  return (
    <>
      <div className={`comment-thread depth-${indentDepth}`}>
        <div className="comment-item">
          {/* Avatar */}
          <Link to={`/profile/${comment.user_id}`} className="comment-avatar">
            {comment.profiles?.avatar_url
              ? <img src={comment.profiles.avatar_url} alt={comment.profiles.username} width={28} height={28} loading="lazy" decoding="async" />
              : <span>{comment.profiles?.username?.[0]?.toUpperCase() || '?'}</span>
            }
          </Link>

          {/* Edit form, in place of the bubble */}
          {editing && (
            <form className="comment-reply-form comment-edit-form" onSubmit={submitEdit}>
              <MentionInput
                value={editValue}
                onValueChange={setEditValue}
                placeholder="Edit your comment…"
                aria-label="Edit your comment"
                maxLength={COMMENT_MAX}
                autoFocus
                onKeyDown={(e) => {
                  /* Escape keeps the old text and hands focus back to the Edit button */
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeEdit();
                  }
                }}
              />
              {editValue.length >= COMMENT_COUNT_FROM && <CharCount length={editValue.length} max={COMMENT_MAX} className="comment-char-count" />}
              <button type="submit" disabled={savingEdit || !editTrimmed}>
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="reply-cancel" onClick={closeEdit}>Cancel</button>
            </form>
          )}

          {/* Content bubble */}
          {!editing && (
            <div className="comment-body">
              <Link to={`/profile/${comment.user_id}`} className="comment-author">
                {comment.profiles ? displayName(comment.profiles) : 'Unknown'}
              </Link>
              <span className="comment-content"><MentionText text={comment.content} /></span>
            </div>
          )}

          {/* Delete — opens confirmation modal */}
          {canDelete && !editing && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className={`comment-delete ${asAdmin ? 'comment-delete--admin' : ''}`}
              title={asAdmin ? 'Delete as admin' : 'Delete comment'}
              aria-label={asAdmin ? 'Delete comment as admin' : 'Delete comment'}
            >
              {asAdmin ? <Shield size={11} /> : <Trash2 size={11} />}
            </button>
          )}
        </div>

        {/* Actions row */}
        <div className="comment-actions">
          <time
            className="comment-time"
            dateTime={parseDbDate(comment.created_at).toISOString()}
            title={fullDate(comment.created_at)}
          >{commentTime}</time>

          {/* Set by the server when the text changed */}
          {comment.updated_at && (
            <time
              className="comment-edited"
              dateTime={parseDbDate(comment.updated_at).toISOString()}
              title={`Edited ${fullDate(comment.updated_at)}`}
            >(edited)</time>
          )}

          {/* Like */}
          <button
            className={`comment-action-btn ${isLiked ? 'liked' : ''}`}
            onClick={() => onLike(comment.id, isLiked)}
            disabled={!currentUserId}
            aria-pressed={isLiked}
            aria-label={`Like comment, ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`}
          >
            <Heart size={11} fill={isLiked ? 'currentColor' : 'none'} />
            {likeCount > 0 && <span>{likeCount}</span>}
          </button>

          {/* Reply */}
          {currentUserId && (
            <button
              ref={replyBtnRef}
              className="comment-action-btn"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              <Reply size={11} />
              <span>Reply</span>
            </button>
          )}

          {/* Edit — your own comments */}
          {isOwner && (
            <button
              ref={editBtnRef}
              className="comment-action-btn"
              onClick={() => { setEditValue(comment.content); setEditing(true); }}
              disabled={editing}
            >
              <Pencil size={11} />
              <span>Edit</span>
            </button>
          )}

          {/* Report — other people's comments */}
          {currentUserId && !isOwner && (
            <button className="comment-action-btn" onClick={() => setShowReport(true)}>
              <Flag size={11} />
              <span>Report</span>
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
            <MentionInput
              value={replyValue}
              onValueChange={setReplyValue}
              placeholder={`Reply to @${comment.profiles?.username}…`}
              aria-label={`Reply to ${comment.profiles ? displayName(comment.profiles) : 'this comment'}`}
              maxLength={COMMENT_MAX}
              autoFocus
              onKeyDown={(e) => {
                /* Escape closes the form and hands focus back to the Reply button */
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowReplyForm(false);
                  replyBtnRef.current?.focus();
                }
              }}
            />
            {replyValue.length >= COMMENT_COUNT_FROM && <CharCount length={replyValue.length} max={COMMENT_MAX} className="comment-char-count" />}
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
                postOwnerId={postOwnerId}
                postId={comment.post_id}
                onDelete={onDelete}
                onEdit={onEdit}
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

      {showReport && <ReportModal targetType="comment" targetId={comment.id} onClose={() => setShowReport(false)} />}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <ConfirmModal
          title="Delete comment?"
          message={
            asAdmin
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
