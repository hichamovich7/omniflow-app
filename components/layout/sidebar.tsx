'use client';

import { useSyncExternalStore } from 'react';
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
  FileText,
  ThumbsUp,
  Briefcase,
  PenSquare,
  BookOpen,
  Tag,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from '@/components/ui/collapsible';

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

interface CollapsibleNavGroup extends NavGroup {
  id: string;
}

// Flat, non-collapsible sections (rendered top to bottom, in order).
const workspaceGroup: NavGroup = {
  label: 'Workspace',
  items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/projects', label: 'Projects', icon: FolderOpen },
  ],
};

// Kept out of the Pinterest collapsible group on purpose: destined to join a
// future "SPY Tools" module rather than live nested under Pinterest.
// See docs/DECISIONS.md.
const researchItem: NavItem = { href: '/research', label: 'Research', icon: Search };

const platformsGroup: NavGroup = {
  label: 'Platforms',
  items: [
    { href: '/facebook', label: 'Facebook', icon: ThumbsUp, disabled: true },
    { href: '/linkedin', label: 'LinkedIn', icon: Briefcase, disabled: true },
    { href: '/medium', label: 'Medium', icon: PenSquare, disabled: true },
  ],
};

const accountGroup: NavGroup = {
  label: 'Account',
  items: [
    { href: '/guide', label: 'Guide', icon: BookOpen },
    { href: '/credits', label: 'Credits', icon: Coins, disabled: true },
    { href: '/settings', label: 'Settings', icon: Settings, disabled: true },
  ],
};

// Collapsible sections — each folds/unfolds independently.
const collapsibleGroups: CollapsibleNavGroup[] = [
  {
    id: 'pinterest',
    label: 'Pinterest',
    items: [
      { href: '/pinterest', label: 'Generate', icon: Sparkles },
      { href: '/boards', label: 'Boards', icon: LayoutGrid },
      { href: '/history', label: 'History', icon: Clock },
    ],
  },
  {
    id: 'wordpress',
    label: 'WordPress',
    items: [
      { href: '/wordpress', label: 'Generate', icon: FileText },
      { href: '/wordpress/history', label: 'History', icon: Clock },
      { href: '/wordpress/categories', label: 'Categories', icon: Tag },
    ],
  },
];

const GROUP_STATE_STORAGE_KEY = 'omniflow:sidebar-groups';

type GroupOpenState = Record<string, boolean>;

const defaultGroupOpenState: GroupOpenState = Object.fromEntries(
  collapsibleGroups.map((group) => [group.id, true])
);

// Sidebar group open/closed state is external (localStorage), synced via
// useSyncExternalStore rather than read-in-effect + setState — this keeps the
// server/first-client-render snapshot (all open, matching pre-existing
// behavior) and client-only reads in sync without an extra render pass.
const groupStateListeners = new Set<() => void>();

// useSyncExternalStore requires getSnapshot to return a stable (===) reference
// when nothing changed, so the parsed object is cached against the raw string.
let cachedRawGroupState: string | null = null;
let cachedGroupStateSnapshot: GroupOpenState = defaultGroupOpenState;

function getGroupStateSnapshot(): GroupOpenState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(GROUP_STATE_STORAGE_KEY);
  } catch {
    raw = null;
  }

  if (raw !== cachedRawGroupState) {
    cachedRawGroupState = raw;
    let parsed: GroupOpenState = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = {};
    }
    cachedGroupStateSnapshot = { ...defaultGroupOpenState, ...parsed };
  }

  return cachedGroupStateSnapshot;
}

function getGroupStateServerSnapshot(): GroupOpenState {
  return defaultGroupOpenState;
}

function writeStoredGroupState(next: GroupOpenState) {
  try {
    localStorage.setItem(GROUP_STATE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore write failures (e.g. private browsing quota)
  }
  groupStateListeners.forEach((listener) => listener());
}

function subscribeToGroupState(onStoreChange: () => void) {
  groupStateListeners.add(onStoreChange);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === GROUP_STATE_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', handleStorage);
  return () => {
    groupStateListeners.delete(onStoreChange);
    window.removeEventListener('storage', handleStorage);
  };
}

function isItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/');
}

function isGroupActive(pathname: string, group: CollapsibleNavGroup) {
  return group.items.some((item) => isItemActive(pathname, item.href));
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = isItemActive(pathname, item.href);

  if (item.disabled) {
    return (
      <span className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted-foreground/30 cursor-not-allowed">
        <item.icon className="h-[15px] w-[15px]" />
        {item.label}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border-l-2 pl-2 pr-2.5 py-1.5 text-[13px] transition-colors duration-100',
        isActive
          ? 'border-primary text-foreground font-medium'
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <item.icon className="h-[15px] w-[15px]" />
      {item.label}
    </Link>
  );
}

export function SidebarContent() {
  const pathname = usePathname();
  const storedOpenGroups = useSyncExternalStore(
    subscribeToGroupState,
    getGroupStateSnapshot,
    getGroupStateServerSnapshot
  );

  // Derived, not stored: whichever group contains the active route renders
  // open regardless of its stored preference, so the user always sees where
  // they are. Manually collapsing a group later is unaffected — only the
  // active group is forced, and nothing is written back for this override.
  const openGroups: GroupOpenState = { ...storedOpenGroups };
  for (const group of collapsibleGroups) {
    if (isGroupActive(pathname, group)) {
      openGroups[group.id] = true;
    }
  }

  function toggleGroup(id: string, open: boolean) {
    writeStoredGroupState({ ...storedOpenGroups, [id]: open });
  }

  return (
    <>
      <div className="flex h-14 shrink-0 items-center px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-linear-to-br from-primary to-brand-accent shadow-sm">
            <span className="text-[10px] font-bold text-primary-foreground">O</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold leading-none tracking-tight">OmniFlow</span>
            <span className="text-[9px] leading-none text-muted-foreground/50 tracking-wide">AI CONTENT OS</span>
          </div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pt-1 pb-4">
        <div>
          <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
            {workspaceGroup.label}
          </p>
          <div className="space-y-px">
            {workspaceGroup.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-px">
          <NavLink item={researchItem} pathname={pathname} />
        </div>

        {collapsibleGroups.map((group) => {
          const isOpen = openGroups[group.id];

          return (
            <Collapsible
              key={group.id}
              open={isOpen}
              onOpenChange={(open) => toggleGroup(group.id, open)}
              className="mt-5"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground">
                {group.label}
                <ChevronRight
                  className={cn('h-3 w-3 shrink-0 transition-transform duration-150', isOpen && 'rotate-90')}
                />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <div className="space-y-px pt-1.5">
                  {group.items.map((item) => (
                    <NavLink key={item.href} item={item} pathname={pathname} />
                  ))}
                </div>
              </CollapsiblePanel>
            </Collapsible>
          );
        })}

        <div className="mt-5">
          <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
            {platformsGroup.label}
          </p>
          <div className="space-y-px">
            {platformsGroup.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
            {accountGroup.label}
          </p>
          <div className="space-y-px">
            {accountGroup.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </div>
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
