import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { PageState } from '@/components/shared/page-state';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Settings" description="Application preferences" />
      <PageState
        variant="unavailable"
        title="Coming soon"
        description="Settings will be available in a future update."
        icon={Settings}
      />
    </PageContainer>
  );
}
