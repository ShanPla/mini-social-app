import { useState, useId, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { friendlyAuthError } from '../../lib/authErrors';
import { redirectTarget } from '../../lib/redirect';
import type { FromState } from '../../lib/redirect';
import { useToast } from '../../context/ToastContext';
import PasswordInput from '../../components/PasswordInput/PasswordInput';
import CharCount from '../../components/CharCount/CharCount';
import './Register.css';
import { swapAuthPage } from '../../lib/authSwap';
import { loadAuthPage } from '../../lib/pages';

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  /* Carried over from the sign-in page, so a deep link survives the detour */
  const fromState = location.state as FromState;
  const toast = useToast();
  const [resending, setResending] = useState(false);
  const id = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /* The address the signup actually used, so an edited field cannot resend elsewhere */
  const [sentTo, setSentTo] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'taken' | 'available'>('idle');
  const [loading, setLoading] = useState(false);

  usePageTitle('Create Account');

  /* The other page's code, so the slide to it starts at once */

  useEffect(() => { loadAuthPage('login').catch(() => undefined); }, []);

  const handleUsernameChange = async (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(cleaned);
    setError('');
    if (cleaned.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    /* Logged-out users have no table access; this RPC is the one open door */
    const { data, error: checkError } = await supabase.rpc('username_available', { name: cleaned });
    /* A failed check (rate limit, offline) says nothing about the name; signing up still does */
    if (checkError) { setUsernameStatus('idle'); return; }
    setUsernameStatus(data === true ? 'available' : 'taken');
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: sentTo });
    if (error) toast.error(friendlyAuthError(error.message));
    else toast.success('Confirmation email sent again. Check your inbox.');
    setResending(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
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
    if (signUpError) { setError(friendlyAuthError(signUpError.message)); setLoading(false); return; }
    if (!data.session) {
      /* Email confirmation is on: there is no session until the link is clicked */
      setSentTo(email.trim());
      setNotice('Almost there. Check your inbox for a confirmation link, then sign in.');
      setLoading(false);
      return;
    }
    navigate(redirectTarget(fromState), { replace: true });
    setLoading(false);
  };

  return (
    <div className="register-page" data-auth-page="register">
      <div className="register-box">
        <div className="register-header">
          <Link to="/login" state={fromState} className="register-back" onClick={(e) => swapAuthPage(e, navigate, 'login', fromState)}>← Back to Sign In</Link>
          <h1>Create Account</h1>
          <p>Join The Chronicle today</p>
        </div>

        <form onSubmit={handleRegister} className="register-form">
          <div className="form-group">
            <label htmlFor={`${id}-username`}>
              Username
              {usernameStatus === 'checking' && <span className="username-status checking"> — checking…</span>}
              {usernameStatus === 'taken' && <span className="username-status taken"> — already taken</span>}
              {usernameStatus === 'available' && <span className="username-status available"> — available ✓</span>}
            </label>
            <input
              id={`${id}-username`}
              aria-describedby={`${id}-username-hint`}
              type="text"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="your_username"
              required
              minLength={3}
              maxLength={30}
              className={usernameStatus === 'taken' ? 'input-error' : usernameStatus === 'available' ? 'input-success' : ''}
            />
            <span className="field-hint" id={`${id}-username-hint`}>Letters, numbers, and underscores only.</span>
            {username.length >= 20 && <CharCount length={username.length} max={30} className="register-char-count" />}
          </div>

          <div className="form-group">
            <label htmlFor={`${id}-email`}>Email</label>
            <input
              id={`${id}-email`}
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="yourname@gmail.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor={`${id}-password`}>Password</label>
            <PasswordInput
              id={`${id}-password`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {error && <p className="error-msg">{error}</p>}
          {notice && (
            <>
              <p className="notice-msg">{notice}</p>
              <button type="button" className="auth-inline-btn" onClick={handleResend} disabled={resending}>
                {resending ? 'Sending…' : 'Resend the email'}
              </button>
            </>
          )}

          <button
            type="submit"
            className="btn-primary register-submit"
            disabled={loading || usernameStatus === 'taken' || usernameStatus === 'checking'}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <p className="register-legal">
            By creating an account you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </form>
      </div>

      <div className="register-art">
        <div className="register-art-watermark">✦</div>

        <Link to="/" className="register-panel-brand" aria-label="The Chronicle, front page">
          <span className="register-panel-brand-serif">The</span>
          <span className="register-panel-brand-main">Chronicle</span>
        </Link>

        <div className="register-art-main">
          <p className="register-art-headline">
            Your story<br />
            <em>starts here.</em>
          </p>
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
