import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { conversationTitle, MOBILE_QUERY } from '../../lib/chat';
import { ConversationAvatar } from '../ConversationList/ConversationList';
import ChatPopup from '../ChatPopup/ChatPopup';
import './ChatDock.css';

/*
 * Bottom-right dock for floating chats: open windows in a row, minimized
 * ones as bubbles. Hidden on mobile and on the /messages page (there the
 * full page takes over and openChat() navigates instead).
 */
export default function ChatDock() {
  const location = useLocation();
  const { userId, openChats, minimized, getConversation, openChat, closeChat } = useChat();
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (!userId || mobile || location.pathname.startsWith('/messages') || openChats.length === 0) return null;

  const windows = openChats.filter((id) => !minimized.includes(id));
  const bubbles = openChats.filter((id) => minimized.includes(id));

  return createPortal(
    <div className="chat-dock">
      {/* Open windows */}
      <div className="chat-dock-windows">
        {windows.map((id) => <ChatPopup key={id} conversationId={id} />)}
      </div>

      {/* Minimized bubbles */}
      {bubbles.length > 0 && (
        <div className="chat-dock-bubbles">
          {bubbles.map((id) => {
            const conv = getConversation(id);
            if (!conv) return null;
            return (
              <div key={id} className="chat-bubble-wrap">
                <button
                  className="chat-bubble"
                  onClick={() => openChat(id)}
                  title={conversationTitle(conv, userId)}
                >
                  <ConversationAvatar conversation={conv} currentUserId={userId} size={48} />
                  {conv.unread_count > 0 && (
                    <span className="chat-bubble-badge">{conv.unread_count > 9 ? '9+' : conv.unread_count}</span>
                  )}
                </button>
                <button className="chat-bubble-close" onClick={() => closeChat(id)} title="Close">
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  );
}
