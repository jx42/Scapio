// shadcn/ui — Card. Vereinfacht auf Header/Title/Content, Farben ueber die Tokens.
import * as React from 'react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

function Card({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <Comp
      data-slot="card"
      className={cn('glas glas-hover rounded-lg', className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-header" className={cn('flex flex-col gap-1 px-6 pt-4 pb-0', className)} {...props} />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('font-heading text-sm font-medium text-text-leise', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-description" className={cn('text-xs text-text-leise', className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6 py-4', className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardHeader, CardTitle };
