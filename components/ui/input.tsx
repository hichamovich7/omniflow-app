import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base text-foreground shadow-xs outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 read-only:bg-surface-muted disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/15 md:h-10 md:text-sm dark:aria-invalid:ring-destructive/25 dark:aria-invalid:focus-visible:ring-destructive/25 motion-reduce:transition-none',
        className
      )}
      {...props}
    />
  );
}

export { Input };
