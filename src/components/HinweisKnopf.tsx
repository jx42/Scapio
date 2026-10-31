/*
 * Hinweise einer Kachel: Warnsymbol und Anzahl rechts in der Titelzeile (`werkzeuge`),
 * die Hinweise selbst im Dialog. Verlauf und Top 25 teilen sich das, damit beide
 * Kacheln gleich aussehen.
 */

import { useState, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

import { de } from '@/i18n/de';
import { zahl } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type HinweisKnopfProps = {
  readonly anzahl: number;
  readonly titel: string;
  readonly beschreibung: string;
  readonly children: ReactNode;
};

export function HinweisKnopf({ anzahl, titel, beschreibung, children }: HinweisKnopfProps) {
  const [offen, setOffen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="link"
        onClick={() => setOffen(true)}
        className="h-auto min-h-6 gap-1 p-0 font-normal"
      >
        <TriangleAlert aria-hidden="true" className="size-3.5 text-warnung" />
        {de.hinweisKnopf.anzahl(anzahl, zahl(anzahl))}
      </Button>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{titel}</DialogTitle>
            <DialogDescription className="sr-only">{beschreibung}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    </>
  );
}
