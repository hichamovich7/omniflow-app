import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGenerationWithPins } from '@/lib/queries/generations';
import { PageHeader } from '@/components/layout/page-header';
import { PinTable } from '@/components/pinterest/pin-table';
import { ExportCsvButton } from '@/components/pinterest/export-csv-button';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

export default async function GenerationResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { generation, pins } = await getGenerationWithPins(supabase, id);

  if (!generation) {
    redirect('/pinterest');
  }

  const langLabel = LANGUAGE_LABELS[generation.language as SupportedLanguage] ?? generation.language;

  return (
    <div className="space-y-6">
      <PageHeader title="Generation Results" description={generation.keyword}>
        <div className="flex items-center gap-2">
          <ExportCsvButton pins={pins} keyword={generation.keyword} />
          <Link href="/pinterest" className={buttonVariants({ variant: 'outline' })}>
            New Generation
          </Link>
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{langLabel}</Badge>
        <Badge variant="secondary">{generation.pins_requested} pins requested</Badge>
        <Badge variant="secondary">{pins.length} pins generated</Badge>
        <Badge variant="secondary">{generation.model_used}</Badge>
        <Badge variant={generation.status === 'completed' ? 'default' : 'destructive'}>
          {generation.status}
        </Badge>
        <Badge variant="secondary">
          {new Date(generation.created_at).toLocaleString()}
        </Badge>
      </div>

      {pins.length > 0 ? (
        <PinTable pins={pins} />
      ) : (
        <p className="text-sm text-muted-foreground">No pins generated.</p>
      )}
    </div>
  );
}
