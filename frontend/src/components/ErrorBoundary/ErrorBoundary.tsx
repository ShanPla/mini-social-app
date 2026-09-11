import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import LoadingScreen from '../LoadingScreen/LoadingScreen';
import { isChunkLoadError, canReloadForStaleChunk, reloadForStaleChunk } from '../../lib/reloadOnce';
import './ErrorBoundary.css';

type Props = {
  children: ReactNode;
  /* Rendered instead of the recovery card for errors that are not a stale
     chunk, e.g. null to simply hide a non-essential widget */
  fallback?: ReactNode;
};

type State = {
  error: Error | null;
  /* Decided at catch time so render never paints the card for a reload */
  reloading: boolean;
};

/*
 * Catches render errors below it so one broken card shows a recovery
 * panel instead of a blank page. App keys this by route, so navigating
 * away resets it. Class component: React only exposes componentDidCatch
 * to classes.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, reloading: isChunkLoadError(error) && canReloadForStaleChunk() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.state.reloading && reloadForStaleChunk()) return;
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;
    /* The reload is already on its way: show the same loader the page had */
    if (reloading) return <LoadingScreen compact />;

    const stale = isChunkLoadError(error);
    if (!stale && this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div className="error-boundary">
        <div className="error-boundary-card">
          <div className="error-boundary-icon"><AlertTriangle size={26} strokeWidth={1.6} /></div>
          <h2>{stale ? 'The Chronicle was updated' : 'Something went wrong'}</h2>
          <p>{stale
            ? 'A newer version is live. Reload to pick it up.'
            : 'This part of the page hit an error it could not recover from.'}</p>
          {!stale && <pre className="error-boundary-detail">{error.message}</pre>}
          <div className="error-boundary-actions">
            <button className="btn-primary" onClick={() => window.location.reload()}>Reload page</button>
            <a className="btn-ghost" href="/feed">Go to feed</a>
          </div>
        </div>
      </div>
    );
  }
}
