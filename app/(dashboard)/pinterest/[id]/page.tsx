import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGenerationWithPins } from '@/lib/queries/generations';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { ActionBar } from '@/components/ui/action-bar';
import { PinTable } from '@/components/pinterest/pin-table';
import { ExportCsvButton } from '@/components/pinterest/export-csv-button';
import { GenerateImagesButton } from '@/components/pinterest/generate-images-button';
import { ScheduleDialog } from '@/components/pinterest/schedule-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import type { ImageStatus } from '@/types/database';
import { ArrowLeft, Calendar, Globe, Cpu, Hash } from 'lucide-react';

function statusBadgeVariant(status: string) {
  switch (status) {
    case 'completed': return 'success' as const;
    case 'processing': return 'warning' as const;
    case 'failed': return 'destructive' as const;
    default: return 'secondary' as const;
  }
}

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
  const imageStatus = (generation.image_status ?? 'none') as ImageStatus;
  const pinsWithoutImages = pins.filter((p) => !p.media_url).length;
  const hasSchedule = pins.some((p) => p.publish_date);
  const isPartial = pins.length < generation.pins_requested;

  return (
    <PageContainer>
      <PageHeader title="Generation Results" description={generation.keyword}>
        <ActionBar>
          {generation.status === 'completed' && pins.length > 0 && (
            <GenerateImagesButton
              generationId={generation.id}
              imageStatus={imageStatus}
              pinsWithoutImages={pinsWithoutImages}
            />
          )}
          {generation.status === 'completed' && pins.length > 0 && (
            <ScheduleDialog
              generationId={generation.id}
              pinCount={pins.length}
              hasSchedule={hasSchedule}
            />
          )}
          <ExportCsvButton pins={pins} keyword={generation.keyword} />
          <Link href="/pinterest" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            New
          </Link>
        </ActionBar>
      </PageHeader>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Globe className="h-3.5 w-3.5" />
            {langLabel}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Hash className="h-3.5 w-3.5" />
            {isPartial
              ? `${pins.length} of ${generation.pins_requested} pins`
              : `${pins.length} pins`}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" />
            {generation.model_used}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(generation.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <Badge variant={statusBadgeVariant(generation.status)}>
            {generation.status}
          </Badge>
          {isPartial && (
            <Badge variant="warning">partial</Badge>
          )}
        </CardContent>
      </Card>

      {pins.length > 0 ? (
        <PinTable pins={pins} />
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No pins generated.</p>
        </div>
      )}
    </PageContainer>
  );
}
