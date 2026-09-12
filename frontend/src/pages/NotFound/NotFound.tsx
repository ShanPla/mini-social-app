import { Link } from 'react-router-dom';
import EmptyState from '../../components/EmptyState/EmptyState';
import { usePageTitle } from '../../lib/usePageTitle';
import './NotFound.css';

type Props = {
  userId: string | null;
};

/* Anything the router does not know. Signed out, the way back is Sign in. */
export default function NotFound({ userId }: Props) {
  usePageTitle('Page not found');

  return (
    <div className="not-found-page">
      <EmptyState
        icon="search"
        title="Page not found"
        subtitle="That address does not lead anywhere on The Chronicle. It may have moved, or the link was mistyped."
        action={
          <Link to={userId ? '/feed' : '/login'} className="btn-primary not-found-btn">
            {userId ? 'Back to feed' : 'Sign in'}
          </Link>
        }
      />
    </div>
  );
}
