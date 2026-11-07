// shadcn/ui — Input (new-york-v4, Abweichungen in ADR-024). Rand in `bedien-rand` (3:1, ADR-019),
// Fokus ueber den globalen Ring aus styles/theme.css, kein eigener.
import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-bedien-rand bg-bedien px-3 py-1 text-base text-text transition-farben placeholder:text-text-leise disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-verlust md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
