import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import './ErrorBoundary.css';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/*
 * Catches render errors below it so one broken card shows a recovery
 * panel instead of a blank page. App keys this by route, so navigating
 * away resets it. Class component: React only exposes componentDidCatch
 * to classes.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="error-boundary-card">
          <div className="error-boundary-icon"><AlertTriangle size={26} strokeWidth={1.6} /></div>
          <h2>Something went wrong</h2>
          <p>This part of the page hit an error it could not recover from.</p>
          <pre className="error-boundary-detail">{this.state.error.message}</pre>
          <div className="error-boundary-actions">
            <button className="btn-primary" onClick={() => window.location.reload()}>Reload page</button>
            <a className="btn-ghost" href="/feed">Go to feed</a>
          </div>
        </div>
      </div>
    );
  }
}
