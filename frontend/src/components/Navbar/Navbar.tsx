import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sun, Moon, Search, Settings } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { isActivePath } from '../../lib/navActive';
import { prefetchPage } from '../../lib/pages';
import { useTheme } from '../../lib/theme';
import NotificationBell from '../NotificationBell/NotificationBell';
import SearchBar from '../SearchBar/SearchBar';
import './Navbar.css';

type NavbarProps = {
  userId: string | null;
};

export default function Navbar({ userId }: NavbarProps) {
  const location = useLocation();
  const { unreadConversations } = useChat();
  const { theme, setPreference } = useTheme();
  const navRef = useRef<HTMLElement>(null);
  /* Phones keep search behind an icon. It is open only on the page where it
     was opened, so going anywhere (a result, a tab) closes it again. */
  const [searchOpenOn, setSearchOpenOn] = useState<string | null>(null);
  const searchOpen = searchOpenOn === location.pathname;

  const toggleSearch = () => {
    if (searchOpen) { setSearchOpenOn(null); return; }
    setSearchOpenOn(location.pathname);
    /* The field exists only once the row is shown */
    requestAnimationFrame(() => navRef.current?.querySelector<HTMLInputElement>('.searchbar-input')?.focus());
  };

  const isActive = (path: string) => isActivePath(location.pathname, path);
  const profilePath = userId ? `/profile/${userId}` : '';

  return (
    <nav className="navbar" ref={navRef}>
      <div className="navbar-inner">
        <Link to="/feed" className="navbar-brand">
          <span className="brand-serif">The</span>
          <span className="brand-main">Chronicle</span>
        </Link>

        {/* One bar: search sits between the name and the links. On phones it
            drops under the bar when the search icon is pressed. */}
        {userId && (
          <div className={`navbar-search ${searchOpen ? 'navbar-search--open' : ''}`}>
            <SearchBar />
          </div>
        )}

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
            <button
              type="button"
              className="nav-icon-btn nav-search-toggle"
              onClick={toggleSearch}
              aria-expanded={searchOpen}
              aria-label="Search users"
              title="Search users"
            >
              <Search size={17} />
            </button>
            <NotificationBell currentUserId={userId} />
            {/* Flips light and dark; Settings also offers following the device */}
            <button
              type="button"
              className="nav-icon-btn nav-theme-btn"
              onClick={() => setPreference(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {/* Log out lives in Settings. Phones reach Settings from the bottom bar. */}
            <Link
              to="/settings"
              className={`nav-icon-btn nav-settings ${isActive('/settings') ? 'nav-icon-btn--active' : ''}`}
              aria-current={isActive('/settings') ? 'page' : undefined}
              aria-label="Settings"
              title="Settings"
              onMouseEnter={() => prefetchPage('settings')}
              onFocus={() => prefetchPage('settings')}
            >
              <Settings size={17} />
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
