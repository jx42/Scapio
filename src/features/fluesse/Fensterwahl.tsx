/*
 * Die Segmentleiste fuer das Zeitfenster der Fluss-Kachel — dieselbe ToggleGroup wie die
 * Zeitraumwahl in Kachel 1: die Segmente waehlen einen Parameter, sie wechseln keine Panels.
 */

import { de } from '@/i18n/de';
import { FENSTER, type Fenster } from '@/lib/api';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type FensterwahlProps = {
  readonly gewaehlt: Fenster;
  readonly onWahl: (fenster: Fenster) => void;
};

export function Fensterwahl({ gewaehlt, onWahl }: FensterwahlProps) {
  return (
    <ToggleGroup
      type="single"
      aria-label={de.fluesse.fenster}
      value={gewaehlt}
      onValueChange={(wert) => {
        if (wert !== '') onWahl(wert as Fenster);
      }}
    >
      {FENSTER.map((f) => (
        <ToggleGroupItem key={f} value={f}>
          {de.fluesse.fensterKurz[f]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
