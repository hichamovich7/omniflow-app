'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Type } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { toastApiError } from '@/components/pinterest/strategy-safeguard-alert';
import { requestPinTextRegeneration } from '@/lib/pinterest/regenerate-text-client';
import type { Pin } from '@/types/database';

interface RegenerateTextButtonProps {
  pin: Pick<Pin, 'id' | 'title'>;
  /** Called with the saved Pin (new title / description / keywords) after a success. */
  onRegenerated?: (pin: Pin) => void;
  /** Icon-only (image overlay of the Pin grid) or labeled. */
  iconOnly?: boolean;
  size?: 'xs' | 'sm';
  disabled?: boolean;
  className?: string;
}

/**
 * "Regenerate text" (TASK-076): new title, description and keywords for one
 * saved Pin — POST /api/pinterest/pins/[id]/regenerate-text. The image,
 * link, board and schedule are kept. A second click while the request runs
 * is ignored (ref, not only the disabled state, which updates a render late).
 */
export function RegenerateTextButton({
  pin,
  onRegenerated,
  iconOnly = false,
  size = 'xs',
  disabled = false,
  className,
}: RegenerateTextButtonProps) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [loading, setLoading] = useState(false);

  async function regenerateText() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const result = await requestPinTextRegeneration(pin.id);
      if (!result.ok) {
        // The Pin is unchanged; the error names what failed and offers "Try again".
        toastApiError(result.error, 'Text regeneration failed — the Pin was not modified', () => void regenerateText());
        return;
      }
      toast.success('Text regenerated — image, link, board and schedule kept');
      onRegenerated?.(result.pin);
      router.refresh();
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? (size === 'sm' ? 'icon-sm' : 'icon-xs') : size}
      className={className}
      loading={loading}
      disabled={disabled || loading}
      onClick={(e) => {
        e.stopPropagation();
        void regenerateText();
      }}
      aria-label={iconOnly ? `Regenerate text for: ${pin.title}` : undefined}
      title={iconOnly ? 'Regenerate text' : undefined}
      data-testid="regenerate-text-button"
    >
      <Type data-icon="inline-start" />
      {!iconOnly && 'Regenerate text'}
    </Button>
  );
}
