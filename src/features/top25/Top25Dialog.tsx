/*
 * Kachel 4, Detail: der Knopf im Untertitel oeffnet diesen Dialog — mit den fehlenden
 * Fonds oder, wenn gar keiner bekannt ist, mit der Anleitung zu `funds.json`. Derselbe
 * Weg wie `KennzahlDetailsDialog` in Kachel 3 — Fokusfalle und Escape kommen von Radix
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
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titel}</DialogTitle>
          <DialogDescription className="sr-only">{beschreibung}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
