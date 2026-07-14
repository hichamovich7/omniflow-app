import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { BypassEmailForm } from '@/components/admin/bypass-email-form';
import { BypassEmailTable } from '@/components/admin/bypass-email-table';
import type { RateLimitBypassEntry } from '@/types/database';

export default async function AdminBypassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || user.email !== process.env.ADMIN_EMAIL) {
    notFound();
  }

  const supabaseAdmin = createAdminClient();
  const { data } = await supabaseAdmin
    .from('rate_limit_bypass')
    .select('id, email, added_at')
    .order('added_at', { ascending: false });

  const emails = (data ?? []) as RateLimitBypassEntry[];

  return (
    <PageContainer narrow>
      <PageHeader
        title="Rate Limit Bypass"
        description="Emails exempt from AI-cost-incurring rate limits (generate, research, generate-images, analyze)."
      />
      <BypassEmailForm />
      <BypassEmailTable emails={emails} />
    </PageContainer>
  );
}
