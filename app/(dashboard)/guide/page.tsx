import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { guideSections } from '@/lib/guide/content';

export default function GuidePage() {
  return (
    <PageContainer>
      <PageHeader
        title="Guide"
        description="How OmniFlow works, feature by feature"
      />

      <div className="flex flex-wrap gap-2">
        {guideSections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full border border-border/60 bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            {section.title}
          </a>
        ))}
      </div>

      <div className="space-y-4">
        {guideSections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="scroll-mt-20 rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <section.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight">{section.title}</h2>
                <p className="text-sm text-muted-foreground">{section.summary}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 pl-12">
              {section.points.map((point, i) => (
                <li key={i} className="list-disc text-sm leading-relaxed text-foreground/90 marker:text-muted-foreground/40">
                  {point}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
