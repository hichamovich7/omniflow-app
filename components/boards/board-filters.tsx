'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
        <Input
          placeholder="Search boards..."
          className="pl-9 h-9 text-sm placeholder:text-muted-foreground/40"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <Select
        value={searchParams.get('project') ?? 'all'}
        onValueChange={(v) => v && updateParam('project', v)}
      >
        <SelectTrigger className="h-9 w-36 text-sm">
          <span className="truncate">
            {searchParams.get('project')
              ? projects.find((p) => p.id === searchParams.get('project'))?.name ?? 'Project'
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
    </div>
  );
}
