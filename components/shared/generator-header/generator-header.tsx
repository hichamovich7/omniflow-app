import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface GeneratorHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  className?: string;
}

// Centred header of the generator pages (Pinterest, WordPress hub and forms):
// 44 px tinted icon tile, page title (28 / 34 px 700), 14 px muted
// description. Mirrored by `CenteredHeaderSkeleton`. List and resource pages
// use `PageHeader` / `ResourceHeader` instead.
export function GeneratorHeader({
  icon: Icon,
  title,
  description,
  className,
}: GeneratorHeaderProps) {
  return (
    <div data-slot="generator-header" className={cn('text-center', className)}>
      <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-selected">
        <Icon aria-hidden="true" className="size-5 text-primary" />
      </div>
      <h1 className="text-page-title text-balance">{title}</h1>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-body-secondary text-balance">{description}</p>
      )}
    </div>
  );
}
