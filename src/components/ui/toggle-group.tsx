// shadcn/ui — ToggleGroup auf Radix. Eine Option aus mehreren waehlen, kein Bereichswechsel. [P-06]
// Als Segmentleiste in derselben Bedienfläche wie <TabsList> (ADR-029), nicht als Einzel-Chips.
import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { toggleVariants } from '@/components/ui/toggle';

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  variant: 'default',
});

function ToggleGroup({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root data-slot="toggle-group" className={cn('inline-flex w-fit flex-wrap items-center gap-0.5 rounded-md lichtkante lichtkante-hover bg-bedien p-0.75', className)} {...props}>
      <ToggleGroupContext.Provider value={{ variant }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(toggleVariants({ variant: context.variant ?? variant }), className)}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
