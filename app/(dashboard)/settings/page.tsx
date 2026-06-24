import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Settings" description="Application preferences" />
      <EmptyState
        title="Coming soon"
        description="Settings will be available in a future update."
        icon={Settings}
      />
    </PageContainer>
  );
}
