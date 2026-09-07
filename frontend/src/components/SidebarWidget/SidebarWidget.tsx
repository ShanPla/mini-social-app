import { Link } from 'react-router-dom';
import './SidebarWidget.css';

type WidgetProps = {
  title: string;
  icon?: React.ReactNode;
  /* Optional link shown at the bottom, e.g. "See all" */
  footer?: { to: string; label: string };
  children: React.ReactNode;
};

/* Card shell shared by every feed sidebar widget */
export default function SidebarWidget({ title, icon, footer, children }: WidgetProps) {
  return (
    <section className="widget">
      <header className="widget-header">
        {icon && <span className="widget-icon">{icon}</span>}
        <h4>{title}</h4>
      </header>
      <div className="widget-body">{children}</div>
      {footer && <Link to={footer.to} className="widget-footer">{footer.label} →</Link>}
    </section>
  );
}

/* Avatar used in widget user rows; optional green presence dot */
export function WidgetAvatar({ username, avatarUrl, size = 34, online = false }: {
  username: string;
  avatarUrl: string | null;
  size?: number;
  online?: boolean;
}) {
  return (
    <span className="widget-avatar-wrap" style={{ width: size, height: size }}>
      <span className="widget-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
        {avatarUrl
          ? <img src={avatarUrl} alt={username} loading="lazy" />
          : <span>{username[0]?.toUpperCase() || '?'}</span>
        }
      </span>
      {online && <span className="widget-online-dot" />}
    </span>
  );
}

/* Loading placeholder rows */
export function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="widget-skeletons">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="widget-skeleton">
          <div className="widget-skeleton-avatar" />
          <div className="widget-skeleton-line" />
        </div>
      ))}
    </div>
  );
}

export function WidgetEmpty({ children }: { children: React.ReactNode }) {
  return <p className="widget-empty">{children}</p>;
}
