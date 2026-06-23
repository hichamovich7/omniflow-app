import { LogoutButton } from '@/app/(dashboard)/logout-button';

interface TopbarProps {
  email: string;
}

export function Topbar({ email }: TopbarProps) {
  return (
    <header className="flex h-14 items-center justify-end border-b px-6">
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{email}</span>
        <LogoutButton />
      </div>
    </header>
  );
}
