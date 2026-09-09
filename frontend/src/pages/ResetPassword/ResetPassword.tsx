import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { friendlyAuthError } from '../../lib/authErrors';
import { useToast } from '../../context/ToastContext';
import AuthLayout from '../../components/AuthLayout/AuthLayout';
import '../Login/Login.css';

type Props = {
  userId: string | null;
};

/*
 * /reset-password. The recovery link signs the user in (a normal session,
 * from whichever device opened it) before landing here, so a signed-in
 * user is the normal case.
 * No session means the link was bad or expired. A signed-in user who
 * navigates here on purpose simply gets to change their password.
 */
export default function ResetPassword({ userId }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  usePageTitle('New Password');

  /* Supabase reports a dead link in the URL hash rather than with a session */
  const linkError = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('error_description');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(friendlyAuthError(error.message));
      setLoading(false);
      return;
    }
    toast.success('Password updated. You are signed in.');
    navigate('/feed', { replace: true });
  };

  if (!userId) {
    return (
      <AuthLayout>
        <div className="login-header">
          <h2>Link expired</h2>
          <p>{linkError || 'This reset link is invalid or has already been used.'}</p>
        </div>
        <div className="login-form">
          <Link to="/forgot-password" className="btn-primary login-submit login-submit--link">Request a new link</Link>
        </div>
        <p className="login-register-link">
          <Link to="/login">← Back to Sign In</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="login-header">
        <h2>Choose a new password</h2>
        <p>At least 6 characters. You will stay signed in afterwards.</p>
      </div>

      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label>New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            autoFocus
            autoComplete="new-password"
          />
        </div>
        <div className="form-group">
          <label>Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button type="submit" className="btn-primary login-submit" disabled={loading}>
          {loading ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </AuthLayout>
  );
}
