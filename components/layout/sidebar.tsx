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
      <span aria-disabled="true" className="flex min-h-9 items-center gap-3 rounded-xl px-3 text-[13px] text-muted-foreground/45 cursor-not-allowed">
        <item.icon className="h-[15px] w-[15px]" />
        <span className="flex-1">{item.label}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/35">Soon</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        'relative flex min-h-9 items-center gap-3 rounded-xl px-3 text-[13px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        isActive
          ? 'bg-primary/6 font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
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
      <div className="flex h-18 shrink-0 items-center border-b border-sidebar-border/70 px-5">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br from-primary to-brand-accent shadow-sm">
            <span className="text-xs font-bold text-primary-foreground">O</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-none tracking-tight">OmniFlow</span>
            <span className="mt-1 text-[9px] leading-none tracking-[0.16em] text-muted-foreground/55">AI CONTENT OS</span>
          </div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
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
              <CollapsibleTrigger className="flex min-h-8 w-full items-center justify-between rounded-lg px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55 transition-colors hover:bg-muted/60 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                {group.label}
                <ChevronRight
                  className={cn('h-3 w-3 shrink-0 transition-transform duration-150', isOpen && 'rotate-90')}
                />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <div className="space-y-0.5 pt-1.5">
                  {group.items.map((item) => (
                    <NavLink key={item.href} item={item} pathname={pathname} />
                  ))}
                </div>
              </CollapsiblePanel>
            </Collapsible>
          );
        })}

        <div className="mt-5">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
            {platformsGroup.label}
          </p>
          <div className="space-y-px">
            {platformsGroup.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
            {accountGroup.label}
          </p>
          <div className="space-y-px">
            {accountGroup.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </div>
      </nav>
      {process.env.NEXT_PUBLIC_APP_VERSION && (
        <div className="shrink-0 border-t border-sidebar-border/70 px-5 py-3">
          <p className="font-mono text-xs text-muted-foreground">v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
        </div>
      )}
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border/70 bg-sidebar">
      <SidebarContent />
    </aside>
  );
}
