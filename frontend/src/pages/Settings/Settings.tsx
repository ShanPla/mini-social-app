import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, KeyRound, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { friendlyAuthError } from '../../lib/authErrors';
import { describeError } from '../../lib/errors';
import { useToast } from '../../context/ToastContext';
import { markIntentionalSignOut } from '../../lib/session';
import { pruneFolder, removeUserPostImages } from '../../lib/storage';
import PasswordForm from '../../components/PasswordForm/PasswordForm';
import '../Login/Login.css';
import './Settings.css';

type Props = {
  userId: string;
};

/* /settings: the account basics. Profile details (name, bio, photo) live on the profile page. */
export default function SettingsPage({ userId }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailNotice, setEmailNotice] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  usePageTitle('Settings');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: auth }, { data: profile }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('username').eq('id', userId).maybeSingle(),
      ]);
      if (cancelled) return;
      setEmail(auth.user?.email ?? null);
      setUsername(profile?.username ?? '');
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailNotice('');
    const target = newEmail.trim();
    if (!target || target === email || emailBusy) return;
    setEmailBusy(true);
    const { data, error } = await supabase.auth.updateUser({ email: target });
    setEmailBusy(false);
    if (error) { setEmailError(friendlyAuthError(error.message)); return; }
    /* With confirmation on, Supabase parks the new address until the link is clicked */
    if (data.user?.new_email) {
      setEmailNotice(`Almost there. Confirm the change from your inbox at ${target} to finish.`);
      return;
    }
    setEmail(data.user?.email ?? target);
    setNewEmail('');
    toast.success('Email updated');
  };

  const canDelete = username.length > 0 && confirmText.trim().toLowerCase() === username;

  const handleDelete = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    /* Files first: once the row is gone the storage policies no longer know us */
    await Promise.all([pruneFolder('avatars', userId), removeUserPostImages(userId)]);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      toast.error(describeError(error, 'Could not delete the account. Please try again.'));
      setDeleting(false);
      return;
    }
    /* The user no longer exists server-side; only the local session is left to clear */
    markIntentionalSignOut();
    await supabase.auth.signOut({ scope: 'local' });
    toast.info('Your account has been deleted.');
    navigate('/login', { replace: true });
  };

  return (
    <div className="settings-page">
      <div className="settings-inner">
        <header className="settings-header">
          {/* Settings is reached from the profile, so that is where back leads */}
          <Link to={`/profile/${userId}`} className="settings-back">← Back to profile</Link>
          <h1>Settings</h1>
          <p>Signed in as <strong>@{username || '…'}</strong>. Name, bio and photo are edited on your profile.</p>
        </header>

        {/* Email */}
        <section className="settings-card">
          <h2><Mail size={16} /> Email</h2>
          <p className="settings-current">Current address: <strong>{email ?? '…'}</strong></p>
          <form onSubmit={handleEmail} className="login-form">
            <div className="form-group">
              <label>New email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            {emailError && <p className="error-msg">{emailError}</p>}
            {emailNotice && <p className="notice-msg">{emailNotice}</p>}
            <button type="submit" className="btn-primary login-submit" disabled={emailBusy || !newEmail.trim()}>
              {emailBusy ? 'Saving…' : 'Change email'}
            </button>
          </form>
        </section>

        {/* Password */}
        <section className="settings-card">
          <h2><KeyRound size={16} /> Password</h2>
          <PasswordForm submitLabel="Change password" onDone={() => toast.success('Password updated')} />
        </section>

        {/* Delete */}
        <section className="settings-card settings-card--danger">
          <h2><Trash2 size={16} /> Delete account</h2>
          <p>
            Removes your profile, posts, comments, likes, follows and notifications, and the photos behind
            them. Messages you sent stay in their conversations as [Deleted user]. This cannot be undone.
          </p>
          <div className="form-group">
            <label>Type your handle <strong>@{username || '…'}</strong> to confirm</label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={username}
              autoComplete="off"
            />
          </div>
          <button type="button" className="settings-delete-btn" onClick={handleDelete} disabled={!canDelete || deleting}>
            {deleting ? 'Deleting…' : 'Delete my account'}
          </button>
        </section>
      </div>
    </div>
  );
}
