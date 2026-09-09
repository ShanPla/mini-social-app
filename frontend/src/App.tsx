import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import Navbar from './components/Navbar/Navbar';
import SearchBar from './components/SearchBar/SearchBar';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import Feed from './pages/Feed/Feed';
import ProfilePage from './pages/Profile/Profile';
import PostPage from './pages/Post/Post';
import SearchPage from './pages/Search/Search';
import NotificationsPage from './pages/Notifications/Notifications';
import MessagesPage from './pages/Messages/Messages';
import ChatProvider from './context/ChatProvider';
import PresenceProvider from './context/PresenceProvider';
import ChatDock from './components/ChatDock/ChatDock';
import MobileNav from './components/MobileNav/MobileNav';
import './styles/global.css';
import './styles/animations.css';

const AUTH_ROUTES = ['/login', '/register'];

// New pages open at the top. Back/forward (POP) is left to the browser so
// it can restore where the reader was.
function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navigationType]);
  return null;
}

// Wraps each page in a fade+slide entrance
function PageWrapper({ children, withMobileNav }: { children: React.ReactNode; withMobileNav: boolean }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className={`page-enter ${withMobileNav ? 'page-enter--mobile-nav' : ''}`}>
      {children}
    </div>
  );
}

function AppInner({ userId, isAdmin }: { userId: string | null; isAdmin: boolean }) {
  const location = useLocation();
  const isAuthPage = AUTH_ROUTES.includes(location.pathname);

  return (
    <ChatProvider key={userId ?? 'signed-out'} userId={userId}>
    <PresenceProvider key={`presence:${userId ?? 'signed-out'}`} userId={userId}>
      <ScrollToTop />
      {!isAuthPage && <Navbar userId={userId} />}
      {!isAuthPage && userId && <SearchBar />}
      {/* Floating chat popups — global, outside PageWrapper so they survive route changes */}
      {!isAuthPage && userId && <ChatDock />}
      {/* Phones lose the feed sidebars, so navigation moves to a bottom bar */}
      {!isAuthPage && userId && <MobileNav userId={userId} />}
      <PageWrapper withMobileNav={!isAuthPage && !!userId}>
        <Routes>
          <Route path="/login" element={!userId ? <Login /> : <Navigate to="/feed" />} />
          <Route path="/register" element={!userId ? <Register /> : <Navigate to="/feed" />} />
          <Route path="/feed" element={userId ? <Feed userId={userId} isAdmin={isAdmin} /> : <Navigate to="/login" />} />
          <Route path="/profile/:userId" element={userId ? <ProfilePage currentUserId={userId} isAdmin={isAdmin} /> : <Navigate to="/login" />} />
          <Route path="/post/:postId" element={userId ? <PostPage currentUserId={userId} isAdmin={isAdmin} /> : <Navigate to="/login" />} />
          <Route path="/search" element={userId ? <SearchPage /> : <Navigate to="/login" />} />
          <Route path="/notifications" element={userId ? <NotificationsPage currentUserId={userId} /> : <Navigate to="/login" />} />
          <Route path="/messages/:conversationId?" element={userId ? <MessagesPage /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to={userId ? "/feed" : "/login"} />} />
        </Routes>
      </PageWrapper>
    </PresenceProvider>
    </ChatProvider>
  );
}

function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  /*
   * Only updates isAdmin when the DB actually answers.
   * A timeout or network error keeps the previous value — never downgrades
   * an admin to false just because Supabase was slow (e.g. after TOKEN_REFRESHED).
   */
  const fetchAdminStatus = async (uid: string) => {
    try {
      const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', uid).single();
      if (error || !data) return;
      setIsAdmin(!!data.is_admin);
    } catch (e) {
      console.error('Admin check failed:', e);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        // Gate the loading screen for at most 1.5s; the fetch itself keeps
        // running and applies its result whenever it arrives.
        await Promise.race([
          fetchAdminStatus(uid),
          new Promise<void>((resolve) => setTimeout(resolve, 1500)),
        ]);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid) fetchAdminStatus(uid);
      else setIsAdmin(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ fontFamily: 'serif', fontSize: '2rem', opacity: 0.3 }}>✦</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppInner userId={userId} isAdmin={isAdmin} />
    </BrowserRouter>
  );
}

export default App;
