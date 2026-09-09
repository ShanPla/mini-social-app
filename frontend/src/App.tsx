import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import Navbar from './components/Navbar/Navbar';
import SearchBar from './components/SearchBar/SearchBar';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import ForgotPassword from './pages/ForgotPassword/ForgotPassword';
import ResetPassword from './pages/ResetPassword/ResetPassword';
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
import ToastProvider from './context/ToastProvider';
import { useToast } from './context/ToastContext';
import { consumeIntentionalSignOut } from './lib/session';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import './styles/global.css';
import './styles/animations.css';

const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

/* Read once at module load, before auth-js consumes the hash. PASSWORD_RECOVERY is
   broadcast to every open tab through a BroadcastChannel, so without this every
   tab the user had open would be steered to the reset form. */
const landedOnRecoveryLink = /(^#|&)type=recovery(&|$)/.test(window.location.hash);

// Says so when the session ends without the user clicking Logout (a refresh
// token that stopped working). Lives under ToastProvider so it can toast.
function SessionWatch({ userId }: { userId: string | null }) {
  const toast = useToast();
  const prev = useRef(userId);
  useEffect(() => {
    if (prev.current && !userId && !consumeIntentionalSignOut()) {
      toast.error('Your session has expired. Please sign in again.');
    }
    prev.current = userId;
  }, [userId, toast]);
  return null;
}

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

type AppInnerProps = {
  userId: string | null;
  isAdmin: boolean;
  /* True once Supabase reports PASSWORD_RECOVERY; consumed by the steer below */
  recovery: boolean;
  onRecoverySteered: () => void;
};

function AppInner({ userId, isAdmin, recovery, onRecoverySteered }: AppInnerProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthPage = AUTH_ROUTES.includes(location.pathname);

  /* A recovery link lands wherever Supabase sends it. If the redirect list in
     the dashboard is incomplete that is the Site URL, not /reset-password, so
     steer there once and then let the user roam. A dead link arrives the same
     way but with an error in the hash and no auth event, so it is steered too,
     hash intact, for ResetPassword to explain. */
  const authErrorInUrl = location.pathname !== '/reset-password'
    && new URLSearchParams(location.hash.replace(/^#/, '')).has('error_description');
  useEffect(() => {
    if (!recovery && !authErrorInUrl) return;
    if (location.pathname !== '/reset-password') {
      navigate({ pathname: '/reset-password', hash: location.hash }, { replace: true });
    }
    if (recovery) onRecoverySteered();
  }, [recovery, authErrorInUrl, location.pathname, location.hash, navigate, onRecoverySteered]);

  return (
    <ToastProvider>
    <SessionWatch userId={userId} />
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
        {/* Keyed by route so a crash on one page clears when you leave it */}
        <ErrorBoundary key={location.pathname}>
        <Routes>
          <Route path="/login" element={!userId ? <Login /> : <Navigate to="/feed" />} />
          <Route path="/register" element={!userId ? <Register /> : <Navigate to="/feed" />} />
          <Route path="/forgot-password" element={!userId ? <ForgotPassword /> : <Navigate to="/feed" />} />
          {/* Reachable signed in or out: the recovery link signs you in first,
              and no session means the link was bad */}
          <Route path="/reset-password" element={<ResetPassword userId={userId} />} />
          <Route path="/feed" element={userId ? <Feed userId={userId} isAdmin={isAdmin} /> : <Navigate to="/login" />} />
          <Route path="/profile/:userId" element={userId ? <ProfilePage currentUserId={userId} isAdmin={isAdmin} /> : <Navigate to="/login" />} />
          <Route path="/post/:postId" element={userId ? <PostPage currentUserId={userId} isAdmin={isAdmin} /> : <Navigate to="/login" />} />
          <Route path="/search" element={userId ? <SearchPage /> : <Navigate to="/login" />} />
          <Route path="/notifications" element={userId ? <NotificationsPage currentUserId={userId} /> : <Navigate to="/login" />} />
          <Route path="/messages/:conversationId?" element={userId ? <MessagesPage /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to={userId ? "/feed" : "/login"} />} />
        </Routes>
        </ErrorBoundary>
      </PageWrapper>
    </PresenceProvider>
    </ChatProvider>
    </ToastProvider>
  );
}

function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const clearRecovery = useCallback(() => setRecovery(false), []);

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid) fetchAdminStatus(uid);
      else setIsAdmin(false);
      if (event === 'PASSWORD_RECOVERY' && landedOnRecoveryLink) setRecovery(true);
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
      <AppInner userId={userId} isAdmin={isAdmin} recovery={recovery} onRecoverySteered={clearRecovery} />
    </BrowserRouter>
  );
}

export default App;
