import Link from 'next/link';
import { SiteFooter } from '@/components/layout/site-footer';

// Public legal pages (TASK-069) — readable signed in or out (lib/legal/routes.ts).
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 md:px-6">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-sm bg-primary"
            >
              <span className="text-xs font-bold text-primary-foreground">O</span>
            </div>
            <span className="text-sm font-semibold tracking-tight">OmniFlow</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 md:px-6 lg:py-14">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
