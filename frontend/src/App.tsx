import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import { clearAllDrafts } from './lib/drafts';
import Navbar from './components/Navbar/Navbar';
import ChatProvider from './context/ChatProvider';
import PresenceProvider from './context/PresenceProvider';
import { useChat } from './context/ChatContext';
import MobileNav from './components/MobileNav/MobileNav';
import ToastProvider from './context/ToastProvider';
import { useToast } from './context/ToastContext';
import { consumeIntentionalSignOut } from './lib/session';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import LoadingScreen from './components/LoadingScreen/LoadingScreen';
import { pageLoaders, pageForPath, prefetchPage } from './lib/pages';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './lib/authPages';
import { redirectTarget } from './lib/redirect';
import type { FromState } from './lib/redirect';
import './styles/global.css';
import './styles/animations.css';

/* Every page is its own chunk, fetched the first time it is visited. The
   shell (navbar, search, toasts, providers) stays in the main bundle.
   The thunks live in lib/pages.ts so the same import() backs prefetching. */
/* These can render without suspending once warmed, for the animation between them */
const Login = LoginPage;
const Register = RegisterPage;
const ForgotPassword = ForgotPasswordPage;
const ResetPassword = lazy(pageLoaders.resetPassword);
const Landing = lazy(pageLoaders.landing);
const Feed = lazy(pageLoaders.feed);
const ProfilePage = lazy(pageLoaders.profile);
const PostPage = lazy(pageLoaders.post);
const SearchPage = lazy(pageLoaders.search);
const NotificationsPage = lazy(pageLoaders.notifications);
const MessagesPage = lazy(pageLoaders.messages);
const NotFound = lazy(pageLoaders.notFound);
const SettingsPage = lazy(pageLoaders.settings);
const PrivacyPage = lazy(pageLoaders.privacy);
const TermsPage = lazy(pageLoaders.terms);
const AdminReports = lazy(pageLoaders.adminReports);
/* The chat tree (thread, bubbles, pickers) is shared by the popups and the
   /messages page; it loads with whichever is used first */
const ChatDock = lazy(() => import('./components/ChatDock/ChatDock'));

/* Pages with their own frame: no app navbar, chat dock or bottom bar */
const AUTH_ROUTES = ['/', '/login', '/register', '/forgot-password', '/reset-password'];

/* Read once at module load, before auth-js consumes the hash. PASSWORD_RECOVERY is
   broadcast to every open tab through a BroadcastChannel, so without this every
   tab the user had open would be steered to the reset form. */
