import { cn } from '@/lib/utils';

interface ResourceHeaderProps {
  title: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  status?: React.ReactNode;
  metadata?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function ResourceHeader({ title, breadcrumbs, status, metadata, actions, className }: ResourceHeaderProps) {
  return <header className={cn('space-y-3', className)}>{breadcrumbs && <div className="text-metadata">{breadcrumbs}</div>}<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 space-y-1.5"><div className="flex flex-wrap items-center gap-2"><h1 className="text-page-title min-w-0">{title}</h1>{status}</div>{metadata && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-metadata">{metadata}</div>}</div>{actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}</div></header>;
}
