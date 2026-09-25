'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WordPressUsageArticle } from '@/lib/queries/wordpress-usage';

interface WordPressUsageBadgeProps {
  usedPinCount: number;
  totalPinCount: number;
  articles: WordPressUsageArticle[];
}

export function WordPressUsageBadge({ usedPinCount, totalPinCount, articles }: WordPressUsageBadgeProps) {
  if (usedPinCount === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className="relative inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] hover:bg-muted/70 hover:text-foreground max-md:after:-inset-y-3"
        aria-label={`${usedPinCount} of ${totalPinCount} pins used in WordPress articles`}
      >
        <FileText className="h-3 w-3" />
        {usedPinCount}/{totalPinCount} pins → WordPress
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Used in</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {articles.map((article) => (
          <DropdownMenuItem
            key={article.generationId}
            onClick={(e) => e.stopPropagation()}
            render={<Link href={`/wordpress/${article.generationId}`} />}
          >
            {article.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
