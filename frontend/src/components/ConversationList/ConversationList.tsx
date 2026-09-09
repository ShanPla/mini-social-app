import { Users } from 'lucide-react';
import type { Conversation } from '../../lib/supabaseClient';
import { conversationTitle, conversationAvatar, lastMessagePreview, shortTime } from '../../lib/chat';
import './ConversationList.css';

type Props = {
  conversations: Conversation[];
  currentUserId: string | null;
  activeId?: string | null;
  loading?: boolean;
  onSelect: (conversationId: string) => void;
};

/* Avatar for a conversation row: the other person (DM) or a group glyph */
export function ConversationAvatar({ conversation, currentUserId, size = 44 }: {
  conversation: Conversation;
  currentUserId: string | null;
  size?: number;
}) {
  const other = conversationAvatar(conversation, currentUserId);
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (conversation.is_group || !other) {
    return (
      <div className="conv-avatar conv-avatar--group" style={style}>
        <Users size={size * 0.45} strokeWidth={1.6} />
      </div>
    );
  }
  return (
    <div className="conv-avatar" style={style}>
      {other.avatar_url
        ? <img src={other.avatar_url} alt={other.username} loading="lazy" />
        : <span>{(other.username[0] || '?').toUpperCase()}</span>
      }
    </div>
  );
}

export default function ConversationList({ conversations, currentUserId, activeId, loading = false, onSelect }: Props) {
  if (loading) {
    return (
      <div className="conv-list">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="conv-skeleton">
            <div className="conv-skeleton-avatar" />
            <div className="conv-skeleton-info">
              <div className="conv-skeleton-line conv-skeleton-line--short" />
              <div className="conv-skeleton-line conv-skeleton-line--medium" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="conv-list">
        <div className="conv-empty">
          <p>No conversations yet.</p>
          <span>Start one from a profile or with the compose button.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="conv-list">
      {conversations.map((conv) => {
        const unread = conv.unread_count > 0;
        return (
          <button
            key={conv.id}
            type="button"
            className={`conv-item ${conv.id === activeId ? 'conv-item--active' : ''} ${unread ? 'conv-item--unread' : ''}`}
            onClick={() => onSelect(conv.id)}
          >
            <ConversationAvatar conversation={conv} currentUserId={currentUserId} />
            <div className="conv-info">
              <div className="conv-top">
                <span className="conv-title">{conversationTitle(conv, currentUserId)}</span>
                <span className="conv-time">{shortTime(conv.last_message_at)}</span>
              </div>
              <div className="conv-bottom">
                <span className="conv-preview">{lastMessagePreview(conv, currentUserId)}</span>
                {unread && <span className="conv-unread-dot" title={`${conv.unread_count} unread`} />}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
