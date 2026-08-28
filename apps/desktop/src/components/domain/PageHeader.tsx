interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/**
 * Page header per githelm.pen: fs-4xl (24px) normal-weight title with
 * -0.2px tracking, fs-sm (13px) muted subtitle, actions on the right.
 * Pages place it inside their 32px content padding.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-normal leading-tight tracking-[-0.2px] th-text-strong">
          {title}
        </h1>
        {description && <p className="text-[13px] th-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
    </div>
  );
}
