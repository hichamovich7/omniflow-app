'use client';

import { useEffect } from 'react';
import { PageContainer } from '@/components/ui/page-container';
import { Button } from '@/components/ui/button';
import { PageState } from '@/components/shared/page-state';

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
      {/* Replaces the whole page, so the title is the page's h1. No error details are shown. */}
      <PageState
        variant="error"
        headingLevel={1}
        title="Something went wrong"
        description="An unexpected error occurred. Please try again."
        action={
          <Button onClick={reset} variant="outline" size="sm">
            Try again
          </Button>
        }
      />
    </PageContainer>
  );
}
