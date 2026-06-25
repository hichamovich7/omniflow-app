import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
}

export function EmptyState({ title, description, icon: Icon, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 px-6 py-20 text-center">
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 max-w-xs text-[13px] text-muted-foreground leading-relaxed">
        {description}
      </p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
