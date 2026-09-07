import { Link, useLocation } from 'react-router-dom';
import { Newspaper, MessageCircle, Bell, User } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import './QuickLinks.css';

type Props = {
  userId: string;
};

/* Left-column navigation shortcuts */
export default function QuickLinks({ userId }: Props) {
  const location = useLocation();
  const { unreadConversations } = useChat();

  const links = [
    { to: '/feed', label: 'Feed', icon: <Newspaper size={16} /> },
    { to: '/messages', label: 'Messages', icon: <MessageCircle size={16} />, badge: unreadConversations },
    { to: '/notifications', label: 'Notifications', icon: <Bell size={16} /> },
    { to: `/profile/${userId}`, label: 'My profile', icon: <User size={16} /> },
  ];

  return (
    <nav className="quick-links">
      {links.map((l) => {
        const active = location.pathname === l.to || (l.to !== '/feed' && location.pathname.startsWith(l.to));
        return (
          <Link key={l.to} to={l.to} className={`quick-link ${active ? 'quick-link--active' : ''}`}>
            <span className="quick-link-icon">{l.icon}</span>
            <span className="quick-link-label">{l.label}</span>
            {!!l.badge && <span className="quick-link-badge">{l.badge > 9 ? '9+' : l.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
