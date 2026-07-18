import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGenerationWithPins } from '@/lib/queries/generations';
import { getPinsWordPressUsage } from '@/lib/queries/wordpress-usage';
import { PageContainer } from '@/components/ui/page-container';
import { EditorialWorkspace } from '@/components/editorial/editorial-workspace';
import { RegenerateGenerationButton } from '@/components/pinterest/regenerate-generation-button';
import { Badge } from '@/components/ui/badge';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import type { ImageStatus } from '@/types/database';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { timeAgo } from '@/lib/utils/format-date';
import { statusToBadgeVariant } from '@/lib/utils/status';

export default async function GenerationResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { generation, pins, imageVersionCounts } = await getGenerationWithPins(supabase, id);

  if (!generation) {
    redirect('/pinterest');
  }

  const langLabel = LANGUAGE_LABELS[generation.language as SupportedLanguage] ?? generation.language;
  const imageStatus = (generation.image_status ?? 'none') as ImageStatus;
  const pinsWithoutImages = pins.filter((p) => !p.media_url).length;
  const hasSchedule = pins.some((p) => p.publish_date);
  const isPartial = pins.length < generation.pins_requested;
  const wordpressUsageMap = await getPinsWordPressUsage(supabase, pins.map((p) => p.id));
  const pinsWordPressUsage = Object.fromEntries(wordpressUsageMap);

  return (
    <PageContainer>
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link
            href="/pinterest"
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors"
            aria-label="Back to generator"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div className="space-y-0.5">
            <h1 className="text-xl font-semibold tracking-tight">{generation.keyword}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
              <span>{langLabel}</span>
              <span className="text-border">·</span>
              <span>
                {isPartial
                  ? `${pins.length} of ${generation.pins_requested} pins`
                  : `${pins.length} pins`}
              </span>
              <span className="text-border">·</span>
              <span>{generation.model_used}</span>
              <span className="text-border">·</span>
              <span>{timeAgo(generation.created_at)}</span>
              <Badge variant={statusToBadgeVariant(generation.status)} className="ml-0.5">
                {generation.status}
              </Badge>
              {isPartial && <Badge variant="warning">partial</Badge>}
            </div>
          </div>
        </div>
      </div>

      {/* Editorial workspace */}
      {pins.length > 0 ? (
        <EditorialWorkspace
          pins={pins}
          generationId={generation.id}
          imageStatus={imageStatus}
          pinsWithoutImages={pinsWithoutImages}
          hasSchedule={hasSchedule}
          keyword={generation.keyword}
          isCompleted={generation.status === 'completed'}
          imageVersionCounts={imageVersionCounts}
          pinsWordPressUsage={pinsWordPressUsage}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 py-20 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No pins generated</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {generation.error_message ?? "This generation didn't produce any results."}
          </p>
          <div className="mt-4 flex justify-center">
            <RegenerateGenerationButton
              projectId={generation.project_id}
              keyword={generation.keyword}
              language={generation.language}
              pinsRequested={generation.pins_requested}
            />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
