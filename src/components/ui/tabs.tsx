// shadcn/ui — Tabs auf Radix. Tastaturbedienung kommt von Radix, nicht von uns.
import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex h-9 w-fit items-center justify-center gap-0.5 rounded-md lichtkante lichtkante-hover bg-bedien p-0.75',
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-3 text-xs font-medium whitespace-nowrap text-text-leise transition-farben hover:text-text data-[state=active]:bg-bedien-aktiv data-[state=active]:text-text disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      // eslint-disable-next-line no-restricted-syntax -- outline-none ohne eigenen Ring: der globale, unlayerte Ring aus styles/theme.css gilt unbedingt.
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
