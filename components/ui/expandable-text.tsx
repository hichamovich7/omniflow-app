'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ExpandableTextProps {
  text: string;
  maxChars?: number;
  className?: string;
}

export function ExpandableText({ text, maxChars = 200, className }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);

  if (text.length <= maxChars) {
    return <p className={cn('whitespace-pre-line', className)}>{text}</p>;
  }

  return (
    <p className={cn('whitespace-pre-line', className)}>
      {expanded ? text : `${text.slice(0, maxChars).trimEnd()}…`}{' '}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="font-medium text-primary hover:underline"
      >
        {expanded ? 'Read less' : 'Read more'}
      </button>
    </p>
  );
}
