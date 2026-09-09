/*
 * Supabase auth error text, turned into one line a person can act on.
 * Shared by Login, Register, ForgotPassword and ResetPassword.
 */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('email not confirmed')) return 'Your email address has not been confirmed yet.';
  if (m.includes('invalid') && m.includes('email'))
    return 'Please enter a valid email address (e.g. yourname@gmail.com).';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'An account with this email already exists. Try logging in instead.';
  if (m.includes('rate limit') || m.includes('email rate') || m.includes('too many') || m.includes('security purposes'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('same password') || m.includes('different from the old'))
    return 'Your new password must be different from the old one.';
  if (m.includes('password') && m.includes('short')) return 'Password must be at least 6 characters.';
  if (m.includes('weak password') || m.includes('password should'))
    return 'Password must contain uppercase, lowercase letters and numbers.';
  if (m.includes('session') && (m.includes('missing') || m.includes('expired')))
    return 'This link has expired. Please request a new one.';
  return message;
}

export function isUnconfirmedEmail(message: string): boolean {
  return message.toLowerCase().includes('email not confirmed');
}
