'use client';

import Link from 'next/link';
import { ChevronDown, Sparkles, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buttonVariants } from '@/components/ui/button';

export function GenerateContentMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ size: 'lg', className: 'px-5' })}>
        <Sparkles className="h-4 w-4" />
        Generate Content
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href="/pinterest" />}>
          <Sparkles className="mr-2 h-4 w-4" />
          Pinterest Pins
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/wordpress" />}>
          <FileText className="mr-2 h-4 w-4" />
          WordPress Article
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
