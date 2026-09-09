import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useChat } from '../../context/ChatContext';
import NotificationBell from '../NotificationBell/NotificationBell';
import './Navbar.css';

type NavbarProps = {
  userId: string | null;
};

export default function Navbar({ userId }: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadConversations } = useChat();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/feed" className="navbar-brand">
          <span className="brand-serif">The</span>
          <span className="brand-main">Chronicle</span>
        </Link>

        {userId && (
          <div className="navbar-links">
            <Link to="/feed" className={`nav-link ${isActive('/feed') ? 'nav-link--active' : ''}`}>Feed</Link>
            {/* The feed's quick links only exist on the feed; every other page needs this one.
                Hidden below 680px, where the bottom bar carries it. */}
            <Link to="/messages" className={`nav-link nav-link--badged ${isActive('/messages') ? 'nav-link--active' : ''}`}>
              Messages
              {unreadConversations > 0 && (
                <span className="nav-badge">{unreadConversations > 9 ? '9+' : unreadConversations}</span>
              )}
            </Link>
            <Link to={`/profile/${userId}`} className={`nav-link ${isActive('/profile') ? 'nav-link--active' : ''}`}>Profile</Link>
            <NotificationBell currentUserId={userId} />
            <button onClick={handleLogout} className="nav-logout">Logout</button>
          </div>
        )}
      </div>
    </nav>
  );
}
