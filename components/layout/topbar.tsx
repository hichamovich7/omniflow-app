import { Coins } from 'lucide-react';
import { MobileNav } from '@/components/layout/mobile-nav';
import { UserMenu } from '@/components/layout/user-menu';
import { Badge } from '@/components/ui/badge';

interface TopbarProps {
  email: string;
  creditsBalance?: number;
}

export function Topbar({ email, creditsBalance }: TopbarProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b px-4 md:px-6">
      <div className="flex items-center gap-2">
        <MobileNav />
      </div>
      <div className="flex items-center gap-3">
        {creditsBalance !== undefined && (
          <Badge variant="outline" className="gap-1 font-normal">
            <Coins className="h-3 w-3" />
            {creditsBalance}
          </Badge>
        )}
        <UserMenu email={email} />
      </div>
    </header>
  );
}
