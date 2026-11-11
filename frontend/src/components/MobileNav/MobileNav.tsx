import { Link, useLocation } from 'react-router-dom';
import { Newspaper, MessageCircle, Bell, User, Settings } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { MOBILE_QUERY } from '../../lib/chat';
import { isActivePath } from '../../lib/navActive';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useUnreadNotifications } from '../../lib/useUnreadNotifications';
import './MobileNav.css';

type Props = {
  userId: string;
};

/*
 * Bottom tab bar for phones. Below 680px the feed sidebars, and with them
 * the quick links, are hidden, so this carries the five places that matter.
 * Log out is at the bottom of Settings.
 */
export default function MobileNav({ userId }: Props) {
  const location = useLocation();
  const { unreadConversations } = useChat();
  /* The bar is display:none above 680px, so skip the count there */
  const phone = useMediaQuery(MOBILE_QUERY);
  const unreadNotifications = useUnreadNotifications(userId, phone);

  const tabs = [
    { to: '/feed', label: 'Feed', icon: <Newspaper size={19} /> },
    { to: '/messages', label: 'Messages', icon: <MessageCircle size={19} />, badge: unreadConversations },
    { to: '/notifications', label: 'Alerts', icon: <Bell size={19} />, badge: unreadNotifications },
    { to: `/profile/${userId}`, label: 'Profile', icon: <User size={19} /> },
    { to: '/settings', label: 'Settings', icon: <Settings size={19} /> },
  ];

  return (
    <nav className="mobile-nav" aria-label="Main">
      {tabs.map((t) => {
        const active = isActivePath(location.pathname, t.to);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`mobile-nav-tab ${active ? 'mobile-nav-tab--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
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
