import './AuthLayout.css';

type Props = {
  children: React.ReactNode;
};

/*
 * The dark art panel on the left and a form column on the right.
 * Login, ForgotPassword and ResetPassword all render inside it.
 * (Register keeps its own art panel; it reads as the mirror image.)
 */
export default function AuthLayout({ children }: Props) {
  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-watermark">✦</div>

        <div className="login-panel-brand">
          <span className="login-panel-brand-serif">The</span>
          <span className="login-panel-brand-main">Chronicle</span>
        </div>

        <div className="login-brand">
          <p className="brand-tagline">Share your story,</p>
          <h1 className="brand-headline">
            one post<br />
            <em>at a time.</em>
          </h1>
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
