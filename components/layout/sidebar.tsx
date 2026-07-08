'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  Sparkles,
  Clock,
  LayoutGrid,
  Coins,
  Settings,
  Search,
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
    label: 'Generators',
    items: [
      { href: '/research', label: 'Research', icon: Search },
      { href: '/pinterest', label: 'Pinterest', icon: Sparkles },
    ],
  },
  {
    label: 'Library',
    items: [
      { href: '/boards', label: 'Boards', icon: LayoutGrid },
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
      <div className="flex h-14 shrink-0 items-center px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
            <span className="text-[10px] font-bold text-primary-foreground">O</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold leading-none tracking-tight">OmniFlow</span>
            <span className="text-[9px] leading-none text-muted-foreground/50 tracking-wide">AI CONTENT OS</span>
          </div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pt-1 pb-4">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && 'mt-5')}>
            <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
              {group.label}
            </p>
            <div className="space-y-px">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + '/');

                if (item.disabled) {
                  return (
                    <span
                      key={item.href}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted-foreground/30 cursor-not-allowed"
                    >
                      <item.icon className="h-[15px] w-[15px]" />
                      {item.label}
                    </span>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors duration-100',
                      isActive
                        ? 'bg-primary/8 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-[15px] w-[15px]" />
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
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/60 bg-sidebar">
      <SidebarContent />
    </aside>
  );
}
