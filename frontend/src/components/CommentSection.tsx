import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { Comment } from '../lib/supabaseClient';
import './CommentSection.css';

type Props = {
  postId: string;
  postAuthorId: string;
  currentUserId: string | null;
};

export default function CommentSection({ postId, postAuthorId, currentUserId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchComments();
  }, [postId]);

  const fetchComments = async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(id, username, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (data) setComments(data as Comment[]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !newComment.trim() || loading) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: currentUserId, content: newComment.trim() })
      .select('*, profiles(id, username, avatar_url)')
      .single();

    if (!error && data) {
      setComments([...comments, data as Comment]);
      setNewComment('');

      // Fire notification if commenting on someone else's post
      if (postAuthorId !== currentUserId) {
        await supabase.from('notifications').insert({
          user_id: postAuthorId,
          actor_id: currentUserId,
          type: 'comment',
          post_id: postId,
        });
      }
    }
    setLoading(false);
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (!error) setComments(comments.filter((c) => c.id !== commentId));
  };

  return (
    <div className="comment-section">
      <div className="comments-list">
        {comments.length === 0 && (
          <p className="no-comments">No comments yet. Be the first.</p>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="comment-item">
            <Link to={`/profile/${comment.user_id}`} className="comment-author">
              {comment.profiles?.username || 'Unknown'}
            </Link>
            <span className="comment-content">{comment.content}</span>
            {currentUserId === comment.user_id && (
              <button onClick={() => handleDelete(comment.id)} className="comment-delete">✕</button>
            )}
          </div>
        ))}
      </div>

      {currentUserId && (
        <form onSubmit={handleSubmit} className="comment-form">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            maxLength={300}
          />
          <button type="submit" disabled={loading || !newComment.trim()}>Post</button>
        </form>
      )}
    </div>
  );
}
