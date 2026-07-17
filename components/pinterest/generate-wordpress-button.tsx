'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface GenerateWordPressButtonProps {
  selectedPinIds: Set<string>;
}

const MIN_RECOMMENDED_PINS = 3;

export function GenerateWordPressButton({ selectedPinIds }: GenerateWordPressButtonProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function navigateToWordPress() {
    const pinIds = Array.from(selectedPinIds).join(',');
    router.push(`/wordpress?pinIds=${encodeURIComponent(pinIds)}`);
  }

  function handleClick() {
    if (selectedPinIds.size < MIN_RECOMMENDED_PINS) {
      setConfirmOpen(true);
      return;
    }
    navigateToWordPress();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleClick}>
        <FileText className="mr-1.5 h-3.5 w-3.5" />
        Generate WordPress Article ({selectedPinIds.size})
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Not enough pins selected</DialogTitle>
            <DialogDescription>
              You&apos;ve selected {selectedPinIds.size} pin{selectedPinIds.size === 1 ? '' : 's'} — fewer than the
              {' '}{MIN_RECOMMENDED_PINS} recommended for a well-rounded article. The result may lack enough source
              material. Continue anyway?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={navigateToWordPress}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
