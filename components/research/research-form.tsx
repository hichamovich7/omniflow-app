'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Search, Trash2, Sparkle, CircleAlert } from 'lucide-react';
import { createResearchSchema } from '@/lib/validations/research';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { DeleteResearchDialog } from './delete-research-dialog';
import { timeAgo } from '@/lib/utils/format-date';

type SourceType = 'keyword' | 'website' | 'blog' | 'pinterest';

const SOURCE_TYPE_CONFIG: Record<SourceType, { label: string; placeholder: string }> = {
  keyword: { label: 'Keyword', placeholder: 'e.g. small bathroom storage ideas' },
  website: { label: 'Website URL', placeholder: 'https://example.com' },
  blog: { label: 'Blog URL', placeholder: 'https://example.com/blog/post-title' },
  pinterest: { label: 'Pinterest URL', placeholder: 'https://pinterest.com/pin/...' },
};

interface ProjectOption {
  id: string;
  name: string;
  is_default: boolean;
}

interface ResearchResultRow {
  id: string;
  project_id: string;
  source_type: SourceType;
  input: string;
  title: string | null;
  status: 'completed' | 'failed';
  created_at: string;
}

interface ResearchFormProps {
  projects: ProjectOption[];
  researchResults: ResearchResultRow[];
}

interface Preview {
  researchId: string;
  title: string | null;
  content: string;
  sourceUrl: string | null;
}

interface Analysis {
  analysisId: string;
  theme: string;
  keywords: string;
  audience: string;
  tone: string;
  category: string;
  summary: string;
}

export function ResearchForm({ projects, researchResults }: ResearchFormProps) {
  const router = useRouter();
  const defaultProject = projects.find((p) => p.is_default) ?? projects[0];

  const [projectId, setProjectId] = useState(defaultProject?.id ?? '');
  const [sourceType, setSourceType] = useState<SourceType>('keyword');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ResearchResultRow | null>(null);

  const history = researchResults.filter((r) => r.project_id === projectId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPreview(null);
    setAnalysis(null);

    const parsed = createResearchSchema.safeParse({ projectId, sourceType, input });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);

    const res = await fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      const message = json.error?.message ?? 'Research failed';
      setError(message);
      toast.error(message);
      setLoading(false);
      return;
    }

    toast.success('Research complete');
    setPreview(json.data);
    setLoading(false);
    router.refresh();
  }

  async function handleAnalyze() {
    if (!preview) return;
    setAnalyzing(true);
    setError(null);

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ researchResultId: preview.researchId }),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      const message = json.error?.message ?? 'Analysis failed';
      setError(message);
      toast.error(message);
      setAnalyzing(false);
      return;
    }

    setAnalysis(json.data);
    setAnalyzing(false);
  }

  function handleContinue() {
    const params = new URLSearchParams({ projectId });
    const keyword = sourceType === 'keyword' ? input : (preview?.title ?? input).slice(0, 200);
    params.set('keyword', keyword);

    if (preview?.sourceUrl) {
      if (sourceType === 'pinterest') {
        params.set('pinterestUrl', preview.sourceUrl);
      } else if (sourceType === 'website' || sourceType === 'blog') {
        params.set('websiteUrl', preview.sourceUrl);
      }
    }

    if (analysis) {
      params.set('analysisId', analysis.analysisId);
    }

    router.push(`/pinterest?${params.toString()}`);
  }

  const config = SOURCE_TYPE_CONFIG[sourceType];

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8"
      >
        <div className="grid grid-cols-[1fr_auto] gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="project" className="text-xs font-medium text-muted-foreground">
              Project
            </Label>
            <Select value={projectId} onValueChange={(v) => v && setProjectId(v)}>
              <SelectTrigger id="project">
                <span className="truncate text-sm">
                  {projects.find((p) => p.id === projectId)?.name ?? 'Select'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sourceType" className="text-xs font-medium text-muted-foreground">
              Source
            </Label>
            <Select value={sourceType} onValueChange={(v) => v && setSourceType(v as SourceType)}>
              <SelectTrigger id="sourceType" className="w-44">
                <span className="truncate text-sm">{config.label}</span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_TYPE_CONFIG) as SourceType[]).map((type) => (
                  <SelectItem key={type} value={type}>
                    {SOURCE_TYPE_CONFIG[type].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="input" className="text-xs font-medium text-muted-foreground">
            {config.label}
          </Label>
          <Input
            id="input"
            placeholder={config.placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            required
            disabled={loading}
            className="h-12 text-sm placeholder:text-muted-foreground/40"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/5 px-3 py-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <Button type="submit" disabled={loading || !projectId} className="h-12 w-full text-sm font-medium">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Researching...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Research
            </>
          )}
        </Button>
      </form>

      {preview && (
        <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8">
          <div>
            {preview.title && <p className="text-sm font-medium">{preview.title}</p>}
            {preview.sourceUrl && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{preview.sourceUrl}</p>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
            {preview.content}
          </div>

          {analysis ? (
            <div className="space-y-3 rounded-lg border border-brand-accent/20 bg-brand-accent/5 p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-brand-accent">
                <Sparkle className="h-3.5 w-3.5" />
                Content Analysis
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Theme</dt>
                  <dd className="font-medium">{analysis.theme}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="font-medium">{analysis.category}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Audience</dt>
                  <dd className="font-medium">{analysis.audience}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tone</dt>
                  <dd className="font-medium">{analysis.tone}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Keywords</dt>
                  <dd className="font-medium">{analysis.keywords}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Summary</dt>
                  <dd className="font-medium">{analysis.summary}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <Button
              onClick={handleAnalyze}
              disabled={analyzing}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkle className="mr-2 h-4 w-4" />
                  Analyze
                </>
              )}
            </Button>
          )}

          <Button onClick={handleContinue} className="w-full sm:w-auto">
            Continue to Generate
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Research History</h2>
        {history.length === 0 ? (
          <EmptyState
            title="No research yet"
            description="Results for this project will appear here."
            icon={Search}
          />
        ) : (
          <div className="space-y-2">
            {history.map((r) => (
              <div
                key={r.id}
                className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 transition-colors hover:border-border"
              >
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="outline">{SOURCE_TYPE_CONFIG[r.source_type].label}</Badge>
                  {r.status === 'failed' && (
                    <Badge variant="destructive" className="gap-1">
                      <CircleAlert className="h-3 w-3" />
                      Failed
                    </Badge>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title ?? r.input}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
                    <span className="truncate">{r.input}</span>
                    <span>·</span>
                    <span>{timeAgo(r.created_at)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Delete research result"
                  onClick={() => setDeleteTarget(r)}
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteResearchDialog
          researchId={deleteTarget.id}
          label={deleteTarget.title ?? deleteTarget.input}
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
