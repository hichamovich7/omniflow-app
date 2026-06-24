'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  Image,
  Clock,
  Coins,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/projects', label: 'Projects', icon: FolderOpen },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/pinterest', label: 'Pinterest', icon: Image },
      { href: '/history', label: 'History', icon: Clock },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/credits', label: 'Credits', icon: Coins, disabled: true },
      { href: '/settings', label: 'Settings', icon: Settings, disabled: true },
    ],
  },
];

export function SidebarContent() {
  const pathname = usePathname();

  return (
    <>
      <div className="flex h-12 shrink-0 items-center border-b px-5">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight">
          OmniFlow
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && 'mt-6')}>
            <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + '/');

                if (item.disabled) {
                  return (
                    <span
                      key={item.href}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/40 cursor-not-allowed"
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </span>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.75 rounded-full bg-primary" />
                    )}
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-60 flex-col border-r bg-sidebar">
      <SidebarContent />
    </aside>
  );
}
