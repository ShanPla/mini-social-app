import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import type { ChatMember, ChatMessage } from '../../lib/supabaseClient';
import { messageTime } from '../../lib/chat';
import { displayName } from '../../lib/names';
import './MessageBubble.css';

type Props = {
  message: ChatMessage;
  /* Signed URL for message.image_url (the bucket is private); undefined while loading */
  imageSrc?: string;
  isOwn: boolean;
  sender?: ChatMember;
  /* Group chats show who sent a message (first bubble in a run only) */
  showSender: boolean;
  /* Show the avatar on the last bubble of a run from someone else */
  showAvatar: boolean;
  /* Consecutive bubble from the same sender within a few minutes */
  grouped: boolean;
  /* "Seen" / "Seen by …" under the last own message */
  seenLabel?: string | null;
  onDelete?: () => void;
  onImageClick?: (url: string) => void;
};

export default function MessageBubble({
  message,
  imageSrc,
  isOwn,
  sender,
  showSender,
  showAvatar,
  grouped,
  seenLabel,
  onDelete,
  onImageClick,
}: Props) {
  const time = messageTime(message.created_at);

  return (
    <div className={`msg-row ${isOwn ? 'msg-row--own' : ''} ${grouped ? 'msg-row--grouped' : ''}`}>
      {/* Avatar column (other people only) */}
      {!isOwn && (
        <div className="msg-avatar-col">
          {showAvatar && (
            message.sender_id ? (
              <Link to={`/profile/${message.sender_id}`} className="msg-avatar" title={sender ? `@${sender.username}` : ''}>
                {sender?.avatar_url
                  ? <img src={sender.avatar_url} alt={sender.username} loading="lazy" />
                  : <span>{sender?.username?.[0]?.toUpperCase() || '?'}</span>
                }
              </Link>
            ) : (
              /* Deleted account: nowhere to link to */
              <span className="msg-avatar"><span>?</span></span>
            )
          )}
        </div>
      )}

      <div className="msg-body">
        {/* Sender name (group chats) */}
        {showSender && sender && (
          <span className="msg-sender">{displayName(sender)}</span>
        )}

        <div className="msg-bubble-wrap">
          {/* Delete (own messages) */}
          {isOwn && onDelete && (
            <button className="msg-delete" onClick={onDelete} title="Unsend">
              <Trash2 size={13} />
            </button>
          )}

          <div className={`msg-bubble ${message.image_url && !message.content ? 'msg-bubble--image-only' : ''}`} title={time}>
            {message.image_url && (
              imageSrc ? (
                <button
                  type="button"
                  className="msg-image"
                  onClick={() => onImageClick?.(imageSrc)}
                >
                  <img src={imageSrc} alt="" loading="lazy" />
                </button>
              ) : (
                <div className="msg-image msg-image--loading" />
              )
            )}
            {message.content && <p className="msg-text">{message.content}</p>}
          </div>
        </div>

        {seenLabel && <span className="msg-seen">{seenLabel}</span>}
      </div>
    </div>
  );
}
