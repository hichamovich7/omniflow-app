'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterBar, FilterBarSearch, filterSelectClass } from '@/components/shared/filter-bar';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

interface ProjectOption {
  id: string;
  name: string;
}

interface BoardFiltersProps {
  projects: ProjectOption[];
}

export function BoardFilters({ projects }: BoardFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [name, setName] = useState(searchParams.get('search') ?? '');

  useEffect(() => {
    const timeout = setTimeout(() => {
      const current = searchParams.get('search') ?? '';
      if (name !== current) {
        updateParam('search', name);
      }
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.replace(`/boards?${params.toString()}`);
  }

  return (
    <FilterBar>
      <FilterBarSearch
        label="Search boards"
        placeholder="Search boards..."
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <Select
        value={searchParams.get('project') ?? 'all'}
        onValueChange={(v) => v && updateParam('project', v)}
      >
        <SelectTrigger className={filterSelectClass} aria-label="Project">
          <span className="truncate">
            {searchParams.get('project')
              ? (projects.find((p) => p.id === searchParams.get('project'))?.name ?? 'Project')
              : 'All Projects'}
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
    </FilterBar>
  );
}
