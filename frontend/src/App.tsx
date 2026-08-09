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

function AppInner({ userId }: { userId: string | null }) {
  const location = useLocation();
  const isAuthPage = AUTH_ROUTES.includes(location.pathname);

  return (
    <>
      {!isAuthPage && <Navbar userId={userId} />}
      {!isAuthPage && userId && <SearchBar />}
      <Routes>
        <Route path="/login" element={!userId ? <Login /> : <Navigate to="/feed" />} />
        <Route path="/register" element={!userId ? <Register /> : <Navigate to="/feed" />} />
        <Route path="/feed" element={userId ? <Feed userId={userId} /> : <Navigate to="/login" />} />
        <Route path="/profile/:userId" element={userId ? <ProfilePage currentUserId={userId} /> : <Navigate to="/login" />} />
        <Route path="/post/:postId" element={userId ? <PostPage currentUserId={userId} /> : <Navigate to="/login" />} />
        <Route path="/search" element={userId ? <SearchPage /> : <Navigate to="/login" />} />
        <Route path="/notifications" element={userId ? <NotificationsPage currentUserId={userId} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={userId ? "/feed" : "/login"} />} />
      </Routes>
    </>
  );
}

function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
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
      <AppInner userId={userId} />
    </BrowserRouter>
  );
}

export default App;
