'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FilterBar, filterSelectClass } from '@/components/shared/filter-bar';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  SOCIAL_CONTENT_PERIOD_LABELS,
  SOCIAL_CONTENT_PERIODS,
  SOCIAL_CONTENT_SOURCE_LABELS,
  SOCIAL_CONTENT_SOURCE_TYPES,
  SOCIAL_CONTENT_STATUSES,
  type SocialContentPeriod,
  type SocialContentSourceType,
} from '@/lib/social/social-content';

interface MediumHistoryFiltersProps {
  projects: Array<{ id: string; name: string }>;
  /** History page the filters apply to — /medium, or /facebook (TASK-068). */
  basePath?: '/medium' | '/facebook';
}

const STATUS_LABELS: Record<string, string> = { completed: 'Completed', failed: 'Failed' };

/** Project / source / date / status filters of /medium — query string only, the server does the filtering. */
export function MediumHistoryFilters({ projects, basePath = '/medium' }: MediumHistoryFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(key: string, value: string | null) {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') params.delete(key);
    else params.set(key, value);
    params.delete('page');
    const query = params.toString();
    router.replace(query ? `${basePath}?${query}` : basePath);
  }

  const project = searchParams.get('project');
  const source = searchParams.get('source') as SocialContentSourceType | null;
  const period = searchParams.get('period') as SocialContentPeriod | null;
  const status = searchParams.get('status');

  return (
    <FilterBar>
      <Select value={project ?? 'all'} onValueChange={(v) => update('project', v)}>
        <SelectTrigger className={filterSelectClass} aria-label="Project">
          <span className="truncate">{project ? (projects.find((p) => p.id === project)?.name ?? 'Project') : 'Project'}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Projects</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={source ?? 'all'} onValueChange={(v) => update('source', v)}>
        <SelectTrigger className={filterSelectClass} aria-label="Source">
          <span className="truncate">{(source && SOCIAL_CONTENT_SOURCE_LABELS[source]) ?? 'Source'}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          {SOCIAL_CONTENT_SOURCE_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {SOCIAL_CONTENT_SOURCE_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={period ?? 'all'} onValueChange={(v) => update('period', v)}>
        <SelectTrigger className={filterSelectClass} aria-label="Date">
          <span className="truncate">{(period && SOCIAL_CONTENT_PERIOD_LABELS[period]) ?? 'Date'}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any date</SelectItem>
          {SOCIAL_CONTENT_PERIODS.map((value) => (
            <SelectItem key={value} value={value}>
              {SOCIAL_CONTENT_PERIOD_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status ?? 'all'} onValueChange={(v) => update('status', v)}>
        <SelectTrigger className={filterSelectClass} aria-label="Status">
          <span className="truncate">{(status && STATUS_LABELS[status]) ?? 'Status'}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {SOCIAL_CONTENT_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterBar>
  );
}
