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
  SelectValue,
} from '@/components/ui/select';
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

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
        <Input
          placeholder="Search keywords..."
          className="pl-9 h-9 text-sm placeholder:text-muted-foreground/40"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Select
          value={searchParams.get('project') ?? 'all'}
          onValueChange={(v) => v && updateParam('project', v)}
        >
          <SelectTrigger className="h-9 w-36 text-sm">
            <span className="truncate">
              {searchParams.get('project')
                ? projects.find((p) => p.id === searchParams.get('project'))?.name ?? 'Project'
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
          <SelectTrigger className="h-9 w-28 text-sm">
            <SelectValue placeholder="Language" />
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
          <SelectTrigger className="h-9 w-28 text-sm">
            <SelectValue placeholder="Status" />
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
        >
          <SelectTrigger className="h-9 w-32 text-sm">
            <span className="truncate">
              {searchParams.get('category')
                ? categories.find((c) => c.id === searchParams.get('category'))?.name ?? 'Category'
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
      </div>
    </div>
  );
}
