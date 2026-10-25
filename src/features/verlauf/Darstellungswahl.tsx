/*
 * Umschalter Verlauf/Jahrestabelle ganz rechts im Kachelkopf.
 *
 * `ToggleGroup`, nicht ein zweiter `Tabs`-Root: die Kachel steckt schon in den Tabs der
 * Verlaufwahl, und ein verschachtelter Root wuerde deren Reiter an sich binden. [P-06]
 */

import { ChartLine, Table2 } from 'lucide-react';

import { de } from '@/i18n/de';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export const DARSTELLUNGEN = ['verlauf', 'tabelle'] as const;
export type Darstellung = (typeof DARSTELLUNGEN)[number];

export function Darstellungswahl({
  gewaehlt,
  onWahl,
}: {
  readonly gewaehlt: Darstellung;
  readonly onWahl: (darstellung: Darstellung) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label={de.verlauf.darstellung}
      value={gewaehlt}
      onValueChange={(wert) => {
        if (wert !== '') onWahl(wert as Darstellung);
      }}
    >
      <ToggleGroupItem value="verlauf" aria-label={de.verlauf.darstellungVerlauf} title={de.verlauf.darstellungVerlauf}>
        <ChartLine aria-hidden="true" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="tabelle" aria-label={de.verlauf.darstellungTabelle} title={de.verlauf.darstellungTabelle}>
        <Table2 aria-hidden="true" className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
