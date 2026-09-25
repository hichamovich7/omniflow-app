import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-24 w-full rounded-md border border-input bg-card px-3 py-2.5 text-base leading-6 text-foreground shadow-xs outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 read-only:bg-surface-muted disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/15 md:text-sm md:leading-5 dark:aria-invalid:ring-destructive/25 dark:aria-invalid:focus-visible:ring-destructive/25 motion-reduce:transition-none',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
