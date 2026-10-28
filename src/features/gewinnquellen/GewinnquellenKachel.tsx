/*
 * Woher kommt der Gewinn, Container.
 */

import { useQuery } from '@tanstack/react-query';

import { de } from '@/i18n/de';
import { api, kachelZustand, schluessel } from '@/lib/api';
import { Kachel } from '@/components/Kachel';
import { Driftfussnote } from '@/components/Driftbanner';
import { GewinnquellenAnsicht } from '@/features/gewinnquellen/GewinnquellenAnsicht';

export function GewinnquellenKachel() {
  const abfrage = useQuery({
    queryKey: schluessel.gewinnquellen,
    queryFn: api.gewinnquellen,
  });
  const daten = abfrage.data;
  const zustand = kachelZustand(abfrage, (d) => d.mitteCent === 0, de.gewinnquellen.leer);

  return (
    <Kachel
      titel={de.gewinnquellen.titel}
      id="gewinnquellen"
      zustand={zustand}
      ladehoehe="gross"
      fussnoten={<Driftfussnote drift={daten?.drift} />}
    >
      {daten === undefined ? null : <GewinnquellenAnsicht daten={daten} />}
    </Kachel>
  );
}
