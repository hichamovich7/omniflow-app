import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  /** Simple form pages (Research, Generate, New/Edit Project, New/Edit Board) use a
   * reduced max-width so the form doesn't stretch across the full desktop viewport. */
  narrow?: boolean;
}

export function PageContainer({ children, narrow }: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto space-y-8 px-4 py-6 md:px-8 md:py-8',
        narrow ? 'max-w-2xl' : 'max-w-7xl'
      )}
    >
      {children}
    </div>
  );
}
