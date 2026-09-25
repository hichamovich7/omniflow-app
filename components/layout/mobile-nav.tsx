'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SidebarContent } from '@/components/layout/sidebar';

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon-lg" className="-ml-2 lg:hidden" />}>
        <Menu className="h-5 w-5" />
        <span className="sr-only">Open menu</span>
      </SheetTrigger>
      {/* `data-[side=left]:` is needed to beat the Sheet's base 75 % width. */}
      <SheetContent side="left" className="gap-0 bg-sidebar p-0 data-[side=left]:w-72">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        {/* Close on navigation only: group toggles and disabled items keep the menu open. */}
        <div
          className="flex h-full flex-col"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a[href]')) setOpen(false);
          }}
        >
          <SidebarContent />
        </div>
      </SheetContent>
    </Sheet>
  );
}
