// shadcn/ui — DropdownMenu auf Radix. Tastatursteuerung und Positionierung kommen von
// Radix, nicht von uns.
import * as React from 'react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  align = 'start',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'schwebend z-50 min-w-[10rem] overflow-hidden rounded-md p-1 text-text data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  punkt = 'bg-text-leise',
  rechts,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  readonly rechts?: React.ReactNode;
  /** Tailwind-Hintergrundklasse des Auswahlpunkts, in der Farbe der zugehörigen Linie. */
  readonly punkt?: string;
}) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      checked={checked}
      className={cn(
        'relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm text-text outline-hidden select-none focus:bg-rand focus:text-text data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <span className={cn('block size-2 rounded-full', punkt)} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
      {rechts !== undefined && <span className="ml-auto pl-4 text-xs text-text-leise tabular-nums">{rechts}</span>}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
};
