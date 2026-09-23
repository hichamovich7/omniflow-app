'use client';

import { useMemo, useState } from 'react';
import { BoardPinCard } from '@/components/boards/board-pin-card';
import { cn } from '@/lib/utils';
import type { Pin } from '@/types/database';

interface BoardPinGridProps {
  pins: Pin[];
}

const NO_SECTION = '__no_section__';
const ALL = '__all__';

export function BoardPinGrid({ pins }: BoardPinGridProps) {
  const [activeSection, setActiveSection] = useState<string>(ALL);

  const { sectionNames, hasUnsectioned } = useMemo(() => {
    const distinct = new Set<string>();
    let unsectioned = false;
    for (const pin of pins) {
      const section = pin.board_section?.trim();
      if (section) distinct.add(section);
      else unsectioned = true;
    }
    return {
      sectionNames: Array.from(distinct).sort((a, b) => a.localeCompare(b)),
      hasUnsectioned: unsectioned,
    };
  }, [pins]);

  const visiblePins = useMemo(() => {
    if (activeSection === ALL) return pins;
    if (activeSection === NO_SECTION) return pins.filter((pin) => !pin.board_section?.trim());
    return pins.filter((pin) => pin.board_section?.trim() === activeSection);
  }, [pins, activeSection]);

  const showFilters = sectionNames.length > 0;

  return (
    <div className="space-y-4">
      {showFilters && (
        <div role="group" aria-label="Filter by section" className="flex flex-wrap gap-1.5">
          <SectionChip label="All" active={activeSection === ALL} onClick={() => setActiveSection(ALL)} />
          {sectionNames.map((name) => (
            <SectionChip
              key={name}
              label={name}
              active={activeSection === name}
              onClick={() => setActiveSection(name)}
            />
          ))}
          {hasUnsectioned && (
            <SectionChip
              label="No section"
              active={activeSection === NO_SECTION}
              onClick={() => setActiveSection(NO_SECTION)}
            />
          )}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visiblePins.map((pin) => (
          <BoardPinCard key={pin.id} pin={pin} />
        ))}
      </div>
    </div>
  );
}

function SectionChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border/60 text-muted-foreground hover:border-border hover:bg-muted/40'
      )}
    >
      {label}
    </button>
  );
}
