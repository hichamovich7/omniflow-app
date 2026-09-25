import type { LucideIcon } from 'lucide-react';
import { PageState } from '@/components/shared/page-state';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  /** Heading level of the title (defaults to 2, directly under the page's h1). */
  headingLevel?: 2 | 3;
  children?: React.ReactNode;
}

/** Older API kept for existing callers: an `empty` `PageState`, `children` as its action. */
export function EmptyState({ title, description, icon, headingLevel, children }: EmptyStateProps) {
  return (
    <PageState
      variant="empty"
      title={title}
      description={description}
      icon={icon}
      headingLevel={headingLevel}
      action={children}
    />
  );
}
