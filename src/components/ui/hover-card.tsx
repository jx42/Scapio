// shadcn/ui — HoverCard auf Radix. Anders als ein Tooltip bleibt sie offen, solange der Zeiger auf ihr steht, und Escape schliesst sie (WCAG 1.4.13).
import * as React from 'react';
import { HoverCard as HoverCardPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function HoverCard({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />;
}

function HoverCardTrigger({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

function HoverCardContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        sideOffset={sideOffset}
        className={cn('z-50 max-w-xs schwebend rounded-md px-3 py-2 text-sm leading-snug text-text', className)}
        {...props}
      >
        {children}
        <HoverCardPrimitive.Arrow className="fill-rand" />
      </HoverCardPrimitive.Content>
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
