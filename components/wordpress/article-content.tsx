interface ArticleContentProps {
  html: string;
}

// No Tailwind Typography plugin in this project (RULES.md Rule #30 — visual
// stack is Tailwind/Shadcn/Lucide/Sonner only) — arbitrary child-selector
// utilities style the marked()-generated HTML instead of adding a new dependency.
export function ArticleContent({ html }: ArticleContentProps) {
  return (
    <div
      className="max-w-none [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-foreground/90 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_ol]:space-y-1 [&_li]:text-sm [&_li]:text-foreground/90 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_img]:rounded-xl [&_img]:my-6 [&_img]:w-full [&_strong]:font-semibold"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
