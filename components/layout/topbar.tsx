import { MobileNav } from '@/components/layout/mobile-nav';
import { UserMenu } from '@/components/layout/user-menu';

interface TopbarProps {
  email: string;
  creditsBalance?: number;
}

export function Topbar({ email, creditsBalance }: TopbarProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border/60 px-4 md:px-6">
      <div className="flex items-center">
        <MobileNav />
      </div>
      <div className="flex items-center gap-3">
        {creditsBalance !== undefined && (
          <span className="hidden sm:inline-flex text-xs text-muted-foreground">
            {creditsBalance} credits
          </span>
        )}
        <UserMenu email={email} />
      </div>
    </header>
  );
}
