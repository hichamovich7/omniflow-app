'use client';

import { useMemo } from 'react';
import { EditorialSelectionProvider, useSelection } from './selection-provider';
import { SelectionToolbar } from './selection-toolbar';
import { SelectionActionBar } from './selection-action-bar';
import { PinTable } from '@/components/pinterest/pin-table';
import { ExportCsvButton } from '@/components/pinterest/export-csv-button';
import { GenerateImagesButton } from '@/components/pinterest/generate-images-button';
import { ScheduleDialog } from '@/components/pinterest/schedule-dialog';
import { GenerateWordPressButton } from '@/components/pinterest/generate-wordpress-button';
import type { Pin, ImageStatus } from '@/types/database';
import type { WordPressUsageArticle } from '@/lib/queries/wordpress-usage';

interface EditorialWorkspaceProps {
  pins: Pin[];
  generationId: string;
  imageStatus: ImageStatus;
  pinsWithoutImages: number;
  hasSchedule: boolean;
  keyword: string;
  isCompleted: boolean;
  imageVersionCounts: Record<string, number>;
  pinsWordPressUsage: Record<string, WordPressUsageArticle[]>;
}

export function EditorialWorkspace(props: EditorialWorkspaceProps) {
  return (
    <EditorialSelectionProvider>
      <EditorialWorkspaceContent {...props} />
    </EditorialSelectionProvider>
  );
}

function EditorialWorkspaceContent({
  pins,
  generationId,
  imageStatus,
  pinsWithoutImages,
  hasSchedule,
  keyword,
  isCompleted,
  imageVersionCounts,
  pinsWordPressUsage,
}: EditorialWorkspaceProps) {
  const { selectedIds, selectedCount } = useSelection();
  const allIds = useMemo(() => pins.map(p => p.id), [pins]);

  const allSelectedHaveImages = useMemo(() => {
    if (selectedCount === 0) return false;
    return Array.from(selectedIds).every(id => {
      const pin = pins.find(p => p.id === id);
      return pin?.media_url != null;
    });
  }, [selectedIds, selectedCount, pins]);

  return (
    <>
      {isCompleted && pins.length > 0 && (
        <>
          {/* Default action bar — no selection */}
          {selectedCount === 0 && (
            <div className="flex flex-wrap items-center gap-2 pl-9">
              <GenerateImagesButton
                generationId={generationId}
                imageStatus={imageStatus}
                pinsWithoutImages={pinsWithoutImages}
              />
              <ScheduleDialog
                generationId={generationId}
                pinCount={pins.length}
                hasSchedule={hasSchedule}
              />
              <ExportCsvButton pins={pins} keyword={keyword} />
            </div>
          )}

          {/* Selection action bar — visible when items selected */}
          <SelectionActionBar>
            <GenerateImagesButton
              generationId={generationId}
              imageStatus={imageStatus}
              pinsWithoutImages={pinsWithoutImages}
              selectedPinIds={selectedIds}
              allPinsHaveImages={allSelectedHaveImages}
            />
            <ScheduleDialog
              generationId={generationId}
              pinCount={pins.length}
              hasSchedule={hasSchedule}
              selectedPinIds={selectedIds}
            />
            <ExportCsvButton
              pins={pins}
              keyword={keyword}
              selectedPinIds={selectedIds}
            />
            <GenerateWordPressButton selectedPinIds={selectedIds} />
          </SelectionActionBar>
        </>
      )}

      {pins.length > 0 && (
        <div className="space-y-3">
          <SelectionToolbar allIds={allIds} />
          <PinTable
            pins={pins}
            generationId={generationId}
            imageVersionCounts={imageVersionCounts}
            pinsWordPressUsage={pinsWordPressUsage}
          />
        </div>
      )}
    </>
  );
}
