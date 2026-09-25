'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterBar, FilterBarSearch, filterSelectClass } from '@/components/shared/filter-bar';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '@/types/pinterest';

interface ProjectOption {
  id: string;
  name: string;
}

interface BoardOption {
  id: string;
  name: string;
  project_id: string;
}

interface HistoryFiltersProps {
  projects: ProjectOption[];
  boards: BoardOption[];
}

const STATUS_OPTIONS = ['completed', 'processing', 'failed', 'pending'] as const;

export function HistoryFilters({ projects, boards }: HistoryFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '');
  const selectedProject = searchParams.get('project');
  const boardOptions = selectedProject
    ? boards.filter((b) => b.project_id === selectedProject)
    : boards;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const current = searchParams.get('q') ?? '';
      if (keyword !== current) {
        updateParam('q', keyword);
      }
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.replace(`/history?${params.toString()}`);
  }

  function handleProjectChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set('project', value);
    } else {
      params.delete('project');
    }
    params.delete('board');
    params.delete('page');
    router.replace(`/history?${params.toString()}`);
  }

  return (
    <FilterBar>
      <FilterBarSearch
        label="Search generations"
        placeholder="Search keywords..."
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />

      <Select
        value={searchParams.get('project') ?? 'all'}
        onValueChange={(v) => v && handleProjectChange(v)}
      >
        <SelectTrigger className={filterSelectClass} aria-label="Project">
          <span className="truncate">
            {searchParams.get('project')
              ? (projects.find((p) => p.id === searchParams.get('project'))?.name ?? 'Project')
              : 'Project'}
          </span>
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

      <Select
        value={searchParams.get('board') ?? 'all'}
        onValueChange={(v) => v && updateParam('board', v)}
      >
        <SelectTrigger className={filterSelectClass} aria-label="Board">
          <span className="truncate">
            {searchParams.get('board')
              ? (boardOptions.find((b) => b.id === searchParams.get('board'))?.name ?? 'Board')
              : 'Board'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Boards</SelectItem>
          {boardOptions.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('language') ?? 'all'}
        onValueChange={(v) => v && updateParam('language', v)}
      >
        <SelectTrigger className={filterSelectClass} aria-label="Language">
          <span className="truncate">
            {LANGUAGE_LABELS[searchParams.get('language') as keyof typeof LANGUAGE_LABELS] ??
              'Language'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <SelectItem key={lang} value={lang}>
              {LANGUAGE_LABELS[lang]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('status') ?? 'all'}
        onValueChange={(v) => v && updateParam('status', v)}
      >
        <SelectTrigger className={filterSelectClass} aria-label="Status">
          <span className="truncate capitalize">{searchParams.get('status') ?? 'Status'}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterBar>
  );
}
