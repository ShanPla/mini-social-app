import { memo, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CornerUpLeft, SmilePlus, Trash2 } from 'lucide-react';
import type { ChatMember, ChatMessage } from '../../lib/supabaseClient';
import { messageTime } from '../../lib/chat';
import { displayName } from '../../lib/names';
import { parseDbDate, fullDate } from '../../lib/timeAgo';
import { summarizeReactions, reactorLabel } from '../../lib/reactions';
import type { Reaction } from '../../lib/reactions';
import { replyPreview } from '../../lib/replies';
import ReactionPicker from '../ReactionPicker/ReactionPicker';
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
  /* Sent by someone I blocked (group chats): collapsed until I press Show */
  blockedSender: boolean;
  /* Everyone's reactions on this message; the same array until one of them changes */
  reactions: Reaction[];
  myId: string | null;
  /* The functions below must all be stable (the bubble is memoised) */
  nameOf: (userId: string | null) => string;
  onDelete?: (message: ChatMessage) => void;
  onImageClick?: (url: string) => void;
  onReact: (message: ChatMessage, emoji: string) => void;
  onReply: (message: ChatMessage) => void;
  onJumpTo: (messageId: string) => void;
};

const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP = 10;

type PickerState = { anchor: { top: number; bottom: number; left: number; width: number }; withReply: boolean };

function MessageBubble({
  message,
  imageSrc,
  isOwn,
  sender,
  showSender,
  showAvatar,
  grouped,
  seenLabel,
  blockedSender,
  reactions,
  myId,
  nameOf,
  onDelete,
  onImageClick,
  onReact,
  onReply,
  onJumpTo,
}: Props) {
  const time = messageTime(message.created_at);
  /* Tap (or Enter / Space) on a bubble shows its time underneath; there is no hover on a phone */
  const [showTime, setShowTime] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const reactBtnRef = useRef<HTMLButtonElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef({ x: 0, y: 0 });
  /* A long press just opened the bar: the lift of the finger must not also toggle the time */
  const longPressed = useRef(false);
  /* An image bubble holds a button already, so only text bubbles are keyboard targets */
  const keyboardToggle = !message.image_url;

  const chips = useMemo(() => summarizeReactions(reactions, myId), [reactions, myId]);
  const myReaction = chips.find((c) => c.mine)?.emoji ?? null;

  const toggleTime = (e: React.MouseEvent) => {
    if (longPressed.current) { longPressed.current = false; return; }
    /* The photo, links and buttons inside keep their own action; selecting text is not a tap */
    if ((e.target as HTMLElement).closest('a, button')) return;
    if (window.getSelection()?.toString()) return;
    setShowTime((v) => !v);
  };

  const openFromButton = () => {
    const r = reactBtnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPicker({ anchor: { top: r.top, bottom: r.bottom, left: r.left, width: r.width }, withReply: false });
  };

  const cancelPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  /* Touch only: hold the bubble to get the reaction bar (with Reply) */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    if ((e.target as HTMLElement).closest('a, button')) return;
    cancelPress();
    longPressed.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    const el = e.currentTarget;
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      longPressed.current = true;
      const r = el.getBoundingClientRect();
      setPicker({ anchor: { top: r.top, bottom: r.bottom, left: r.left, width: r.width }, withReply: true });
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pressTimer.current) return;
    if (Math.hypot(e.clientX - pressStart.current.x, e.clientY - pressStart.current.y) > LONG_PRESS_SLOP) cancelPress();
  };

  const closePicker = (restoreFocus: boolean) => {
    setPicker(null);
    if (restoreFocus) reactBtnRef.current?.focus();
  };

  if (blockedSender && !revealed) {
    return (
      <div className="msg-row msg-row--blocked">
        <div className="msg-avatar-col" />
        <div className="msg-blocked">
          <span>Message from someone you blocked</span>
          <button type="button" className="msg-blocked-show" onClick={() => setRevealed(true)}>Show</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`msg-row ${isOwn ? 'msg-row--own' : ''} ${grouped ? 'msg-row--grouped' : ''}`} data-msg-id={message.id}>
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

        {/* The message this one replies to */}
        {message.reply_to_id && message.reply !== undefined && (
          message.reply ? (
            <button
              type="button"
              className="msg-quote"
              onClick={() => onJumpTo(message.reply!.id)}
              aria-label={`Go to the original message from ${nameOf(message.reply.sender_id)}`}
              title="Go to the original message"
            >
              <span className="msg-quote-name">{nameOf(message.reply.sender_id)}</span>
              <span className="msg-quote-text">{replyPreview(message.reply.content, message.reply.image_url) || 'Message'}</span>
            </button>
          ) : (
            <span className="msg-quote msg-quote--gone">Original message was removed</span>
          )
        )}

        <div className="msg-bubble-wrap">
          <div
            className={`msg-bubble ${message.image_url && !message.content ? 'msg-bubble--image-only' : ''}`}
            title={fullDate(message.created_at)}
            onClick={toggleTime}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={cancelPress}
            onPointerCancel={cancelPress}
            onContextMenu={(e) => { if (longPressed.current) e.preventDefault(); }}
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

          {/* Hover / focus actions: react, reply, unsend */}
          <div className="msg-actions">
            <button
              ref={reactBtnRef}
              type="button"
              className="msg-action"
              onClick={openFromButton}
              title="React"
              aria-label="React to message"
              aria-haspopup="true"
              aria-expanded={!!picker}
            >
              <SmilePlus size={15} />
            </button>
            <button
              type="button"
              className="msg-action msg-action--reply"
              onClick={() => onReply(message)}
              title="Reply"
              aria-label="Reply to message"
            >
              <CornerUpLeft size={15} />
            </button>
            {isOwn && onDelete && (
              <button type="button" className="msg-action msg-action--delete" onClick={() => onDelete(message)} title="Unsend" aria-label="Unsend message">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Reaction summary */}
        {chips.length > 0 && (
          <div className="msg-reactions" role="group" aria-label="Reactions">
            {chips.map((chip) => (
              <button
                key={chip.emoji}
                type="button"
                className={`msg-chip ${chip.mine ? 'msg-chip--mine' : ''}`}
                aria-pressed={chip.mine}
                aria-label={`${chip.emoji} ${chip.count} ${chip.count === 1 ? 'reaction' : 'reactions'}${chip.mine ? ', including yours' : ''}`}
                title={reactorLabel(chip.userIds, myId, (id) => nameOf(id))}
                onClick={() => onReact(message, chip.emoji)}
              >
                <span aria-hidden="true">{chip.emoji}</span>
                <span className="msg-chip-count" aria-hidden="true">{chip.count}</span>
              </button>
            ))}
          </div>
        )}

        {showTime && (
          <time className="msg-time" dateTime={parseDbDate(message.created_at).toISOString()} title={fullDate(message.created_at)}>
            {time}
          </time>
        )}
        {seenLabel && <span className="msg-seen">{seenLabel}</span>}
      </div>

      {picker && (
        <ReactionPicker
          anchor={picker.anchor}
          current={myReaction}
          onPick={(emoji) => { closePicker(true); onReact(message, emoji); }}
          onReply={picker.withReply ? () => { closePicker(false); onReply(message); } : undefined}
          onClose={closePicker}
        />
      )}
    </div>
  );
}

/* Memoised: a thread re-renders on every keystroke and new message, a bubble only when its own props change */
export default memo(MessageBubble);
