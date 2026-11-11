import { Link } from 'react-router-dom';
import './AuthLayout.css';

type Props = {
  children: React.ReactNode;
  /* Which page this is, for the animation between them (lib/authSwap.ts) */
  page?: 'login' | 'forgotPassword' | 'resetPassword';
};

/*
 * The dark art panel on the left and a form column on the right.
 * Login, ForgotPassword and ResetPassword all render inside it.
 * (Register keeps its own art panel, on the same side.)
 */
export default function AuthLayout({ children, page }: Props) {
  return (
    <div className="login-page" data-auth-page={page}>
      <div className="login-left">
        <div className="login-watermark">✦</div>

        {/* The way back to the front page */}
        <Link to="/" className="login-panel-brand" aria-label="The Chronicle, front page">
          <span className="login-panel-brand-serif">The</span>
          <span className="login-panel-brand-main">Chronicle</span>
        </Link>

        <div className="login-brand">
          <p className="brand-tagline">Share your story,</p>
          <p className="brand-headline">
            one post<br />
            <em>at a time.</em>
          </p>
        </div>

        <div className="login-deco">
          <div className="login-deco-stars">
            <span className="login-deco-star">✦</span>
            <span className="login-deco-star">✦</span>
            <span className="login-deco-star">✦</span>
            <span className="login-deco-star">✦</span>
            <span className="login-deco-star">✦</span>
          </div>
          <div className="login-deco-divider" />
          <p className="login-deco-quote">
            "Every story deserves to be told.<br />
            Every voice deserves to be heard."
          </p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-box">{children}</div>
      </div>
    </div>
  );
}
