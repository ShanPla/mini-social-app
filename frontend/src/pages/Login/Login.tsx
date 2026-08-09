import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  usePageTitle('Sign In');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else navigate('/feed');
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-watermark">✦</div>

        <div className="login-panel-brand">
          <span className="login-panel-brand-serif">The</span>
          <span className="login-panel-brand-main">Chronicle</span>
        </div>

        <div className="login-brand">
          <p className="brand-tagline">Share your story,</p>
          <h1 className="brand-headline">
            one post<br />
            <em>at a time.</em>
          </h1>
        </div>

        <div className="login-deco">
          <div className="login-deco-stars">
            <span className="login-deco-star">✦</span>
            <span className="login-deco-star">✦</span>
            <span className="login-deco-star">✦</span>
            <span className="login-deco-star">✦</span>
            <span className="login-deco-star">✦</span>
          </div>
          <div className="login-deco-divider" />
          <p className="login-deco-quote">
            "Every story deserves to be told.<br />
            Every voice deserves to be heard."
          </p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-box">
          <div className="login-header">
            <h2>Sign In</h2>
            <p>Welcome back to The Chronicle</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn-primary login-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="login-register-link">
            New here?{' '}
            <Link to="/register">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
