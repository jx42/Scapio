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
import { ZEITRAEUME, type Zeitraum } from '@/lib/api';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type ZeitraumwahlProps = {
  readonly gewaehlt: Zeitraum;
  readonly onWahl: (zeitraum: Zeitraum) => void;
};

export function Zeitraumwahl({ gewaehlt, onWahl }: ZeitraumwahlProps) {
  return (
    <ToggleGroup
      type="single"
      aria-label={de.verlauf.zeitraum}
      value={gewaehlt}
      onValueChange={(wert) => {
        if (wert !== '') onWahl(wert as Zeitraum);
      }}
    >
      {ZEITRAEUME.map((zeitraum) => (
        <ToggleGroupItem key={zeitraum} value={zeitraum}>
          {de.verlauf.zeitraeume[zeitraum]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
