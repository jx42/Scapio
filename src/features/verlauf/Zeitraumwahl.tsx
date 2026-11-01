/*
 * Die Chip-Reihe fuer den Zeitraum.
 *
 * `ToggleGroup type="single"`: die Chips wechseln keine Panels, sie waehlen einen
 * Parameter. Radix rendert dafuer `role="radiogroup"`/`role="radio"` statt Tabs —
 * genau der Fall "eine Option aus mehreren waehlen". [P-06]
 *
 * Optik als Segmentleiste wie die Reiter, verbundene Segmente statt einzelner Chips — dafuer
 * aber weiterhin `<ToggleGroup>`, nicht `<ButtonGroup>`: Letztere ist laut shadcn fuer
 * Aktionsknoepfe gedacht, hier waehlt man einen Zustand, das bleibt Radix' Radiogroup.
 */

import { de } from '@/i18n/de';
import type { Zeitraum } from '@/lib/api';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type ZeitraumwahlProps = {
  /** `null`: frei gewaehlt ueber den Zeitraumregler, kein Segment aktiv. */
  readonly gewaehlt: Zeitraum | null;
  /** Vom Server: nur Zeitraeume, die ein anderes Fenster als `max` zeigen, und `max`. */
  readonly angeboten: readonly Zeitraum[];
  readonly onWahl: (zeitraum: Zeitraum) => void;
};

export function Zeitraumwahl({ gewaehlt, angeboten, onWahl }: ZeitraumwahlProps) {
  // Ein gemerkter Zeitraum ohne Knopf zeigt dasselbe Fenster wie `max`.
  const aktiv = gewaehlt === null ? '' : angeboten.includes(gewaehlt) ? gewaehlt : 'max';
  return (
    <ToggleGroup
      type="single"
      aria-label={de.verlauf.zeitraum}
      className="max-sm:w-full max-sm:flex-nowrap"
      value={aktiv}
      onValueChange={(wert) => {
        if (wert !== '') onWahl(wert as Zeitraum);
      }}
    >
      {angeboten.map((zeitraum) => (
        <ToggleGroupItem className="max-sm:min-w-0 max-sm:flex-1 max-sm:px-1" key={zeitraum} value={zeitraum}>
          {de.verlauf.zeitraeume[zeitraum]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
