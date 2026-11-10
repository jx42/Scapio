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
 *
 * Das letzte Segment blendet den Zeitraumregler ein; er nimmt sonst unter jedem Chart Platz,
 * obwohl die festen Zeitraeume fast immer reichen.
 */

import { de } from '@/i18n/de';
import type { KursZeitraum } from '@/lib/api';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const EIGEN = 'eigen';

/** `Z`: die Verlauf-Kachel kennt `Zeitraum`, der Positionsverlauf zusaetzlich drei Monate. */
export type ZeitraumwahlProps<Z extends KursZeitraum> = {
  /** `null`: der Zeitraumregler ist offen. */
  readonly gewaehlt: Z | null;
  /** Vom Server: nur Zeitraeume, die ein anderes Fenster als `max` zeigen, und `max`. */
  readonly angeboten: readonly Z[];
  /** Ohne Regler (weniger als zwei Tage) kein Segment dafuer. */
  readonly eigenMoeglich: boolean;
  readonly onWahl: (zeitraum: Z) => void;
  readonly onEigen: () => void;
};

export function Zeitraumwahl<Z extends KursZeitraum>({
  gewaehlt,
  angeboten,
  eigenMoeglich,
  onWahl,
  onEigen,
}: ZeitraumwahlProps<Z>) {
  // Ein gemerkter Zeitraum ohne Knopf zeigt dasselbe Fenster wie `max`.
  const aktiv = gewaehlt === null ? EIGEN : angeboten.includes(gewaehlt) ? gewaehlt : 'max';
  return (
    <ToggleGroup
      type="single"
      aria-label={de.verlauf.zeitraum}
      className="max-sm:w-full max-sm:flex-nowrap"
      value={aktiv}
      onValueChange={(wert) => {
        if (wert === EIGEN) onEigen();
        else if (wert !== '') onWahl(wert as Z);
      }}
    >
      {angeboten.map((zeitraum) => (
        <ToggleGroupItem className="max-sm:min-w-0 max-sm:flex-1 max-sm:px-1" key={zeitraum} value={zeitraum}>
          {de.verlauf.zeitraeume[zeitraum]}
        </ToggleGroupItem>
      ))}
      {eigenMoeglich || gewaehlt === null ? (
        <ToggleGroupItem className="max-sm:min-w-0 max-sm:flex-1 max-sm:px-1" value={EIGEN}>
          {de.verlauf.zeitraumEigen}
        </ToggleGroupItem>
      ) : null}
    </ToggleGroup>
  );
}
