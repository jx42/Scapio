/*
 * Kachel 4 als Reihe: Unternehmen links, Länder & Sektoren rechts. Länder & Sektoren gibt die Höhe
 * vor, Unternehmen füllt sie mit so vielen Zeilen, wie passen — dasselbe Muster wie Kennzahlen neben
 * Aufteilung. Eigene Komponente, weil sie nur mit `top25` eingehängt wird und der Ref sonst beim
 * ersten Messen noch fehlte.
 */

import { useRef } from 'react';

import { useElementHoehe } from '@/hooks/useElementHoehe';
import { useMedienAbfrage } from '@/hooks/useMedienAbfrage';
import { LaenderSektorenKachel } from '@/features/top25/LaenderSektorenKachel';
import { Top25Kachel } from '@/features/top25/Top25Kachel';

export function LookThroughKacheln() {
  const laenderRef = useRef<HTMLDivElement>(null);
  const laenderHoehe = useElementHoehe(laenderRef);
  // Entspricht `xl:` im Grid: erst ab dort stehen die beiden nebeneinander.
  const nebeneinander = useMedienAbfrage('(width >= 80rem)');

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Top25Kachel hoehe={nebeneinander ? laenderHoehe : null} />
      <div ref={laenderRef}>
        <LaenderSektorenKachel />
      </div>
    </div>
  );
}
