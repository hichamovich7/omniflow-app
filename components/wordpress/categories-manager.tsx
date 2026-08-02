'use client';

import { useState } from 'react';
import { Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CategoryManagerList,
  CreateCategoryDialog,
  type CategoryOption,
} from '@/components/wordpress/category-select';
import { WpCategoryMapping } from '@/components/wordpress/wp-category-mapping';
import { WpImportCategoriesDialog } from '@/components/wordpress/wp-import-categories-dialog';

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

export function CategoriesManager({ projects, categories: initialCategories, wordpressSites = {} }: CategoriesManagerProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [createForProjectId, setCreateForProjectId] = useState<string | null>(null);
  const [importForProjectId, setImportForProjectId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {projects.map((project) => {
        const projectCategories = categories.filter((c) => c.project_id === project.id);
        const site = wordpressSites[project.id];

        return (
          <div key={project.id} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">{project.name}</h2>
              <div className="flex items-center gap-2">
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
        );
      })}

      <CreateCategoryDialog
        open={createForProjectId !== null}
        onOpenChange={(open) => !open && setCreateForProjectId(null)}
        projectId={createForProjectId ?? ''}
        onCreated={(category) => {
          setCategories((all) => [...all, category]);
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
          setImportForProjectId(null);
        }}
      />
    </div>
  );
}
