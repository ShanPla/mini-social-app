import './EmptyState.css';

type EmptyStateProps = {
  icon: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export default function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h3 className="empty-state-title">{title}</h3>
      {subtitle && <p className="empty-state-subtitle">{subtitle}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
