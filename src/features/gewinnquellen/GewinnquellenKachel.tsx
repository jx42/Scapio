/*
 * Gewinne & Abzüge, Container.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { de } from '@/i18n/de';
import { api, kachelZustand, schluessel } from '@/lib/api';
import { Kachel } from '@/components/Kachel';
import { Driftfussnote } from '@/components/Driftbanner';
import { GewinnquellenAnsicht } from '@/features/gewinnquellen/GewinnquellenAnsicht';
import { GewinnquellenBuchungen, type Auswahl } from '@/features/gewinnquellen/GewinnquellenBuchungen';

export function GewinnquellenKachel() {
  const abfrage = useQuery({
    queryKey: schluessel.gewinnquellen,
    queryFn: api.gewinnquellen,
  });
  const kennzahlen = useQuery({ queryKey: schluessel.kennzahlen, queryFn: api.kennzahlen }).data;
  const daten = abfrage.data;
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);
  const zustand = kachelZustand(abfrage, (d) => d.mitteCent === 0, de.gewinnquellen.leer);

  return (
    <Kachel
      titel={de.gewinnquellen.titel}
      id="gewinnquellen"
      zustand={zustand}
      ladehoehe="gross"
      fussnoten={<Driftfussnote drift={daten?.drift} />}
    >
      {daten === undefined ? null : (
        <>
          <GewinnquellenAnsicht
            daten={daten}
            realisiertCent={kennzahlen?.realisiertCent ?? null}
            onAuswahl={kennzahlen === undefined ? undefined : setAuswahl}
          />
          {kennzahlen === undefined ? null : (
            <GewinnquellenBuchungen daten={kennzahlen} auswahl={auswahl} onSchliessen={() => setAuswahl(null)} />
          )}
        </>
      )}
    </Kachel>
  );
}
