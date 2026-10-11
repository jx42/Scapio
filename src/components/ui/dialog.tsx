// shadcn/ui — Dialog auf Radix. Fokus-Falle und Escape kommen von Radix, nicht von uns.
import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { XIcon } from 'lucide-react';

import { de } from '@/i18n/de';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-grund/40 backdrop-blur-sm duration-100 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  // Radix gibt den Fokus beim Schliessen an den `DialogTrigger` zurueck. Unsere Dialoge sind
  // gesteuert und haben keinen, dann landete er auf <body> (WCAG 2.4.3). Deshalb der Ausloeser
  // von Hand: beim Oeffnen hat er den Fokus noch.
  const ausloeser = React.useRef<HTMLElement | null>(null);
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // eslint-disable-next-line no-restricted-syntax -- outline-none ohne eigenen Ring: der globale, unlayerte Ring aus styles/theme.css gilt unbedingt.
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 schwebend rounded-lg p-5 text-sm text-text duration-100 outline-none sm:max-w-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        onOpenAutoFocus={(event) => {
          ausloeser.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented || ausloeser.current?.isConnected !== true) return;
          event.preventDefault();
          ausloeser.current.focus();
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="ghost" size="icon" className="absolute top-3.5 right-3 size-7">
              <XIcon />
              <span className="sr-only">{de.dialog.schliessen}</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('font-heading text-xl font-semibold text-text', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-text-leise', className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle };
