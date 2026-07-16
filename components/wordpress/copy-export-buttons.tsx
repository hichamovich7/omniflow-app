'use client';

import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface CopyExportButtonsProps {
  markdown: string;
  html: string;
  filename: string;
}

export function CopyExportButtons({ markdown, html, filename }: CopyExportButtonsProps) {
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => copy(markdown, 'Markdown')}>
        <Copy className="mr-1.5 h-3.5 w-3.5" />
        Copy Markdown
      </Button>
      <Button variant="outline" size="sm" onClick={() => copy(html, 'HTML')}>
        <Copy className="mr-1.5 h-3.5 w-3.5" />
        Copy HTML
      </Button>
      <Button variant="outline" size="sm" onClick={downloadMarkdown}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Download .md
      </Button>
    </div>
  );
}
