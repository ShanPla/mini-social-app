import { useState, useEffect, useId } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { friendlyAuthError } from '../../lib/authErrors';
import { swapAuthPage } from '../../lib/authSwap';
import { loadAuthPage } from '../../lib/pages';
import AuthLayout from '../../components/AuthLayout/AuthLayout';
import '../Login/Login.css';

/*
 * /forgot-password. Supabase emails a recovery link that lands on
 * /reset-password already signed in (a normal session, usable from any
 * device); that page sets the new password. The redirect URL must be on
 * the allow list in Supabase Auth settings.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const id = useId();
  const navigate = useNavigate();

  usePageTitle('Reset Password');
  /* Sign in's code, so the animation back to it starts at once */
  useEffect(() => { loadAuthPage('login').catch(() => undefined); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(friendlyAuthError(error.message));
    else setSent(true);
    setLoading(false);
  };

  /* Lifts this form away, with Sign in underneath (lib/authSwap.ts) */
  const backToSignIn = (
    <Link to="/login" className="auth-back" onClick={(e) => swapAuthPage(e, navigate, 'login', undefined)}>
      ← Back to Sign In
    </Link>
  );

  if (sent) {
    return (
      <AuthLayout page="forgotPassword">
        <div className="login-header">
          <span className="auth-sent-icon" aria-hidden="true"><MailCheck size={20} /></span>
          <h1>Check your email</h1>
          {/* Same message whether or not the address exists, so the form cannot be used to probe accounts */}
          <p role="status">
            If an account exists for <strong>{email.trim()}</strong>, a reset link is on its way.
            It works once and expires after a short while.
          </p>
        </div>

        <div className="auth-actions">
          {backToSignIn}
          <button type="button" className="btn-ghost auth-action" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout page="forgotPassword">
      <div className="login-header">
        <h1>Forgot your password?</h1>
        <p>Enter the email you signed up with. We will send a link to choose a new one.</p>
      </div>

      <form onSubmit={handleSubmit} className="login-form">
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
            placeholder="you@example.com"
            required
            autoFocus
          />
        </div>

        {error && <p className="error-msg">{error}</p>}

        {/* The way back on the left, the one action on the right, at its own width */}
        <div className="auth-actions">
          {backToSignIn}
          <button type="submit" className="btn-primary auth-action" disabled={loading || !email.trim()}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
