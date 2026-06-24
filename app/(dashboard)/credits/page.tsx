import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { Coins } from 'lucide-react';

export default function CreditsPage() {
  return (
    <PageContainer>
      <PageHeader title="Credits" description="Monitor your credit usage" />
      <EmptyState
        title="Coming soon"
        description="Credit management will be available in a future update."
        icon={Coins}
      />
    </PageContainer>
  );
}