const landedOnRecoveryLink = /(^#|&)type=recovery(&|$)/.test(window.location.hash);

/* A signed-out visitor to a members-only page goes to sign in and remembers
   where they were headed (path and query), so signing in lands them there. */
function ToLogin() {
  const location = useLocation();
  return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}

/* The sign-in pages when someone is already (or has just become) signed in */
function ToWhereTheyWereGoing() {
  const location = useLocation();
  return <Navigate to={redirectTarget(location.state as FromState)} replace />;
}

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

// Floating chat popups. Rendered only once a popup is open, so the chat code
// is not part of the first load for someone who never opens a chat.
// Its own boundary: a stale chunk here reloads like any page, and any other
// failure hides the dock instead of taking the whole app down.
function ChatDockGate() {
  const { openChats } = useChat();
  if (openChats.length === 0) return null;
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <ChatDock />
      </Suspense>
    </ErrorBoundary>
  );
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

// Remounts the page per path and keeps content clear of the mobile tab bar.
// The entrance animation lives inside the Suspense boundary (below), so it
// plays when the page is ready rather than on the loader.
function PageWrapper({ children, withMobileNav }: { children: React.ReactNode; withMobileNav: boolean }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className={withMobileNav ? 'page-enter--mobile-nav' : undefined}>
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
      {/* Floating chat popups — global, outside PageWrapper so they survive route changes */}
      {!isAuthPage && userId && <ChatDockGate />}
      {/* Phones lose the feed sidebars, so navigation moves to a bottom bar */}
      {!isAuthPage && userId && <MobileNav userId={userId} />}
      <PageWrapper withMobileNav={!isAuthPage && !!userId}>
        {/* Keyed by route so a crash on one page clears when you leave it */}
        <ErrorBoundary key={location.pathname}>
        {/* Inside the boundary, so a chunk that fails to load lands on its recovery card */}
        <Suspense fallback={<LoadingScreen compact />}>
        <div className="page-enter">
        <Routes>
          <Route path="/login" element={!userId ? <Login /> : <ToWhereTheyWereGoing />} />
          <Route path="/register" element={!userId ? <Register /> : <ToWhereTheyWereGoing />} />
          <Route path="/forgot-password" element={!userId ? <ForgotPassword /> : <ToWhereTheyWereGoing />} />
          {/* Reachable signed in or out: the recovery link signs you in first,
              and no session means the link was bad */}
          <Route path="/reset-password" element={<ResetPassword userId={userId} />} />
          <Route path="/feed" element={userId ? <Feed userId={userId} isAdmin={isAdmin} /> : <ToLogin />} />
          <Route path="/profile/:userId" element={userId ? <ProfilePage currentUserId={userId} isAdmin={isAdmin} /> : <ToLogin />} />
          <Route path="/post/:postId" element={userId ? <PostPage currentUserId={userId} isAdmin={isAdmin} /> : <ToLogin />} />
          <Route path="/search" element={userId ? <SearchPage /> : <ToLogin />} />
          <Route path="/notifications" element={userId ? <NotificationsPage currentUserId={userId} /> : <ToLogin />} />
          <Route path="/messages/:conversationId?" element={userId ? <MessagesPage /> : <ToLogin />} />
          <Route path="/settings" element={userId ? <SettingsPage userId={userId} isAdmin={isAdmin} /> : <ToLogin />} />
          {/* Admins only; everyone else gets the 404 (the database refuses them anyway) */}
          <Route path="/admin/reports" element={userId ? (isAdmin ? <AdminReports userId={userId} /> : <NotFound userId={userId} />) : <ToLogin />} />
          {/* Legal pages: readable signed in or out */}
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          {/* Signed out, the front page says what this is; signed in, there is nothing to sell */}
          <Route path="/" element={userId ? <Navigate to="/feed" replace /> : <Landing />} />
          {/* Anything else is a real 404, not a silent bounce to the feed */}
          <Route path="*" element={<NotFound userId={userId} />} />
        </Routes>
        </div>
        </Suspense>
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
  /* Who is signed in right now. An admin check that answers after a sign-out
     or an account switch belongs to someone else and is dropped. */
  const currentUidRef = useRef<string | null>(null);

  /*
   * Only updates isAdmin when the DB actually answers.
   * A timeout or network error keeps the previous value — never downgrades
   * an admin to false just because Supabase was slow (e.g. after TOKEN_REFRESHED).
   */
  const fetchAdminStatus = async (uid: string) => {
    try {
      const { data, error } = await supabase.rpc('i_am_admin');
      if (currentUidRef.current !== uid) return;
      if (error || typeof data !== 'boolean') return;
      setIsAdmin(data);
    } catch (e) {
      console.error('Admin check failed:', e);
    }
  };

  useEffect(() => {
    /* The first page's code can download while the session is being checked,
       so the loader is not followed by a second wait for the chunk */
    prefetchPage(pageForPath(window.location.pathname));

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      currentUidRef.current = uid;
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
      const changed = currentUidRef.current !== uid;
      currentUidRef.current = uid;
      setUserId(uid);
      /* A different account must not inherit the previous one's admin flag */
      if (changed) setIsAdmin(false);
      /* Also when the session expired or was ended elsewhere: unfinished text
         must not stay behind on a shared device */
      if (event === 'SIGNED_OUT') clearAllDrafts();
      if (uid) fetchAdminStatus(uid);
      if (event === 'PASSWORD_RECOVERY' && landedOnRecoveryLink) setRecovery(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <AppInner userId={userId} isAdmin={isAdmin} recovery={recovery} onRecoverySteered={clearRecovery} />
    </BrowserRouter>
  );
}

export default App;
