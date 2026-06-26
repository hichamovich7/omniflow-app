'use client';

import { useEffect } from 'react';
import { PageContainer } from '@/components/ui/page-container';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        <Button onClick={reset} variant="outline" size="sm" className="mt-4">
          Try again
        </Button>
      </div>
    </PageContainer>
  );
}
