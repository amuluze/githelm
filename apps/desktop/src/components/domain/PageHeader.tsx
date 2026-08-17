interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export const PageHeader = ({ title, description, actions }: PageHeaderProps) => (
  <div className="flex items-start justify-between gap-4 border-b th-bd-subtle px-6 py-5">
    <div>
      <h1 className="text-xl font-semibold tracking-tight th-text-title">
        {title}
      </h1>
      {description && (
        <p className="mt-1 text-sm th-text-muted">{description}</p>
      )}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);