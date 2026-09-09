import { Link, useLocation } from 'react-router-dom';
import { Newspaper, MessageCircle, User } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import './MobileNav.css';

type Props = {
  userId: string;
};

/*
 * Bottom tab bar for phones. Below 680px the feed sidebars — and with them
 * the quick links — are hidden, so this is the only route to /messages.
 * Notifications stay on the navbar bell, which already carries its own badge.
 */
export default function MobileNav({ userId }: Props) {
  const location = useLocation();
  const { unreadConversations } = useChat();

  const tabs = [
    { to: '/feed', label: 'Feed', icon: <Newspaper size={19} /> },
    { to: '/messages', label: 'Messages', icon: <MessageCircle size={19} />, badge: unreadConversations },
    { to: `/profile/${userId}`, label: 'Profile', icon: <User size={19} /> },
  ];

  return (
    <nav className="mobile-nav">
      {tabs.map((t) => {
        const active = location.pathname === t.to || (t.to !== '/feed' && location.pathname.startsWith(t.to));
        return (
          <Link key={t.to} to={t.to} className={`mobile-nav-tab ${active ? 'mobile-nav-tab--active' : ''}`}>
            <span className="mobile-nav-icon">
              {t.icon}
              {!!t.badge && <span className="mobile-nav-badge">{t.badge > 9 ? '9+' : t.badge}</span>}
            </span>
            <span className="mobile-nav-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
