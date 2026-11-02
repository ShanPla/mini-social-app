import LegalPage from '../../components/LegalPage/LegalPage';
import { usePageTitle } from '../../lib/usePageTitle';

/* /privacy: what The Chronicle keeps, where, and who can see it */
export default function Privacy() {
  usePageTitle('Privacy Policy');

  return (
    <LegalPage title="Privacy Policy" updated="2026-11-01">
      <p>
        The Chronicle is a small social app built as a student portfolio project. This page says, in plain
        words, what it stores about you and what happens to it.
      </p>

      <h2>What is stored</h2>
      <ul>
        <li>Your account: email address, username, password (stored only as a hash by the sign-in service).</li>
        <li>Your profile: display name, bio and profile photo.</li>
        <li>What you share: posts and their images, comments, likes and who you follow.</li>
        <li>Messages: chat messages and any photos you send in chats. Chat photos are kept in a private bucket and only people in that conversation can open them.</li>
        <li>Notifications that the app creates for you (likes, comments, follows, messages).</li>
        <li>When you check whether a username is free: a one-way hash of your network address, deleted after 10 minutes, to stop people from trying every name.</li>
      </ul>

      <h2>Where it is stored</h2>
      <p>
        Your data lives in Supabase (database, sign-in and file storage), which is hosted in the cloud. The
        website itself is hosted on Vercel. Vercel Web Analytics and Speed Insights are switched on; they
        count page views and measure how fast pages load. They are cookieless and are not used to follow
        you around.
      </p>

      <h2>Who can see what</h2>
      <ul>
        <li><strong>Public</strong> posts can be seen by every signed-in user.</li>
        <li><strong>Followers only</strong> posts can be seen by anyone who follows you. Following needs no approval, so anyone can follow you and then see them.</li>
        <li><strong>Private</strong> posts can only be seen by you.</li>
        <li>Your profile (name, bio, photo, posts you made public) is visible to other signed-in users.</li>
        <li>Messages and chat photos can be seen by the people in that conversation.</li>
      </ul>

      <h2>No ads, no selling</h2>
      <p>There are no ads and no trackers for advertising. Your data is not sold or shared with anyone for marketing.</p>

      <h2>Deleting your data</h2>
      <p>
        Go to Settings, then Delete account. This removes your account and its data: profile, posts,
        comments, likes, follows, notifications and the photos behind them. Messages you sent stay in their
        conversations as [Deleted user]. Photos sent in chats may remain in storage until they are cleaned up.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or a request about your data: <a href="mailto:platonshan0@gmail.com">platonshan0@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
