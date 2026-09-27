'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Download, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CategoryManagerList,
  CreateCategoryDialog,
  type CategoryOption,
} from '@/components/wordpress/category-select';
import { WpCategoryMapping } from '@/components/wordpress/wp-category-mapping';
import { WpImportCategoriesDialog } from '@/components/wordpress/wp-import-categories-dialog';
import {
  categoryCountLabel,
  projectIdFromHash,
  readCategoryCardOpen,
  siteDomain,
  writeCategoryCardOpen,
  type CategoryCardStorage,
} from '@/lib/wordpress/category-cards-view';

interface ProjectOption {
  id: string;
  name: string;
}

interface WordPressSiteRef {
  id: string;
  site_url: string;
}

interface CategoriesManagerProps {
  projects: ProjectOption[];
  categories: CategoryOption[];
  wordpressSites?: Record<string, WordPressSiteRef>;
}

// Same approach as the Quality report card (quality-report-disclosure.tsx):
// localStorage is an external store read through useSyncExternalStore, so the
// server / first client render is compact and no effect + setState is needed.
const listeners = new Set<() => void>();
// In-memory copy so the toggle keeps working for this page view when
// localStorage is unavailable (private mode, blocked site data).
const memoryOpen = new Map<string, boolean>();

function getStorage(): CategoryCardStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function setCardsOpen(projectIds: string[], open: boolean) {
  writeCategoryCardOpen(projectIds, open, memoryOpen, getStorage);
  listeners.forEach((listener) => listener());
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

/** Open/closed state of every card. The snapshot is a primitive ('1' / '0' per project), so it is stable. */
function useCardsOpen(projectIds: string[]): Record<string, boolean> {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => projectIds.map((id) => (readCategoryCardOpen(id, memoryOpen, getStorage) ? '1' : '0')).join(''),
    () => '0'.repeat(projectIds.length)
  );
  return Object.fromEntries(projectIds.map((id, i) => [id, snapshot[i] === '1']));
}

export function CategoriesManager({ projects, categories: initialCategories, wordpressSites = {} }: CategoriesManagerProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [createForProjectId, setCreateForProjectId] = useState<string | null>(null);
  const [importForProjectId, setImportForProjectId] = useState<string | null>(null);
  const projectIds = projects.map((p) => p.id);
  const openById = useCardsOpen(projectIds);
  const allOpen = projectIds.every((id) => openById[id]);
  const allClosed = projectIds.every((id) => !openById[id]);

  // A `#project-<id>` link (Project detail page → Categories) opens that card.
  useEffect(() => {
    const targetId = projectIdFromHash(window.location.hash);
    if (!targetId || !projects.some((p) => p.id === targetId)) return;
    setCardsOpen([targetId], true);
    document.getElementById(`project-${targetId}`)?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={allOpen} onClick={() => setCardsOpen(projectIds, true)}>
          <ChevronsUpDown aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
          Expand all
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={allClosed} onClick={() => setCardsOpen(projectIds, false)}>
          <ChevronsDownUp aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
          Collapse all
        </Button>
      </div>

      {projects.map((project) => {
        const projectCategories = categories.filter((c) => c.project_id === project.id);
        const site = wordpressSites[project.id];
        const open = openById[project.id] ?? false;
        const panelId = `project-${project.id}-details`;
        const toggle = () => setCardsOpen([project.id], !open);

        return (
          <div
            key={project.id}
            id={`project-${project.id}`}
            data-testid="category-card"
            data-open={open ? 'true' : 'false'}
            className="scroll-mt-6 rounded-xl border border-border/60 bg-card px-3 py-2.5 sm:px-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              {/* Mouse shortcut only: keyboard and screen-reader users use the chevron button. */}
              <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-2" onClick={toggle}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-label={`${open ? 'Hide' : 'Show'} details for ${project.name}`}
                  title={open ? 'Hide details' : 'Show details'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle();
                  }}
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
                  />
                </Button>
                <div className="min-w-0">
                  <h2 className="text-sm font-medium wrap-break-word">{project.name}</h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {site ? (
                      <>
                        <span className="max-w-full truncate">{siteDomain(site.site_url)}</span>
                        <Badge variant="success">Connected</Badge>
                      </>
                    ) : (
                      <Badge variant="neutral">No WordPress site</Badge>
                    )}
                    <Badge variant="outline">{categoryCountLabel(projectCategories.length)}</Badge>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {site && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setImportForProjectId(project.id)}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Import from WordPress
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => setCreateForProjectId(project.id)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Category
                </Button>
              </div>
            </div>
            {/* Kept mounted while collapsed so the details (list, mapping) behave exactly as before. */}
            <div id={panelId} hidden={!open} className="mt-3 space-y-3">
              {projectCategories.length === 0 ? (
                !site && <p className="text-sm text-muted-foreground">No categories yet.</p>
              ) : (
                <div className="space-y-1.5">
                  <CategoryManagerList
                    categories={projectCategories}
                    onCategoriesChange={(next) => {
                      setCategories((all) => [...all.filter((c) => c.project_id !== project.id), ...next]);
                    }}
                  />
                </div>
              )}
              {site && (
                <WpCategoryMapping
                  siteId={site.id}
                  categories={projectCategories}
                  onCategoriesChange={(next) => {
                    setCategories((all) => [...all.filter((c) => c.project_id !== project.id), ...next]);
                  }}
                />
              )}
            </div>
          </div>
        );
      })}

      <CreateCategoryDialog
        open={createForProjectId !== null}
        onOpenChange={(open) => !open && setCreateForProjectId(null)}
        projectId={createForProjectId ?? ''}
        onCreated={(category) => {
          setCategories((all) => [...all, category]);
          // Show the new category: its card may be collapsed.
          if (createForProjectId) setCardsOpen([createForProjectId], true);
          setCreateForProjectId(null);
        }}
      />

      <WpImportCategoriesDialog
        open={importForProjectId !== null}
        onOpenChange={(open) => !open && setImportForProjectId(null)}
        siteId={(importForProjectId && wordpressSites[importForProjectId]?.id) || ''}
        onImported={(imported) => {
          setCategories((all) => {
            const importedIds = new Set(imported.map((c) => c.id));
            return [...all.filter((c) => !importedIds.has(c.id)), ...imported];
          });
          if (importForProjectId) setCardsOpen([importForProjectId], true);
          setImportForProjectId(null);
        }}
      />
    </div>
  );
}
