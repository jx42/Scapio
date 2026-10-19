// shadcn/ui — Button (new-york-v4, Abweichungen in ADR-024). Farben ueber die Tokens.
import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { linkVariants } from '@/lib/linkStil';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // eslint-disable-next-line no-restricted-syntax -- outline-none ohne eigenen Ring: der globale, unlayerte Ring aus styles/theme.css gilt unbedingt.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-farben disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 shrink-0 outline-none cursor-pointer disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default: 'bg-chart-1 text-grund shadow-primaer hover:bg-chart-1/90',
        outline: 'lichtkante lichtkante-hover bg-bedien text-text hover:bg-bedien-aktiv',
        ghost: 'text-text-leise hover:bg-rand/60 hover:text-text',
        // Der eine Linkstil aus lib/linkStil.ts, nicht der der Registry.
        link: linkVariants({ abstand: 'weit' }),
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
