// shadcn/ui — Popover auf Radix. Oeffnet per Klick, Tippen und Enter; Escape schliesst und gibt den Fokus zurueck.
import * as React from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        sideOffset={sideOffset}
        className={cn(
          // eslint-disable-next-line no-restricted-syntax -- outline-none ohne eigenen Ring: der globale aus styles/theme.css gilt unbedingt; den Fokus nimmt der Inhalt nur beim Oeffnen.
          'z-50 max-w-xs schwebend rounded-md px-3 py-2 text-sm leading-snug text-text outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <PopoverPrimitive.Arrow className="fill-rand" />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
