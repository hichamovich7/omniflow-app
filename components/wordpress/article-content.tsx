interface ArticleContentProps {
  html: string;
}

// The page header owns the only `h1`, so the preview shifts every heading one
// level down (h1 → h2 … h5 → h6; h6 stays). Display only: the stored article
// and the HTML/Markdown exports keep their own heading structure.
function demoteHeadings(html: string): string {
  return html.replace(/<(\/?)h([1-6])(?=[\s>])/gi, (_, slash: string, level: string) => {
    return `<${slash}h${Math.min(Number(level) + 1, 6)}`;
  });
}

// No Tailwind Typography plugin in this project (RULES.md Rule #30 — visual
// stack is Tailwind/Shadcn/Lucide/Sonner only) — arbitrary child-selector
// utilities style the marked()-generated HTML instead of adding a new dependency.
// Heading selectors are one level down to match `demoteHeadings`, so the
// article title (source h1) still looks like before. Wide tables scroll inside
// themselves instead of widening the page.
export function ArticleContent({ html }: ArticleContentProps) {
  return (
    <div
      data-slot="article-content"
      className="max-w-none [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:mb-4 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-8 [&_h3]:mb-3 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-6 [&_h4]:mb-2 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-foreground/90 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_ol]:space-y-1 [&_li]:text-sm [&_li]:text-foreground/90 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_img]:rounded-xl [&_img]:my-6 [&_img]:w-full [&_strong]:font-semibold [&_table]:mb-4 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: demoteHeadings(html) }}
    />
  );
}
