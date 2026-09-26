import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, X, Maximize2, Info } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { conversationTitle, conversationAvatar } from '../../lib/chat';
import { ConversationAvatar } from '../ConversationList/ConversationList';
import ChatThread from '../ChatThread/ChatThread';
import ConversationInfoModal from '../ConversationInfoModal/ConversationInfoModal';
import './ChatPopup.css';

type Props = {
  conversationId: string;
};

/* One floating Messenger-style chat window (rendered by ChatDock). */
export default function ChatPopup({ conversationId }: Props) {
  const navigate = useNavigate();
  const { userId, getConversation, closeChat, toggleMinimize } = useChat();
  const [showInfo, setShowInfo] = useState(false);
  const conv = getConversation(conversationId);

  if (!conv) return null;

  const title = conversationTitle(conv, userId);
  const other = conversationAvatar(conv, userId);
  const subtitle = conv.is_group ? `${conv.members.length} members` : null;

  return (
    <div className="chat-popup">
      {/* Header */}
      <div className="chat-popup-header">
        <div className="chat-popup-identity" onClick={() => toggleMinimize(conversationId)}>
          <ConversationAvatar conversation={conv} currentUserId={userId} size={30} />
          <div className="chat-popup-title">
            {other ? (
              <Link to={`/profile/${other.user_id}`} onClick={(e) => e.stopPropagation()}>{title}</Link>
            ) : (
              <span>{title}</span>
            )}
            {subtitle && <small>{subtitle}</small>}
          </div>
        </div>
        <div className="chat-popup-actions">
          <button onClick={() => setShowInfo(true)} title="Conversation info" aria-label="Conversation info"><Info size={15} /></button>
          <button onClick={() => navigate(`/messages/${conversationId}`)} title="Open in Messages" aria-label="Open in Messages"><Maximize2 size={14} /></button>
          <button onClick={() => toggleMinimize(conversationId)} title="Minimize" aria-label="Minimize chat"><Minus size={16} /></button>
          <button onClick={() => closeChat(conversationId)} title="Close" aria-label="Close chat"><X size={16} /></button>
        </div>
      </div>

      {/* Thread */}
      <div className="chat-popup-body">
        <ChatThread key={conversationId} conversationId={conversationId} compact autoFocus />
      </div>

      {showInfo && (
        <ConversationInfoModal conversationId={conversationId} onClose={() => setShowInfo(false)} />
      )}
    </div>
  );
}
