import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { logOut } from '../../lib/logout';
import { isActivePath } from '../../lib/navActive';
import { prefetchPage } from '../../lib/pages';
import { useTheme } from '../../lib/theme';
import NotificationBell from '../NotificationBell/NotificationBell';
import './Navbar.css';

type NavbarProps = {
  userId: string | null;
};

export default function Navbar({ userId }: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadConversations } = useChat();
  const { theme, setPreference } = useTheme();

  const handleLogout = async () => {
    await logOut();
    navigate('/login');
  };

  const isActive = (path: string) => isActivePath(location.pathname, path);
  const profilePath = userId ? `/profile/${userId}` : '';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/feed" className="navbar-brand">
          <span className="brand-serif">The</span>
          <span className="brand-main">Chronicle</span>
        </Link>

        {userId && (
          <div className="navbar-links">
            {/* Hover or focus fetches the page chunk, so the click renders at once */}
            <Link to="/feed" className={`nav-link ${isActive('/feed') ? 'nav-link--active' : ''}`} aria-current={isActive('/feed') ? 'page' : undefined} onMouseEnter={() => prefetchPage('feed')} onFocus={() => prefetchPage('feed')}>Feed</Link>
            {/* The feed's quick links only exist on the feed; every other page needs this one.
                Hidden below 680px, where the bottom bar carries it. */}
            <Link to="/messages" className={`nav-link nav-link--badged ${isActive('/messages') ? 'nav-link--active' : ''}`} aria-current={isActive('/messages') ? 'page' : undefined} onMouseEnter={() => prefetchPage('messages')} onFocus={() => prefetchPage('messages')}>
              Messages
              {unreadConversations > 0 && (
                <span className="nav-badge">{unreadConversations > 9 ? '9+' : unreadConversations}</span>
              )}
            </Link>
            {/* Only your own profile lights up, not anyone else's */}
            <Link to={profilePath} className={`nav-link ${isActive(profilePath) ? 'nav-link--active' : ''}`} aria-current={isActive(profilePath) ? 'page' : undefined} onMouseEnter={() => prefetchPage('profile')} onFocus={() => prefetchPage('profile')}>Profile</Link>
            <NotificationBell currentUserId={userId} />
            {/* Flips light and dark; Settings also offers following the device */}
            <button
              type="button"
              className="nav-theme-btn"
              onClick={() => setPreference(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button onClick={handleLogout} className="nav-logout">Logout</button>
          </div>
        )}
      </div>
    </nav>
  );
}
