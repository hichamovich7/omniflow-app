'use client';

import { BulkActions } from '@/components/shared/bulk-actions';
import { useSelection } from './selection-provider';

interface SelectionActionBarProps {
  children: React.ReactNode;
}

/** `BulkActions` bound to the editorial selection context. */
export function SelectionActionBar({ children }: SelectionActionBarProps) {
  const { selectedCount, selectNone } = useSelection();

  return (
    <BulkActions selectedCount={selectedCount} onClearSelection={selectNone}>
      {children}
    </BulkActions>
  );
}
