import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import './Register.css';

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'taken' | 'available'>('idle');
  const [loading, setLoading] = useState(false);

  usePageTitle('Create Account');

  const handleUsernameChange = async (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(cleaned);
    setError('');
    if (cleaned.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    /* Logged-out users have no table access; this RPC is the one open door */
    const { data } = await supabase.rpc('username_available', { name: cleaned });
    setUsernameStatus(data === true ? 'available' : 'taken');
  };

  const getFriendlyError = (message: string): string => {
    if (message.includes('invalid') && message.includes('email'))
      return 'Please enter a valid email address (e.g. yourname@gmail.com).';
    if (message.includes('already registered') || message.includes('already been registered'))
      return 'An account with this email already exists. Try logging in instead.';
    if (message.includes('rate limit') || message.includes('email rate'))
      return 'Too many attempts. Please wait a minute and try again.';
    if (message.includes('password') && message.includes('short'))
      return 'Password must be at least 6 characters.';
    if (message.includes('weak password'))
      return 'Password must contain uppercase, lowercase letters and numbers.';
    return message;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (username.length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (usernameStatus === 'taken') { setError('That username is already taken. Please choose another.'); return; }
    if (usernameStatus === 'checking') { setError('Still checking username availability, please wait.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);
    /* The username travels in the auth metadata; handle_new_user() in
       schema.sql reads it when it creates the profile row, so it works
       even when the account is not confirmed yet. */
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (signUpError) { setError(getFriendlyError(signUpError.message)); setLoading(false); return; }
    if (!data.session) {
      /* Email confirmation is on: there is no session until the link is clicked */
      setNotice('Almost there. Check your inbox for a confirmation link, then sign in.');
      setLoading(false);
      return;
    }
    navigate('/feed');
    setLoading(false);
  };

  return (
    <div className="register-page">
      <div className="register-box">
        <div className="register-header">
          <Link to="/login" className="register-back">← Back to Sign In</Link>
          <h2>Create Account</h2>
          <p>Join The Chronicle today</p>
        </div>

        <form onSubmit={handleRegister} className="register-form">
          <div className="form-group">
            <label>
              Username
              {usernameStatus === 'checking' && <span className="username-status checking"> — checking…</span>}
              {usernameStatus === 'taken' && <span className="username-status taken"> — already taken</span>}
              {usernameStatus === 'available' && <span className="username-status available"> — available ✓</span>}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="your_username"
              required
              minLength={3}
              maxLength={30}
              className={usernameStatus === 'taken' ? 'input-error' : usernameStatus === 'available' ? 'input-success' : ''}
            />
            <span className="field-hint">Letters, numbers, and underscores only.</span>
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="yourname@gmail.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              required
              minLength={6}
            />
          </div>

          {error && <p className="error-msg">{error}</p>}
          {notice && <p className="notice-msg">{notice}</p>}

          <button
            type="submit"
            className="btn-primary register-submit"
            disabled={loading || usernameStatus === 'taken' || usernameStatus === 'checking'}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
      </div>

      <div className="register-art">
        <div className="register-art-watermark">✦</div>

        <div className="register-panel-brand">
          <span className="register-panel-brand-serif">The</span>
          <span className="register-panel-brand-main">Chronicle</span>
        </div>

        <div className="register-art-main">
          <h2 className="register-art-headline">
            Your story<br />
            <em>starts here.</em>
          </h2>
          <p className="register-art-sub">
            Join a community of voices.<br />
            Share what matters to you.
          </p>
        </div>

        <div className="register-art-deco">
          <div className="register-art-stars">
            <span className="register-art-star">✦</span>
            <span className="register-art-star">✦</span>
            <span className="register-art-star">✦</span>
            <span className="register-art-star">✦</span>
            <span className="register-art-star">✦</span>
          </div>
          <div className="register-art-divider" />
          <p className="register-art-quote">"Every voice matters."</p>
        </div>
      </div>
    </div>
  );
}
