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

interface CategoryOption {
  id: string;
  name: string;
}

interface WordPressHistoryFiltersProps {
  projects: ProjectOption[];
  categories: CategoryOption[];
}

const STATUS_OPTIONS = ['completed', 'processing', 'failed', 'pending'] as const;

export function WordPressHistoryFilters({ projects, categories }: WordPressHistoryFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '');

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
    router.replace(`/wordpress/history?${params.toString()}`);
  }

  // A category id only means something within its own Project — changing
  // (or clearing) the Project filter always drops any selected Category
  // rather than risk keeping one that belongs to a different project.
  function handleProjectChange(value: string) {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    if (value !== 'all') {
      params.set('project', value);
    } else {
      params.delete('project');
    }
    params.delete('category');
    params.delete('page');
    router.replace(`/wordpress/history?${params.toString()}`);
  }

  const selectedProjectId = searchParams.get('project');

  return (
    <FilterBar>
      <FilterBarSearch
        label="Search articles"
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

      <Select
        value={searchParams.get('category') ?? 'all'}
        onValueChange={(v) => v && updateParam('category', v)}
        disabled={!selectedProjectId}
      >
        <SelectTrigger
          className={filterSelectClass}
          aria-label="Category"
          disabled={!selectedProjectId}
          title={!selectedProjectId ? 'Select a Project first' : undefined}
        >
          <span className="truncate">
            {!selectedProjectId
              ? 'Select a Project'
              : searchParams.get('category')
                ? (categories.find((c) => c.id === searchParams.get('category'))?.name ??
                  'Category')
                : 'Category'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterBar>
  );
}
