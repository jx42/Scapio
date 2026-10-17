/*
 * Kachel 1: welches Fenster der Zeitraumregler zeigt und was er beim Ziehen vorschauen laesst.
 *
 * Die Vorschau steht in einem `Beobachtbar`, nicht im State der Ansicht: ein Ziehschritt
 * rendert so nur die Ueberlage im Chart (`VorschauUeberlage`), nicht Ansicht und Recharts.
 *
 * Sie gilt fuer das Fenster, in dem gezogen wurde: nach dem Loslassen bleibt sie stehen, bis
 * ein anderes kommt, und ist dann verworfen — auch fuer eine spaetere Rueckkehr.
 */

import { useEffect, useState } from 'react';

import { beobachtbar } from '@/lib/beobachtbar';
import type { VorschauAnschluss, VorschauStand } from '@/features/verlauf/VerlaufVorschau';

/** `runde` zaehlt jede von aussen gesetzte Auswahl, siehe `VerlaufAnsichtProps.auswahlRunde`. */
export function useZeitraumVorschau(
  ausschnitt: { readonly von: string; readonly bis: string } | null,
  tage: readonly string[],
  runde: number,
) {
  const fenster = ausschnitt === null ? '' : `${ausschnitt.von}|${ausschnitt.bis}|${tage[0]}|${tage.length}|${runde}`;
  const [quelle] = useState(() => beobachtbar<VorschauStand>(null));

  // Bis hierher blendet `VorschauUeberlage` die alte schon aus (`fuer`); verworfen wird sie,
  // damit sie bei der Rueckkehr in dasselbe Fenster nicht wieder auftaucht.
  useEffect(() => {
    if (quelle.lies()?.fuer !== fenster) quelle.setze(null);
  }, [quelle, fenster]);

  const anschluss: VorschauAnschluss = { quelle, fenster };
  return {
    fenster,
    anschluss,
    melde: (neu: { readonly von: number; readonly bis: number } | null) => {
      quelle.setze(neu === null ? null : { fuer: fenster, vorschau: { tage, ...neu } });
    },
  };
}
