import { Link } from 'react-router-dom';
import './LegalPage.css';

type Props = {
  title: string;
  updated: string;
  children: React.ReactNode;
};

/* A plain readable article for the Privacy and Terms pages. Works signed in or out. */
export default function LegalPage({ title, updated, children }: Props) {
  return (
    <div className="legal-page">
      <article className="legal-article">
        <Link to="/" className="legal-back">← The Chronicle</Link>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated <time dateTime={updated}>{updated}</time></p>
        {children}
        <nav className="legal-footer" aria-label="Legal">
          <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy Policy</Link>
        </nav>
      </article>
    </div>
  );
}
