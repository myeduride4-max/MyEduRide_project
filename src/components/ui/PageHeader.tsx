'use client';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  action?: React.ReactNode;
};

export function PageHeader({ title, subtitle, badge, action }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="min-w-0 flex-1">
        {badge && <p className="page-badge">{badge}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
