/*
 * Kachel 6, Container.
 *
 * Eigene Abfrage, eigener Zustand: die Sparplaene kommen aus einer anderen Quelle als
 * die Fluesse und fallen unabhaengig von ihnen aus. Die Ansicht zeigt nur Beobachtetes —
 * diese Anwendung handelt nicht.
 */

import { useQuery } from '@tanstack/react-query';

import { de } from '@/i18n/de';
import { api, kachelZustand, schluessel } from '@/lib/api';
import { Kachel } from '@/components/Kachel';
import { Driftfussnote } from '@/components/Driftbanner';
import { SparplanListe } from '@/features/sparplaene/SparplanListe';

export function SparplaeneKachel() {
  const abfrage = useQuery({ queryKey: schluessel.sparplaene, queryFn: api.sparplaene });
  const daten = abfrage.data;

  const zustand = kachelZustand(abfrage, (d) => d.plaene.length === 0, de.sparplaene.leer);

  return (
    <Kachel
      titel={de.sparplaene.titel}
      id="sparplaene"
      zustand={zustand}
      ladehoehe="mittel"
      className="flex-1 pb-2"
      fussnoten={<Driftfussnote drift={daten?.drift} />}
    >
      {daten === undefined ? null : (
        <SparplanListe plaene={daten.plaene} summeCent={daten.summeCent} />
      )}
    </Kachel>
  );
}
