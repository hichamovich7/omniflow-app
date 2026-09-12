import { MobileNav } from '@/components/layout/mobile-nav';
import { UserMenu } from '@/components/layout/user-menu';

interface TopbarProps {
  email: string;
  creditsBalance?: number;
}

export function Topbar({ email, creditsBalance }: TopbarProps) {
  return (
    <header className="flex h-18 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-sm md:px-8">
      <div className="flex items-center">
        <MobileNav />
      </div>
      <div className="flex items-center gap-3">
        {creditsBalance !== undefined && (
          <span className="hidden rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
            {creditsBalance} credits
          </span>
        )}
        <UserMenu email={email} creditsBalance={creditsBalance} />
      </div>
    </header>
  );
}
