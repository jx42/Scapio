// shadcn/ui — Badge (new-york-v4, Abweichungen in ADR-024). Farben ueber die fachlichen Tokens.
import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-flaeche text-text',
        gewinnLeise: 'bg-gewinn/15 text-gewinn',
        verlustLeise: 'bg-verlust/15 text-verlust',
        link: 'bg-rand-licht text-text underline-offset-4 [a&]:hover:bg-rand-licht/80 [a&]:hover:underline',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
