import LegalPage from '../../components/LegalPage/LegalPage';
import { usePageTitle } from '../../lib/usePageTitle';

/* /terms: the short house rules */
export default function Terms() {
  usePageTitle('Terms');

  return (
    <LegalPage title="Terms" updated="2026-11-01">
      <p>
        The Chronicle is a student portfolio project, offered free of charge. By creating an account you
        agree to the points below.
      </p>

      <h2>Be respectful</h2>
      <p>Treat other people the way you would want to be treated. No harassment, bullying, hate or threats.</p>

      <h2>What you may post</h2>
      <ul>
        <li>Only post things you are allowed to share, and that are yours or that you have permission to use.</li>
        <li>Nothing illegal, nothing that harasses or targets someone, and no spam.</li>
        <li>You stay responsible for what you post and for what you send in messages.</li>
      </ul>

      <h2>Moderation</h2>
      <p>
        Admins may remove posts, comments or accounts that break these rules, without notice, to keep the
        community safe.
      </p>

      <h2>Provided as is</h2>
      <p>
        This is a hobby and learning project. It comes as is, with no promise that it will always be
        available, bug free or keep your data forever. Please do not rely on it for anything important.
      </p>

      <h2>Your account</h2>
      <p>
        You can delete your account at any time in Settings. See the Privacy Policy for what that removes.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href="mailto:platonshan0@gmail.com">platonshan0@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
