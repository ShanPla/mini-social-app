import { useState, useId } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { friendlyAuthError, isUnconfirmedEmail } from '../../lib/authErrors';
import { useToast } from '../../context/ToastContext';
import AuthLayout from '../../components/AuthLayout/AuthLayout';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const id = useId();

  usePageTitle('Sign In');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUnconfirmed(false);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(friendlyAuthError(error.message));
      /* Supabase only reports an unconfirmed email once the password matched,
         so offering a resend here does not leak anything */
      setUnconfirmed(isUnconfirmedEmail(error.message));
      setLoading(false);
      return;
    }
    navigate('/feed');
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    if (error) toast.error(friendlyAuthError(error.message));
    else toast.success('Confirmation email sent. Check your inbox.');
    setResending(false);
  };

  return (
    <AuthLayout>
      <div className="login-header">
        <h2>Sign In</h2>
        <p>Welcome back to The Chronicle</p>
      </div>

      <form onSubmit={handleLogin} className="login-form">
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
        <div className="form-group">
          <label htmlFor={`${id}-password`}>Password</label>
          <input
            id={`${id}-password`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        <div className="login-aux">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>

        {error && <p className="error-msg">{error}</p>}
        {unconfirmed && (
          <button type="button" className="auth-inline-btn" onClick={handleResend} disabled={resending}>
            {resending ? 'Sending…' : 'Resend confirmation email'}
          </button>
        )}

        <button type="submit" className="btn-primary login-submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <p className="login-register-link">
        New here?{' '}
        <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
