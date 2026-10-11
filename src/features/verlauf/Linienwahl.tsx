/*
 * Mehrfachauswahl fuer die beiden optionalen Linien der Vermoegen-Ansicht: die
 * eingezahltes Kapital und die Markierungen für Käufe, Verkäufe und Erträge. Anders als Benchmarkwahl schliesst
 * sich hier eine Auswahl nicht aus, deshalb Checkbox-Eintraege statt Radio-Items.
 * Im Kachelkopf, links neben Benchmarkwahl und in deren Groesse; die Punkte der
 * eingeblendeten Linien stehen auch im geschlossenen Zustand im Knopf, als Legende.
 */

import { ChevronDownIcon } from 'lucide-react';

import { de } from '@/i18n/de';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { triggerVariants } from '@/components/ui/trigger';

export type LinienwahlProps = {
  readonly zeigeEinzahlung: boolean;
  readonly zeigeZufluesse: boolean;
  readonly onZeigeEinzahlung: (wert: boolean) => void;
  readonly onZeigeZufluesse: (wert: boolean) => void;
};

export function Linienwahl({
  zeigeEinzahlung,
  zeigeZufluesse,
  onZeigeEinzahlung,
  onZeigeZufluesse,
}: LinienwahlProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={de.verlauf.linien}
        className={triggerVariants({ aktiv: zeigeEinzahlung || zeigeZufluesse })}
      >
        {zeigeEinzahlung || zeigeZufluesse ? (
          <span aria-hidden="true" className="flex -space-x-1">
            {zeigeEinzahlung ? <span className="size-2 rounded-full bg-text ring-2 ring-grund" /> : null}
            {zeigeZufluesse ? <span className="size-2 rounded-full bg-chart-3 ring-2 ring-grund" /> : null}
          </span>
        ) : null}
        {de.verlauf.linien}
        <ChevronDownIcon aria-hidden="true" className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuCheckboxItem
          checked={zeigeEinzahlung}
          punkt="bg-text"
          onCheckedChange={onZeigeEinzahlung}
          onSelect={(ereignis) => ereignis.preventDefault()}
        >
          {de.verlauf.einzahlung}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={zeigeZufluesse}
          punkt="bg-chart-3"
          onCheckedChange={onZeigeZufluesse}
          onSelect={(ereignis) => ereignis.preventDefault()}
        >
          {de.verlauf.marken}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
