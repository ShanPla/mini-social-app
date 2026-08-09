import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import NotificationBell from '../NotificationBell/NotificationBell';
import './Navbar.css';

type NavbarProps = {
  userId: string | null;
};

export default function Navbar({ userId }: NavbarProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/feed" className="navbar-brand">
          <span className="brand-serif">The</span>
          <span className="brand-main">Chronicle</span>
        </Link>

        {userId && (
          <div className="navbar-links">
            <Link to="/feed" className="nav-link">Feed</Link>
            <Link to={`/profile/${userId}`} className="nav-link">Profile</Link>
            <NotificationBell currentUserId={userId} />
            <button onClick={handleLogout} className="nav-logout">Logout</button>
          </div>
        )}
      </div>
    </nav>
  );
}
