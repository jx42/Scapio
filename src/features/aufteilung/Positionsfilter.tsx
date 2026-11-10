/*
 * Mehrfachauswahl der Linien im Positionsverlauf. Nur Positionen, nie ein Link im Eintrag: ein
 * `menuitemcheckbox` darf nichts Bedienbares enthalten (WCAG 4.1.2).
 */

import { useEffect, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { de } from '@/i18n/de';
import { zahl } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Farbtupfer } from '@/components/Ring';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { triggerVariants } from '@/components/ui/trigger';

/** Ab so vielen eingeblendeten Linien steht die Anzahl im Knopf statt der Tupfer. */
const ANZAHL_AB = 6;

export type FilterEintrag = {
  readonly isin: string;
  readonly name: string;
  readonly farbe: string;
  readonly sichtbar: boolean;
};

export type PositionsfilterProps = {
  /** In Ringreihenfolge. */
  readonly eintraege: readonly FilterEintrag[];
  readonly onUmschalten: (isin: string) => void;
};

export function Positionsfilter({ eintraege, onUmschalten }: PositionsfilterProps) {
  // Beim Öffnen festgehalten: wanderte der Fokus mit der Auswahl, spränge er beim Abwählen.
  const [startIsin, setStartIsin] = useState<string | undefined>(undefined);
  const sichtbar = eintraege.filter((e) => e.sichtbar);

  // Das Menü bietet kein `onOpenAutoFocus`. Über State läuft der Effekt einen Commit später: erst
  // dann hat sich der Fokus-Trap des Dialogs pausiert, sonst holte er den Fokus sofort zurück.
  const [startEintrag, setStartEintrag] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    startEintrag?.focus();
  }, [startEintrag]);

  return (
    <DropdownMenu
      onOpenChange={(offen) => {
        if (offen) setStartIsin((sichtbar[0] ?? eintraege[0])?.isin);
      }}
    >
      <DropdownMenuTrigger
        className={cn(triggerVariants({ aktiv: sichtbar.length > 0 }), 'max-sm:w-full')}
      >
        <span className="flex items-center gap-2">
          {sichtbar.length >= ANZAHL_AB ? (
            <span
              aria-hidden="true"
              className="inline-grid h-5 min-w-5 place-items-center rounded-sm bg-bedien-aktiv px-1 tabular-nums"
            >
              {zahl(sichtbar.length)}
            </span>
          ) : sichtbar.length > 0 ? (
            <span aria-hidden="true" className="flex -space-x-1">
              {sichtbar.map((e) => (
                <Farbtupfer key={e.isin} farbe={e.farbe} className="size-2 rounded-full ring-2 ring-grund" />
              ))}
            </span>
          ) : null}
          {de.positionsverlauf.filter}
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] min-w-60 overflow-y-auto">
        {eintraege.map((e) => (
          <DropdownMenuCheckboxItem
            key={e.isin}
            ref={e.isin === startIsin ? setStartEintrag : undefined}
            checked={e.sichtbar}
            // Der Punkt der Vorlage nimmt nur eine Klasse, der Ring hat Farbwerte.
            punkt="hidden"
            onCheckedChange={() => onUmschalten(e.isin)}
            onSelect={(ereignis) => ereignis.preventDefault()}
          >
            {e.sichtbar ? (
              <span className="absolute left-2 flex size-3.5 items-center justify-center">
                <Farbtupfer farbe={e.farbe} className="size-2" />
              </span>
            ) : null}
            <span className="min-w-0 break-words">{e.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
