/*
 * Info-Knopf mit Erklaerung als Popover, nicht als Tooltip: ein Tooltip oeffnet nur bei
 * Hover und Fokus und ist auf Touchgeraeten unerreichbar (WCAG 1.4.13). [P-06]
 * Das negative Margin haelt den Knopf aus der Zeilenhoehe heraus und zieht das Icon,
 * das im 32-px-Knopf 8 px Luft hat, naeher an den Text davor.
 */

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

import { de } from '@/i18n/de';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type InfoKnopfProps = {
  /** Wofuer die Erklaerung gilt, fuer das aria-label. */
  readonly bezeichnung: string;
  readonly inhaltKlasse?: string;
  readonly children: ReactNode;
};

export function InfoKnopf({ bezeichnung, inhaltKlasse, children }: InfoKnopfProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`${de.erklaerungOeffnen}: ${bezeichnung}`}
          className="-my-2 -ml-1.5 size-8 rounded-full"
        >
          <Info aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={bezeichnung} className={inhaltKlasse}>{children}</PopoverContent>
    </Popover>
  );
}
