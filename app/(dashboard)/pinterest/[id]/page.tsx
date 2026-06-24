import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PinTable } from '@/components/pinterest/pin-table';
import { ExportCsvButton } from '@/components/pinterest/export-csv-button';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import type { Pin } from '@/types/database';

export default async function GenerationResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: generation } = await supabase
    .from('generations')
    .select('*')
    .eq('id', id)
    .single();

  if (!generation) {
    redirect('/pinterest');
  }

  const { data: pins } = await supabase
    .from('pins')
    .select('*')
    .eq('generation_id', id)
    .order('created_at', { ascending: true });

  const pinList = (pins ?? []) as Pin[];
  const langLabel = LANGUAGE_LABELS[generation.language as SupportedLanguage] ?? generation.language;

  return (
    <div className="space-y-6">
      <PageHeader title="Generation Results" description={generation.keyword}>
        <div className="flex items-center gap-2">
          <ExportCsvButton pins={pinList} keyword={generation.keyword} />
          <Link href="/pinterest" className={buttonVariants({ variant: 'outline' })}>
            New Generation
          </Link>
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{langLabel}</Badge>
        <Badge variant="secondary">{generation.pins_requested} pins requested</Badge>
        <Badge variant="secondary">{pinList.length} pins generated</Badge>
        <Badge variant="secondary">{generation.model_used}</Badge>
        <Badge variant={generation.status === 'completed' ? 'default' : 'destructive'}>
          {generation.status}
        </Badge>
        <Badge variant="secondary">
          {new Date(generation.created_at).toLocaleString()}
        </Badge>
      </div>

      {pinList.length > 0 ? (
        <PinTable pins={pinList} />
      ) : (
        <p className="text-sm text-muted-foreground">No pins generated.</p>
      )}
    </div>
  );
}
