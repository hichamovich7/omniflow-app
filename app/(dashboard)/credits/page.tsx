import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { PageState } from '@/components/shared/page-state';
import { Coins } from 'lucide-react';

export default function CreditsPage() {
  return (
    <PageContainer>
      <PageHeader title="Credits" description="Monitor your credit usage" />
      <PageState
        variant="unavailable"
        title="Coming soon"
        description="Credit management will be available in a future update."
        icon={Coins}
      />
    </PageContainer>
  );
}
