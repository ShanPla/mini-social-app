import { Link, useNavigate } from 'react-router-dom';
import { usePageTitle } from '../../lib/usePageTitle';
import { useToast } from '../../context/ToastContext';
import AuthLayout from '../../components/AuthLayout/AuthLayout';
import PasswordForm from '../../components/PasswordForm/PasswordForm';
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

  usePageTitle('New Password');

  /* Supabase reports a dead link in the URL hash rather than with a session */
  const linkError = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('error_description');

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

      <PasswordForm
        autoFocus
        onDone={() => {
          toast.success('Password updated. You are signed in.');
          navigate('/feed', { replace: true });
        }}
      />
    </AuthLayout>
  );
}
