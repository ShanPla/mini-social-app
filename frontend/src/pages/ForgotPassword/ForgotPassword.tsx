import { useState, useId } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { friendlyAuthError } from '../../lib/authErrors';
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

  usePageTitle('Reset Password');

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

  return (
    <AuthLayout>
      <div className="login-header">
        <h2>Reset password</h2>
        <p>We will email you a link to choose a new one.</p>
      </div>

      {sent ? (
        <div className="login-form">
          {/* Same message whether or not the address exists, so the form cannot be used to probe accounts */}
          <p className="notice-msg">
            If an account exists for <strong>{email.trim()}</strong>, a reset link is on its way.
            It works once and expires after a short while.
          </p>
          <button type="button" className="auth-inline-btn" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor={`${id}-email`}>Email</label>
            <input
              id={`${id}-email`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="btn-primary login-submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="login-register-link">
        <Link to="/login">← Back to Sign In</Link>
      </p>
    </AuthLayout>
  );
}
