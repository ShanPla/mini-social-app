import { Link, useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import './MessagesButton.css';

/* Navbar icon linking to /messages with a live unread badge. */
export default function MessagesButton() {
  const location = useLocation();
  const { unreadConversations } = useChat();
  const active = location.pathname.startsWith('/messages');

  return (
    <Link to="/messages" className={`msg-nav-btn ${active ? 'msg-nav-btn--active' : ''}`} title="Messages">
      <MessageCircle size={18} />
      {unreadConversations > 0 && (
        <span className="msg-nav-badge">{unreadConversations > 9 ? '9+' : unreadConversations}</span>
      )}
    </Link>
  );
}
