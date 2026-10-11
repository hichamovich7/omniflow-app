import Link from 'next/link';
import { FileText, Globe, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PinterestSourceKind = 'keyword' | 'omniflow-article' | 'existing-post';

/** Where each source starts. The OmniFlow article flow starts from an article page (Social Content Studio). */
export const PINTEREST_SOURCE_HREFS: Record<PinterestSourceKind, string> = {
  keyword: '/pinterest',
  'omniflow-article': '/wordpress/history',
  'existing-post': '/pinterest/from-wordpress',
};

export const NO_WORDPRESS_SITE_MESSAGE =
  'No WordPress site connected yet. Connect one in a project to turn your existing articles into Pins.';

const OPTIONS: Array<{
  kind: PinterestSourceKind;
  label: string;
  description: string;
  icon: typeof Globe;
}> = [
  {
    kind: 'keyword',
    label: 'From keyword',
    description: 'Enter a keyword and generate Pins.',
    icon: KeyRound,
  },
  {
    kind: 'omniflow-article',
    label: 'From OmniFlow WordPress article',
    description: 'Open an article written by OmniFlow, then "Generate Pinterest content".',
    icon: FileText,
  },
  {
    kind: 'existing-post',
    label: 'From existing WordPress article',
    description: 'Pick a post already on your WordPress site.',
    icon: Globe,
  },
];

export interface PinterestSourceOption {
  kind: PinterestSourceKind;
  label: string;
  /** null when the source cannot be used yet. */
  href: string | null;
  description: string;
  current: boolean;
  disabled: boolean;
}

/** The chooser's state, pure (tested offline). */
export function pinterestSourceOptions(active: PinterestSourceKind, hasWordPressSite: boolean): PinterestSourceOption[] {
  return OPTIONS.map((option) => {
    const disabled = option.kind === 'existing-post' && !hasWordPressSite;
    return {
      kind: option.kind,
      label: option.label,
      href: disabled ? null : PINTEREST_SOURCE_HREFS[option.kind],
      description: disabled ? NO_WORDPRESS_SITE_MESSAGE : option.description,
      current: option.kind === active,
      disabled,
    };
  });
}

/**
 * Pin source choice shown at the top of the Pinterest generator pages. Pure
 * navigation: links only — no request, no AI call. "From existing WordPress
 * article" is disabled (no link) until a WordPress site is connected.
 */
export function PinterestSourceChooser({
  active,
  hasWordPressSite,
}: {
  active: PinterestSourceKind;
  hasWordPressSite: boolean;
}) {
  const states = pinterestSourceOptions(active, hasWordPressSite);
  return (
    <nav aria-label="Pin source" className="mb-6" data-testid="pinterest-source-chooser">
      <ul className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((option, index) => {
          const { current: isActive, disabled } = states[index];
          const body = (
            <>
              <span className="flex items-center gap-2 text-sm font-medium">
                <option.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {option.label}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {disabled ? NO_WORDPRESS_SITE_MESSAGE : option.description}
              </span>
            </>
          );
          const base = 'block h-full rounded-xl border p-3 transition-colors';
          return (
            <li key={option.kind}>
              {disabled ? (
                <div
                  className={cn(
                    base,
                    'border-dashed border-border bg-muted/40 text-muted-foreground'
                  )}
                  aria-disabled="true"
                  data-source={option.kind}
                  data-disabled="true"
                >
                  {body}
                  <Link
                    href="/projects"
                    className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                  >
                    Connect a WordPress site
                  </Link>
                </div>
              ) : (
                <Link
                  href={PINTEREST_SOURCE_HREFS[option.kind]}
                  aria-current={isActive ? 'page' : undefined}
                  data-source={option.kind}
                  className={cn(
                    base,
                    'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    isActive
                      ? 'border-primary bg-primary/5'
                      : 'border-border/60 bg-card hover:border-primary/30'
                  )}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
