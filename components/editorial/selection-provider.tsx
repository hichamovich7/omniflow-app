'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface SelectionContextValue {
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  selectNone: () => void;
  invertSelection: (allIds: string[]) => void;
  isSelected: (id: string) => boolean;
  selectedCount: number;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within EditorialSelectionProvider');
  return ctx;
}

export function EditorialSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const invertSelection = useCallback((allIds: string[]) => {
    setSelectedIds(prev => new Set(allIds.filter(id => !prev.has(id))));
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const value = useMemo(() => ({
    selectedIds,
    toggle,
    selectAll,
    selectNone,
    invertSelection,
    isSelected,
    selectedCount: selectedIds.size,
  }), [selectedIds, toggle, selectAll, selectNone, invertSelection, isSelected]);

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}
