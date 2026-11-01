import { useState, useEffect, useId } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, KeyRound, Trash2, SunMoon, Monitor, Sun, Moon, LogOut, FileText, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { usePageTitle } from '../../lib/usePageTitle';
import { friendlyAuthError } from '../../lib/authErrors';
import { describeError } from '../../lib/errors';
import { useToast } from '../../context/ToastContext';
import { markIntentionalSignOut } from '../../lib/session';
import { logOut } from '../../lib/logout';
import { pruneFolder, removeUserPostImages } from '../../lib/storage';
import { useTheme } from '../../lib/theme';
import { clearAllDrafts } from '../../lib/drafts';
import type { ThemePreference } from '../../lib/theme';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import PasswordInput from '../../components/PasswordInput/PasswordInput';
import PasswordForm from '../../components/PasswordForm/PasswordForm';
import '../Login/Login.css';
import './Settings.css';

type Props = {
  userId: string;
  isAdmin?: boolean;
};

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/* /settings: the account basics. Profile details (name, bio, photo) live on the profile page. */
export default function SettingsPage({ userId, isAdmin = false }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  /* The email/username fetch failed; Retry bumps version to run it again */
  const [loadFailed, setLoadFailed] = useState(false);
  const [version, setVersion] = useState(0);
  /* Which fetch the email and username belong to; loading is derived from it */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loadKey = `${userId}:${version}`;
  const loading = loadedKey !== loadKey;
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailNotice, setEmailNotice] = useState('');
  const [confirmText, setConfirmText] = useState('');
  /* Deleting needs the current password again, checked just before the account goes */
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  /* The last step before the account goes: a plain yes/no after the typed handle */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const id = useId();
  const { preference, setPreference } = useTheme();

  usePageTitle('Settings');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: auth, error: authError }, { data: profile, error: profileError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('username').eq('id', userId).maybeSingle(),
      ]);
      if (cancelled) return;
      setLoadFailed(!!authError || !!profileError);
      setEmail(auth.user?.email ?? null);
      setUsername(profile?.username ?? '');
      setLoadedKey(`${userId}:${version}`);
    })();
    return () => { cancelled = true; };
  }, [userId, version]);

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
      toast.info(`Check ${target} for a confirmation link to finish the change.`);
      return;
    }
    setEmail(data.user?.email ?? target);
    setNewEmail('');
    toast.success('Email updated');
  };

  const canDelete = !loading && !!email && username.length > 0 && confirmText.trim().toLowerCase() === username && deletePassword.length > 0;

  const handleDelete = async () => {
    setConfirmingDelete(false);
    if (!canDelete || deleting || !email) return;
    setDeleting(true);
    setDeleteError('');
    /* Re-auth: a stolen open session alone cannot delete the account */
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: deletePassword });
    if (authError) {
      setDeleteError(
        authError.message.toLowerCase().includes('invalid login')
          ? 'That password is not correct.'
          : friendlyAuthError(authError.message)
      );
      setDeleting(false);
      return;
    }
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
    clearAllDrafts();
    await supabase.auth.signOut({ scope: 'local' });
    toast.info('Your account has been deleted.');
    navigate('/login', { replace: true });
  };

  const handleLogout = async () => {
    await logOut();
    navigate('/login');
  };

  return (
    <div className="settings-page">
      <div className="settings-inner">
        <header className="settings-header">
          {/* Settings is reached from the profile, so that is where back leads */}
          <Link to={`/profile/${userId}`} className="settings-back">← Back to profile</Link>
          <h1>Settings</h1>
          <p>Signed in as <strong>@{loading ? 'loading…' : username || '…'}</strong>. Name, bio and photo are edited on your profile.</p>
        </header>

        {loadFailed && (
          <p className="error-msg" role="alert">
            Could not load your account details.{' '}
            <button type="button" className="btn-ghost" onClick={() => setVersion((v) => v + 1)}>Retry</button>
          </p>
        )}

        {/* Appearance: native radios, so arrow keys move between the three */}
        <section className="settings-card">
          <h2><SunMoon size={16} /> Appearance</h2>
          <p>Follow your device, or pick one. Saved on this device only.</p>
          <div className="theme-options" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map(({ value, label, Icon }) => (
              <label key={value} className={`theme-option ${preference === value ? 'theme-option--on' : ''}`}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={preference === value}
                  onChange={() => setPreference(value)}
                />
                <Icon size={15} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Email */}
        <section className="settings-card">
          <h2><Mail size={16} /> Email</h2>
          <p className="settings-current">Current address: <strong>{loading ? 'Loading…' : email ?? '…'}</strong></p>
          <form onSubmit={handleEmail} className="login-form">
            <div className="form-group">
              <label htmlFor={`${id}-email`}>New email</label>
              <input
                id={`${id}-email`}
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
            <label htmlFor={`${id}-confirm`}>Type your handle <strong>@{loading ? 'loading…' : username || '…'}</strong> to confirm</label>
            <input
              id={`${id}-confirm`}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={username}
              autoComplete="off"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor={`${id}-delete-password`}>Your current password</label>
            <PasswordInput
              id={`${id}-delete-password`}
              value={deletePassword}
              onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(''); }}
              autoComplete="current-password"
              aria-invalid={!!deleteError}
              aria-describedby={deleteError ? `${id}-delete-error` : undefined}
              disabled={loading}
            />
          </div>
          {deleteError && <p className="error-msg" id={`${id}-delete-error`} role="alert">{deleteError}</p>}
          <button type="button" className="settings-delete-btn" onClick={() => setConfirmingDelete(true)} disabled={!canDelete || deleting}>
            {deleting ? 'Deleting…' : 'Delete my account'}
          </button>
        </section>

        {/* Session and the legal pages. Logout is also in the navbar; phones reach it here too. */}
        <section className="settings-card">
          <h2><LogOut size={16} /> Session</h2>
          <button type="button" className="btn-ghost settings-logout" onClick={handleLogout}>Log out</button>
        </section>

        {isAdmin && (
          <section className="settings-card">
            <h2><Shield size={16} /> Moderation</h2>
            <p className="settings-legal"><Link to="/admin/reports">Review reports</Link></p>
          </section>
        )}

        <section className="settings-card">
          <h2><FileText size={16} /> About</h2>
          <p className="settings-legal">
            <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy Policy</Link>
          </p>
        </section>
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete your account?"
          message="This permanently removes your profile, posts, comments, likes, follows and notifications. It cannot be undone."
          confirmLabel="Delete my account"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
