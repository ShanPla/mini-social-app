import { Users, Sparkles, Search, Bell, PenLine, TriangleAlert } from 'lucide-react';
import './EmptyState.css';

type EmptyStateProps = {
  icon: 'users' | 'sparkles' | 'search' | 'bell' | 'pen' | 'alert' | string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /* The page's only heading (e.g. the 404) is an h1; everywhere else it is an h3 */
  asPageHeading?: boolean;
};

const ICON_MAP: Record<string, React.ReactNode> = {
  users: <Users size={40} strokeWidth={1.2} />,
  sparkles: <Sparkles size={40} strokeWidth={1.2} />,
  search: <Search size={40} strokeWidth={1.2} />,
  bell: <Bell size={40} strokeWidth={1.2} />,
  pen: <PenLine size={40} strokeWidth={1.2} />,
  alert: <TriangleAlert size={40} strokeWidth={1.2} />,
};

export default function EmptyState({ icon, title, subtitle, action, asPageHeading = false }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {ICON_MAP[icon] ?? <Sparkles size={40} strokeWidth={1.2} />}
      </div>
      {asPageHeading
        ? <h1 className="empty-state-title">{title}</h1>
        : <h3 className="empty-state-title">{title}</h3>}
      {subtitle && <p className="empty-state-subtitle">{subtitle}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
