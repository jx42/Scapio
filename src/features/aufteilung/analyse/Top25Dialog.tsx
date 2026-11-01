/*
 * Aufteilung, Detail: ist gar kein Fonds bekannt, oeffnet der Knopf im Kopf der Kachel diesen
 * Dialog mit der Anleitung zu `funds.json`. Die fehlenden Fonds zeigt `HinweisKnopf`. Derselbe
 * Weg wie `KennzahlDetailsDialog` — Fokusfalle und Escape kommen von Radix
 * (`src/components/ui/dialog.tsx`).
 */

import type { ReactNode } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type Top25DialogProps = {
  readonly offen: boolean;
  readonly onOpenChange: (offen: boolean) => void;
  readonly titel: string;
  readonly beschreibung: string;
  readonly children: ReactNode;
};

export function Top25Dialog({ offen, onOpenChange, titel, beschreibung, children }: Top25DialogProps) {
  return (
    <Dialog open={offen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titel}</DialogTitle>
          <DialogDescription className="sr-only">{beschreibung}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
