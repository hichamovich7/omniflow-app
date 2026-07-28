'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CategoryManagerList,
  CreateCategoryDialog,
  type CategoryOption,
} from '@/components/wordpress/category-select';
import { WpCategoryMapping } from '@/components/wordpress/wp-category-mapping';

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

  return (
    <div className="space-y-4">
      {projects.map((project) => {
        const projectCategories = categories.filter((c) => c.project_id === project.id);
        const site = wordpressSites[project.id];

        return (
          <div key={project.id} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">{project.name}</h2>
              <Button type="button" variant="outline" size="sm" onClick={() => setCreateForProjectId(project.id)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Category
              </Button>
            </div>
            {projectCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No categories yet.</p>
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
            {site && projectCategories.length > 0 && (
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
    </div>
  );
}
