// shadcn/ui — Alert (new-york-v4, Abweichungen in ADR-024). Farben ueber die fachlichen
// Tokens aus theme.css, nicht ueber die shadcn-Standardnamen.
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-2.5 py-2 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-2 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: 'border-rand bg-flaeche text-text',
        gewinn: 'border-gewinn/50 bg-gewinn/10 text-gewinn *:data-[slot=alert-description]:text-text',
        warnung: 'border-warnung/50 bg-warnung/10 text-warnung *:data-[slot=alert-description]:text-text',
        verlust: 'border-verlust/60 bg-verlust/10 text-verlust *:data-[slot=alert-description]:text-text',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'col-start-2 font-medium tracking-tight [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-text',
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 text-sm text-balance text-text-leise md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-text [&_p:not(:last-child)]:mb-4',
        className,
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="alert-action" className={cn('col-start-3 row-span-2 row-start-1 ml-4 self-start', className)} {...props} />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
