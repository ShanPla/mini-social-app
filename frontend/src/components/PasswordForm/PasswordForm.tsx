import { useState, useId } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { friendlyAuthError } from '../../lib/authErrors';
import '../../pages/Login/Login.css';

type Props = {
  submitLabel?: string;
  /* Called after the password is saved; the form clears itself */
  onDone?: () => void;
  autoFocus?: boolean;
};

/*
 * New password + confirmation, saved with auth.updateUser. Used by the
 * reset page (recovery session) and by Settings (signed-in change).
 */
export default function PasswordForm({ submitLabel = 'Set new password', onDone, autoFocus = false }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const id = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) { setError(friendlyAuthError(updateError.message)); return; }
    setPassword('');
    setConfirm('');
    onDone?.();
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <div className="form-group">
        <label htmlFor={`${id}-new`}>New password</label>
        <input
          id={`${id}-new`}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={6}
          autoFocus={autoFocus}
          autoComplete="new-password"
        />
      </div>
      <div className="form-group">
        <label htmlFor={`${id}-confirm`}>Confirm new password</label>
        <input
          id={`${id}-confirm`}
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
        {loading ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
