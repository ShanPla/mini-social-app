import { MessageCircle } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { conversationTitle, lastMessagePreview, shortTime } from '../../lib/chat';
import { ConversationAvatar } from '../ConversationList/ConversationList';
import SidebarWidget, { WidgetSkeleton, WidgetEmpty } from '../SidebarWidget/SidebarWidget';
import './RecentChats.css';

const LIMIT = 3;

/* Latest conversations; click opens the floating popup (or /messages on mobile) */
export default function RecentChats() {
  const { userId, conversations, loadingConversations, openChat } = useChat();
  const recent = conversations.slice(0, LIMIT);

  return (
    <SidebarWidget title="Recent chats" icon={<MessageCircle size={15} />} footer={{ to: '/messages', label: 'All messages' }}>
      {loadingConversations ? (
        <WidgetSkeleton rows={3} />
      ) : recent.length === 0 ? (
        <WidgetEmpty>No conversations yet.</WidgetEmpty>
      ) : (
        recent.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`widget-row rc-row ${c.unread_count > 0 ? 'rc-row--unread' : ''}`}
            onClick={() => openChat(c.id)}
          >
            <ConversationAvatar conversation={c} currentUserId={userId} size={34} />
            <span className="widget-row-info">
              <span className="rc-top">
                <span className="widget-row-name">{conversationTitle(c, userId)}</span>
                <span className="rc-time">{shortTime(c.last_message_at)}</span>
              </span>
              <span className="widget-row-sub">{lastMessagePreview(c, userId)}</span>
            </span>
            {c.unread_count > 0 && <span className="rc-dot" />}
          </button>
        ))
      )}
    </SidebarWidget>
  );
}
