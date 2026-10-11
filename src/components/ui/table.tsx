// shadcn/ui — Table. Eine Tabelle bleibt eine Tabelle: <caption>, <th scope>, kein div-Raster.
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * `bereich` benennt den Scroll-Container und macht ihn fokussierbar: laeuft die Tabelle
 * ueber, ist sie sonst mit der Tastatur nicht zu verschieben (WCAG 2.1.1).
 *
 * `innen` traegt Klassen einer Huelle zwischen Container und Tabelle, etwa eine Maske:
 * auf dem Container oder darueber schnitte sie dessen Fokusring ab (WCAG 2.4.7).
 */
function Table({
  className,
  bereich,
  innen,
  ...props
}: React.ComponentProps<'table'> & { bereich?: string; innen?: string }) {
  const tabelle = <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />;
  return (
    <div
      data-slot="table-container"
      className="relative -mx-2 overflow-x-auto px-2"
      {...(bereich === undefined ? {} : { role: 'region', 'aria-label': bereich, tabIndex: 0 })}
    >
      {innen === undefined ? tabelle : <div className={cn('-mx-2 px-2', innen)}>{tabelle}</div>}
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b [&_tr]:border-rand', className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t border-rand font-medium', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b border-rand/60 in-data-[slot=table-body]:tabellenzeile-hover', className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-8 px-2 first:pl-0 last:pr-0 text-left align-middle text-xs font-medium text-text-leise whitespace-nowrap',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td data-slot="table-cell" className={cn('px-2 py-1.5 align-middle first:pl-0 last:pr-0', className)} {...props} />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption data-slot="table-caption" className={cn('mt-2 text-xs text-text-leise', className)} {...props} />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
