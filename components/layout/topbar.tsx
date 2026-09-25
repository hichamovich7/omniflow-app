import { Badge } from '@/components/ui/badge';
import { MobileNav } from '@/components/layout/mobile-nav';
import { BrandLink } from '@/components/layout/sidebar';
import { UserMenu } from '@/components/layout/user-menu';

interface TopbarProps {
  email: string;
  creditsBalance?: number;
}

// Same surface and border as the sidebar, and the same horizontal gutter as
// PageContainer (docs/DESIGN.md, Top navigation): 56 px below `lg`, 64 px above.
export function Topbar({ email, creditsBalance }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-4 md:px-6 lg:h-16 lg:px-8">
      <div className="flex items-center gap-2 lg:hidden">
        <MobileNav />
        <BrandLink />
      </div>
      <div className="ml-auto flex items-center gap-3">
        {creditsBalance !== undefined && (
          <Badge variant="neutral" className="hidden tabular-nums sm:inline-flex">
            {creditsBalance} credits
          </Badge>
        )}
        <UserMenu email={email} creditsBalance={creditsBalance} />
      </div>
    </header>
  );
}
