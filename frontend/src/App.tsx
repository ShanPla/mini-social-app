import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import Navbar from './components/Navbar';
import SearchBar from './components/SearchBar';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import Feed from './pages/Feed/Feed';
import ProfilePage from './pages/Profile/Profile';
import PostPage from './pages/Post/Post';
import SearchPage from './pages/Search/Search';
import NotificationsPage from './pages/Notifications/Notifications';
import './styles/global.css';

const AUTH_ROUTES = ['/login', '/register'];

function AppInner({ userId, isAdmin }: { userId: string | null; isAdmin: boolean }) {
  const location = useLocation();
  const isAuthPage = AUTH_ROUTES.includes(location.pathname);

  return (
    <>
      {!isAuthPage && <Navbar userId={userId} />}
      {!isAuthPage && userId && <SearchBar />}
      <Routes>
        <Route path="/login" element={!userId ? <Login /> : <Navigate to="/feed" />} />
        <Route path="/register" element={!userId ? <Register /> : <Navigate to="/feed" />} />
        <Route path="/feed" element={userId ? <Feed userId={userId} isAdmin={isAdmin} /> : <Navigate to="/login" />} />
        <Route path="/profile/:userId" element={userId ? <ProfilePage currentUserId={userId} isAdmin={isAdmin} /> : <Navigate to="/login" />} />
        <Route path="/post/:postId" element={userId ? <PostPage currentUserId={userId} isAdmin={isAdmin} /> : <Navigate to="/login" />} />
        <Route path="/search" element={userId ? <SearchPage /> : <Navigate to="/login" />} />
        <Route path="/notifications" element={userId ? <NotificationsPage currentUserId={userId} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={userId ? "/feed" : "/login"} />} />
      </Routes>
    </>
  );
}

function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

const fetchAdminStatus = async (uid: string) => {
  try {
    const { data } = await Promise.race([
      supabase.from('profiles').select('is_admin').eq('id', uid).single(),
      new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), 1500))
    ]);
    setIsAdmin((data as any)?.is_admin ?? false);
  } catch {
    setIsAdmin(false);
  }
};

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      try {
        if (uid) await fetchAdminStatus(uid);
      } catch (e) {
        console.error('Admin check failed:', e);
      } finally {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      try {
        if (uid) await fetchAdminStatus(uid);
        else setIsAdmin(false);
      } catch (e) {
        setIsAdmin(false);
      }
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