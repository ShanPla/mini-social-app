import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import type { ChatMember, ChatMessage } from '../../lib/supabaseClient';
import { messageTime } from '../../lib/chat';
import { displayName } from '../../lib/names';
import { parseDbDate, fullDate } from '../../lib/timeAgo';
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
  /* Must be a stable function (the bubble is memoised): it receives the message */
  onDelete?: (message: ChatMessage) => void;
  onImageClick?: (url: string) => void;
};

function MessageBubble({
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
  /* Tap (or Enter / Space) on a bubble shows its time underneath; there is no hover on a phone */
  const [showTime, setShowTime] = useState(false);
  /* An image bubble holds a button already, so only text bubbles are keyboard targets */
  const keyboardToggle = !message.image_url;

  const toggleTime = (e: React.MouseEvent) => {
    /* The photo, links and buttons inside keep their own action; selecting text is not a tap */
    if ((e.target as HTMLElement).closest('a, button')) return;
    if (window.getSelection()?.toString()) return;
    setShowTime((v) => !v);
  };

  return (
    <div className={`msg-row ${isOwn ? 'msg-row--own' : ''} ${grouped ? 'msg-row--grouped' : ''}`}>
      {/* Avatar column (other people only) */}
      {!isOwn && (
        <div className="msg-avatar-col">
          {showAvatar && (
            message.sender_id ? (
              <Link to={`/profile/${message.sender_id}`} className="msg-avatar" title={sender ? `@${sender.username}` : ''}>
                {sender?.avatar_url
                  ? <img src={sender.avatar_url} alt={sender.username} width={28} height={28} loading="lazy" decoding="async" />
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
            <button className="msg-delete" onClick={() => onDelete(message)} title="Unsend" aria-label="Unsend message">
              <Trash2 size={13} />
            </button>
          )}

          <div
            className={`msg-bubble ${message.image_url && !message.content ? 'msg-bubble--image-only' : ''}`}
            title={fullDate(message.created_at)}
            onClick={toggleTime}
            {...(keyboardToggle ? {
              role: 'button',
              tabIndex: 0,
              'aria-expanded': showTime,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowTime((v) => !v); }
              },
            } : {})}
          >
            {message.image_url && (
              imageSrc ? (
                <button
                  type="button"
                  className="msg-image"
                  onClick={() => onImageClick?.(imageSrc)}
                  aria-label="Open photo"
                >
                  <img src={imageSrc} alt="" width={240} height={180} loading="lazy" decoding="async" />
                </button>
              ) : (
                <div className="msg-image msg-image--loading" />
              )
            )}
            {message.content && <p className="msg-text">{message.content}</p>}
          </div>
        </div>

        {showTime && (
          <time className="msg-time" dateTime={parseDbDate(message.created_at).toISOString()} title={fullDate(message.created_at)}>
            {time}
          </time>
        )}
        {seenLabel && <span className="msg-seen">{seenLabel}</span>}
      </div>
    </div>
  );
}

/* Memoised: a thread re-renders on every keystroke and new message, a bubble only when its own props change */
export default memo(MessageBubble);
