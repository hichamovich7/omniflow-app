import Link from 'next/link';
import { LEGAL_LAST_UPDATED, type LegalPage } from '@/lib/legal/content';

const INLINE_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Renders `[label](/path)` / `[label](https://…)` inside legal text as links. */
function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_LINK)) {
    const [whole, label, href] = match;
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const className = 'font-medium text-primary underline-offset-4 hover:underline';
    parts.push(
      href.startsWith('/') ? (
        <Link key={index} href={href} className={className}>
          {label}
        </Link>
      ) : (
        <a key={index} href={href} className={className} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      )
    );
    last = index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function LegalDocument({ page }: { page: LegalPage }) {
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">{page.title}</h1>
        <p className="text-sm text-muted-foreground">Last updated: {LEGAL_LAST_UPDATED}</p>
        <p className="text-base leading-7 text-foreground/90">
          <RichText text={page.intro} />
        </p>
      </header>

      {page.sections.map((section) => (
        <section key={section.heading} className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">{section.heading}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-7 text-foreground/90">
              <RichText text={paragraph} />
            </p>
          ))}
          {section.items && (
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-foreground/90 marker:text-muted-foreground">
              {section.items.map((item) => (
                <li key={item}>
                  <RichText text={item} />
                </li>
              ))}
            </ul>
          )}
          {section.after?.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-7 text-foreground/90">
              <RichText text={paragraph} />
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
